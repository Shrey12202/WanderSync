"""
EXIF metadata extraction service.

Extracts GPS coordinates, timestamps, and camera info from images
using Pillow.
"""

import io
from datetime import datetime
from typing import Optional, Any, Dict

from PIL import Image, ExifTags
from PIL.ExifTags import GPSTAGS

from app.schemas.media import ExifResponse


def _dms_to_decimal(dms_tuple, ref: str) -> Optional[float]:
    """Convert GPS Degrees-Minutes-Seconds to decimal degrees."""
    try:
        degrees = float(dms_tuple[0])
        minutes = float(dms_tuple[1])
        seconds = float(dms_tuple[2])

        decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)

        if ref in ("S", "W"):
            decimal = -decimal

        return round(decimal, 8)
    except (TypeError, ValueError, IndexError):
        return None


def _parse_exif_datetime(dt_str: str) -> Optional[datetime]:
    """Parse EXIF datetime string (format: 'YYYY:MM:DD HH:MM:SS')."""
    formats = [
        "%Y:%m:%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y:%m:%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(str(dt_str).strip(), fmt)
        except (ValueError, TypeError):
            continue
    return None


def extract_exif(file_bytes: bytes) -> ExifResponse:
    """
    Extract EXIF metadata from image bytes.

    Returns an ExifResponse with GPS coordinates, timestamp, and camera info.
    Non-image files or images without EXIF return empty response.
    """
    result = ExifResponse()

    try:
        image = Image.open(io.BytesIO(file_bytes))
    except Exception:
        return result

    try:
        exif_data = image._getexif()
    except Exception:
        return result

    if not exif_data:
        return result

    # Build decoded EXIF dict
    decoded: Dict[str, Any] = {}
    for tag_id, value in exif_data.items():
        tag_name = ExifTags.TAGS.get(tag_id, tag_id)
        decoded[tag_name] = value

    # Extract camera info
    result.camera_make = str(decoded.get("Make", "")).strip() or None
    result.camera_model = str(decoded.get("Model", "")).strip() or None

    # Extract timestamp
    dt_str = decoded.get("DateTimeOriginal") or decoded.get("DateTime")
    if dt_str:
        result.taken_at = _parse_exif_datetime(str(dt_str))

    # Extract GPS coordinates
    gps_info_raw = decoded.get("GPSInfo")
    if gps_info_raw:
        gps_info: Dict[str, Any] = {}
        for key in gps_info_raw:
            gps_tag = GPSTAGS.get(key, key)
            gps_info[gps_tag] = gps_info_raw[key]

        lat = _dms_to_decimal(
            gps_info.get("GPSLatitude"),
            gps_info.get("GPSLatitudeRef", "N"),
        )
        lng = _dms_to_decimal(
            gps_info.get("GPSLongitude"),
            gps_info.get("GPSLongitudeRef", "E"),
        )

        if lat is not None and lng is not None:
            result.latitude = lat
            result.longitude = lng
            result.has_gps = True

    return result


def get_raw_exif_dict(file_bytes: bytes) -> Optional[dict]:
    """Extract raw EXIF data as a JSON-serializable dict for storage."""
    try:
        image = Image.open(io.BytesIO(file_bytes))
        exif_data = image._getexif()
    except Exception:
        return None

    if not exif_data:
        return None

    result = {}
    for tag_id, value in exif_data.items():
        tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
        # Convert non-serializable types to strings
        try:
            if isinstance(value, bytes):
                continue  # Skip binary data
            elif isinstance(value, dict):
                result[tag_name] = {str(k): str(v) for k, v in value.items()}
            else:
                result[tag_name] = str(value)
        except Exception:
            continue

    return result
