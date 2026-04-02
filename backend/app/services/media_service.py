"""
Media upload and processing service.

Handles the full upload flow: save file → extract EXIF → generate thumbnail → create DB record.
"""

import io
from typing import Optional
from uuid import UUID
from datetime import datetime

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media import Media
from app.services.storage import storage, thumbnail_storage
from app.services.exif_service import extract_exif, get_raw_exif_dict


# Thumbnail settings
THUMB_MAX_SIZE = (400, 400)
THUMB_QUALITY = 85


async def generate_thumbnail(file_bytes: bytes, original_filename: str) -> Optional[str]:
    """Generate a thumbnail for image files. Returns the thumbnail path or None."""
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.thumbnail(THUMB_MAX_SIZE, Image.Resampling.LANCZOS)

        # Convert to RGB if necessary (e.g., RGBA PNGs)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # Save thumbnail to bytes
        thumb_buffer = io.BytesIO()
        image.save(thumb_buffer, format="JPEG", quality=THUMB_QUALITY)
        thumb_bytes = thumb_buffer.getvalue()

        # Save using thumbnail storage
        thumb_path = await thumbnail_storage.save(thumb_bytes, original_filename)
        return thumb_path
    except Exception:
        return None


def detect_file_type(mime_type: str) -> str:
    """Determine if a file is an image or video based on MIME type."""
    if mime_type and mime_type.startswith("image/"):
        return "image"
    elif mime_type and mime_type.startswith("video/"):
        return "video"
    return "image"  # Default to image


async def process_upload(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    trip_id: UUID,
    stop_id: Optional[UUID],
    caption: Optional[str],
    override_lat: Optional[float],
    override_lng: Optional[float],
    override_date: Optional[datetime],
    db: AsyncSession,
) -> Media:
    """
    Full upload pipeline:
    1. Save original file
    2. Extract EXIF metadata
    3. Generate thumbnail (for images)
    4. Create database record
    """
    file_type = detect_file_type(mime_type)

    # 1. Save the original file
    file_path = await storage.save(file_bytes, filename, subdir=str(trip_id))

    # 2. Extract EXIF from images
    exif_data = None
    latitude = override_lat
    longitude = override_lng
    taken_at = None

    if file_type == "image":
        exif_result = extract_exif(file_bytes)

        # Use EXIF GPS if no override provided
        if latitude is None and exif_result.has_gps:
            latitude = exif_result.latitude
        if longitude is None and exif_result.has_gps:
            longitude = exif_result.longitude

        taken_at = override_date if override_date else exif_result.taken_at
        exif_data = get_raw_exif_dict(file_bytes)

    # 3. Generate thumbnail for images
    thumbnail_path = None
    if file_type == "image":
        thumbnail_path = await generate_thumbnail(file_bytes, filename)

    # 4. Create database record
    media = Media(
        trip_id=trip_id,
        stop_id=stop_id,
        file_path=file_path,
        file_name=filename,
        file_type=file_type,
        mime_type=mime_type,
        thumbnail_path=thumbnail_path,
        caption=caption,
        latitude=latitude,
        longitude=longitude,
        taken_at=taken_at,
        file_size=len(file_bytes),
        exif_data=exif_data,
    )
    db.add(media)
    await db.flush()
    await db.refresh(media)

    return media
