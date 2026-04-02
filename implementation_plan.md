# WorldMap — Personal Travel Visualization Platform

A production-quality MVP web application for visualizing personal travel on interactive maps with trip management, media uploads with EXIF extraction, animated path playback, timelines, and heatmaps.

## User Review Required

> [!IMPORTANT]
> **Mapbox Token**: You will need a [Mapbox access token](https://account.mapbox.com/access-tokens/) stored in the frontend `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN`. A free tier provides 50,000 map loads/month.

> [!IMPORTANT]
> **PostgreSQL**: The backend expects a local PostgreSQL instance. You'll need to create a database (e.g., `worldmap`) and provide the connection URL.

> [!WARNING]
> **Tailwind CSS**: Per your request, the frontend will use Tailwind CSS instead of vanilla CSS. This is an exception to default guidance.

---

## Proposed Architecture

```
world app/
├── backend/                     # Python FastAPI
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── config.py            # Settings & env vars
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── trip.py
│   │   │   ├── day.py
│   │   │   ├── stop.py
│   │   │   └── media.py
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── trip.py
│   │   │   ├── day.py
│   │   │   ├── stop.py
│   │   │   └── media.py
│   │   ├── routes/              # API route handlers
│   │   │   ├── __init__.py
│   │   │   ├── trips.py
│   │   │   ├── days.py
│   │   │   ├── stops.py
│   │   │   ├── media.py
│   │   │   └── map_data.py
│   │   ├── services/            # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── trip_service.py
│   │   │   ├── media_service.py
│   │   │   ├── exif_service.py
│   │   │   └── storage.py       # Abstracted file storage
│   │   └── utils/
│   │       └── __init__.py
│   ├── uploads/                 # Local file storage (MVP)
│   ├── requirements.txt
│   └── alembic/ (optional)      # Migrations scaffold
├── frontend/                    # Next.js App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root layout with sidebar nav
│   │   │   ├── page.tsx         # Dashboard (trip list)
│   │   │   ├── trips/
│   │   │   │   ├── new/page.tsx # Create trip form
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx # Trip detail (map + timeline + gallery)
│   │   │   ├── upload/
│   │   │   │   └── page.tsx     # Upload page
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── map/
│   │   │   │   ├── MapView.tsx          # Main Mapbox wrapper
│   │   │   │   ├── TripPath.tsx         # Polyline + animation
│   │   │   │   ├── StopMarker.tsx       # Pin markers
│   │   │   │   └── HeatmapLayer.tsx     # Heatmap visualization
│   │   │   ├── timeline/
│   │   │   │   └── TimelineSlider.tsx   # Scrubbing timeline
│   │   │   ├── trips/
│   │   │   │   ├── TripCard.tsx         # Dashboard card
│   │   │   │   └── TripForm.tsx         # Create/edit form
│   │   │   ├── media/
│   │   │   │   ├── MediaGallery.tsx     # Photo/video grid
│   │   │   │   ├── UploadHandler.tsx    # Drag-and-drop uploader
│   │   │   │   └── UploadQueue.tsx      # Offline queue UI
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   └── ui/                      # Shared UI primitives
│   │   │       ├── Button.tsx
│   │   │       ├── Card.tsx
│   │   │       └── Modal.tsx
│   │   ├── lib/
│   │   │   ├── api.ts           # API client (fetch wrapper)
│   │   │   ├── uploadQueue.ts   # IndexedDB offline queue
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts         # TypeScript interfaces
│   ├── public/
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── package.json
├── schema.sql                   # PostgreSQL DDL
└── README.md                    # Setup instructions
```

---

## Database Schema

PostGIS-ready design using `DOUBLE PRECISION` for lat/lng in MVP (trivially upgradable to `GEOGRAPHY(POINT, 4326)` columns later).

```sql
-- trips: Top-level container
CREATE TABLE trips (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    cover_image   TEXT,                -- URL/path to cover
    start_date    DATE,
    end_date      DATE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- days: Logical grouping within a trip
CREATE TABLE days (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number    INTEGER NOT NULL,
    date          DATE,
    title         VARCHAR(255),
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- stops: Geolocated points within a day
CREATE TABLE stops (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id        UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name          VARCHAR(255),
    description   TEXT,
    latitude      DOUBLE PRECISION,    -- PostGIS upgrade: GEOGRAPHY(POINT, 4326)
    longitude     DOUBLE PRECISION,
    arrival_time  TIMESTAMPTZ,
    departure_time TIMESTAMPTZ,
    sequence_order INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- media: Files attached to stops
CREATE TABLE media (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id       UUID REFERENCES stops(id) ON DELETE SET NULL,
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    file_path     TEXT NOT NULL,
    file_type     VARCHAR(20) NOT NULL,  -- 'image', 'video'
    thumbnail_path TEXT,
    caption       TEXT,
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    taken_at      TIMESTAMPTZ,
    file_size     BIGINT,
    exif_data     JSONB,                 -- Raw EXIF for future use
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for geo queries (future PostGIS GIST indexes go here)
CREATE INDEX idx_stops_trip ON stops(trip_id);
CREATE INDEX idx_stops_day ON stops(day_id);
CREATE INDEX idx_stops_coords ON stops(latitude, longitude);
CREATE INDEX idx_media_stop ON media(stop_id);
CREATE INDEX idx_media_trip ON media(trip_id);
CREATE INDEX idx_media_coords ON media(latitude, longitude);
CREATE INDEX idx_trips_dates ON trips(start_date, end_date);
```

---

## Proposed Changes

### Backend (FastAPI)

#### [NEW] `backend/requirements.txt`
Dependencies: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `asyncpg`, `psycopg2-binary`, `python-multipart`, `Pillow`, `python-dotenv`, `pydantic-settings`, `alembic`

#### [NEW] `backend/app/main.py`
- FastAPI app with CORS middleware (allow `localhost:3000`)
- Include all route routers
- Lifespan event to create tables on startup (dev mode)

#### [NEW] `backend/app/config.py`
- Pydantic `Settings` class reading from `.env`
- `DATABASE_URL`, `UPLOAD_DIR`, `CORS_ORIGINS`

#### [NEW] `backend/app/database.py`
- SQLAlchemy async engine + `AsyncSession` factory
- `get_db` dependency for route injection

#### [NEW] `backend/app/models/` (trip, day, stop, media)
- SQLAlchemy ORM models matching schema above
- Relationships: Trip → Days → Stops → Media

#### [NEW] `backend/app/schemas/` (trip, day, stop, media)
- Pydantic v2 models for request/response validation
- Nested response schemas (e.g., TripDetail includes days → stops)

#### [NEW] `backend/app/routes/trips.py`
| Endpoint | Method | Description |
|---|---|---|
| `/api/trips` | POST | Create trip |
| `/api/trips` | GET | List all trips |
| `/api/trips/{id}` | GET | Get trip with days, stops, media |
| `/api/trips/{id}` | PUT | Update trip |
| `/api/trips/{id}` | DELETE | Delete trip |

#### [NEW] `backend/app/routes/days.py`
| Endpoint | Method | Description |
|---|---|---|
| `/api/trips/{trip_id}/days` | POST | Add day to trip |
| `/api/trips/{trip_id}/days` | GET | List days for trip |

#### [NEW] `backend/app/routes/stops.py`
| Endpoint | Method | Description |
|---|---|---|
| `/api/days/{day_id}/stops` | POST | Add stop to day |
| `/api/stops/{id}` | PUT | Update stop (edit location) |
| `/api/stops/{id}` | DELETE | Delete stop |

#### [NEW] `backend/app/routes/media.py`
| Endpoint | Method | Description |
|---|---|---|
| `/api/media/upload` | POST | Upload file, extract EXIF, return metadata |
| `/api/media/{id}` | GET | Get media details |
| `/api/media/{id}` | DELETE | Delete media + file |
| `/api/uploads/{path}` | GET | Serve uploaded files (static mount) |

#### [NEW] `backend/app/routes/map_data.py`
| Endpoint | Method | Description |
|---|---|---|
| `/api/map-data/{trip_id}` | GET | GeoJSON for trip's stops + paths |
| `/api/heatmap` | GET | All stops as coordinate array for heatmap |

#### [NEW] `backend/app/services/exif_service.py`
- `extract_exif(file_bytes) → ExifData`
- DMS → decimal degree conversion
- Extract GPS coords, timestamp, camera info

#### [NEW] `backend/app/services/storage.py`
- Abstract `StorageBackend` base class
- `LocalStorage` implementation (save to `uploads/`)
- Future: `CloudinaryStorage`, `SupabaseStorage`

#### [NEW] `backend/app/services/media_service.py`
- Handle upload flow: save file → extract EXIF → create DB record
- Generate thumbnails (Pillow resize)

---

### Frontend (Next.js)

#### [NEW] `frontend/` (scaffolded via `create-next-app`)
- Next.js 14+ with App Router, TypeScript, Tailwind CSS
- Key dependencies: `mapbox-gl`, `@turf/turf` (geo calculations)

#### [NEW] `frontend/src/components/map/MapView.tsx`
- Client component (`"use client"`) with `mapbox-gl`
- Dynamically imported with `ssr: false`
- Dark satellite style by default
- Handles: markers, polylines, heatmap layer, fly-to animations

#### [NEW] `frontend/src/components/map/TripPath.tsx`
- Draws polyline between stops
- Animated path drawing effect using Mapbox `line-dasharray` animation
- Playback controls (play/pause/speed)

#### [NEW] `frontend/src/components/map/HeatmapLayer.tsx`
- Mapbox heatmap layer using stop density
- Color gradient from cool → warm
- Toggleable overlay

#### [NEW] `frontend/src/components/timeline/TimelineSlider.tsx`
- Custom range slider synced to stops
- Scrubbing updates map camera position
- Shows stop name + time at current position
- Smooth animated transitions

#### [NEW] `frontend/src/components/media/UploadHandler.tsx`
- Drag-and-drop + file picker
- Preview images before upload
- Show extracted GPS on mini-map
- Allow user to confirm/edit location before saving
- Progress indicators

#### [NEW] `frontend/src/components/media/UploadQueue.tsx`
- IndexedDB-backed offline queue
- Show pending/failed uploads
- Auto-retry on reconnection
- Visual status indicators

#### [NEW] `frontend/src/app/page.tsx` (Dashboard)
- Grid of trip cards with cover images
- Stats (total trips, countries, distance)
- Search/filter
- "New Trip" CTA button

#### [NEW] `frontend/src/app/trips/[id]/page.tsx` (Trip Detail)
- **Primary view**: Full-width map with stop pins + path
- **Side panel**: Timeline slider + media gallery
- Animated path playback
- Click stop → see media + details

#### [NEW] `frontend/src/app/upload/page.tsx`
- Batch upload UI
- Select trip + stop to attach
- EXIF preview panel
- Location confirmation map

#### [NEW] `frontend/src/lib/api.ts`
- Typed API client wrapping `fetch`
- Base URL from env, error handling
- Functions: `getTrips()`, `createTrip()`, `uploadMedia()`, etc.

#### [NEW] `frontend/src/lib/uploadQueue.ts`
- IndexedDB wrapper for offline uploads
- `enqueue()`, `processQueue()`, `getQueueStatus()`
- `navigator.onLine` listener for auto-retry

---

## Design System

- **Color Palette**: Deep navy/slate dark mode with amber/teal accents
- **Typography**: Inter (Google Font)
- **Map Style**: Mapbox Dark / Satellite Streets
- **Glassmorphism**: Frosted glass overlays on map panels
- **Animations**: Framer Motion for page transitions, Mapbox native for map animations
- **Layout**: Sidebar navigation + full-bleed map views

---

## Open Questions

> [!IMPORTANT]
> **1. PostgreSQL Connection**: Do you already have PostgreSQL installed locally? If not, I can include Docker Compose setup for the database.

> [!IMPORTANT]
> **2. Mapbox Token**: Do you have a Mapbox account/token ready, or should I use a placeholder and document where to add it?

> [!NOTE]
> **3. Google Photos Integration**: Per the spec, I'll scaffold the OAuth flow and API integration module but won't fully implement it. Is this acceptable?

> [!NOTE]
> **4. Authentication**: The spec says "personal" app — should I skip auth entirely for MVP, or add a simple API key / basic login?

---

## Verification Plan

### Automated Tests
1. **Backend**: Start FastAPI dev server, verify all endpoints return expected status codes
2. **Frontend**: Run `npm run build` to catch TypeScript/compilation errors
3. **Integration**: Use the browser tool to navigate the full flow:
   - Create a trip → Add days/stops → Upload media → View on map

### Manual Verification
- Run both backend (`uvicorn`) and frontend (`npm run dev`)
- Visual verification of map rendering, path animation, timeline sync
- Test offline upload queue by simulating network disconnect
