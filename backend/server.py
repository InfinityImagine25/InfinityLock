"""
Infinity Lock Admin Panel - FastAPI Backend Server
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import csv
import io
import asyncio
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import random

from models import (
    AdminUserCreate, AdminUserResponse, AdminUserInDB,
    LoginRequest, TOTPVerifyRequest, TOTPSetupResponse, TokenResponse,
    AppUserResponse, AppUserInDB,
    DashboardStats, FeatureAnalytics, SystemHealth,
    FeedbackResponse, FeedbackInDB,
    SettingsUpdate, SettingsResponse,
    SecurityLogResponse, SecurityLogInDB, SecurityLogCreate,
    UserActionRequest,
)
from auth import (
    hash_password, verify_password,
    generate_totp_secret, get_totp_provisioning_uri, generate_totp_qr_code, verify_totp,
    create_access_token, create_temp_token, decode_token,
    calculate_lockout, is_locked_out,
    generate_email_otp,
)
from email_service import send_otp_email, send_security_alert_email

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="Infinity Lock Admin API", version="1.0.0")

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
admin_router = APIRouter(prefix="/admin", tags=["Admin Management"])
users_router = APIRouter(prefix="/users", tags=["User Management"])
analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])
feedback_router = APIRouter(prefix="/feedback", tags=["Feedback"])
settings_router = APIRouter(prefix="/settings", tags=["Settings"])
notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])
export_router = APIRouter(prefix="/export", tags=["Export"])

# Security
security = HTTPBearer()

# Notification subscribers (in-memory for SSE)
notification_subscribers = []

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== Dependencies ====================

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Validate JWT token and return current admin user"""
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    if payload.get("type") == "temp":
        raise HTTPException(status_code=401, detail="TOTP verification required")
    
    email = payload.get("sub")
    admin = await db.admin_users.find_one({"email": email}, {"_id": 0})
    
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")
    
    if admin.get("status") != "active":
        raise HTTPException(status_code=403, detail="Account is not active")
    
    return admin


async def require_super_admin(admin: dict = Depends(get_current_admin)) -> dict:
    """Require super admin role"""
    if admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return admin


async def require_admin_or_super(admin: dict = Depends(get_current_admin)) -> dict:
    """Require admin or super admin role"""
    if admin.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return admin


async def log_security_event(event_type: str, admin_id: str = None, user_id: str = None, 
                            ip_address: str = None, details: dict = None):
    """Log security event to database and broadcast notification for important events"""
    log_entry = SecurityLogInDB(
        event_type=event_type,
        admin_id=admin_id,
        user_id=user_id,
        ip_address=ip_address,
        details=details or {}
    )
    doc = log_entry.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.security_logs.insert_one(doc)
    
    # Broadcast real-time notification for important events
    notify_events = {
        "LOGIN_FAILED": {"type": "alert", "title": "Failed Login", "severity": "warning"},
        "TOTP_VERIFICATION_FAILED": {"type": "alert", "title": "TOTP Failed", "severity": "warning"},
        "USER_SUSPENDED": {"type": "action", "title": "User Suspended", "severity": "info"},
        "ADMIN_CREATED": {"type": "action", "title": "New Admin Created", "severity": "info"},
        "SETTINGS_UPDATED": {"type": "action", "title": "Settings Updated", "severity": "info"},
    }
    
    if event_type in notify_events:
        notification = {
            **notify_events[event_type],
            "event_type": event_type,
            "details": details or {},
            "timestamp": doc['timestamp'],
        }
        try:
            await broadcast_notification(notification)
        except Exception as e:
            logger.warning(f"Failed to broadcast notification: {e}")


# ==================== Auth Routes ====================

@auth_router.post("/login", response_model=TokenResponse)
async def login(request: Request, login_data: LoginRequest):
    """
    Step 1 of authentication: Verify email/password
    Returns temp token if TOTP is enabled, or full access token if not
    """
    admin = await db.admin_users.find_one({"email": login_data.email}, {"_id": 0})
    
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check lockout
    lockout_until = admin.get("lockout_until")
    if lockout_until and is_locked_out(datetime.fromisoformat(lockout_until) if isinstance(lockout_until, str) else lockout_until):
        raise HTTPException(
            status_code=423, 
            detail="Account is locked. Please try again later or verify via email OTP."
        )
    
    # Verify password
    if not verify_password(login_data.password, admin["password_hash"]):
        # Increment failed attempts
        failed_attempts = admin.get("failed_attempts", 0) + 1
        lockout = calculate_lockout(failed_attempts, admin["role"])
        
        await db.admin_users.update_one(
            {"email": login_data.email},
            {
                "$set": {
                    "failed_attempts": failed_attempts,
                    "lockout_until": lockout.isoformat() if lockout else None
                }
            }
        )
        
        # Log failed attempt
        client_ip = request.client.host if request.client else "unknown"
        await log_security_event(
            "LOGIN_FAILED",
            admin_id=admin["id"],
            ip_address=client_ip,
            details={"email": login_data.email, "failed_attempts": failed_attempts}
        )
        
        # Send alert for super admin failures
        if admin["role"] == "super_admin":
            logger.warning(f"SUPER ADMIN LOGIN FAILED: {login_data.email}")
            # In production, send email alert here
            print(f"[EMAIL ALERT] Super Admin login failed for {login_data.email}")
        
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Reset failed attempts on successful password verification
    await db.admin_users.update_one(
        {"email": login_data.email},
        {"$set": {"failed_attempts": 0, "lockout_until": None}}
    )
    
    # Check if TOTP is required
    if admin.get("totp_enabled"):
        temp_token = create_temp_token(login_data.email)
        return TokenResponse(
            access_token="",
            role=admin["role"],
            requires_totp=True,
            temp_token=temp_token
        )
    
    # TOTP not enabled - issue full token (only for admin, super_admin always needs TOTP)
    if admin["role"] == "super_admin":
        raise HTTPException(
            status_code=403, 
            detail="TOTP must be enabled for Super Admin accounts"
        )
    
    access_token = create_access_token({"sub": login_data.email, "role": admin["role"]})
    
    # Update last login
    await db.admin_users.update_one(
        {"email": login_data.email},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    return TokenResponse(
        access_token=access_token,
        role=admin["role"],
        requires_totp=False
    )


@auth_router.post("/verify-totp", response_model=TokenResponse)
async def verify_totp_code(request: Request, verify_data: TOTPVerifyRequest):
    """
    Step 2 of authentication: Verify TOTP code
    """
    # Verify temp token
    payload = decode_token(verify_data.temp_token)
    if not payload or payload.get("type") != "temp":
        raise HTTPException(status_code=401, detail="Invalid or expired verification session")
    
    if payload.get("sub") != verify_data.email:
        raise HTTPException(status_code=401, detail="Token email mismatch")
    
    admin = await db.admin_users.find_one({"email": verify_data.email}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")
    
    # Verify TOTP code
    if not verify_totp(admin["totp_secret"], verify_data.totp_code):
        # Log failed TOTP
        client_ip = request.client.host if request.client else "unknown"
        await log_security_event(
            "TOTP_VERIFICATION_FAILED",
            admin_id=admin["id"],
            ip_address=client_ip,
            details={"email": verify_data.email}
        )
        raise HTTPException(status_code=401, detail="Invalid TOTP code")
    
    # Generate full access token
    access_token = create_access_token({"sub": verify_data.email, "role": admin["role"]})
    
    # Update last login and log success
    await db.admin_users.update_one(
        {"email": verify_data.email},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    client_ip = request.client.host if request.client else "unknown"
    await log_security_event(
        "LOGIN_SUCCESS",
        admin_id=admin["id"],
        ip_address=client_ip,
        details={"email": verify_data.email, "role": admin["role"]}
    )
    
    logger.info(f"Admin logged in: {verify_data.email}")
    
    return TokenResponse(
        access_token=access_token,
        role=admin["role"],
        requires_totp=False
    )


@auth_router.get("/totp-setup", response_model=TOTPSetupResponse)
async def get_totp_setup(admin: dict = Depends(get_current_admin)):
    """Get TOTP setup information (QR code) for current admin"""
    secret = admin.get("totp_secret")
    if not secret:
        secret = generate_totp_secret()
        await db.admin_users.update_one(
            {"email": admin["email"]},
            {"$set": {"totp_secret": secret}}
        )
    
    provisioning_uri = get_totp_provisioning_uri(secret, admin["email"])
    qr_code = generate_totp_qr_code(provisioning_uri)
    
    return TOTPSetupResponse(
        secret=secret,
        provisioning_uri=provisioning_uri,
        qr_code_base64=qr_code
    )


@auth_router.post("/enable-totp")
async def enable_totp(totp_code: str, admin: dict = Depends(get_current_admin)):
    """Enable TOTP for current admin after verifying a code"""
    if not verify_totp(admin["totp_secret"], totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code. Please try again.")
    
    await db.admin_users.update_one(
        {"email": admin["email"]},
        {"$set": {"totp_enabled": True}}
    )
    
    await log_security_event(
        "TOTP_ENABLED",
        admin_id=admin["id"],
        details={"email": admin["email"]}
    )
    
    return {"message": "TOTP enabled successfully"}


@auth_router.post("/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    admin: dict = Depends(get_current_admin)
):
    """Change password for current admin"""
    # Verify current password
    if not verify_password(current_password, admin["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    if current_password == new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Hash and update
    new_hash = hash_password(new_password)
    await db.admin_users.update_one(
        {"email": admin["email"]},
        {
            "$set": {
                "password_hash": new_hash,
                "password_changed_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    await log_security_event(
        "PASSWORD_CHANGED",
        admin_id=admin["id"],
        details={"email": admin["email"]}
    )
    
    return {"message": "Password changed successfully"}


@auth_router.post("/send-otp")
async def send_email_otp(email: str, purpose: str = "verification"):
    """Send OTP to email for verification"""
    # Generate OTP
    otp_code, expires_at = generate_email_otp()
    
    # Store OTP in database
    await db.email_otps.update_one(
        {"email": email},
        {
            "$set": {
                "otp": otp_code,
                "expires_at": expires_at.isoformat(),
                "purpose": purpose,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True
    )
    
    # Send email via Resend
    result = await send_otp_email(email, otp_code, purpose)
    
    return {
        "message": f"OTP sent to {email}",
        "status": result.get("status"),
        "expires_in_minutes": 10,
    }


@auth_router.post("/verify-email-otp")
async def verify_email_otp(email: str, otp_code: str):
    """Verify email OTP"""
    otp_record = await db.email_otps.find_one({"email": email}, {"_id": 0})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")
    
    # Check expiry
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
    
    # Verify OTP
    if otp_record["otp"] != otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")
    
    # Mark email as verified for admin if exists
    await db.admin_users.update_one(
        {"email": email},
        {"$set": {"email_verified": True}}
    )
    
    # Delete used OTP
    await db.email_otps.delete_one({"email": email})
    
    await log_security_event(
        "EMAIL_VERIFIED",
        details={"email": email}
    )
    
    return {"message": "Email verified successfully", "verified": True}


# ==================== Password Recovery Flow ====================

@auth_router.post("/forgot-password/request")
async def request_password_reset(email: str):
    """Step 1: Request password reset - sends OTP to email"""
    admin = await db.admin_users.find_one({"email": email}, {"_id": 0})
    
    if not admin:
        # Don't reveal if email exists for security
        return {"message": "If the email exists, an OTP has been sent", "requires_totp": False}
    
    # Generate and store OTP
    otp_code, expires_at = generate_email_otp()
    
    await db.email_otps.update_one(
        {"email": email},
        {
            "$set": {
                "otp": otp_code,
                "expires_at": expires_at.isoformat(),
                "purpose": "password_reset",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True
    )
    
    # Send email via Resend
    await send_otp_email(email, otp_code, "password_reset")
    
    await log_security_event(
        "PASSWORD_RESET_REQUESTED",
        details={"email": email}
    )
    
    return {
        "message": "If the email exists, an OTP has been sent",
        "requires_totp": admin.get("totp_enabled", False),
        "expires_in_minutes": 10,
    }


@auth_router.post("/forgot-password/verify-otp")
async def verify_password_reset_otp(email: str, otp_code: str):
    """Step 2: Verify OTP for password reset"""
    otp_record = await db.email_otps.find_one(
        {"email": email, "purpose": "password_reset"}, 
        {"_id": 0}
    )
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")
    
    # Check expiry
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.email_otps.delete_one({"email": email, "purpose": "password_reset"})
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
    
    # Verify OTP
    if otp_record["otp"] != otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")
    
    # Check if admin requires TOTP
    admin = await db.admin_users.find_one({"email": email}, {"_id": 0})
    
    # Create reset token (valid for 10 minutes)
    reset_token = create_access_token(
        {"sub": email, "type": "password_reset", "otp_verified": True},
        expires_delta=timedelta(minutes=10)
    )
    
    return {
        "message": "OTP verified successfully",
        "reset_token": reset_token,
        "requires_totp": admin.get("totp_enabled", False) if admin else False,
    }


@auth_router.post("/forgot-password/verify-totp")
async def verify_password_reset_totp(email: str, totp_code: str, reset_token: str):
    """Step 3 (if TOTP enabled): Verify TOTP for password reset"""
    # Verify reset token
    payload = decode_token(reset_token)
    if not payload or payload.get("type") != "password_reset" or not payload.get("otp_verified"):
        raise HTTPException(status_code=401, detail="Invalid or expired reset token")
    
    if payload.get("sub") != email:
        raise HTTPException(status_code=401, detail="Token email mismatch")
    
    admin = await db.admin_users.find_one({"email": email}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Verify TOTP
    if not verify_totp(admin["totp_secret"], totp_code):
        raise HTTPException(status_code=401, detail="Invalid TOTP code")
    
    # Create final reset token with TOTP verified
    final_reset_token = create_access_token(
        {"sub": email, "type": "password_reset", "otp_verified": True, "totp_verified": True},
        expires_delta=timedelta(minutes=10)
    )
    
    return {
        "message": "TOTP verified successfully",
        "reset_token": final_reset_token,
    }


@auth_router.post("/forgot-password/reset")
async def reset_password(email: str, new_password: str, reset_token: str):
    """Step 4: Reset password with verified token"""
    # Verify reset token
    payload = decode_token(reset_token)
    if not payload or payload.get("type") != "password_reset" or not payload.get("otp_verified"):
        raise HTTPException(status_code=401, detail="Invalid or expired reset token")
    
    if payload.get("sub") != email:
        raise HTTPException(status_code=401, detail="Token email mismatch")
    
    admin = await db.admin_users.find_one({"email": email}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # If admin has TOTP enabled, verify TOTP was also verified
    if admin.get("totp_enabled") and not payload.get("totp_verified"):
        raise HTTPException(status_code=401, detail="TOTP verification required")
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Update password
    new_hash = hash_password(new_password)
    await db.admin_users.update_one(
        {"email": email},
        {
            "$set": {
                "password_hash": new_hash,
                "password_changed_at": datetime.now(timezone.utc).isoformat(),
                "failed_attempts": 0,
                "lockout_until": None,
            }
        }
    )
    
    # Delete OTP record
    await db.email_otps.delete_one({"email": email, "purpose": "password_reset"})
    
    await log_security_event(
        "PASSWORD_RESET_COMPLETED",
        admin_id=admin["id"],
        details={"email": email, "method": "forgot_password"}
    )
    
    # Send security alert email
    await send_security_alert_email(
        email,
        "password_reset",
        {"action": "Password was reset", "method": "Forgot Password Flow"}
    )
    
    return {"message": "Password reset successfully"}


# ==================== Super-Admin Email Change ====================

@auth_router.post("/change-email/verify")
async def verify_email_change(
    new_email: str,
    current_password: str,
    admin: dict = Depends(get_current_admin)
):
    """Step 1: Verify password for email change (Super Admin only)"""
    # Only Super Admin can change email
    if admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can change email")
    
    # Verify current password
    if not verify_password(current_password, admin["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new email format
    import re
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, new_email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    # Check if new email already exists
    existing = await db.admin_users.find_one({"email": new_email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create temporary token for email change
    change_token = create_access_token(
        {
            "sub": admin["email"],
            "type": "email_change",
            "new_email": new_email,
            "password_verified": True,
        },
        expires_delta=timedelta(minutes=10)
    )
    
    return {
        "message": "Password verified. Please verify TOTP to complete email change.",
        "change_token": change_token,
        "requires_totp": admin.get("totp_enabled", False),
    }


@auth_router.post("/change-email/confirm")
async def confirm_email_change(
    totp_code: str,
    change_token: str,
    admin: dict = Depends(get_current_admin)
):
    """Step 2: Confirm email change with TOTP (Super Admin only)"""
    # Only Super Admin can change email
    if admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can change email")
    
    # Verify change token
    payload = decode_token(change_token)
    if not payload or payload.get("type") != "email_change" or not payload.get("password_verified"):
        raise HTTPException(status_code=401, detail="Invalid or expired change token")
    
    if payload.get("sub") != admin["email"]:
        raise HTTPException(status_code=401, detail="Token email mismatch")
    
    new_email = payload.get("new_email")
    if not new_email:
        raise HTTPException(status_code=400, detail="New email not found in token")
    
    # Verify TOTP
    if not verify_totp(admin["totp_secret"], totp_code):
        raise HTTPException(status_code=401, detail="Invalid TOTP code")
    
    old_email = admin["email"]
    
    # Reset TOTP - generate new secret and disable TOTP
    new_totp_secret = generate_totp_secret()
    
    # Update email and reset TOTP in database
    await db.admin_users.update_one(
        {"email": old_email},
        {"$set": {
            "email": new_email,
            "totp_secret": new_totp_secret,
            "totp_enabled": False,
        }}
    )
    
    # Log security event
    await log_security_event(
        "SUPER_ADMIN_EMAIL_CHANGED",
        admin_id=admin["id"],
        details={
            "old_email": old_email,
            "new_email": new_email,
            "totp_reset": True,
        }
    )
    
    # Send security alert to both old and new email
    await send_security_alert_email(
        old_email,
        "email_changed",
        {"action": "Super Admin email was changed", "new_email": new_email}
    )
    await send_security_alert_email(
        new_email,
        "email_changed", 
        {"action": "This email is now the Super Admin", "old_email": old_email}
    )
    
    # Update SUPER_ADMIN_EMAIL in environment (for seed script reference)
    # Note: This only affects runtime, .env file should be manually updated
    os.environ["SUPER_ADMIN_EMAIL"] = new_email
    
    return {
        "message": "Email changed successfully. TOTP has been reset — you will need to set up TOTP again on next login.",
        "new_email": new_email,
        "totp_reset": True,
        "note": "Please log in again with your new email and set up TOTP",
    }


@auth_router.get("/me", response_model=AdminUserResponse)
async def get_current_admin_info(admin: dict = Depends(get_current_admin)):
    """Get current admin user information"""
    return AdminUserResponse(
        id=admin["id"],
        email=admin["email"],
        role=admin["role"],
        status=admin["status"],
        totp_enabled=admin.get("totp_enabled", False),
        email_verified=admin.get("email_verified", False),
        last_login=admin.get("last_login"),
        created_at=admin["created_at"]
    )


# ==================== Admin Management Routes ====================

@admin_router.get("/list", response_model=List[AdminUserResponse])
async def list_admins(admin: dict = Depends(require_super_admin)):
    """List all admin users (Super Admin only)"""
    admins = await db.admin_users.find({}, {"_id": 0, "password_hash": 0, "totp_secret": 0}).to_list(100)
    
    return [
        AdminUserResponse(
            id=a["id"],
            email=a["email"],
            role=a["role"],
            status=a["status"],
            totp_enabled=a.get("totp_enabled", False),
            email_verified=a.get("email_verified", False),
            last_login=a.get("last_login"),
            created_at=a["created_at"]
        )
        for a in admins
    ]


@admin_router.put("/{admin_id}")
async def update_admin(admin_id: str, update_data: dict, current_admin: dict = Depends(require_super_admin)):
    """Update an admin user (Super Admin only)"""
    target = await db.admin_users.find_one({"id": admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    if target["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot modify Super Admin account")
    
    update_doc = {}
    if "status" in update_data and update_data["status"] in ["active", "suspended", "deactivated"]:
        update_doc["status"] = update_data["status"]
    if "role" in update_data and update_data["role"] in ["admin"]:
        update_doc["role"] = update_data["role"]
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    await db.admin_users.update_one({"id": admin_id}, {"$set": update_doc})
    
    await log_security_event(
        "ADMIN_UPDATED",
        admin_id=current_admin["id"],
        details={"target_admin": admin_id, "changes": update_doc}
    )
    
    updated = await db.admin_users.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
    return {
        "message": "Admin updated successfully",
        "admin": {
            "id": updated["id"],
            "email": updated["email"],
            "role": updated["role"],
            "status": updated["status"],
            "totp_enabled": updated.get("totp_enabled", False),
        }
    }


@admin_router.delete("/{admin_id}")
async def delete_admin(admin_id: str, current_admin: dict = Depends(require_super_admin)):
    """Delete an admin user (Super Admin only)"""
    target = await db.admin_users.find_one({"id": admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    if target["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot delete Super Admin account")
    
    await db.admin_users.delete_one({"id": admin_id})
    
    await log_security_event(
        "ADMIN_DELETED",
        admin_id=current_admin["id"],
        details={"deleted_admin_email": target["email"], "deleted_admin_id": admin_id}
    )
    
    return {"message": f"Admin {target['email']} deleted successfully"}


@admin_router.post("/{admin_id}/reset-totp")
async def reset_admin_totp(admin_id: str, current_admin: dict = Depends(require_super_admin)):
    """Reset TOTP for an admin who lost their authenticator (Super Admin only)"""
    target = await db.admin_users.find_one({"id": admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    if target["role"] == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot reset Super Admin TOTP through this endpoint")
    
    new_secret = generate_totp_secret()
    await db.admin_users.update_one(
        {"id": admin_id},
        {"$set": {"totp_secret": new_secret, "totp_enabled": False}}
    )
    
    await log_security_event(
        "TOTP_RESET",
        admin_id=current_admin["id"],
        details={"target_admin": admin_id, "target_email": target["email"]}
    )
    
    return {
        "message": f"TOTP reset for {target['email']}. They will need to set up TOTP again on next login.",
        "email": target["email"],
    }


@admin_router.post("/create", response_model=AdminUserResponse)
async def create_admin(admin_data: AdminUserCreate, current_admin: dict = Depends(require_super_admin)):
    """Create a new admin user (Super Admin only)"""
    # Check if email already exists
    existing = await db.admin_users.find_one({"email": admin_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Cannot create another super admin
    if admin_data.role == "super_admin":
        raise HTTPException(status_code=403, detail="Cannot create additional Super Admin accounts")
    
    # Create admin
    new_admin = AdminUserInDB(
        email=admin_data.email,
        password_hash=hash_password(admin_data.password),
        role=admin_data.role,
        status=admin_data.status,
        totp_secret=generate_totp_secret(),
        totp_enabled=False,
        created_by=current_admin["id"]
    )
    
    doc = new_admin.model_dump()
    doc['password_changed_at'] = doc['password_changed_at'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.admin_users.insert_one(doc)
    
    await log_security_event(
        "ADMIN_CREATED",
        admin_id=current_admin["id"],
        details={"new_admin_email": admin_data.email, "role": admin_data.role}
    )
    
    return AdminUserResponse(
        id=new_admin.id,
        email=new_admin.email,
        role=new_admin.role,
        status=new_admin.status,
        totp_enabled=new_admin.totp_enabled,
        email_verified=new_admin.email_verified,
        last_login=None,
        created_at=doc['created_at']
    )


# ==================== User Management Routes ====================

@users_router.get("/list", response_model=List[AppUserResponse])
async def list_app_users(
    skip: int = 0, 
    limit: int = 50,
    plan: Optional[str] = None,
    status_filter: Optional[str] = None,
    admin: dict = Depends(require_admin_or_super)
):
    """List mobile app users with pagination and filters"""
    query = {}
    if plan:
        query["plan"] = plan
    if status_filter:
        query["status"] = status_filter
    
    users = await db.app_users.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    return [
        AppUserResponse(
            id=u["id"],
            device_id=u["device_id"],
            email=u.get("email"),
            plan=u["plan"],
            status=u["status"],
            language=u.get("language", "en"),
            country=u.get("country"),
            biometric_enabled=u.get("biometric_enabled", False),
            secured_apps_count=u.get("secured_apps_count", 0),
            installed_at=u["installed_at"],
            last_active=u.get("last_active")
        )
        for u in users
    ]


@users_router.post("/action")
async def user_action(
    action_data: UserActionRequest,
    request: Request,
    admin: dict = Depends(require_admin_or_super)
):
    """Suspend, deactivate, or resume a user account"""
    user = await db.app_users.find_one({"id": action_data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_status = {
        "suspend": "suspended",
        "deactivate": "deactivated", 
        "resume": "active"
    }.get(action_data.action)
    
    await db.app_users.update_one(
        {"id": action_data.user_id},
        {"$set": {"status": new_status}}
    )
    
    client_ip = request.client.host if request.client else "unknown"
    await log_security_event(
        f"USER_{action_data.action.upper()}",
        admin_id=admin["id"],
        user_id=action_data.user_id,
        ip_address=client_ip,
        details={"reason": action_data.reason, "new_status": new_status}
    )
    
    return {"message": f"User {action_data.action}d successfully", "new_status": new_status}


@users_router.get("/count")
async def get_user_counts(admin: dict = Depends(require_admin_or_super)):
    """Get user count statistics"""
    total = await db.app_users.count_documents({})
    active = await db.app_users.count_documents({"status": "active", "uninstalled_at": None})
    classic = await db.app_users.count_documents({"plan": "classic"})
    premium = await db.app_users.count_documents({"plan": "premium"})
    
    # Uninstalls
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    
    total_uninstalls = await db.app_users.count_documents({"uninstalled_at": {"$ne": None}})
    uninstalls_week = await db.app_users.count_documents({"uninstalled_at": {"$gte": week_ago}})
    uninstalls_month = await db.app_users.count_documents({"uninstalled_at": {"$gte": month_ago}})
    
    return {
        "total": total,
        "active": active,
        "classic": classic,
        "premium": premium,
        "total_uninstalls": total_uninstalls,
        "uninstalls_week": uninstalls_week,
        "uninstalls_month": uninstalls_month
    }


# ==================== Analytics Routes ====================

@analytics_router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(admin: dict = Depends(require_admin_or_super)):
    """Get main dashboard statistics"""
    total = await db.app_users.count_documents({})
    active = await db.app_users.count_documents({"status": "active", "uninstalled_at": None})
    classic = await db.app_users.count_documents({"plan": "classic"})
    premium = await db.app_users.count_documents({"plan": "premium"})
    
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    
    total_uninstalls = await db.app_users.count_documents({"uninstalled_at": {"$ne": None}})
    uninstalls_week = await db.app_users.count_documents({"uninstalled_at": {"$gte": week_ago}})
    uninstalls_month = await db.app_users.count_documents({"uninstalled_at": {"$gte": month_ago}})
    
    # Revenue calculation (premium = ₹200/month)
    monthly_revenue = premium * 200
    total_revenue = monthly_revenue * 6  # Simulated 6 months
    
    conversion_rate = (premium / total * 100) if total > 0 else 0
    
    return DashboardStats(
        total_installations=total,
        active_users=active,
        total_uninstalls=total_uninstalls,
        uninstalls_this_week=uninstalls_week,
        uninstalls_this_month=uninstalls_month,
        classic_users=classic,
        premium_users=premium,
        premium_conversion_rate=round(conversion_rate, 2),
        total_revenue=total_revenue,
        monthly_revenue=monthly_revenue
    )


@analytics_router.get("/features", response_model=FeatureAnalytics)
async def get_feature_analytics(admin: dict = Depends(require_admin_or_super)):
    """Get feature usage analytics"""
    total = await db.app_users.count_documents({})
    if total == 0:
        total = 1  # Prevent division by zero
    
    biometric_count = await db.app_users.count_documents({"biometric_enabled": True})
    face_unlock_count = await db.app_users.count_documents({"face_unlock_enabled": True})
    intruder_count = await db.app_users.count_documents({"intruder_selfie_enabled": True})
    
    # Aggregate secured apps average
    pipeline = [{"$group": {"_id": None, "avg": {"$avg": "$secured_apps_count"}}}]
    result = await db.app_users.aggregate(pipeline).to_list(1)
    avg_secured = result[0]["avg"] if result else 0
    
    # Language distribution
    lang_pipeline = [{"$group": {"_id": "$language", "count": {"$sum": 1}}}]
    lang_result = await db.app_users.aggregate(lang_pipeline).to_list(100)
    language_dist = {r["_id"]: r["count"] for r in lang_result if r["_id"]}
    
    # Country distribution
    country_pipeline = [{"$group": {"_id": "$country", "count": {"$sum": 1}}}]
    country_result = await db.app_users.aggregate(country_pipeline).to_list(100)
    country_dist = {r["_id"]: r["count"] for r in country_result if r["_id"]}
    
    return FeatureAnalytics(
        biometric_adoption_rate=round(biometric_count / total * 100, 2),
        face_unlock_adoption_rate=round(face_unlock_count / total * 100, 2),
        intruder_selfie_usage=intruder_count,
        avg_secured_apps=round(avg_secured or 0, 1),
        language_distribution=language_dist or {"en": 0},
        country_distribution=country_dist or {"Unknown": 0}
    )


@analytics_router.get("/system-health", response_model=SystemHealth)
async def get_system_health(admin: dict = Depends(require_admin_or_super)):
    """Get system health metrics"""
    # Calculate metrics from logs
    now = datetime.now(timezone.utc)
    hour_ago = (now - timedelta(hours=1)).isoformat()
    
    total_auth = await db.security_logs.count_documents({
        "event_type": {"$in": ["LOGIN_SUCCESS", "LOGIN_FAILED"]},
        "timestamp": {"$gte": hour_ago}
    })
    success_auth = await db.security_logs.count_documents({
        "event_type": "LOGIN_SUCCESS",
        "timestamp": {"$gte": hour_ago}
    })
    
    auth_rate = (success_auth / total_auth * 100) if total_auth > 0 else 100
    
    # Check DB status
    try:
        await db.command("ping")
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"
    
    return SystemHealth(
        api_latency_ms=round(random.uniform(15, 45), 2),
        error_rate=round(random.uniform(0.1, 2.0), 2),
        auth_success_rate=round(auth_rate, 2),
        active_sessions=random.randint(5, 50),
        db_status=db_status,
        last_checked=datetime.now(timezone.utc).isoformat()
    )


@analytics_router.get("/installation-trend")
async def get_installation_trend(days: int = 30, admin: dict = Depends(require_admin_or_super)):
    """Get installation trend over time"""
    # Generate mock trend data
    trend = []
    now = datetime.now(timezone.utc)
    base = 100
    
    for i in range(days, 0, -1):
        date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        installs = base + random.randint(-10, 20)
        uninstalls = random.randint(5, 15)
        base = installs
        trend.append({
            "date": date,
            "installations": installs,
            "uninstalls": uninstalls,
            "net": installs - uninstalls
        })
    
    return trend


# ==================== Feedback Routes ====================

@feedback_router.get("/list", response_model=List[FeedbackResponse])
async def list_feedback(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    admin: dict = Depends(require_admin_or_super)
):
    """List user feedback with optional filtering"""
    query = {}
    if status_filter:
        query["status"] = status_filter
    
    feedback_list = await db.feedback.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return [
        FeedbackResponse(
            id=f["id"],
            user_id=f["user_id"],
            message=f["message"],
            status=f["status"],
            admin_response=f.get("admin_response"),
            created_at=f["created_at"],
            reviewed_at=f.get("reviewed_at")
        )
        for f in feedback_list
    ]


@feedback_router.post("/{feedback_id}/respond")
async def respond_to_feedback(
    feedback_id: str,
    response_text: str,
    admin: dict = Depends(require_admin_or_super)
):
    """Respond to user feedback"""
    result = await db.feedback.update_one(
        {"id": feedback_id},
        {
            "$set": {
                "status": "responded",
                "admin_response": response_text,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "reviewed_by": admin["id"]
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    return {"message": "Response recorded successfully"}


@feedback_router.get("/stats")
async def get_feedback_stats(admin: dict = Depends(require_admin_or_super)):
    """Get feedback statistics"""
    total = await db.feedback.count_documents({})
    new_count = await db.feedback.count_documents({"status": "new"})
    reviewed = await db.feedback.count_documents({"status": "reviewed"})
    responded = await db.feedback.count_documents({"status": "responded"})
    
    return {
        "total": total,
        "new": new_count,
        "reviewed": reviewed,
        "responded": responded
    }


# ==================== Settings Routes ====================

@settings_router.get("/", response_model=SettingsResponse)
async def get_settings(admin: dict = Depends(require_admin_or_super)):
    """Get application settings (Privacy Policy, ToS)"""
    settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0})
    
    if not settings:
        # Return defaults
        return SettingsResponse(
            privacy_policy="Privacy Policy content goes here...",
            terms_of_service="Terms of Service content goes here...",
            updated_at=datetime.now(timezone.utc).isoformat(),
            updated_by=None
        )
    
    return SettingsResponse(
        privacy_policy=settings.get("privacy_policy", ""),
        terms_of_service=settings.get("terms_of_service", ""),
        updated_at=settings.get("updated_at", ""),
        updated_by=settings.get("updated_by")
    )


@settings_router.put("/")
async def update_settings(
    settings_data: SettingsUpdate,
    admin: dict = Depends(require_super_admin)
):
    """Update application settings (Super Admin only)"""
    update_doc = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin["id"]
    }
    
    if settings_data.privacy_policy is not None:
        update_doc["privacy_policy"] = settings_data.privacy_policy
    if settings_data.terms_of_service is not None:
        update_doc["terms_of_service"] = settings_data.terms_of_service
    
    await db.settings.update_one(
        {"type": "app_settings"},
        {"$set": update_doc},
        upsert=True
    )
    
    await log_security_event(
        "SETTINGS_UPDATED",
        admin_id=admin["id"],
        details={"fields_updated": list(update_doc.keys())}
    )
    
    return {"message": "Settings updated successfully"}


# ==================== Security Logs Routes ====================

@api_router.get("/security-logs", response_model=List[SecurityLogResponse])
async def get_security_logs(
    skip: int = 0,
    limit: int = 25,
    event_type: Optional[str] = None,
    admin: dict = Depends(require_super_admin)
):
    """Get security audit logs (Super Admin only) with pagination"""
    query = {}
    if event_type:
        query["event_type"] = event_type
    
    # Apply retention policy (5 days for classic, 10 days for premium - using 10 for admin panel)
    retention_date = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    query["timestamp"] = {"$gte": retention_date}
    
    logs = await db.security_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    return [
        SecurityLogResponse(
            id=log["id"],
            event_type=log["event_type"],
            user_id=log.get("user_id"),
            admin_id=log.get("admin_id"),
            ip_address=log.get("ip_address"),
            details=log.get("details"),
            timestamp=log["timestamp"]
        )
        for log in logs
    ]


@api_router.get("/security-logs/count")
async def get_security_logs_count(
    event_type: Optional[str] = None,
    admin: dict = Depends(require_super_admin)
):
    """Get total count of security logs for pagination"""
    query = {}
    if event_type:
        query["event_type"] = event_type
    
    retention_date = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    query["timestamp"] = {"$gte": retention_date}
    
    total = await db.security_logs.count_documents(query)
    return {"total": total}


# ==================== Export Routes (Super Admin Only) ====================

@export_router.get("/security-logs/csv")
async def export_security_logs_csv(admin: dict = Depends(require_super_admin)):
    """Export security logs as CSV (Super Admin only)"""
    retention_date = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    logs = await db.security_logs.find(
        {"timestamp": {"$gte": retention_date}}, 
        {"_id": 0}
    ).sort("timestamp", -1).to_list(1000)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Event Type", "Date", "Time", "Admin ID", "User ID", "IP Address", "Details"])
    
    for log in logs:
        timestamp = datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00"))
        writer.writerow([
            log.get("event_type", ""),
            timestamp.strftime("%Y-%m-%d"),
            timestamp.strftime("%H:%M:%S"),
            log.get("admin_id", ""),
            log.get("user_id", ""),
            log.get("ip_address", ""),
            json.dumps(log.get("details", {})),
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=security_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@export_router.get("/intrusion-logs/csv")
async def export_intrusion_logs_csv(admin: dict = Depends(require_super_admin)):
    """Export intrusion/failed login logs as CSV (Super Admin only)"""
    retention_date = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    logs = await db.security_logs.find(
        {
            "event_type": {"$in": ["LOGIN_FAILED", "TOTP_VERIFICATION_FAILED", "USER_SUSPENDED"]},
            "timestamp": {"$gte": retention_date}
        }, 
        {"_id": 0}
    ).sort("timestamp", -1).to_list(1000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Event Type", "Date", "Time", "Email/User", "IP Address", "Details"])
    
    for log in logs:
        timestamp = datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00"))
        details = log.get("details", {})
        writer.writerow([
            log.get("event_type", ""),
            timestamp.strftime("%Y-%m-%d"),
            timestamp.strftime("%H:%M:%S"),
            details.get("email", log.get("user_id", "")),
            log.get("ip_address", ""),
            json.dumps(details),
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=intrusion_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@export_router.get("/users/csv")
async def export_users_csv(admin: dict = Depends(require_super_admin)):
    """Export app users as CSV (Super Admin only)"""
    users = await db.app_users.find({}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["User ID", "Device ID", "Email", "Plan", "Status", "Language", "Country", 
                     "Biometric", "Face Unlock", "Secured Apps", "Installed At", "Last Active"])
    
    for user in users:
        writer.writerow([
            user.get("id", ""),
            user.get("device_id", ""),
            user.get("email", ""),
            user.get("plan", ""),
            user.get("status", ""),
            user.get("language", ""),
            user.get("country", ""),
            "Yes" if user.get("biometric_enabled") else "No",
            "Yes" if user.get("face_unlock_enabled") else "No",
            user.get("secured_apps_count", 0),
            user.get("installed_at", ""),
            user.get("last_active", ""),
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=users_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@export_router.get("/security-logs/pdf")
async def export_security_logs_pdf(admin: dict = Depends(require_super_admin)):
    """Export security logs as PDF (Super Admin only)"""
    from fpdf import FPDF
    
    retention_date = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    logs = await db.security_logs.find(
        {"timestamp": {"$gte": retention_date}}, {"_id": 0}
    ).sort("timestamp", -1).to_list(1000)
    
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page(orientation='L')
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Infinity Lock - Security Logs Report", ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", ln=True, align="C")
    pdf.ln(5)
    
    headers = ["Event Type", "Date", "Time", "Admin ID", "IP Address", "Details"]
    col_widths = [45, 25, 20, 55, 35, 97]
    
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(30, 30, 35)
    pdf.set_text_color(200, 200, 220)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 7, h, border=1, fill=True)
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(60, 60, 70)
    for log in logs:
        ts = log.get("timestamp", "")
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
            time_str = dt.strftime("%H:%M:%S")
        except Exception:
            date_str = time_str = ""
        
        details = json.dumps(log.get("details", {}))[:50]
        row = [
            log.get("event_type", "")[:20],
            date_str, time_str,
            (log.get("admin_id") or "")[:25],
            (log.get("ip_address") or ""),
            details,
        ]
        for i, val in enumerate(row):
            pdf.cell(col_widths[i], 6, str(val), border=1)
        pdf.ln()
    
    pdf_bytes = pdf.output()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=security_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"}
    )


@export_router.get("/users/pdf")
async def export_users_pdf(admin: dict = Depends(require_super_admin)):
    """Export app users as PDF (Super Admin only)"""
    from fpdf import FPDF
    
    users = await db.app_users.find({}, {"_id": 0}).to_list(10000)
    
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page(orientation='L')
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Infinity Lock - Users Report", ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | Total: {len(users)}", ln=True, align="C")
    pdf.ln(5)
    
    headers = ["Email", "Plan", "Status", "Language", "Country", "Biometric", "Apps", "Installed"]
    col_widths = [55, 25, 25, 25, 30, 25, 20, 72]
    
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(30, 30, 35)
    pdf.set_text_color(200, 200, 220)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 7, h, border=1, fill=True)
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(60, 60, 70)
    for u in users:
        row = [
            (u.get("email") or u.get("device_id", ""))[:25],
            u.get("plan", ""),
            u.get("status", ""),
            u.get("language", ""),
            (u.get("country") or "")[:15],
            "Yes" if u.get("biometric_enabled") else "No",
            str(u.get("secured_apps_count", 0)),
            u.get("installed_at", "")[:25],
        ]
        for i, val in enumerate(row):
            pdf.cell(col_widths[i], 6, str(val), border=1)
        pdf.ln()
    
    pdf_bytes = pdf.output()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=users_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"}
    )


# ==================== Real-Time Notifications (SSE) ====================

async def broadcast_notification(notification: dict):
    """Broadcast notification to all connected subscribers"""
    # Store in database for persistence
    await db.notifications.insert_one({
        "id": f"notif-{datetime.now(timezone.utc).timestamp()}",
        **notification,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    })
    
    # Broadcast to SSE subscribers
    for queue in notification_subscribers:
        await queue.put(notification)


@notifications_router.get("/stream")
async def notification_stream(request: Request, admin: dict = Depends(require_super_admin)):
    """SSE endpoint for real-time notifications (Super Admin only)"""
    async def event_generator():
        queue = asyncio.Queue()
        notification_subscribers.append(queue)
        
        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                try:
                    # Wait for notification with timeout
                    notification = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(notification)}\n\n"
                except asyncio.TimeoutError:
                    # Send heartbeat
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            notification_subscribers.remove(queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@notifications_router.get("/")
async def get_notifications(
    skip: int = 0,
    limit: int = 20,
    unread_only: bool = False,
    admin: dict = Depends(require_super_admin)
):
    """Get stored notifications (Super Admin only)"""
    query = {}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    unread_count = await db.notifications.count_documents({"read": False})
    
    return {
        "notifications": notifications,
        "unread_count": unread_count,
    }


@notifications_router.post("/mark-read")
async def mark_notifications_read(
    notification_ids: Optional[List[str]] = Query(None),
    admin: dict = Depends(require_super_admin)
):
    """Mark notifications as read"""
    if notification_ids:
        await db.notifications.update_many(
            {"id": {"$in": notification_ids}},
            {"$set": {"read": True}}
        )
    else:
        # Mark all as read
        await db.notifications.update_many({}, {"$set": {"read": True}})
    
    return {"message": "Notifications marked as read"}


# ==================== Health Check ====================

@api_router.get("/")
async def root():
    return {"message": "Infinity Lock Admin API", "version": "1.0.0"}


@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}


# ==================== Include Routers ====================

api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(users_router)
api_router.include_router(analytics_router)
api_router.include_router(feedback_router)
api_router.include_router(settings_router)
api_router.include_router(notifications_router)
api_router.include_router(export_router)

app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Startup Events ====================

@app.on_event("startup")
async def startup_event():
    """Run seed script on startup if Super Admin doesn't exist"""
    logger.info("Checking for Super-Admin account...")
    
    existing = await db.admin_users.find_one({"role": "super_admin"})
    if not existing:
        logger.info("No Super-Admin found. Running seed script...")
        from seed_superadmin import seed_super_admin
        await seed_super_admin()
    else:
        logger.info(f"Super-Admin exists: {existing['email']}")
    
    # Create indexes
    await db.admin_users.create_index("email", unique=True)
    await db.admin_users.create_index("role")
    await db.app_users.create_index("device_id", unique=True)
    await db.app_users.create_index("plan")
    await db.app_users.create_index("status")
    await db.security_logs.create_index("timestamp")
    await db.security_logs.create_index("event_type")
    
    logger.info("Database indexes created")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
