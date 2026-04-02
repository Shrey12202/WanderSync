# WorldMap — Personal Travel Visualization Platform

A full-stack travel journal with interactive map visualization, EXIF metadata extraction, animated path playback, and heatmaps.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React, Tailwind CSS |
| Maps | Mapbox GL JS |
| Backend | Python FastAPI |
| Database | PostgreSQL (PostGIS-ready) |
| Storage | Local filesystem (abstracted for cloud upgrade) |

## Quick Start

### 1. Database (PostgreSQL via Docker)

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and auto-runs `schema.sql`.

### 2. Backend (FastAPI)

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
API docs at `http://localhost:8000/docs`.

### 3. Frontend (Next.js)

```bash
cd frontend

# Install dependencies (already done if scaffolded)
npm install

# Add your Mapbox token to .env.local
# NEXT_PUBLIC_MAPBOX_TOKEN=your_actual_token

# Start dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

### 4. Mapbox Token

1. Create a free account at [mapbox.com](https://www.mapbox.com/)
2. Copy your default public token from the [tokens page](https://account.mapbox.com/access-tokens/)
3. Paste it in `frontend/.env.local`:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijo...
   ```

## Project Structure

```
world app/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── main.py           # App entry point
│   │   ├── config.py         # Environment config
│   │   ├── database.py       # SQLAlchemy setup
│   │   ├── models/           # ORM models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── routes/           # API endpoints
│   │   └── services/         # Business logic
│   ├── uploads/              # Local file storage
│   └── requirements.txt
├── frontend/                 # Next.js frontend
│   ├── src/
│   │   ├── app/              # Pages (App Router)
│   │   ├── components/       # React components
│   │   │   ├── map/          # MapView, HeatmapLayer
│   │   │   ├── timeline/     # TimelineSlider
│   │   │   ├── trips/        # TripCard, TripForm
│   │   │   ├── media/        # Gallery, UploadHandler
│   │   │   └── layout/       # Sidebar
│   │   ├── lib/              # API client, upload queue, utils
│   │   └── types/            # TypeScript interfaces
│   └── .env.local            # Mapbox token
├── schema.sql                # Database DDL
├── docker-compose.yml        # PostgreSQL container
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/trips` | Create trip |
| GET | `/api/trips` | List all trips |
| GET | `/api/trips/{id}` | Get trip detail |
| PUT | `/api/trips/{id}` | Update trip |
| DELETE | `/api/trips/{id}` | Delete trip |
| POST | `/api/trips/{trip_id}/days` | Add day |
| GET | `/api/trips/{trip_id}/days` | List days |
| POST | `/api/days/{day_id}/stops` | Add stop |
| PUT | `/api/stops/{id}` | Update stop |
| DELETE | `/api/stops/{id}` | Delete stop |
| POST | `/api/media/upload` | Upload media file |
| POST | `/api/media/extract-exif` | Extract EXIF (preview) |
| GET | `/api/map-data/{trip_id}` | GeoJSON for map |
| GET | `/api/heatmap` | Heatmap data |

## Features

- **Trip Management**: Create, edit, delete trips with day/stop hierarchy
- **Media Upload**: Drag-and-drop with automatic EXIF GPS extraction
- **Interactive Map**: Mapbox dark mode with stop markers and animated paths
- **Timeline Playback**: Scrub through stops with synced map animation
- **Heatmap**: Density visualization of all visited locations
- **Offline Upload Queue**: IndexedDB-backed queue with auto-retry
