from io import BytesIO
from pathlib import Path
import secrets

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

MAX_FLYER_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_DIMENSION_PX = 10000

# Map Pillow format names -> (file extension, MIME type, Pillow save kwargs)
ALLOWED_FORMATS: dict[str, tuple[str, str, dict]] = {
    "JPEG": ("jpg", "image/jpeg", {"format": "JPEG", "quality": 90, "optimize": True}),
    "PNG": ("png", "image/png", {"format": "PNG", "optimize": True}),
    "WEBP": ("webp", "image/webp", {"format": "WEBP", "quality": 90}),
}


def get_band_flyers_dir(band_id: str) -> Path:
    """Return /data/uploads/flyers/{band_id} (respecting DATA_DIR) with safe path containment."""
    base = (Path(settings.DATA_DIR) / "uploads" / "flyers").resolve()
    safe_band_id = Path(band_id).name
    target = (base / safe_band_id).resolve()
    if base not in target.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid band identifier")
    return target


def resolve_flyer_path(band_id: str, filename: str) -> Path | None:
    """Safely resolve a stored flyer filename inside the band's flyers directory."""
    if not filename:
        return None
    safe_name = Path(filename).name
    if safe_name != filename or safe_name in {".", ".."}:
        return None
    band_dir = get_band_flyers_dir(band_id)
    candidate = (band_dir / safe_name).resolve()
    if band_dir not in candidate.parents:
        return None
    return candidate


def delete_flyer_file(band_id: str, filename: str | None) -> None:
    """Delete a flyer file from disk if it exists, ignoring missing files."""
    if not filename:
        return
    path = resolve_flyer_path(band_id, filename)
    if path and path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


async def save_verified_flyer(band_id: str, event_id: str, upload: UploadFile) -> tuple[str, str]:
    """
    Validate an uploaded image using Pillow (JPG, PNG, WebP only), strip metadata/EXIF,
    normalize orientation, and persist to {DATA_DIR}/uploads/flyers/{band_id}/.
    Returns (stored_filename, content_type).
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(256 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FLYER_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Flyer exceeds the 10 MB maximum file size.",
            )
        chunks.append(chunk)

    raw_bytes = b"".join(chunks)
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    # Step 1: Verify image integrity and format with Pillow
    try:
        with Image.open(BytesIO(raw_bytes)) as img:
            detected_format = (img.format or "").upper()
            width, height = img.size
            img.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or corrupted image file. Upload a valid JPG, PNG, or WebP flyer.",
        )

    if detected_format not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format. Only JPG, PNG, and WebP flyers are allowed.",
        )

    if width <= 0 or height <= 0 or width > MAX_DIMENSION_PX or height > MAX_DIMENSION_PX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image dimensions exceed the maximum allowed size ({MAX_DIMENSION_PX}x{MAX_DIMENSION_PX}px).",
        )

    ext, mime_type, save_kwargs = ALLOWED_FORMATS[detected_format]

    # Step 2: Re-open, normalize EXIF orientation, and re-encode cleanly (strips EXIF/metadata)
    try:
        with Image.open(BytesIO(raw_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            if detected_format == "JPEG" and img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            out_buf = BytesIO()
            img.save(out_buf, **save_kwargs)
            clean_bytes = out_buf.getvalue()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process uploaded image file.",
        )

    # Step 3: Persist atomically into /data/uploads/flyers/{band_id}/
    band_dir = get_band_flyers_dir(band_id)
    band_dir.mkdir(parents=True, exist_ok=True)

    safe_event_id = Path(event_id).name
    filename = f"{safe_event_id}_{secrets.token_hex(4)}.{ext}"
    dest = band_dir / filename
    tmp_dest = band_dir / f".{filename}.tmp"

    tmp_dest.write_bytes(clean_bytes)
    tmp_dest.replace(dest)

    return filename, mime_type
