"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GooglePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

export default function GoogleSearchPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  // Optional vector Map ID — when provided, Google renders a true globe at low zoom.
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<GooglePrediction[]>([]);
  const [picked, setPicked] = useState<{ address: string; lat: number; lng: number } | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const servicesRef = useRef<{
    ac?: any;
    details?: any;
    dummyDiv?: HTMLDivElement;
  }>({});

  const canUse = useMemo(() => !!apiKey, [apiKey]);

  const initServices = useCallback(() => {
    const g = (window as any).google;
    if (!servicesRef.current.ac) servicesRef.current.ac = new g.maps.places.AutocompleteService();
    if (!servicesRef.current.details) {
      const dummy = servicesRef.current.dummyDiv ?? document.createElement("div");
      servicesRef.current.dummyDiv = dummy;
      servicesRef.current.details = new g.maps.places.PlacesService(dummy);
    }
  }, []);

  const initMap = useCallback(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const opts: any = {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      mapTypeId: g.maps.MapTypeId.HYBRID,
      tilt: 0,
      disableDefaultUI: false,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: true,
      zoomControl: true,
      gestureHandling: "greedy",
      backgroundColor: "#0a0e1a",
    };
    // Vector renderer (required for globe projection at low zoom)
    if (mapId) opts.mapId = mapId;

    const map = new g.maps.Map(mapContainerRef.current, opts);
    mapRef.current = map;

    // Try to enable globe projection (vector maps only — silently no-ops on raster).
    try {
      if (typeof map.setProjection === "function") {
        map.setProjection("globe");
      }
    } catch {
      /* ignore — older API or raster map */
    }
  }, [mapId]);

  // When script is ready, init both the map and the Places services.
  useEffect(() => {
    if (!canUse) return;
    const w = window as any;
    if (w.google?.maps && status !== "ready") {
      setStatus("ready");
    }
  }, [canUse, status]);

  useEffect(() => {
    if (status !== "ready") return;
    initMap();
    try {
      initServices();
    } catch (e: any) {
      setError(e?.message || "Failed to initialise Google services.");
      setStatus("error");
    }
  }, [status, initMap, initServices]);

  // Autocomplete suggestions (debounced)
  useEffect(() => {
    if (!canUse || status !== "ready") return;
    if (query.trim().length < 3) {
      setPredictions([]);
      return;
    }

    const handle = window.setTimeout(() => {
      try {
        initServices();
        servicesRef.current.ac!.getPlacePredictions(
          { input: query },
          (res: any, s: any) => {
            const g = (window as any).google;
            if (s !== g.maps.places.PlacesServiceStatus.OK || !res) {
              setPredictions([]);
              return;
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

  const dropMarker = useCallback((lat: number, lng: number, title: string) => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    if (markerRef.current?.setMap) markerRef.current.setMap(null);

    // Prefer Advanced Markers when available, otherwise fall back to legacy Marker.
    const adv = g.maps.marker?.AdvancedMarkerElement;
    if (adv && mapId) {
      markerRef.current = new adv({
        map,
        position: { lat, lng },
        title,
      });
    } else {
      markerRef.current = new g.maps.Marker({
        map,
        position: { lat, lng },
        title,
        animation: g.maps.Animation.DROP,
      });
    }

    map.panTo({ lat, lng });
    if (map.getZoom() < 12) map.setZoom(12);
  }, [mapId]);

  const pick = (p: GooglePrediction) => {
    setStatus("loading");
    setError(null);
    try {
      initServices();
      servicesRef.current.details!.getDetails(
        {
          placeId: p.place_id,
          fields: ["formatted_address", "name", "geometry"],
        },
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
    map.setZoom(2);
    if (markerRef.current?.setMap) markerRef.current.setMap(null);
    markerRef.current = null;
    setPicked(null);
    setQuery("");
    setPredictions([]);
  };

  // Build the script src — include `marker` library so AdvancedMarkerElement is available.
  const scriptSrc = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&v=weekly`;

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

      {/* Floating search panel */}
      {canUse && (
        <div className="absolute top-4 left-4 z-10 w-[min(26rem,calc(100vw-5.5rem))] glass border border-[var(--color-border)] rounded-2xl shadow-2xl p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-[var(--color-text)] m-0">
                🧭 Google Globe Search
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-0.5 truncate">
                Search any address — drops a pin on the globe.
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

          {error && (
            <div className="mb-3 p-2.5 rounded-lg text-xs border bg-red-500/10 border-red-500/20 text-red-400">
              {error}
            </div>
          )}

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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(p);
                    }}
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
              globe projection (vector maps).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
