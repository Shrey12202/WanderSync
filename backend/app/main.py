"""
WorldMap API — FastAPI application entry point.

Personal travel visualization platform backend.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base
from app.routes import trips, days, stops, media, map_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create/migrate database tables on startup."""
    print("--- WANDERSYNC STARTUP ---")
    print(f"CORS Origins: {settings.cors_origin_list}")
    print(f"Upload Dir: {settings.upload_dir}")
    print("--------------------------")

    async with engine.begin() as conn:
        # Create any brand-new tables that don't exist yet
        await conn.run_sync(Base.metadata.create_all)

        # ── Idempotent column migrations ──────────────────────────────────
        # Runs on every startup but only makes changes when needed.
        await conn.execute(text("""
            DO $$
            BEGIN
                -- 1. Make trip_id nullable (allows standalone/memory-wall uploads)
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'media'
                      AND column_name = 'trip_id'
                      AND is_nullable = 'NO'
                ) THEN
                    ALTER TABLE media ALTER COLUMN trip_id DROP NOT NULL;
                    RAISE NOTICE 'media.trip_id made nullable';
                END IF;

                -- 2. Add user_id column for direct ownership of standalone media
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'media' AND column_name = 'user_id'
                ) THEN
                    ALTER TABLE media ADD COLUMN user_id VARCHAR(255);
                    CREATE INDEX idx_media_user_id ON media(user_id);
                    RAISE NOTICE 'media.user_id column added';
                END IF;

                -- 3. Backfill user_id on existing trip-linked rows so the
                --    query OR-condition works for pre-auth data
                UPDATE media m
                SET user_id = t.user_id
                FROM trips t
                WHERE m.trip_id = t.id
                  AND m.user_id IS NULL
                  AND t.user_id IS NOT NULL;

            END $$;
        """))
        print("✅ Schema migration complete")

    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    yield

    await engine.dispose()


app = FastAPI(
    title="WorldMap API",
    description="Personal travel visualization platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static file serving for uploads ──────────────────────────
uploads_path = Path(settings.upload_dir)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

# ── Register route modules ───────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "WanderSync API",
        "status": "online",
        "configured_origins": settings.cors_origin_list
    }

app.include_router(trips.router)
app.include_router(days.router)
app.include_router(stops.router)
app.include_router(media.router)
app.include_router(map_data.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "worldmap-api"}
