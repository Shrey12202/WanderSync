/**
 * API client for the WorldMap backend.
 * Typed fetch wrapper with error handling.
 */

import type {
  TripSummary,
  TripDetail,
  CreateTripRequest,
  UpdateTripRequest,
  Day,
  CreateDayRequest,
  Stop,
  CreateStopRequest,
  UpdateStopRequest,
  MediaItem,
  ExifData,
  MapData,
  GeoJSONFeatureCollection,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Helpers ─────────────────────────────────────────────────

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ── Trips ───────────────────────────────────────────────────

export async function getTrips(): Promise<TripSummary[]> {
  return request<TripSummary[]>("/api/trips");
}

export async function getTrip(id: string): Promise<TripDetail> {
  return request<TripDetail>(`/api/trips/${id}`);
}

export async function createTrip(data: CreateTripRequest): Promise<TripDetail> {
  return request<TripDetail>("/api/trips", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTrip(
  id: string,
  data: UpdateTripRequest
): Promise<TripDetail> {
  return request<TripDetail>(`/api/trips/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTrip(id: string): Promise<void> {
  return request<void>(`/api/trips/${id}`, { method: "DELETE" });
}

// ── Days ────────────────────────────────────────────────────

export async function createDay(
  tripId: string,
  data: CreateDayRequest
): Promise<Day> {
  return request<Day>(`/api/trips/${tripId}/days`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDays(tripId: string): Promise<Day[]> {
  return request<Day[]>(`/api/trips/${tripId}/days`);
}

// ── Stops ───────────────────────────────────────────────────

export async function createStop(
  dayId: string,
  data: CreateStopRequest
): Promise<Stop> {
  return request<Stop>(`/api/days/${dayId}/stops`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateStop(
  stopId: string,
  data: UpdateStopRequest
): Promise<Stop> {
  return request<Stop>(`/api/stops/${stopId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteStop(stopId: string): Promise<void> {
  return request<void>(`/api/stops/${stopId}`, { method: "DELETE" });
}

// ── Media ───────────────────────────────────────────────────

export async function uploadMedia(
  file: File,
  tripId: string,
  stopId?: string,
  caption?: string,
  latitude?: number,
  longitude?: number,
  taken_at?: string
): Promise<MediaItem> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("trip_id", tripId);
  if (stopId) formData.append("stop_id", stopId);
  if (caption) formData.append("caption", caption);
  if (latitude !== undefined) formData.append("latitude", String(latitude));
  if (longitude !== undefined) formData.append("longitude", String(longitude));
  if (taken_at) formData.append("taken_at", taken_at);

  const res = await fetch(`${API_BASE}/api/media/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }

  return res.json();
}

export async function extractExif(file: File): Promise<ExifData> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/media/extract-exif`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }

  return res.json();
}

export async function deleteMedia(mediaId: string): Promise<void> {
  return request<void>(`/api/media/${mediaId}`, { method: "DELETE" });
}

// ── Map Data ────────────────────────────────────────────────

export async function getMapData(tripId: string): Promise<MapData> {
  return request<MapData>(`/api/map-data/${tripId}`);
}

export async function getHeatmapData(): Promise<GeoJSONFeatureCollection> {
  return request<GeoJSONFeatureCollection>("/api/heatmap");
}

export async function getGlobalPaths(): Promise<GeoJSONFeatureCollection> {
  return request<GeoJSONFeatureCollection>("/api/global-paths");
}

// ── Utility ─────────────────────────────────────────────────

export function getMediaUrl(filePath: string): string {
  return `${API_BASE}/api/uploads/${filePath}`;
}

export function getThumbnailUrl(thumbnailPath: string | null, filePath: string): string {
  if (thumbnailPath) {
    return `${API_BASE}/api/uploads/thumbnails/${thumbnailPath}`;
  }
  return getMediaUrl(filePath);
}
