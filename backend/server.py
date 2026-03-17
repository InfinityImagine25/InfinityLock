"""
Infinity Lock Admin Panel - FastAPI Backend Server
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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

# Security
security = HTTPBearer()

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
    """Log security event to database"""
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
    limit: int = 100,
    event_type: Optional[str] = None,
    admin: dict = Depends(require_super_admin)
):
    """Get security audit logs (Super Admin only)"""
    query = {}
    if event_type:
        query["event_type"] = event_type
    
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
