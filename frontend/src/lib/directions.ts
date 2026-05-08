/**
 * Per-leg route resolver.
 *
 * For each consecutive pair of stops we decide between:
 *   1. FLIGHT  — straight great-circle line, drawn dashed on the map.
 *      Used when either endpoint is flagged as an airport, OR when the
 *      pair is intercontinental (driving is impossible).
 *   2. ROAD    — Mapbox Directions API call returning a road-snapped
 *      LineString. Used for everything else.
 *
 * Free-tier discipline:
 *   • Mapbox Directions free quota: 100,000 requests / month.
 *   • Routes are cached in localStorage keyed by lat/lng + airport flag, so
 *     a given pair is fetched at most once per browser unless the stops
 *     change. Each leg is one Directions call.
 *   • Failed fetches gracefully fall back to a straight line — no retries,
 *     no silent quota burn.
 */

import type { Stop } from "@/types";

// ── Public types ────────────────────────────────────────────────────────────

export interface RouteLeg {
  fromIdx: number;
  toIdx: number;
  /** [lng, lat] coordinate pairs */
  coordinates: [number, number][];
  /** meters (approximate for flights) */
  distance: number;
  /** seconds (driving estimate from Mapbox; 0 for flights) */
  duration: number;
  isFlight: boolean;
}

export interface RouteResult {
  legs: RouteLeg[];
  totalDistance: number;
  totalDuration: number;
  /** Combined road geometry (excludes flight legs — they render separately). */
  roadCoordinates: [number, number][];
  /** Each flight leg as its own [from, to] pair. */
  flightSegments: [[number, number], [number, number]][];
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Flag pairs further apart than this as flights (km). Roughly the longest
 *  driveable land distance — anything bigger and Mapbox will fail anyway. */
const MAX_DRIVE_KM = 5000;

const CACHE_PREFIX = "wandersync:dir:v1:";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// ── Geo helpers ─────────────────────────────────────────────────────────────

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}

// ── Cache ───────────────────────────────────────────────────────────────────

interface CachedLeg {
  ts: number;
  coordinates: [number, number][];
  distance: number;
  duration: number;
}

function cacheKey(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): string {
  const r = (n: number) => n.toFixed(5);
  return `${CACHE_PREFIX}${r(from.lat)},${r(from.lng)}->${r(to.lat)},${r(to.lng)}`;
}

function readCache(key: string): CachedLeg | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedLeg;
    if (Date.now() - data.ts > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeCache(key: string, leg: Omit<CachedLeg, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), ...leg })
    );
  } catch {
    /* quota exceeded — ignore */
  }
}

// ── Mapbox Directions call (one leg) ────────────────────────────────────────

async function fetchMapboxDriving(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ coordinates: [number, number][]; distance: number; duration: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  if (!token) return null;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;
    return {
      coordinates: route.geometry.coordinates as [number, number][],
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a road-aware route for an ordered list of stops. Stops with missing
 * coordinates are skipped entirely. The returned `legs` are aligned with the
 * input by fromIdx / toIdx so callers can look up individual stops.
 */
export async function getTripRoute(stops: Stop[]): Promise<RouteResult> {
  // Filter out coordinate-less stops but keep their original indexes for
  // labels that may rely on stop.id position.
  const valid: { idx: number; lat: number; lng: number; isAirport: boolean }[] = [];
  stops.forEach((s, idx) => {
    if (s.latitude == null || s.longitude == null) return;
    valid.push({
      idx,
      lat: s.latitude,
      lng: s.longitude,
      isAirport: !!s.is_airport,
    });
  });

  const legs: RouteLeg[] = [];
  const flightSegments: RouteResult["flightSegments"] = [];
  const roadCoords: [number, number][] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  for (let i = 0; i < valid.length - 1; i++) {
    const from = valid[i];
    const to = valid[i + 1];

    const distKm = haversineKm(from, to);
    const useFlight =
      from.isAirport || to.isAirport || distKm > MAX_DRIVE_KM;

    if (useFlight) {
      const seg: [[number, number], [number, number]] = [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ];
      flightSegments.push(seg);
      legs.push({
        fromIdx: from.idx,
        toIdx: to.idx,
        coordinates: seg,
        distance: distKm * 1000,
        duration: 0,
        isFlight: true,
      });
      totalDistance += distKm * 1000;
      continue;
    }

    // Road leg — try cache first
    const key = cacheKey(from, to);
    const cached = readCache(key);
    let segment = cached
      ? { coordinates: cached.coordinates, distance: cached.distance, duration: cached.duration }
      : await fetchMapboxDriving(from, to);

    if (!segment) {
      // Mapbox failed (unreachable, water, etc.) — fall back to straight line
      // and treat as a flight visually so the user sees a clear "we couldn't
      // road-route this" indicator.
      const seg: [[number, number], [number, number]] = [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ];
      flightSegments.push(seg);
      legs.push({
        fromIdx: from.idx,
        toIdx: to.idx,
        coordinates: seg,
        distance: distKm * 1000,
        duration: 0,
        isFlight: true,
      });
      totalDistance += distKm * 1000;
      continue;
    }

    if (!cached) writeCache(key, segment);

    legs.push({
      fromIdx: from.idx,
      toIdx: to.idx,
      coordinates: segment.coordinates,
      distance: segment.distance,
      duration: segment.duration,
      isFlight: false,
    });

    // Stitch road coords together — drop the leading point on subsequent legs
    // to avoid drawing duplicate seams between connected segments.
    if (roadCoords.length === 0) {
      roadCoords.push(...segment.coordinates);
    } else {
      roadCoords.push(...segment.coordinates.slice(1));
    }
    totalDistance += segment.distance;
    totalDuration += segment.duration;
  }

  return {
    legs,
    totalDistance,
    totalDuration,
    roadCoordinates: roadCoords,
    flightSegments,
  };
}
