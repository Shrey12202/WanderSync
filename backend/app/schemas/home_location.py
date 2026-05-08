"""Pydantic schemas for HomeLocation."""

from datetime import datetime
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, Field


class HomeLocationCreate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=80)
    address: str = Field(min_length=3)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class HomeLocationResponse(BaseModel):
    id: UUID
    user_id: str
    label: Optional[str] = None
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}

