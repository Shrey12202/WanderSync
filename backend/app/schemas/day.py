"""Day request/response schemas."""

import uuid
# `date` is aliased to `_date` so the `date` *field* on the models below does
# not shadow the imported type when Pydantic re-evaluates annotations during
# `model_rebuild()` or JSON-schema generation. Without this alias, the field's
# default of `None` would replace the type, making the field reject any value
# other than None ("Input should be None").
from datetime import date as _date, datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class DayCreate(BaseModel):
    day_number: int
    date: Optional[_date] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class DayUpdate(BaseModel):
    day_number: Optional[int] = None
    date: Optional[_date] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class DayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    day_number: int
    date: Optional[_date] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    stops: List["StopResponse"] = []


from app.schemas.stop import StopResponse  # noqa: E402

DayResponse.model_rebuild()
