"use client";

import Script from "next/script";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHeatmapData, getGlobalPaths } from "@/lib/api";
import type { GeoJSONFeatureCollection } from "@/types";

type GooglePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

const SPIN_SPEED = 0.12;     // degrees per frame when idle
const SPIN_RESUME_MS = 5000; // resume auto-spin after this long without interaction
const BASE_ZOOM_GLOBE = 1.7;
const BASE_ZOOM_FLAT = 2;

export default function GoogleSearchPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  // Optional vector Map ID — when provided, Google renders a true globe at low zoom
  // and unlocks Advanced Markers.
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

  const { isLoaded: authLoaded, isSignedIn } = useAuth();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<GooglePrediction[]>([]);
  const [picked, setPicked] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [isGlobeView, setIsGlobeView] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [tripCount, setTripCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const heatmapRef = useRef<any>(null);
  const heatmapDataRef = useRef<GeoJSONFeatureCollection | null>(null);
  const globalPathsRef = useRef<GeoJSONFeatureCollection | null>(null);
  const spinAnimRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGlobeViewRef = useRef(isGlobeView);
  const servicesRef = useRef<{ ac?: any; details?: any; dummyDiv?: HTMLDivElement }>({});

  const canUse = useMemo(() => !!apiKey, [apiKey]);

  useEffect(() => { isGlobeViewRef.current = isGlobeView; }, [isGlobeView]);

  // ── Places services ─────────────────────────────────────────────────────────
  const initServices = useCallback(() => {
    const g = (window as any).google;
    if (!g?.maps?.places) return;
    if (!servicesRef.current.ac) servicesRef.current.ac = new g.maps.places.AutocompleteService();
    if (!servicesRef.current.details) {
      const dummy = servicesRef.current.dummyDiv ?? document.createElement("div");
      servicesRef.current.dummyDiv = dummy;
      servicesRef.current.details = new g.maps.places.PlacesService(dummy);
    }
  }, []);

  // ── Map initialisation ──────────────────────────────────────────────────────
  const initMap = useCallback(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const opts: any = {
      center: { lat: 20, lng: 0 },
      zoom: isGlobeView ? BASE_ZOOM_GLOBE : BASE_ZOOM_FLAT,
      mapTypeId: g.maps.MapTypeId.HYBRID,
      tilt: 0,
      disableDefaultUI: false,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      zoomControl: true,
      zoomControlOptions: { position: g.maps.ControlPosition.RIGHT_TOP },
      gestureHandling: "greedy",
      backgroundColor: "#0a0e1a",
    };
    if (mapId) opts.mapId = mapId;

    const map = new g.maps.Map(mapContainerRef.current, opts);
    mapRef.current = map;

    // True globe projection — vector maps only.
    try {
      if (typeof map.setProjection === "function") {
        map.setProjection(isGlobeView ? "globe" : "mercator");
      }
    } catch { /* raster fallback */ }

    // ── Stop auto-spin on any interaction, resume after idle ────────────────
    const stopSpin = () => {
      isInteractingRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    const scheduleResume = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => { isInteractingRef.current = false; }, SPIN_RESUME_MS);
    };
    map.addListener("dragstart", stopSpin);
    map.addListener("mousedown", stopSpin);
    map.addListener("zoom_changed", stopSpin);
    map.addListener("dragend", scheduleResume);
    map.addListener("idle", scheduleResume);

    // Reset on outside-of-map clicks
    const resumeOnOutsideClick = (e: MouseEvent | TouchEvent) => {
      const el = mapContainerRef.current;
      if (el && !el.contains(e.target as Node)) {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        isInteractingRef.current = false;
      }
    };
    document.addEventListener("mousedown", resumeOnOutsideClick);
    document.addEventListener("touchstart", resumeOnOutsideClick);
    (map as any).__cleanupOutside = () => {
      document.removeEventListener("mousedown", resumeOnOutsideClick);
      document.removeEventListener("touchstart", resumeOnOutsideClick);
    };

    // ── Auto-spin globe ─────────────────────────────────────────────────────
    const spin = () => {
      const m = mapRef.current;
      if (m && isGlobeViewRef.current && !isInteractingRef.current && m.getZoom() <= 3) {
        const c = m.getCenter();
        if (c) {
          m.setCenter({ lat: c.lat(), lng: c.lng() - SPIN_SPEED });
        }
      }
      spinAnimRef.current = requestAnimationFrame(spin);
    };
    spinAnimRef.current = requestAnimationFrame(spin);
  }, [isGlobeView, mapId]);

  // ── Detect script ready (covers HMR) ────────────────────────────────────────
  useEffect(() => {
    if (!canUse) return;
    const w = window as any;
    if (w.google?.maps && status !== "ready") setStatus("ready");
  }, [canUse, status]);

  // ── Once ready: init map + services ─────────────────────────────────────────
  useEffect(() => {
    if (status !== "ready") return;
    initMap();
    try { initServices(); } catch (e: any) {
      setError(e?.message || "Failed to initialise Google services.");
      setStatus("error");
    }
    return () => {
      if (spinAnimRef.current) cancelAnimationFrame(spinAnimRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const map = mapRef.current;
      if (map?.__cleanupOutside) map.__cleanupOutside();
    };
  }, [status, initMap, initServices]);

  // ── Load heatmap + global paths once auth + map are ready ───────────────────
  useEffect(() => {
    if (!authLoaded || !isSignedIn || status !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const [heat, paths] = await Promise.all([
          getHeatmapData().catch(() => ({ type: "FeatureCollection", features: [] }) as GeoJSONFeatureCollection),
          getGlobalPaths().catch(() => ({ type: "FeatureCollection", features: [] }) as GeoJSONFeatureCollection),
        ]);
        if (cancelled) return;
        heatmapDataRef.current = heat;
        globalPathsRef.current = paths;
        setTripCount(paths.features?.length || 0);
        renderTripPaths(paths);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, isSignedIn, status]);

  // ── Render trip path polylines (colored per trip) ───────────────────────────
  const renderTripPaths = useCallback((paths: GeoJSONFeatureCollection) => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    paths.features.forEach((feat: any) => {
      if (feat.geometry.type !== "LineString") return;
      const coords = (feat.geometry.coordinates as [number, number][]).map(
        ([lng, lat]) => ({ lat, lng })
      );
      const color = feat.properties?.color || "#f59e0b";

      // Outline for contrast at low zoom
      const outline = new g.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: "#000000",
        strokeOpacity: 0.45,
        strokeWeight: 6,
        map,
      });
      const line = new g.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 3.5,
        map,
      });
      polylinesRef.current.push(outline, line);
    });
  }, []);

  // ── Heatmap toggle ──────────────────────────────────────────────────────────
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g?.maps?.visualization || !map) return;

    if (showHeatmap) {
      const heat = heatmapDataRef.current;
      if (!heat || !heat.features?.length) return;

      const points = heat.features
        .map((f: any) => {
          const [lng, lat] = f.geometry.coordinates as [number, number];
          const weight = f.properties?.weight ?? 1;
          return { location: new g.maps.LatLng(lat, lng), weight };
        });

      if (heatmapRef.current) heatmapRef.current.setMap(null);
      heatmapRef.current = new g.maps.visualization.HeatmapLayer({
        data: points,
        map,
        radius: 30,
        opacity: 0.75,
        gradient: [
          "rgba(0,0,0,0)",
          "rgba(20,184,166,0.5)",
          "rgba(245,158,11,0.7)",
          "rgba(251,191,36,0.85)",
          "rgba(239,68,68,1)",
        ],
      });
    } else if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
  }, [showHeatmap, dataLoading]);

  // ── Globe ↔ flat toggle ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (typeof map.setProjection === "function") {
        map.setProjection(isGlobeView ? "globe" : "mercator");
      }
    } catch { /* raster fallback */ }
    const targetZoom = isGlobeView ? BASE_ZOOM_GLOBE : BASE_ZOOM_FLAT;
    if ((map.getZoom() ?? targetZoom) < targetZoom) map.setZoom(targetZoom);
  }, [isGlobeView]);

  // ── Autocomplete (debounced) ────────────────────────────────────────────────
  useEffect(() => {
    if (!canUse || status !== "ready") return;
    if (query.trim().length < 3) { setPredictions([]); return; }

    const handle = window.setTimeout(() => {
      try {
        initServices();
        servicesRef.current.ac!.getPlacePredictions(
          { input: query },
          (res: any, s: any) => {
            const g = (window as any).google;
            if (s !== g.maps.places.PlacesServiceStatus.OK || !res) {
              setPredictions([]); return;
            }
            setPredictions(res);
          }
        );
      } catch (e: any) {
        setError(e?.message || "Google search failed.");
        setStatus("error");
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [canUse, status, query, initServices]);

  // ── Marker drop ─────────────────────────────────────────────────────────────
  const dropMarker = useCallback((lat: number, lng: number, title: string) => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    if (markerRef.current?.setMap) markerRef.current.setMap(null);

    const adv = g.maps.marker?.AdvancedMarkerElement;
    if (adv && mapId) {
      markerRef.current = new adv({ map, position: { lat, lng }, title });
    } else {
      markerRef.current = new g.maps.Marker({
        map, position: { lat, lng }, title,
        animation: g.maps.Animation.DROP,
      });
    }

    isInteractingRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    map.panTo({ lat, lng });
    if (map.getZoom() < 12) map.setZoom(12);
  }, [mapId]);

  const pick = (p: GooglePrediction) => {
    setStatus("loading");
    setError(null);
    try {
      initServices();
      servicesRef.current.details!.getDetails(
        { placeId: p.place_id, fields: ["formatted_address", "name", "geometry"] },
        (place: any, s: any) => {
          const g = (window as any).google;
          if (s !== g.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
            setStatus("ready");
            setError("Failed to retrieve place details.");
            return;
          }
          const loc = place.geometry.location;
          const lat = loc.lat();
          const lng = loc.lng();
          const address = place.formatted_address || p.description;
          setPicked({ address, lat, lng });
          setPredictions([]);
          setStatus("ready");
          setQuery(address);
          dropMarker(lat, lng, address);
        }
      );
    } catch (e: any) {
      setError(e?.message || "Failed to retrieve place details.");
      setStatus("error");
    }
  };

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo({ lat: 20, lng: 0 });
    map.setZoom(isGlobeView ? BASE_ZOOM_GLOBE : BASE_ZOOM_FLAT);
    if (markerRef.current?.setMap) markerRef.current.setMap(null);
    markerRef.current = null;
    setPicked(null);
    setQuery("");
    setPredictions([]);
    isInteractingRef.current = false;
  };

  const scriptSrc = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker,visualization&v=weekly`;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {canUse && (
        <Script
          src={scriptSrc}
          strategy="afterInteractive"
          onLoad={() => { setStatus("ready"); setError(null); }}
          onError={() => { setStatus("error"); setError("Failed to load Google Maps script. Check your API key + restrictions."); }}
        />
      )}

      {/* Map fills the page */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full bg-[var(--color-bg)]" />

      {/* No-key state */}
      {!canUse && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="glass border border-[var(--color-border)] rounded-2xl p-6 max-w-md">
            <p className="text-base text-[var(--color-text)] m-0 font-semibold">Google key missing</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2 m-0">
              Set <code className="text-amber-400">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in{" "}
              <code className="text-amber-400">frontend/.env.local</code>.
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-3 m-0 opacity-70">
              For the true globe projection, also set{" "}
              <code className="text-amber-400">NEXT_PUBLIC_GOOGLE_MAP_ID</code> (a vector Map ID from
              the Google Cloud console).
            </p>
          </div>
        </div>
      )}

      {/* Overlay panel */}
      {canUse && (
        <div className="absolute top-4 left-4 z-10 w-[min(26rem,calc(100vw-5.5rem))] glass border border-[var(--color-border)] rounded-2xl shadow-2xl p-4 md:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-[var(--color-text)] m-0">
                🧭 Google Globe
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-0.5 truncate">
                Search, heatmap, and trip routes on Google Maps.
              </p>
            </div>
            <button
              onClick={resetView}
              disabled={status === "error"}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-all disabled:opacity-40"
              title="Reset view"
            >
              ↺ Reset
            </button>
          </div>

          {/* Toggles row */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button
              onClick={() => setIsGlobeView((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isGlobeView
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/20"
                  : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {isGlobeView ? "🌍 Globe" : "🗺️ Flat Map"}
            </button>
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showHeatmap
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                  : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {showHeatmap ? "🔥 Heatmap On" : "Heatmap Off"}
            </button>
            <span className="text-xs text-[var(--color-text-secondary)] opacity-60 ml-auto">
              {dataLoading ? "Loading…" : `${tripCount} ${tripCount === 1 ? "Trip" : "Trips"}`}
            </span>
          </div>

          {error && (
            <div className="mb-3 p-2.5 rounded-lg text-xs border bg-red-500/10 border-red-500/20 text-red-400">
              {error}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-[var(--color-text-secondary)]/50"
              placeholder={status === "ready" ? "Search address, place, or city…" : "Loading Google Maps…"}
              disabled={status !== "ready"}
            />

            {predictions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl max-h-72 overflow-y-auto z-20 custom-scrollbar">
                {predictions.slice(0, 8).map((p) => (
                  <button
                    key={p.place_id}
                    onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-surface-hover)] transition-colors border-b border-[var(--color-border)] last:border-0"
                  >
                    <p className="text-sm text-[var(--color-text)] m-0 truncate">
                      {p.structured_formatting?.main_text || p.description}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-0.5 truncate">
                      {p.structured_formatting?.secondary_text || ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {picked && (
            <div className="mt-3 p-3 rounded-xl bg-[var(--color-bg)] border border-amber-500/30">
              <p className="text-[10px] text-amber-400 uppercase tracking-wider m-0 font-semibold">
                📍 Selected
              </p>
              <p className="text-sm text-[var(--color-text)] m-0 mt-1 font-medium break-words">
                {picked.address}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-1.5 font-mono">
                {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
              </p>
            </div>
          )}

          {!mapId && status === "ready" && (
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-3 m-0 opacity-60">
              Tip: set <code className="text-amber-400/80">NEXT_PUBLIC_GOOGLE_MAP_ID</code> for the true
              globe projection (vector maps + Advanced Markers).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
