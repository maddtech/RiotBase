import re
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_instance_settings
from app.models import (
    Band,
    BandInvite,
    BandMember,
    InstanceSettings,
    PasswordResetToken,
    User,
)
from app.schemas.auth_bands import (
    LoginRequest,
    PasswordResetRequest,
    RegisterRequest,
    SetupRequest,
    SystemStatusOut,
    TokenResponse,
    UserOut,
)
from app.security import (
    create_access_token,
    hash_one_time_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/v1", tags=["system-and-auth"])


def slugify_band(name: str, db: Session) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "band"
    slug = base
    while db.query(Band).filter(Band.slug == slug).first():
        slug = f"{base}-{secrets.token_hex(2)}"
    return slug


@router.get("/system/status", response_model=SystemStatusOut)
def get_system_status(
    db: Session = Depends(get_db),
    inst: InstanceSettings = Depends(get_instance_settings),
):
    initialized = db.query(User.id).first() is not None
    public_signup = inst.allow_public_signup or settings.ALLOW_PUBLIC_SIGNUP
    smtp_enabled = bool((inst.smtp_host or settings.SMTP_HOST) and (inst.smtp_from or settings.SMTP_FROM))
    return SystemStatusOut(
        initialized=initialized,
        public_signup_enabled=public_signup,
        smtp_enabled=smtp_enabled,
    )


@router.post("/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def run_first_time_setup(
    payload: SetupRequest,
    db: Session = Depends(get_db),
    inst: InstanceSettings = Depends(get_instance_settings),
):
    # Permanently lock setup once the first user exists
    if db.query(User.id).first() is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instance is already initialized")

    inst.allow_public_signup = settings.ALLOW_PUBLIC_SIGNUP

    user = User(
        email=payload.email.lower().strip(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        preferred_timezone=payload.default_timezone,
        is_instance_admin=True,
    )
    db.add(user)
    db.flush()

    band = Band(
        name=payload.band_name.strip(),
        slug=slugify_band(payload.band_name, db),
        home_city=payload.home_city,
        home_state=payload.home_state,
        default_timezone=payload.default_timezone,
    )
    db.add(band)
    db.flush()

    membership = BandMember(
        band_id=band.id,
        user_id=user.id,
        role="admin",
        instrument_role=payload.instrument_role,
    )
    db.add(membership)
    db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    inst: InstanceSettings = Depends(get_instance_settings),
):
    if db.query(User.id).first() is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Complete /setup first")

    invite: BandInvite | None = None
    if payload.invite_token:
        invite = db.query(BandInvite).filter(BandInvite.token == payload.invite_token).first()
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link")
        if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite link has expired")
        if invite.max_uses is not None and invite.use_count >= invite.max_uses:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite link max uses reached")
    elif not (inst.allow_public_signup or settings.ALLOW_PUBLIC_SIGNUP):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is disabled on this server; an invite link is required",
        )

    normalized_email = payload.email.lower().strip()
    if db.query(User).filter(User.email == normalized_email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=normalized_email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        is_instance_admin=False,
    )
    db.add(user)
    db.flush()

    if invite:
        db.add(BandMember(band_id=invite.band_id, user_id=user.id, role=invite.role))
        invite.use_count += 1

    db.commit()
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/auth/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def consume_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    digest = hash_one_time_token(payload.token)
    reset = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == digest).first()

    now = datetime.now(timezone.utc)
    if not reset or reset.used_at is not None or reset.expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    user = db.get(User, reset.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password_hash = hash_password(payload.new_password)
    reset.used_at = now
    db.commit()


@router.get("/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user