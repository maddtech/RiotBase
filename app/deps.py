from fastapi import Depends, Header, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Band, BandMember, InstanceSettings, User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_instance_settings(db: Session = Depends(get_db)) -> InstanceSettings:
    inst = db.get(InstanceSettings, 1)
    if not inst:
        inst = InstanceSettings(id=1)
        db.add(inst)
        db.commit()
        db.refresh(inst)
    return inst


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_timezone: str | None = Header(default=None, alias="X-Timezone"),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Silently sync auto-detected browser timezone if user hasn't locked a manual override
    if x_timezone and not user.preferred_timezone:
        user.preferred_timezone = x_timezone[:64]
        db.commit()

    return user


def require_instance_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_instance_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instance admin privileges required")
    return current_user


def require_band_member(
    band_id: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BandMember:
    membership = (
        db.query(BandMember)
        .filter(BandMember.band_id == band_id, BandMember.user_id == current_user.id)
        .first()
    )
    if not membership:
        # Return 404 instead of 403 so unrelated tenants cannot enumerate valid band IDs
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Band not found")
    return membership


def require_band_admin(
    membership: BandMember = Depends(require_band_member),
) -> BandMember:
    if membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Band admin privileges required")
    return membership


def get_band_or_404(band_id: str = Path(...), db: Session = Depends(get_db)) -> Band:
    band = db.get(Band, band_id)
    if not band:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Band not found")
    return band