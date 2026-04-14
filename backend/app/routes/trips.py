"""Trip CRUD routes."""

from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.trip import TripCreate, TripUpdate, TripSummary, TripDetail
from app.services.trip_service import (
    create_trip,
    get_trips,
    get_trip_detail,
    update_trip,
    delete_trip,
)

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.post("", response_model=TripDetail, status_code=201)
async def create_trip_route(data: TripCreate, db: AsyncSession = Depends(get_db)):
    """Create a new trip."""
    trip = await create_trip(db, **data.model_dump())
    # Re-fetch with relationships
    full_trip = await get_trip_detail(db, trip.id)
    return full_trip


@router.get("", response_model=List[TripSummary])
async def list_trips_route(db: AsyncSession = Depends(get_db)):
    """List all trips with summary counts."""
    trips = await get_trips(db)
    return trips


@router.get("/{trip_id}", response_model=TripDetail)
async def get_trip_route(trip_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a trip with all nested days, stops, and media."""
    trip = await get_trip_detail(db, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.put("/{trip_id}", response_model=TripDetail)
async def update_trip_route(
    trip_id: UUID, data: TripUpdate, db: AsyncSession = Depends(get_db)
):
    """Update trip details."""
    trip = await update_trip(db, trip_id, **data.model_dump(exclude_unset=True))
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    full_trip = await get_trip_detail(db, trip.id)
    return full_trip


@router.delete("/{trip_id}", status_code=204)
async def delete_trip_route(trip_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a trip and all related data."""
    deleted = await delete_trip(db, trip_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Trip not found")


@router.get("/{trip_id}/debug")
async def debug_trip_route(trip_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Debug endpoint — returns raw stops and days for a trip to
    diagnose why data may not appear on the map or dashboard.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.day import Day
    from app.models.stop import Stop
    from app.models.media import Media

    trip = await get_trip_detail(db, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # All stops for this trip directly (bypassing day grouping)
    stmt = (
        select(Stop)
        .where(Stop.trip_id == trip_id)
        .options(selectinload(Stop.media))
        .order_by(Stop.sequence_order)
    )
    result = await db.execute(stmt)
    all_stops = result.scalars().all()

    # All days
    day_stmt = select(Day).where(Day.trip_id == trip_id)
    day_result = await db.execute(day_stmt)
    all_days = day_result.scalars().all()

    # All media
    media_stmt = select(Media).where(Media.trip_id == trip_id)
    media_result = await db.execute(media_stmt)
    all_media = media_result.scalars().all()

    return {
        "trip_id": str(trip_id),
        "title": trip.title,
        "days_count": len(all_days),
        "days": [
            {"id": str(d.id), "day_number": d.day_number, "title": d.title}
            for d in all_days
        ],
        "stops_count": len(all_stops),
        "stops": [
            {
                "id": str(s.id),
                "name": s.name,
                "day_id": str(s.day_id),
                "latitude": s.latitude,
                "longitude": s.longitude,
                "sequence_order": s.sequence_order,
                "arrival_time": s.arrival_time.isoformat() if s.arrival_time else None,
                "media_count": len(s.media),
                "has_valid_coords": s.latitude is not None and s.longitude is not None,
            }
            for s in all_stops
        ],
        "media_count": len(all_media),
        "media": [
            {
                "id": str(m.id),
                "file_name": m.file_name,
                "stop_id": str(m.stop_id) if m.stop_id else None,
                "latitude": m.latitude,
                "longitude": m.longitude,
                "taken_at": m.taken_at.isoformat() if m.taken_at else None,
            }
            for m in all_media
        ],
        "issues_detected": [
            *([f"Stop '{s.name}' (id: {s.id}) has no coordinates — will not appear on map"]
              for s in all_stops if s.latitude is None or s.longitude is None),
            *([f"Trip has {len(all_stops)} stops but 0 days — stops may not appear in dashboard timeline"]
              if len(all_stops) > 0 and len(all_days) == 0 else []),
        ]
    }
