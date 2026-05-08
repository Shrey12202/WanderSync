"""Profile-related endpoints (user settings)."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.home_location import HomeLocation
from app.schemas.home_location import HomeLocationCreate, HomeLocationResponse
from app.utils.auth import get_current_user_id


router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/home-locations", response_model=List[HomeLocationResponse])
async def list_home_locations(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    stmt = (
        select(HomeLocation)
        .where(HomeLocation.user_id == user_id)
        .order_by(HomeLocation.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/home-locations", response_model=HomeLocationResponse, status_code=201)
async def create_home_location(
    payload: HomeLocationCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    addr = payload.address.strip()
    if len(addr) < 3:
        raise HTTPException(status_code=400, detail="Address too short")

    row = HomeLocation(
        user_id=user_id,
        label=payload.label.strip() if payload.label else None,
        address=addr,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(row)
    await db.flush()  # assign id
    return row


@router.delete("/home-locations/{location_id}", status_code=204)
async def delete_home_location(
    location_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    stmt = delete(HomeLocation).where(HomeLocation.id == location_id, HomeLocation.user_id == user_id)
    result = await db.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Home location not found")
    return None

