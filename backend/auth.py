"""
Authentication utilities for Infinity Lock Admin Panel
"""
import os
import secrets
import string
import base64
from io import BytesIO
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

import jwt
import pyotp
import qrcode
from passlib.context import CryptContext

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_urlsafe(32))
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
TEMP_TOKEN_EXPIRE_MINUTES = 5


def generate_secure_password(length: int = 16) -> str:
    """Generate a secure random password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def generate_totp_secret() -> str:
    """Generate a new TOTP secret"""
    return pyotp.random_base32()


def get_totp_provisioning_uri(secret: str, email: str) -> str:
    """Get the TOTP provisioning URI for authenticator apps"""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="InfinityLock Admin")


def generate_totp_qr_code(provisioning_uri: str) -> str:
    """Generate a base64-encoded QR code for TOTP setup"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    
    return base64.b64encode(buffer.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    """Verify a TOTP code"""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_temp_token(email: str) -> str:
    """Create a temporary token for TOTP verification step"""
    return create_access_token(
        {"sub": email, "type": "temp"},
        expires_delta=timedelta(minutes=TEMP_TOKEN_EXPIRE_MINUTES)
    )


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def generate_email_otp() -> Tuple[str, datetime]:
    """Generate a 6-digit OTP for email verification"""
    otp = ''.join(secrets.choice(string.digits) for _ in range(6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    return otp, expires_at


# Brute-force protection settings
ADMIN_LOCKOUT_THRESHOLDS = {
    2: timedelta(minutes=5),    # 2 failures = 5 min lockout
    3: timedelta(hours=1),      # 3 failures = 1 hour lockout
}

SUPER_ADMIN_LOCKOUT_ON_FAIL = True  # Immediate lockout on any failure


def calculate_lockout(failed_attempts: int, role: str) -> Optional[datetime]:
    """Calculate lockout time based on failed attempts and role"""
    if role == "super_admin" and SUPER_ADMIN_LOCKOUT_ON_FAIL:
        return datetime.now(timezone.utc) + timedelta(hours=24)  # Require OTP to unlock
    
    if role == "admin":
        for threshold, duration in sorted(ADMIN_LOCKOUT_THRESHOLDS.items()):
            if failed_attempts >= threshold:
                return datetime.now(timezone.utc) + duration
    
    return None


def is_locked_out(lockout_until: Optional[datetime]) -> bool:
    """Check if account is currently locked out"""
    if lockout_until is None:
        return False
    return datetime.now(timezone.utc) < lockout_until
