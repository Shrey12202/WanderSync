"""Map data and heatmap routes — GeoJSON outputs for Mapbox."""

from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.stop import Stop
from app.models.media import Media
from app.models.trip import Trip

router = APIRouter(prefix="/api", tags=["map"])


@router.get("/map-data/{trip_id}")
async def get_map_data(trip_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Get GeoJSON data for a trip's map visualization.

    Returns:
    - stops: GeoJSON FeatureCollection of stop points
    - path: GeoJSON LineString connecting stops in order
    - media_points: GeoJSON FeatureCollection of geotagged media
    """
    # Verify trip exists
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Get all stops with coordinates, ordered
    stmt = (
        select(Stop)
        .where(Stop.trip_id == trip_id, Stop.latitude.isnot(None), Stop.longitude.isnot(None))
        .order_by(Stop.sequence_order)
    )
    result = await db.execute(stmt)
    stops = result.scalars().all()

    # Build stop features
    stop_features = []
    path_coordinates = []

    for stop in stops:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [stop.longitude, stop.latitude],
            },
            "properties": {
                "id": str(stop.id),
                "name": stop.name or "Unnamed Stop",
                "description": stop.description,
                "arrival_time": stop.arrival_time.isoformat() if stop.arrival_time else None,
                "departure_time": stop.departure_time.isoformat() if stop.departure_time else None,
                "sequence_order": stop.sequence_order,
            },
        }
        stop_features.append(feature)
        path_coordinates.append([stop.longitude, stop.latitude])

    # Build path LineString
    path = None
    if len(path_coordinates) >= 2:
        path = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": path_coordinates,
            },
            "properties": {
                "trip_id": str(trip_id),
                "trip_title": trip.title,
            },
        }

    # Get geotagged media
    media_stmt = (
        select(Media)
        .where(
            Media.trip_id == trip_id,
            Media.latitude.isnot(None),
            Media.longitude.isnot(None),
        )
        .order_by(Media.taken_at.asc().nullslast())
    )
    media_result = await db.execute(media_stmt)
    media_items = media_result.scalars().all()

    media_features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [m.longitude, m.latitude],
            },
            "properties": {
                "id": str(m.id),
                "file_path": m.file_path,
                "thumbnail_path": m.thumbnail_path,
                "caption": m.caption,
                "taken_at": m.taken_at.isoformat() if m.taken_at else None,
                "file_type": m.file_type,
            },
        }
        for m in media_items
    ]

    return {
        "stops": {
            "type": "FeatureCollection",
            "features": stop_features,
        },
        "path": path,
        "media": {
            "type": "FeatureCollection",
            "features": media_features,
        },
        "bounds": _calculate_bounds(stops),
    }


@router.get("/heatmap")
async def get_heatmap_data(db: AsyncSession = Depends(get_db)):
    """
    Get all stop coordinates for heatmap visualization.

    Returns array of [lng, lat, weight] for Mapbox heatmap layer.
    Weight is based on number of media at each stop.
    """
    stmt = (
        select(Stop)
        .options(selectinload(Stop.media))
        .where(Stop.latitude.isnot(None), Stop.longitude.isnot(None))
    )
    result = await db.execute(stmt)
    stops = result.scalars().all()

    points = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [stop.longitude, stop.latitude],
                },
                "properties": {
                    "id": str(stop.id),
                    "name": stop.name,
                    # Base weight 1 to ensure a stop always glows slightly, +2 for every photo.
                    "weight": 1 + (len(stop.media) * 2),
                },
            }
            for stop in stops
        ],
    }

    return points


def _calculate_bounds(stops: list) -> Optional[dict]:
    """Calculate bounding box for a set of stops."""
    if not stops:
        return None

    lats = [s.latitude for s in stops if s.latitude is not None]
    lngs = [s.longitude for s in stops if s.longitude is not None]

    if not lats or not lngs:
        return None

    padding = 0.01  # ~1km padding
    return {
        "sw": [min(lngs) - padding, min(lats) - padding],
        "ne": [max(lngs) + padding, max(lats) + padding],
    }

@router.get("/global-paths")
async def get_global_paths(db: AsyncSession = Depends(get_db)):
    """
    Get all trip paths with distinct colors for the global map.
    """
    # Eager load stops ordered properly for all trips
    stmt = (
        select(Stop)
        .where(Stop.latitude.isnot(None), Stop.longitude.isnot(None))
        .order_by(Stop.trip_id, Stop.sequence_order)
    )
    result = await db.execute(stmt)
    stops = result.scalars().all()

    # Group stops by trip
    trip_paths = {}
    for stop in stops:
        if stop.trip_id not in trip_paths:
            trip_paths[stop.trip_id] = []
        trip_paths[stop.trip_id].append([stop.longitude, stop.latitude])

    # A palette of vibrant map colors that distinctly contrast against blue oceans and green landmasses
    colors = ["#ff007f", "#ff4500", "#9400d3", "#ff1493", "#ff6347", "#8b008b", "#dc143c"]

    features = []
    for trip_id, coords in trip_paths.items():
        if len(coords) >= 2:
            # Deterministic color assignment based on UUID integer value
            color_index = trip_id.int % len(colors)
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
                "properties": {
                    "trip_id": str(trip_id),
                    "color": colors[color_index]
                }
            })

    return {
        "type": "FeatureCollection",
        "features": features
    }
