from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class SystemStatusOut(BaseModel):
    initialized: bool
    public_signup_enabled: bool
    smtp_enabled: bool


class SetupRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    band_name: str = Field(min_length=1, max_length=150)
    home_city: str | None = Field(default=None, max_length=100)
    home_state: str | None = Field(default=None, max_length=100)
    default_timezone: str = Field(default="America/New_York", max_length=64)
    instrument_role: str | None = Field(default=None, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    invite_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    preferred_timezone: str | None
    is_instance_admin: bool

    model_config = {"from_attributes": True}


class BandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    home_city: str | None = Field(default=None, max_length=100)
    home_state: str | None = Field(default=None, max_length=100)
    default_timezone: str = Field(default="America/New_York", max_length=64)
    instrument_role: str | None = Field(default=None, max_length=80)


class BandOut(BaseModel):
    id: str
    name: str
    slug: str
    home_city: str | None
    home_state: str | None
    default_timezone: str
    ical_token: str
    my_role: str | None = None

    model_config = {"from_attributes": True}


class BandMemberOut(BaseModel):
    user_id: str
    display_name: str
    email: str
    role: str
    instrument_role: str | None
    joined_at: datetime


class MemberRoleUpdate(BaseModel):
    role: str = Field(pattern="^(admin|member)$")
    instrument_role: str | None = None


class InviteCreate(BaseModel):
    role: str = Field(default="member", pattern="^(admin|member)$")
    expires_in_hours: int | None = Field(default=168, ge=1, le=720)  # Default 7 days
    max_uses: int | None = Field(default=None, ge=1, le=100)


class InviteOut(BaseModel):
    id: str
    token: str
    role: str
    expires_at: datetime | None
    max_uses: int | None
    use_count: int

    model_config = {"from_attributes": True}


class InvitePreviewOut(BaseModel):
    band_name: str
    home_city: str | None
    home_state: str | None
    role: str


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)