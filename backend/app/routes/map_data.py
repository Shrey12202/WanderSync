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
from app.utils.auth import get_current_user_id

router = APIRouter(prefix="/api", tags=["map"])

# High-contrast palette for globe / global paths (jewel tones — reads well on dark basemap)
TRIP_THEME_COLORS = [
    "#FF3D92",  # magenta
    "#00E8C6",  # aqua
    "#FFB020",  # gold
    "#9D59FF",  # violet
    "#3DEBFF",  # electric cyan
    "#FFB84D",  # tangerine
    "#62FF73",  # lime
    "#FF5CF0",  # fuchsia
    "#6EE7FF",  # ice blue
    "#FFD54A",  # lemon
]


@router.get("/map-data/{trip_id}")
async def get_map_data(
    trip_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """GeoJSON data for a trip's map visualization (auth-scoped)."""
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your trip")

    stmt = (
        select(Stop)
        .where(Stop.trip_id == trip_id, Stop.latitude.isnot(None), Stop.longitude.isnot(None))
        .order_by(Stop.sequence_order)
    )
    result = await db.execute(stmt)
    stops = result.scalars().all()

    stop_features = []
    path_coordinates = []

    for stop in stops:
        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [stop.longitude, stop.latitude]},
            "properties": {
                "id": str(stop.id),
                "name": stop.name or "Unnamed Stop",
                "description": stop.description,
                "arrival_time": stop.arrival_time.isoformat() if stop.arrival_time else None,
                "departure_time": stop.departure_time.isoformat() if stop.departure_time else None,
                "sequence_order": stop.sequence_order,
                "place_id": stop.place_id,
                "is_airport": stop.is_airport,
            },
        }
        stop_features.append(feature)
        path_coordinates.append([stop.longitude, stop.latitude])

    path = None
    # Live-recorded walks have an actual GPS LineString — prefer that over
    # the straight-line stops geometry.
    if trip.track_geojson and isinstance(trip.track_geojson, dict):
        coords = trip.track_geojson.get("coordinates") or []
        if len(coords) >= 2:
            path = {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {
                    "trip_id": str(trip_id),
                    "trip_title": trip.title,
                    "is_track": True,
                },
            }
    if path is None and len(path_coordinates) >= 2:
        path = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": path_coordinates},
            "properties": {"trip_id": str(trip_id), "trip_title": trip.title},
        }

    media_stmt = (
        select(Media)
        .where(Media.trip_id == trip_id, Media.latitude.isnot(None), Media.longitude.isnot(None))
        .order_by(Media.taken_at.asc().nullslast())
    )
    media_result = await db.execute(media_stmt)
    media_items = media_result.scalars().all()

    media_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [m.longitude, m.latitude]},
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
        "stops": {"type": "FeatureCollection", "features": stop_features},
        "path": path,
        "media": {"type": "FeatureCollection", "features": media_features},
        "bounds": _calculate_bounds(stops),
    }


@router.get("/heatmap")
async def get_heatmap_data(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Heatmap of stops — scoped to the authenticated user."""
    from sqlalchemy import and_, or_
    stmt = (
        select(Stop)
        .join(Trip, Stop.trip_id == Trip.id)
        .options(selectinload(Stop.media))
        .where(
            or_(Trip.user_id == user_id, Trip.user_id.is_(None)),
            Stop.latitude.isnot(None),
            Stop.longitude.isnot(None),
        )
    )
    result = await db.execute(stmt)
    stops = result.scalars().all()

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [stop.longitude, stop.latitude]},
                "properties": {"id": str(stop.id), "name": stop.name, "weight": 1 + len(stop.media) * 2},
            }
            for stop in stops
        ],
    }


@router.get("/global-paths")
async def get_global_paths(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """All trip paths for the global map — scoped to the authenticated user.

    Live-recorded walks render their captured GPS track; planned trips render
    a straight-line geometry connecting their stops.
    """
    from sqlalchemy import or_

    # 1. Fetch trips with a recorded track first — they short-circuit stops.
    trip_stmt = select(Trip).where(or_(Trip.user_id == user_id, Trip.user_id.is_(None)))
    trip_result = await db.execute(trip_stmt)
    trips = trip_result.scalars().all()

    track_paths: dict = {}
    for t in trips:
        if t.track_geojson and isinstance(t.track_geojson, dict):
            coords = t.track_geojson.get("coordinates") or []
            if len(coords) >= 2:
                track_paths[t.id] = coords

    # 2. Stops-based geometry for trips without a recorded track.
    stmt = (
        select(Stop)
        .join(Trip, Stop.trip_id == Trip.id)
        .where(
            or_(Trip.user_id == user_id, Trip.user_id.is_(None)),
            Stop.latitude.isnot(None),
            Stop.longitude.isnot(None),
        )
        .order_by(Stop.trip_id, Stop.sequence_order)
    )
    result = await db.execute(stmt)
    stops = result.scalars().all()

    trip_paths: dict = {}
    for stop in stops:
        if stop.trip_id in track_paths:
            continue  # already covered by the recorded track above
        if stop.trip_id not in trip_paths:
            trip_paths[stop.trip_id] = []
        trip_paths[stop.trip_id].append([stop.longitude, stop.latitude])

    features = []
    for trip_id, coords in track_paths.items():
        color_index = trip_id.int % len(TRIP_THEME_COLORS)
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"trip_id": str(trip_id), "color": TRIP_THEME_COLORS[color_index], "is_track": True},
        })
    for trip_id, coords in trip_paths.items():
        if len(coords) >= 2:
            color_index = trip_id.int % len(TRIP_THEME_COLORS)
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {"trip_id": str(trip_id), "color": TRIP_THEME_COLORS[color_index]},
            })

    return {"type": "FeatureCollection", "features": features}


@router.get("/all-stops-map")
async def get_all_stops_map(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Every stop with coordinates as points — for dashboard map (no route lines)."""
    from sqlalchemy import or_

    stmt = (
        select(Stop, Trip.title)
        .join(Trip, Stop.trip_id == Trip.id)
        .where(
            or_(Trip.user_id == user_id, Trip.user_id.is_(None)),
            Stop.latitude.isnot(None),
            Stop.longitude.isnot(None),
        )
        .order_by(Stop.trip_id, Stop.sequence_order)
    )
    result = await db.execute(stmt)
    rows = result.all()

    features = []
    for stop, trip_title in rows:
        color_index = stop.trip_id.int % len(TRIP_THEME_COLORS)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [stop.longitude, stop.latitude]},
            "properties": {
                "id": str(stop.id),
                "name": stop.name or "Stop",
                "trip_id": str(stop.trip_id),
                "trip_title": trip_title or "Trip",
                "sequence_order": stop.sequence_order,
                "color": TRIP_THEME_COLORS[color_index],
            },
        })

    return {"type": "FeatureCollection", "features": features}


def _calculate_bounds(stops: list) -> Optional[dict]:
    if not stops:
        return None
    lats = [s.latitude for s in stops if s.latitude is not None]
    lngs = [s.longitude for s in stops if s.longitude is not None]
    if not lats or not lngs:
        return None
    padding = 0.01
    return {"sw": [min(lngs) - padding, min(lats) - padding], "ne": [max(lngs) + padding, max(lats) + padding]}
