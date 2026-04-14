"""Trip CRUD service."""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.trip import Trip
from app.models.day import Day
from app.models.stop import Stop
from app.models.media import Media


async def create_trip(db: AsyncSession, **kwargs) -> Trip:
    trip = Trip(**kwargs)
    db.add(trip)
    await db.flush()
    await db.refresh(trip)
    return trip


async def get_trips(db: AsyncSession) -> List[dict]:
    """Get all trips with stop and media counts."""
    stmt = (
        select(
            Trip,
            func.count(Stop.id.distinct()).label("stop_count"),
            func.count(Media.id.distinct()).label("media_count"),
        )
        .outerjoin(Stop, Stop.trip_id == Trip.id)
        .outerjoin(Media, Media.trip_id == Trip.id)
        .group_by(Trip.id)
        .order_by(Trip.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    trips = []
    for trip, stop_count, media_count in rows:
        trip_dict = {
            "id": trip.id,
            "title": trip.title,
            "description": trip.description,
            "cover_image": trip.cover_image,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
            "created_at": trip.created_at,
            "updated_at": trip.updated_at,
            "stop_count": stop_count,
            "media_count": media_count,
        }
        trips.append(trip_dict)
    return trips


async def get_trip_detail(db: AsyncSession, trip_id: UUID) -> Optional[Trip]:
    """Get a trip with all nested days → stops → media."""
    stmt = (
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.days)
            .selectinload(Day.stops)
            .selectinload(Stop.media)
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_trip(db: AsyncSession, trip_id: UUID, **kwargs) -> Optional[Trip]:
    trip = await db.get(Trip, trip_id)
    if not trip:
        return None
    for key, value in kwargs.items():
        if value is not None:
            setattr(trip, key, value)
    await db.flush()
    await db.refresh(trip)
    return trip


async def delete_trip(db: AsyncSession, trip_id: UUID) -> bool:
    trip = await db.get(Trip, trip_id)
    if not trip:
        return False
    await db.delete(trip)
    await db.flush()
    return True
