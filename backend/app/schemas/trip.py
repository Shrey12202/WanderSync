"""Trip request/response schemas."""

import uuid
from datetime import date, datetime
from typing import Any, Optional, List

from pydantic import BaseModel, ConfigDict


# ── Request schemas ──────────────────────────────────────────

class TripCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    # Optional live-recorded GPS track (GeoJSON LineString) + summary stats.
    # Only set by the /trips/record flow.
    track_geojson: Optional[Any] = None
    track_distance_m: Optional[float] = None
    track_duration_s: Optional[int] = None


class TripUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_image: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    track_geojson: Optional[Any] = None
    track_distance_m: Optional[float] = None
    track_duration_s: Optional[int] = None


# ── Response schemas ─────────────────────────────────────────

class TripBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    track_geojson: Optional[Any] = None
    track_distance_m: Optional[float] = None
    track_duration_s: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class TripSummary(TripBase):
    """Lightweight trip object for list views."""
    stop_count: int = 0
    media_count: int = 0


class TripDetail(TripBase):
    """Full trip with nested days, stops, media."""
    days: List["DayResponse"] = []


# Import here to avoid circular deps with day→stop
from app.schemas.day import DayResponse  # noqa: E402

TripDetail.model_rebuild()
