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
