-- WorldMap Database Schema
-- PostgreSQL with PostGIS-ready design
-- Uses DOUBLE PRECISION for lat/lng (upgrade to GEOGRAPHY(POINT, 4326) later)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TRIPS: Top-level travel container
-- ============================================================
CREATE TABLE trips (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    cover_image   TEXT,
    start_date    DATE,
    end_date      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DAYS: Logical day grouping within a trip
-- ============================================================
CREATE TABLE days (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number    INTEGER NOT NULL,
    date          DATE,
    title         VARCHAR(255),
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STOPS: Geolocated points within a day
-- ============================================================
CREATE TABLE stops (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id          UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name            VARCHAR(255),
    description     TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    arrival_time    TIMESTAMPTZ,
    departure_time  TIMESTAMPTZ,
    sequence_order  INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEDIA: Files attached to stops or directly to trips
-- ============================================================
CREATE TABLE media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id         UUID REFERENCES stops(id) ON DELETE SET NULL,
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_type       VARCHAR(20) NOT NULL CHECK (file_type IN ('image', 'video')),
    mime_type       VARCHAR(100),
    thumbnail_path  TEXT,
    caption         TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    taken_at        TIMESTAMPTZ,
    file_size       BIGINT,
    exif_data       JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Trip lookups
CREATE INDEX idx_trips_dates ON trips(start_date, end_date);

-- Day lookups
CREATE INDEX idx_days_trip ON days(trip_id);
CREATE INDEX idx_days_date ON days(date);

-- Stop lookups & geo queries
CREATE INDEX idx_stops_trip ON stops(trip_id);
CREATE INDEX idx_stops_day ON stops(day_id);
CREATE INDEX idx_stops_coords ON stops(latitude, longitude);
CREATE INDEX idx_stops_sequence ON stops(day_id, sequence_order);

-- Media lookups & geo queries
CREATE INDEX idx_media_stop ON media(stop_id);
CREATE INDEX idx_media_trip ON media(trip_id);
CREATE INDEX idx_media_coords ON media(latitude, longitude);
CREATE INDEX idx_media_taken ON media(taken_at);
