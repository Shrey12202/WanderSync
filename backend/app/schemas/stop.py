"""Stop request/response schemas."""

import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class StopCreate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    sequence_order: int = 0


class StopUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    sequence_order: Optional[int] = None


class StopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    day_id: uuid.UUID
    trip_id: uuid.UUID
    name: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    sequence_order: int
    created_at: datetime
    media: List["MediaResponse"] = []


from app.schemas.media import MediaResponse  # noqa: E402

StopResponse.model_rebuild()
