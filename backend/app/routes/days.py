"""Day routes — nested under trips."""

from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.day import Day
from app.models.stop import Stop
from app.models.trip import Trip
from app.schemas.day import DayCreate, DayUpdate, DayResponse

router = APIRouter(prefix="/api/trips/{trip_id}/days", tags=["days"])


@router.post("", response_model=DayResponse, status_code=201)
async def create_day(
    trip_id: UUID, data: DayCreate, db: AsyncSession = Depends(get_db)
):
    """Add a day to a trip."""
    # Verify trip exists
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    day = Day(trip_id=trip_id, **data.model_dump())
    db.add(day)
    await db.flush()
    await db.refresh(day)

    # Re-fetch with stops
    stmt = (
        select(Day)
        .where(Day.id == day.id)
        .options(selectinload(Day.stops).selectinload(Stop.media))
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.get("", response_model=List[DayResponse])
async def list_days(trip_id: UUID, db: AsyncSession = Depends(get_db)):
    """List all days for a trip."""
    stmt = (
        select(Day)
        .where(Day.trip_id == trip_id)
        .options(selectinload(Day.stops).selectinload(Stop.media))
        .order_by(Day.day_number)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/{day_id}", response_model=DayResponse)
async def update_day(
    trip_id: UUID, day_id: UUID, data: DayUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a day."""
    day = await db.get(Day, day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Day not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(day, key, value)
    await db.flush()

    stmt = (
        select(Day)
        .where(Day.id == day.id)
        .options(selectinload(Day.stops).selectinload(Stop.media))
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.delete("/{day_id}", status_code=204)
async def delete_day(
    trip_id: UUID, day_id: UUID, db: AsyncSession = Depends(get_db)
):
    """Delete a day and all its stops."""
    day = await db.get(Day, day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Day not found")
    await db.delete(day)
    await db.flush()
