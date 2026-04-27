/**
 * TypeScript interfaces for the WorldMap application.
 * Mirrors the backend Pydantic schemas.
 */

// ── Core entities ───────────────────────────────────────────

export interface Trip {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripSummary extends Trip {
  stop_count: number;
  media_count: number;
}

export interface TripDetail extends Trip {
  days: Day[];
}

export interface Day {
  id: string;
  trip_id: string;
  day_number: number;
  date: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
  stops: Stop[];
}

export interface Stop {
  id: string;
  day_id: string;
  trip_id: string;
  name: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  arrival_time: string | null;
  departure_time: string | null;
  sequence_order: number;
  created_at: string;
  media: MediaItem[];
}

export interface MediaItem {
  id: string;
  stop_id: string | null;
  trip_id: string | null;
  file_path: string;
  file_name: string;
  file_type: "image" | "video";
  mime_type: string | null;
  thumbnail_path: string | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string | null;
  file_size: number | null;
  created_at: string;
}

export interface MediaWithContext extends MediaItem {
  trip_title: string;
  stop_name: string | null;
}

export interface ExifData {
  latitude: number | null;
  longitude: number | null;
  taken_at: string | null;
  camera_make: string | null;
  camera_model: string | null;
  has_gps: boolean;
}

// ── Request types ───────────────────────────────────────────

export interface CreateTripRequest {
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export interface UpdateTripRequest {
  title?: string;
  description?: string;
  cover_image?: string;
  start_date?: string;
  end_date?: string;
}

export interface CreateDayRequest {
  day_number: number;
  date?: string;
  title?: string;
  notes?: string;
}

export interface CreateStopRequest {
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  arrival_time?: string;
  departure_time?: string;
  sequence_order?: number;
}

export interface UpdateStopRequest {
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  arrival_time?: string;
  departure_time?: string;
  sequence_order?: number;
}

// ── Map data types ──────────────────────────────────────────

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point" | "LineString";
    coordinates: number[] | number[][];
  };
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface MapData {
  stops: GeoJSONFeatureCollection;
  path: GeoJSONFeature | null;
  media: GeoJSONFeatureCollection;
  bounds: {
    sw: [number, number];
    ne: [number, number];
  } | null;
}

// ── Upload queue types ──────────────────────────────────────

export interface QueuedUpload {
  id: string;
  file: File;
  tripId: string;
  stopId?: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
  status: "pending" | "uploading" | "failed" | "completed";
  retryCount: number;
  error?: string;
  createdAt: number;
}
