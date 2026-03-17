"""
Pydantic Models for Infinity Lock Admin Panel
"""
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone
import uuid


# Enums
RoleType = Literal["super_admin", "admin", "premium_user", "classic_user"]
AccountStatus = Literal["active", "suspended", "deactivated", "pending_deletion"]


# Auth Models
class AdminUserBase(BaseModel):
    email: EmailStr
    role: RoleType
    status: AccountStatus = "active"


class AdminUserCreate(AdminUserBase):
    password: str


class AdminUserInDB(AdminUserBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    password_hash: str
    totp_secret: str
    totp_enabled: bool = False
    email_verified: bool = False
    failed_attempts: int = 0
    lockout_until: Optional[datetime] = None
    last_login: Optional[datetime] = None
    password_changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    email: str
    role: RoleType
    status: AccountStatus
    totp_enabled: bool
    email_verified: bool
    last_login: Optional[str] = None
    created_at: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TOTPVerifyRequest(BaseModel):
    email: EmailStr
    totp_code: str
    temp_token: str


class TOTPSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    qr_code_base64: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    requires_totp: bool = False
    temp_token: Optional[str] = None


# App User Models (for managing mobile app users)
class AppUserBase(BaseModel):
    device_id: str
    email: Optional[str] = None
    plan: Literal["classic", "premium"] = "classic"
    status: AccountStatus = "active"


class AppUserInDB(AppUserBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    language: str = "en"
    country: Optional[str] = None
    email_verified: bool = False
    biometric_enabled: bool = False
    face_unlock_enabled: bool = False
    intruder_selfie_enabled: bool = False
    secured_apps_count: int = 0
    installed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: Optional[datetime] = None
    uninstalled_at: Optional[datetime] = None


class AppUserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    device_id: str
    email: Optional[str]
    plan: str
    status: str
    language: str
    country: Optional[str]
    biometric_enabled: bool
    secured_apps_count: int
    installed_at: str
    last_active: Optional[str]


# Analytics Models
class DashboardStats(BaseModel):
    total_installations: int
    active_users: int
    total_uninstalls: int
    uninstalls_this_week: int
    uninstalls_this_month: int
    classic_users: int
    premium_users: int
    premium_conversion_rate: float
    total_revenue: float
    monthly_revenue: float


class FeatureAnalytics(BaseModel):
    biometric_adoption_rate: float
    face_unlock_adoption_rate: float
    intruder_selfie_usage: int
    avg_secured_apps: float
    language_distribution: dict
    country_distribution: dict


class SystemHealth(BaseModel):
    api_latency_ms: float
    error_rate: float
    auth_success_rate: float
    active_sessions: int
    db_status: str
    last_checked: str


# Feedback Models
class FeedbackBase(BaseModel):
    user_id: str
    message: str


class FeedbackInDB(FeedbackBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: Literal["new", "reviewed", "responded", "archived"] = "new"
    admin_response: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    user_id: str
    message: str
    status: str
    admin_response: Optional[str]
    created_at: str
    reviewed_at: Optional[str]


# Settings Models
class SettingsUpdate(BaseModel):
    privacy_policy: Optional[str] = None
    terms_of_service: Optional[str] = None


class SettingsResponse(BaseModel):
    privacy_policy: str
    terms_of_service: str
    updated_at: str
    updated_by: Optional[str]


# Security Log Models
class SecurityLogCreate(BaseModel):
    event_type: str
    user_id: Optional[str] = None
    admin_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[dict] = None


class SecurityLogInDB(SecurityLogCreate):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SecurityLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    event_type: str
    user_id: Optional[str]
    admin_id: Optional[str]
    ip_address: Optional[str]
    details: Optional[dict]
    timestamp: str


# User Action Models
class UserActionRequest(BaseModel):
    user_id: str
    action: Literal["suspend", "deactivate", "resume"]
    reason: Optional[str] = None
