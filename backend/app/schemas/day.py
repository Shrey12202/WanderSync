"""Day request/response schemas."""

import uuid
from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class DayCreate(BaseModel):
    day_number: int
    date: Optional[date] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class DayUpdate(BaseModel):
    day_number: Optional[int] = None
    date: Optional[date] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class DayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    day_number: int
    date: Optional[date] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    stops: List["StopResponse"] = []


from app.schemas.stop import StopResponse  # noqa: E402

DayResponse.model_rebuild()
