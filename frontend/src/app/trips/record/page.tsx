"use client";

/**
 * Live walk / hike recording.
 *
 * - Uses `navigator.geolocation.watchPosition` only while the user has pressed
 *   START. Geolocation is never read in the background.
 * - Samples points sparsely: a new fix is appended only when the user has
 *   moved >= MIN_MOVE_M from the last point AND is more accurate than
 *   MIN_ACCURACY_M. This keeps the track storage small and the line clean.
 * - Holds a screen Wake Lock (when supported) so the screen doesn't blank
 *   while you're walking — the lock is released the moment you stop.
 * - On STOP, opens a save modal with the start location reverse-geocoded by
 *   Google Places (Essentials, free tier) for a friendly default title.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createTrip, createDay, createStop } from "@/lib/api";
import { googleReverseGeocode } from "@/components/search/GooglePlacesSearch";
import { parseGpxFile } from "@/lib/gpx";
import type { TrackGeoJSON } from "@/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ── Sampling thresholds ────────────────────────────────────────────────────

const MIN_MOVE_M = 5;          // ignore drift smaller than this
const MIN_ACCURACY_M = 100;    // discard fixes worse than this (urban GPS noise)
const FORCE_SAMPLE_S = 15;     // even if you stand still, log a point every N s

// ── Geo helpers ────────────────────────────────────────────────────────────

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}

function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtDistance(meters: number) {
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// ── Component ──────────────────────────────────────────────────────────────

type RecState = "idle" | "recording" | "review";

export default function RecordPage() {
  const router = useRouter();
  const mapWrapper = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const startMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastSampleAtRef = useRef<number>(0);

  const [state, setState] = useState<RecState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [permissionPending, setPermissionPending] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // Track buffer — kept in a ref so the watchPosition callback always sees fresh state
  const trackRef = useRef<[number, number][]>([]);
  const [trackLength, setTrackLength] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedS, setElapsedS] = useState(0);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState<number | null>(null);

  // Save form
  const [saveTitle, setSaveTitle] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [startName, setStartName] = useState<string | null>(null);
  const [endName, setEndName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Map init ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapWrapper.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapWrapper.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [0, 20],
      zoom: 1.5,
      antialias: true,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // The map sometimes mounts before the `fixed inset-0` container has its
    // final dimensions (visual viewport on iOS Safari, animations, etc.).
    // A delayed resize forces a redraw against the real container size so
    // the canvas isn't 0×0.
    const resizeAfter = (ms: number) => setTimeout(() => map.resize(), ms);
    const t1 = resizeAfter(50);
    const t2 = resizeAfter(300);
    const t3 = resizeAfter(1000);

    map.on("load", () => {
      map.addSource("track", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } as GeoJSON.Feature,
      });
      map.addLayer({
        id: "track-glow",
        type: "line",
        source: "track",
        paint: { "line-color": "#f59e0b", "line-width": 8, "line-opacity": 0.25, "line-blur": 4 },
      });
      map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#fbbf24", "line-width": 4, "line-opacity": 0.95 },
      });
    });
    mapRef.current = map;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Elapsed timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (state !== "recording" || startedAt == null) return;
    const id = window.setInterval(() => {
      setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state, startedAt]);

  // ── Wake Lock (best-effort) ─────────────────────────────────────────────

  const acquireWakeLock = useCallback(async () => {
    try {
      // The WakeLock API isn't typed in older lib.dom; cast through any.
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };
      if (nav.wakeLock?.request) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      /* ignore — non-fatal */
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null;
  }, []);

  // Re-acquire wake lock + flag pause whenever the tab toggles visibility.
  // iOS Safari (and most mobile browsers) suspend `watchPosition` while the
  // page is hidden — we surface this to the user so they know there's a gap.
  useEffect(() => {
    if (state !== "recording") return;
    const onVis = () => {
      const hidden = document.visibilityState !== "visible";
      setIsHidden(hidden);
      if (!hidden) acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state, acquireWakeLock]);

  // ── Track painting ──────────────────────────────────────────────────────

  const repaintTrack = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("track") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: trackRef.current },
    } as GeoJSON.Feature);
  }, []);

  const updateLiveMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!liveMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        width:18px;height:18px;border-radius:50%;
        background:#22d3ee;border:3px solid #fff;
        box-shadow:0 0 0 4px rgba(34,211,238,0.35), 0 0 18px rgba(34,211,238,0.7);
        animation: pulse 1.6s ease-in-out infinite;
      `;
      // Insert keyframes once
      if (!document.getElementById("rec-pulse-keyframes")) {
        const s = document.createElement("style");
        s.id = "rec-pulse-keyframes";
        s.textContent = "@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }";
        document.head.appendChild(s);
      }
      liveMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      liveMarkerRef.current.setLngLat([lng, lat]);
    }
  }, []);

  const placeStartMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map || startMarkerRef.current) return;
    const el = document.createElement("div");
    el.style.cssText = `
      width:24px;height:24px;border-radius:50%;
      background:#10b981;border:3px solid #0a0e1a;
      box-shadow:0 0 12px rgba(16,185,129,0.6);
    `;
    startMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  }, []);

  // ── Start / Stop / Discard ──────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Your browser doesn't support geolocation.");
      return;
    }

    setPermissionPending(true);
    trackRef.current = [];
    setTrackLength(0);
    setDistanceM(0);
    setElapsedS(0);
    setAccuracyM(null);
    setSpeedMps(null);
    repaintTrack();
    if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }

    // 1. Quick one-shot lookup so the map can fly to the user before the
    //    high-accuracy `watchPosition` cycle warms up. We don't add this
    //    to the track — only used to bootstrap the view.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        if (map) map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, duration: 1000 });
        updateLiveMarker(pos.coords.longitude, pos.coords.latitude);
      },
      () => { /* ignore — watchPosition will retry */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
    );

    // 2. Continuous high-accuracy watch — this is the actual track recorder.
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPermissionPending(false);
        const { latitude, longitude, accuracy, speed } = pos.coords;
        setAccuracyM(accuracy);
        setSpeedMps(speed ?? null);
        updateLiveMarker(longitude, latitude);

        const now = Date.now();
        const last = trackRef.current[trackRef.current.length - 1];
        const map = mapRef.current;

        // First fix — accept unconditionally so recording always starts. Even
        // a noisy first fix is better than waiting forever in a dense city.
        if (!last) {
          trackRef.current.push([longitude, latitude]);
          setTrackLength(1);
          if (startedAt == null) {
            setStartedAt(now);
            setState("recording");
            acquireWakeLock();
          }
          placeStartMarker(longitude, latitude);
          lastSampleAtRef.current = now;
          if (map) map.flyTo({ center: [longitude, latitude], zoom: 17, duration: 1200 });
          return;
        }

        // Subsequent fixes — drop only if both noisy AND we already have a
        // recent point. We let bad fixes through after FORCE_SAMPLE_S so the
        // map keeps something to draw rather than freezing on a dead end.
        const sinceLast = (now - lastSampleAtRef.current) / 1000;
        const isNoisy = accuracy != null && accuracy > MIN_ACCURACY_M;
        if (isNoisy && sinceLast < FORCE_SAMPLE_S) return;

        const moved = haversineM({ lat: last[1], lng: last[0] }, { lat: latitude, lng: longitude });
        // Filter GPS jitter — only count movement that meaningfully exceeds
        // the reported accuracy radius.
        const minMove = Math.max(MIN_MOVE_M, (accuracy ?? 0) * 0.5);

        if (moved >= minMove || sinceLast >= FORCE_SAMPLE_S) {
          trackRef.current.push([longitude, latitude]);
          setTrackLength(trackRef.current.length);
          setDistanceM((d) => d + (moved >= MIN_MOVE_M ? moved : 0));
          lastSampleAtRef.current = now;
          repaintTrack();
        }
      },
      (err) => {
        setPermissionPending(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied — enable it in your browser settings to record a walk.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Couldn't get a GPS fix. Try moving to an open area.");
        } else {
          setError(err.message || "Failed to read location.");
        }
        setState("idle");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    watchIdRef.current = watchId;
  }, [startedAt, acquireWakeLock, placeStartMarker, repaintTrack, updateLiveMarker]);

  const stopRecording = useCallback(async () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();

    if (trackRef.current.length < 2) {
      setError("Track is too short to save (need at least 2 GPS samples).");
      // Reset to idle so user can try again
      setState("idle");
      setStartedAt(null);
      return;
    }

    // Suggest a title from the first reading
    const [lng, lat] = trackRef.current[0];
    const [eLng, eLat] = trackRef.current[trackRef.current.length - 1];
    const dateLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const [s, e] = await Promise.all([googleReverseGeocode(lat, lng), googleReverseGeocode(eLat, eLng)]);
    setStartName(s);
    setEndName(e);
    setSaveTitle(s ? `Walk from ${s.split(",")[0]} — ${dateLabel}` : `Walk on ${dateLabel}`);
    setState("review");
  }, [releaseWakeLock]);

  // ── Import a route from a .gpx file ────────────────────────────────────
  // Apple Fitness, Strava, Garmin, Komoot, AllTrails, Google Maps Timeline
  // (via Takeout) — they all export GPX. Parsed entirely in the browser; the
  // imported track funnels into the same "review" modal as a live recording,
  // so save/discard/UX are unchanged.
  const handleImportGpx = useCallback(async (file: File) => {
    setError(null);
    try {
      const parsed = await parseGpxFile(file);
      if (parsed.coordinates.length < 2) {
        setError("This GPX file has fewer than 2 points — nothing to plot.");
        return;
      }

      // Reset any prior state, then load the imported track into the same
      // refs/state the live recorder uses.
      if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }
      if (liveMarkerRef.current) { liveMarkerRef.current.remove(); liveMarkerRef.current = null; }

      trackRef.current = parsed.coordinates;
      setTrackLength(parsed.coordinates.length);
      setDistanceM(parsed.distanceM);
      setElapsedS(parsed.durationS);
      setAccuracyM(null);
      setSpeedMps(null);

      const startEpoch = parsed.startTime ? Date.parse(parsed.startTime) : Date.now();
      setStartedAt(Number.isFinite(startEpoch) ? startEpoch : Date.now());

      // Paint and fit map to the imported track bounds.
      repaintTrack();
      const map = mapRef.current;
      const [firstLng, firstLat] = parsed.coordinates[0];
      placeStartMarker(firstLng, firstLat);
      if (map) {
        const lngs = parsed.coordinates.map((c) => c[0]);
        const lats = parsed.coordinates.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 60, duration: 1200, maxZoom: 17 }
        );
      }

      // Default title from GPX name → location → date, like the live flow does.
      const dateLabel = (parsed.startTime ? new Date(parsed.startTime) : new Date())
        .toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const [sLng, sLat] = parsed.coordinates[0];
      const [eLng, eLat] = parsed.coordinates[parsed.coordinates.length - 1];
      const [s, e] = await Promise.all([
        googleReverseGeocode(sLat, sLng),
        googleReverseGeocode(eLat, eLng),
      ]);
      setStartName(s);
      setEndName(e);
      setSaveTitle(
        parsed.name?.trim() ||
        (s ? `Walk from ${s.split(",")[0]} — ${dateLabel}` : `Walk on ${dateLabel}`)
      );
      setState("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't read that GPX file.");
    }
  }, [repaintTrack, placeStartMarker]);

  const discardAndReset = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();
    trackRef.current = [];
    setTrackLength(0);
    setDistanceM(0);
    setElapsedS(0);
    setStartedAt(null);
    setStartName(null);
    setEndName(null);
    setSaveTitle("");
    setSaveDesc("");
    setState("idle");
    repaintTrack();
    if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }
    if (liveMarkerRef.current) { liveMarkerRef.current.remove(); liveMarkerRef.current = null; }
  }, [releaseWakeLock, repaintTrack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!saveTitle.trim()) {
      setError("Give your walk a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const trackGeo: TrackGeoJSON = {
        type: "LineString",
        coordinates: trackRef.current,
      };

      const trip = await createTrip({
        title: saveTitle.trim(),
        description: saveDesc.trim() || undefined,
        start_date: today,
        end_date: today,
        track_geojson: trackGeo,
        track_distance_m: distanceM,
        track_duration_s: elapsedS,
      });

      const day = await createDay(trip.id, { day_number: 1, title: "Day 1", date: today });

      const startedISO = startedAt != null ? new Date(startedAt).toISOString() : undefined;
      const endedISO = startedAt != null ? new Date(startedAt + elapsedS * 1000).toISOString() : undefined;

      const [sLng, sLat] = trackRef.current[0];
      const [eLng, eLat] = trackRef.current[trackRef.current.length - 1];

      await createStop(day.id, {
        name: startName || "Start",
        latitude: sLat,
        longitude: sLng,
        sequence_order: 0,
        arrival_time: startedISO,
      });
      await createStop(day.id, {
        name: endName || "End",
        latitude: eLat,
        longitude: eLng,
        sequence_order: 1,
        arrival_time: endedISO,
      });

      router.push(`/trips/${trip.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save walk.");
      setSaving(false);
    }
  }, [saving, saveTitle, saveDesc, distanceM, elapsedS, startedAt, startName, endName, router]);

  // ── UI ──────────────────────────────────────────────────────────────────

  const isAccLow = accuracyM != null && accuracyM > MIN_ACCURACY_M;

  return (
    // `fixed inset-0` covers the AppShell sidebar / bottom-nav so the map
    // gets the entire viewport — critical on phones where the bottom-nav
    // would otherwise cover the Stop button. We restore the chrome by
    // navigating away.
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--color-bg)] overflow-hidden">
      <div ref={mapWrapper} className="absolute inset-0" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <button
          onClick={() => router.push("/trips")}
          className="text-white/80 hover:text-white text-sm font-medium pointer-events-auto bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10"
        >
          ← Back
        </button>
        <h1 className="text-white text-base font-bold pointer-events-auto bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5">
          <span aria-hidden>🚶</span> Record Walk
        </h1>
      </div>

      {/* Live stats — only while recording */}
      {state === "recording" && (
        <div className="relative z-10 self-center mt-2 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-amber-500/30 text-center pointer-events-none flex gap-4 items-center">
          <div>
            <p className="text-[10px] text-white/60 m-0 uppercase tracking-wide">Time</p>
            <p className="text-white font-mono text-lg m-0 leading-tight">{fmtDuration(elapsedS)}</p>
          </div>
          <div className="w-px h-8 bg-white/15" />
          <div>
            <p className="text-[10px] text-white/60 m-0 uppercase tracking-wide">Distance</p>
            <p className="text-amber-400 font-mono text-lg m-0 leading-tight">{fmtDistance(distanceM)}</p>
          </div>
          <div className="w-px h-8 bg-white/15" />
          <div>
            <p className="text-[10px] text-white/60 m-0 uppercase tracking-wide">Points</p>
            <p className="text-white font-mono text-lg m-0 leading-tight">{trackLength}</p>
          </div>
          {speedMps != null && (
            <>
              <div className="w-px h-8 bg-white/15" />
              <div>
                <p className="text-[10px] text-white/60 m-0 uppercase tracking-wide">Speed</p>
                <p className="text-teal-400 font-mono text-lg m-0 leading-tight">{(speedMps * 3.6).toFixed(1)} km/h</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Accuracy indicator */}
      {state === "recording" && accuracyM != null && (
        <div className={`relative z-10 self-center mt-2 px-3 py-1 rounded-full text-[10px] font-semibold ${
          isAccLow
            ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
            : "bg-teal-500/20 border border-teal-500/40 text-teal-300"
        } pointer-events-none`}>
          {isAccLow ? "⚠ Weak GPS — move to open sky" : `✓ GPS ±${accuracyM.toFixed(0)} m`}
        </div>
      )}

      {/* Tab/screen visibility warning — phone GPS pauses while the page is hidden */}
      {state === "recording" && isHidden && (
        <div className="relative z-10 self-center mt-2 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-red-500/25 border border-red-500/50 text-red-200 pointer-events-none">
          ⏸ Recording paused — keep this tab open and screen unlocked
        </div>
      )}

      {/* Error banner */}
      {error && state !== "review" && (
        <div className="relative z-10 self-center mt-2 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium max-w-md text-center pointer-events-none">
          {error}
        </div>
      )}

      {/* Bottom action panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
        {state === "idle" && (
          <>
            <button
              onClick={startRecording}
              disabled={permissionPending}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#0a0e1a] font-extrabold text-base shadow-2xl shadow-amber-500/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
            >
              {permissionPending ? "…" : "START"}
            </button>

            <p className="text-white/65 text-[11px] text-center max-w-sm leading-relaxed m-0 mt-1">
              <span className="text-amber-300 font-semibold">Live mode works best phone-in-hand</span> with
              the screen on — phone browsers pause GPS the moment the page is hidden.
            </p>

            {/* GPX import — the reliable path for longer walks */}
            <div className="w-full max-w-sm mt-1 pt-3 border-t border-white/10">
              <p className="text-white/50 text-[10px] text-center uppercase tracking-wider m-0 mb-2">
                Or import a route you already recorded
              </p>
              <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/15 text-white/85 text-xs font-semibold cursor-pointer transition-all">
                <span>📂 Choose .gpx file</span>
                <input
                  type="file"
                  accept=".gpx,application/gpx+xml,application/xml,text/xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportGpx(f);
                    // Reset so picking the same file twice still triggers onChange
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-white/40 text-[10px] text-center m-0 mt-2 leading-relaxed">
                Works with Apple Fitness, Strava, Google Fit, Garmin, Komoot, AllTrails — anything that exports GPX.
              </p>
            </div>
          </>
        )}

        {state === "recording" && (
          <button
            onClick={stopRecording}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-extrabold text-base shadow-2xl shadow-red-500/40 transition-all active:scale-95 flex items-center justify-center"
            aria-label="Stop recording"
          >
            <span className="block w-6 h-6 bg-white rounded-sm" />
          </button>
        )}
      </div>

      {/* Review modal */}
      {state === "review" && (
        <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="p-5 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-bold text-[var(--color-text)] m-0">Save your walk</h2>
              <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-1">
                Review the details below, then tap Save to add this to your trips.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[var(--color-bg)] rounded-xl p-3 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-text-secondary)] m-0 uppercase">Distance</p>
                  <p className="text-amber-400 font-mono text-sm m-0 mt-1">{fmtDistance(distanceM)}</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-xl p-3 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-text-secondary)] m-0 uppercase">Time</p>
                  <p className="text-teal-400 font-mono text-sm m-0 mt-1">{fmtDuration(elapsedS)}</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-xl p-3 text-center border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-text-secondary)] m-0 uppercase">Points</p>
                  <p className="text-[var(--color-text)] font-mono text-sm m-0 mt-1">{trackLength}</p>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  maxLength={100}
                  placeholder="e.g., Morning walk along Marine Drive"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 resize-none"
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  maxLength={500}
                  placeholder="How was it?"
                />
              </div>

              {/* Start/end summary */}
              {(startName || endName) && (
                <div className="text-[11px] text-[var(--color-text-secondary)] space-y-1 bg-[var(--color-bg)] rounded-xl p-3 border border-[var(--color-border)]">
                  {startName && <p className="m-0">🟢 <span className="text-[var(--color-text)] font-medium">Start:</span> {startName}</p>}
                  {endName && <p className="m-0">🏁 <span className="text-[var(--color-text)] font-medium">End:</span> {endName}</p>}
                </div>
              )}

              {error && (
                <div className="bg-red-500/15 border border-red-500/40 text-red-300 px-3 py-2 rounded-xl text-xs">{error}</div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a0e1a] font-bold text-sm hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
                >
                  {saving ? "Saving…" : "Save Walk"}
                </button>
                <button
                  onClick={discardAndReset}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 disabled:opacity-50 transition-all"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
