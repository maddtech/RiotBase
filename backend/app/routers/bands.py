from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import (
    get_band_or_404,
    get_current_user,
    require_band_admin,
    require_band_member,
)
from app.models import Band, BandInvite, BandMember, PasswordResetToken, User
from app.routers.auth import slugify_band
from app.schemas.auth_bands import (
    BandCreate,
    BandMemberOut,
    BandOut,
    InviteCreate,
    InviteOut,
    InvitePreviewOut,
    MemberRoleUpdate,
)
from app.security import generate_one_time_token

router = APIRouter(prefix="/api/v1", tags=["bands-and-invites"])


@router.get("/bands", response_model=list[BandOut])
def list_my_bands(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Band, BandMember.role)
        .join(BandMember, BandMember.band_id == Band.id)
        .filter(BandMember.user_id == current_user.id)
        .order_by(Band.created_at.asc())
        .all()
    )
    results = []
    for band, role in rows:
        item = BandOut.model_validate(band)
        item.my_role = role
        results.append(item)
    return results


@router.post("/bands", response_model=BandOut, status_code=status.HTTP_201_CREATED)
def create_band(
    payload: BandCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    band = Band(
        name=payload.name.strip(),
        slug=slugify_band(payload.name, db),
        home_city=payload.home_city,
        home_state=payload.home_state,
        default_timezone=payload.default_timezone,
    )
    db.add(band)
    db.flush()

    db.add(
        BandMember(
            band_id=band.id,
            user_id=current_user.id,
            role="admin",
            instrument_role=payload.instrument_role,
        )
    )
    db.commit()
    db.refresh(band)

    out = BandOut.model_validate(band)
    out.my_role = "admin"
    return out


@router.get("/bands/{band_id}", response_model=BandOut)
def get_band(
    membership: BandMember = Depends(require_band_member),
    band: Band = Depends(get_band_or_404),
):
    out = BandOut.model_validate(band)
    out.my_role = membership.role
    return out


@router.get("/bands/{band_id}/members", response_model=list[BandMemberOut])
def list_band_members(
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(BandMember, User)
        .join(User, User.id == BandMember.user_id)
        .filter(BandMember.band_id == membership.band_id)
        .order_by(BandMember.joined_at.asc())
        .all()
    )
    return [
        BandMemberOut(
            user_id=user.id,
            display_name=user.display_name,
            email=user.email,
            role=bm.role,
            instrument_role=bm.instrument_role,
            joined_at=bm.joined_at,
        )
        for bm, user in rows
    ]


@router.patch("/bands/{band_id}/members/{target_user_id}", response_model=BandMemberOut)
def update_band_member(
    target_user_id: str,
    payload: MemberRoleUpdate,
    membership: BandMember = Depends(require_band_admin),
    db: Session = Depends(get_db),
):
    target = (
        db.query(BandMember)
        .filter(BandMember.band_id == membership.band_id, BandMember.user_id == target_user_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Prevent demoting the last admin of a band
    if target.role == "admin" and payload.role != "admin":
        admin_count = (
            db.query(BandMember)
            .filter(BandMember.band_id == membership.band_id, BandMember.role == "admin")
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last remaining band admin",
            )

    target.role = payload.role
    if payload.instrument_role is not None:
        target.instrument_role = payload.instrument_role

    db.commit()
    user = db.get(User, target_user_id)
    return BandMemberOut(
        user_id=user.id,
        display_name=user.display_name,
        email=user.email,
        role=target.role,
        instrument_role=target.instrument_role,
        joined_at=target.joined_at,
    )


@router.post("/bands/{band_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_band_invite(
    payload: InviteCreate,
    membership: BandMember = Depends(require_band_admin),
    db: Session = Depends(get_db),
):
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)
        if payload.expires_in_hours
        else None
    )
    invite = BandInvite(
        band_id=membership.band_id,
        role=payload.role,
        expires_at=expires_at,
        max_uses=payload.max_uses,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/invites/{token}", response_model=InvitePreviewOut)
def preview_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(BandInvite).filter(BandInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite link has expired")
    if invite.max_uses is not None and invite.use_count >= invite.max_uses:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite link max uses reached")

    band = db.get(Band, invite.band_id)
    return InvitePreviewOut(
        band_name=band.name,
        home_city=band.home_city,
        home_state=band.home_state,
        role=invite.role,
    )


@router.post("/invites/{token}/accept", response_model=BandOut)
def accept_invite_existing_user(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(BandInvite).filter(BandInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite link has expired")
    if invite.max_uses is not None and invite.use_count >= invite.max_uses:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite link max uses reached")

    existing = (
        db.query(BandMember)
        .filter(BandMember.band_id == invite.band_id, BandMember.user_id == current_user.id)
        .first()
    )
    band = db.get(Band, invite.band_id)

    if existing:
        out = BandOut.model_validate(band)
        out.my_role = existing.role
        return out

    db.add(BandMember(band_id=invite.band_id, user_id=current_user.id, role=invite.role))
    invite.use_count += 1
    db.commit()

    out = BandOut.model_validate(band)
    out.my_role = invite.role
    return out


@router.post("/bands/{band_id}/members/{target_user_id}/reset-link")
def generate_member_reset_link(
    target_user_id: str,
    request: Request,
    membership: BandMember = Depends(require_band_admin),
    db: Session = Depends(get_db),
):
    target_member = (
        db.query(BandMember)
        .filter(BandMember.band_id == membership.band_id, BandMember.user_id == target_user_id)
        .first()
    )
    if not target_member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in this band")

    raw_token, token_hash = generate_one_time_token()
    reset = PasswordResetToken(
        user_id=target_user_id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(reset)
    db.commit()

    base_url = str(request.base_url).rstrip("/")
    return {
        "reset_url": f"{base_url}/reset-password/{raw_token}",
        "expires_in_hours": 24,
    }