"""Media upload and management routes."""

from uuid import UUID
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.media import Media
from app.models.stop import Stop
from app.models.trip import Trip
from app.schemas.media import MediaResponse, MediaUpdate, ExifResponse, MediaWithContext
from app.services.media_service import process_upload
from app.services.exif_service import extract_exif
from app.services.storage import storage
from app.config import settings
from app.utils.auth import get_current_user_id

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/all", response_model=List[MediaWithContext])
async def get_all_media(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """
    Get all media for the authenticated user across all trips + standalone uploads.
    Ordered by taken_at descending (newest first).
    """
    stmt = (
        select(Media, Trip.title.label("trip_title"), Stop.name.label("stop_name"))
        .outerjoin(Trip, Media.trip_id == Trip.id)
        .outerjoin(Stop, Media.stop_id == Stop.id)
        .where(
            or_(
                Trip.user_id == user_id,          # media attached to user's trips
                Media.user_id == user_id,          # standalone uploads
            )
        )
        .order_by(Media.taken_at.desc().nullslast(), Media.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for media, trip_title, stop_name in rows:
        item = MediaWithContext.model_validate(media)
        item.trip_title = trip_title or "Standalone"
        item.stop_name = stop_name
        items.append(item)
    return items


@router.post("/upload", response_model=MediaResponse, status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    trip_id: Optional[UUID] = Form(None),   # Optional — standalone uploads allowed
    stop_id: Optional[UUID] = Form(None),
    caption: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    taken_at: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """
    Upload a media file (image/video).
    trip_id is optional — if omitted, the photo is saved as a standalone memory.
    """
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {settings.max_upload_size // (1024*1024)}MB",
        )

    mime_type = file.content_type or "application/octet-stream"
    if not (mime_type.startswith("image/") or mime_type.startswith("video/")):
        raise HTTPException(status_code=400, detail="Only image and video files are accepted")

    media = await process_upload(
        file_bytes=file_bytes,
        filename=file.filename or "unnamed",
        mime_type=mime_type,
        trip_id=trip_id,
        stop_id=stop_id,
        caption=caption,
        override_lat=latitude,
        override_lng=longitude,
        override_date=datetime.fromisoformat(taken_at) if taken_at else None,
        db=db,
        user_id=user_id,
    )

    return media


@router.post("/extract-exif", response_model=ExifResponse)
async def extract_exif_route(file: UploadFile = File(...)):
    """Extract EXIF metadata from an image without uploading it."""
    file_bytes = await file.read()
    return extract_exif(file_bytes)


@router.get("/{media_id}", response_model=MediaResponse)
async def get_media(media_id: UUID, db: AsyncSession = Depends(get_db)):
    media = await db.get(Media, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    return media


@router.put("/{media_id}", response_model=MediaResponse)
async def update_media(
    media_id: UUID,
    data: MediaUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    media = await db.get(Media, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(media, key, value)
    await db.flush()
    await db.refresh(media)
    return media


@router.delete("/{media_id}", status_code=204)
async def delete_media(
    media_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    media = await db.get(Media, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    await storage.delete(media.file_path)
    if media.thumbnail_path:
        await storage.delete(media.thumbnail_path)

    await db.delete(media)
    await db.flush()
