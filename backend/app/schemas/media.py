"""Media request/response schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MediaCreate(BaseModel):
    stop_id: Optional[uuid.UUID] = None
    trip_id: uuid.UUID
    caption: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MediaUpdate(BaseModel):
    stop_id: Optional[uuid.UUID] = None
    caption: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    taken_at: Optional[datetime] = None


class MediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    stop_id: Optional[uuid.UUID] = None
    trip_id: uuid.UUID
    file_path: str
    file_name: str
    file_type: str
    mime_type: Optional[str] = None
    thumbnail_path: Optional[str] = None
    caption: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    taken_at: Optional[datetime] = None
    file_size: Optional[int] = None
    created_at: datetime


class MediaWithContext(MediaResponse):
    """Media enriched with trip title and stop name for the global gallery."""
    trip_title: str
    stop_name: Optional[str] = None


class ExifResponse(BaseModel):
    """EXIF data extracted from an uploaded image."""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    taken_at: Optional[datetime] = None
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    has_gps: bool = False
