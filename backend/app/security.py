import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from pwdlib import PasswordHash

from app.config import settings

ALGORITHM = "HS256"
password_hasher = PasswordHash.recommended()


def hash_password(plain_password: str) -> str:
    return password_hasher.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hasher.verify(plain_password, hashed_password)


def create_access_token(user_id: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def generate_one_time_token() -> tuple[str, str]:
    """Returns (raw_token_for_url, sha256_hash_for_db)."""
    raw = secrets.token_urlsafe(32)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, digest


def hash_one_time_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()