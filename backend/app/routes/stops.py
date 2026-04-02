"""Stop routes."""

from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.day import Day
from app.models.stop import Stop
from app.models.media import Media
from app.schemas.stop import StopCreate, StopUpdate, StopResponse

router = APIRouter(prefix="/api", tags=["stops"])


@router.post("/days/{day_id}/stops", response_model=StopResponse, status_code=201)
async def create_stop(
    day_id: UUID, data: StopCreate, db: AsyncSession = Depends(get_db)
):
    """Add a stop to a day."""
    day = await db.get(Day, day_id)
    if not day:
        raise HTTPException(status_code=404, detail="Day not found")

    stop = Stop(day_id=day_id, trip_id=day.trip_id, **data.model_dump())
    db.add(stop)
    await db.flush()
    await db.refresh(stop)

    # Re-fetch with media
    stmt = (
        select(Stop)
        .where(Stop.id == stop.id)
        .options(selectinload(Stop.media))
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.get("/trips/{trip_id}/stops", response_model=List[StopResponse])
async def list_stops_for_trip(trip_id: UUID, db: AsyncSession = Depends(get_db)):
    """List all stops for a trip, ordered chronologically."""
    stmt = (
        select(Stop)
        .where(Stop.trip_id == trip_id)
        .options(selectinload(Stop.media))
        .order_by(Stop.arrival_time.asc().nullslast(), Stop.sequence_order)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/stops/{stop_id}", response_model=StopResponse)
async def update_stop(
    stop_id: UUID, data: StopUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a stop (e.g., edit location after EXIF extraction)."""
    stop = await db.get(Stop, stop_id)
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(stop, key, value)
    await db.flush()

    stmt = (
        select(Stop)
        .where(Stop.id == stop.id)
        .options(selectinload(Stop.media))
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.delete("/stops/{stop_id}", status_code=204)
async def delete_stop(stop_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a stop and all its media."""
    stop = await db.get(Stop, stop_id)
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    await db.delete(stop)
    await db.flush()
