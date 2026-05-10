"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { getTrip, getMapData, createDay, createStop, getTripMedia } from "@/lib/api";
import type { TripDetail, MapData, Stop, MediaItem } from "@/types";
import dynamic from "next/dynamic";
import TimelineSlider from "@/components/timeline/TimelineSlider";
import MediaGallery from "@/components/media/MediaGallery";
import UploadHandler from "@/components/media/UploadHandler";
import StopSlideshowModal from "@/components/media/StopSlideshowModal";
import GooglePlacesSearch from "@/components/search/GooglePlacesSearch";
import Link from "next/link";
import { formatDateRange } from "@/lib/utils";
import { getTripRoute, type RouteResult } from "@/lib/directions";
import { useHomeLocations } from "@/context/HomeLocationsContext";
import { googleReverseGeocode } from "@/lib/googleGeocode";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--color-surface)] animate-pulse flex items-center justify-center rounded-2xl">
      <span className="text-[var(--color-text-secondary)] text-sm">Loading map...</span>
    </div>
  ),
});

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { homeLocations } = useHomeLocations();
  const resolvedParams = use(params);
  const router = useRouter();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "media" | "add">("timeline");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [slideshowStop, setSlideshowStop] = useState<Stop | null>(null);
  const [tripMedia, setTripMedia] = useState<MediaItem[]>([]);
  const [routeOverride, setRouteOverride] = useState<RouteResult | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Flatten all stops from all days — use explicit null checks so lat=0 or lng=0 are preserved
  const allStops: Stop[] = trip?.days
    ?.flatMap((day) => day.stops)
    .filter((s) => s.latitude != null && s.longitude != null)
    .sort((a, b) => a.sequence_order - b.sequence_order) ?? [];

  // All media: use tripMedia (fetched from /api/trips/{id}/media — includes all media for the trip)
  const allMedia = tripMedia;

  // Geotagged media for map markers (Bug 12)
  const geotaggedMedia = tripMedia.filter(
    (m) => m.latitude != null && m.longitude != null && m.file_type === "image"
  );

  // Load trip data and all media
  const loadTrip = useCallback(async () => {
    try {
      const [tripData, mapDataResult, mediaData] = await Promise.all([
        getTrip(resolvedParams.id),
        getMapData(resolvedParams.id),
        getTripMedia(resolvedParams.id),
      ]);
      setTrip(tripData);
      setMapData(mapDataResult);
      setTripMedia(mediaData);
    } catch (err) {
      console.error("Failed to load trip:", err);
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  // Resolve road / flight geometry whenever the ordered list of stops changes.
  // Live-recorded walks already have an actual GPS track in mapData.path —
  // skip directions entirely for those.
  useEffect(() => {
    if (trip?.track_geojson) {
      setRouteOverride(null);
      return;
    }
    if (allStops.length < 2) {
      setRouteOverride(null);
      return;
    }
    let cancelled = false;
    getTripRoute(allStops)
      .then((res) => {
        if (!cancelled) setRouteOverride(res);
      })
      .catch((e) => {
        console.warn("Route resolution failed, falling back to straight lines:", e);
        if (!cancelled) setRouteOverride(null);
      });
    return () => { cancelled = true; };
    // We intentionally serialize the stops fingerprint so identical lists don't
    // re-trigger the effect (the array identity changes on each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.track_geojson, allStops.map((s) => `${s.id}:${s.latitude},${s.longitude}:${s.is_airport ? 1 : 0}`).join("|")]);

  // Playback logic
  useEffect(() => {
    if (isPlaying && allStops.length > 0) {
      playIntervalRef.current = setInterval(() => {
        setActiveStopIndex((prev) => {
          if (prev >= allStops.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 2000);
    }

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, allStops.length]);

  // Add Stop tab state — Google-Places-driven so users only need to pick a
  // place; lat/lng/place_id/is_airport are filled automatically.
  const [addForm, setAddForm] = useState({
    stopName: "",
    latitude: null as number | null,
    longitude: null as number | null,
    placeId: null as string | null,
    isAirport: false,
    arrivalTime: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;

    const hasLocation =
      addForm.stopName.trim().length > 0 &&
      addForm.latitude != null &&
      addForm.longitude != null;

    if (!hasLocation) {
      setAddError(
        "📍 Add a location: search and pick a result, use “Drop a pin on the map”, or “Use my current location”."
      );
      return;
    }
    setAddError(null);
    setAddLoading(true);
    try {
      let dayId: string;
      if (trip.days.length === 0) {
        const day = await createDay(trip.id, { day_number: 1, title: "Day 1" });
        dayId = day.id;
      } else {
        dayId = trip.days[trip.days.length - 1].id;
      }

      await createStop(dayId, {
        name: addForm.stopName || undefined,
        latitude: addForm.latitude ?? undefined,
        longitude: addForm.longitude ?? undefined,
        arrival_time: addForm.arrivalTime || undefined,
        sequence_order: allStops.length,
        place_id: addForm.placeId ?? undefined,
        is_airport: addForm.isAirport,
      });

      setAddForm({
        stopName: "",
        latitude: null,
        longitude: null,
        placeId: null,
        isAirport: false,
        arrivalTime: "",
      });
      await loadTrip();
    } catch (err) {
      console.error("Failed to add stop:", err);
      setAddError("Failed to add stop. Please try again.");
    } finally {
      setAddLoading(false);
    }
  };

  const fillStopFromGeolocation = () => {
    if (!navigator.geolocation) {
      setAddError("Your browser does not support geolocation.");
      return;
    }
    setGeoLoading(true);
    setAddError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let stopName = "";
        const addr = await googleReverseGeocode(lat, lng);
        if (addr) stopName = addr.length > 140 ? `${addr.slice(0, 137)}…` : addr;
        if (!stopName.trim()) stopName = "Here (rename me)";
        setAddForm((prev) => ({
          ...prev,
          stopName,
          latitude: lat,
          longitude: lng,
          placeId: `gps:${lat.toFixed(6)},${lng.toFixed(6)}`,
          isAirport: false,
        }));
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        const msg =
          err.code === 1
            ? "Location permission denied — allow location for this site in your browser, or use search / map pin."
            : err.code === 2
              ? "Position unavailable. Try again or use map pin."
              : "Could not read GPS in time. Try outdoors, widen browser permissions, or use map pin.";
        setAddError(msg);
      },
      { enableHighAccuracy: true, timeout: 22_000, maximumAge: 60_000 }
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--color-text-secondary)] animate-pulse">Loading trip...</div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <span className="text-5xl">🔍</span>
        <p className="text-[var(--color-text-secondary)]">Trip not found</p>
        <Link href="/trips" className="text-amber-400 text-sm no-underline hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-[var(--color-text-secondary)]/50";

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {/* Bug 9 — Back goes to /trips not / */}
          <Link
            href="/trips"
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] no-underline text-sm transition-colors"
          >
            ← Back
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-[var(--color-text)] m-0 truncate flex items-center gap-2">
              {trip.track_geojson && <span title="Live recorded walk" className="text-amber-400">🚶</span>}
              <span className="truncate">{trip.title}</span>
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-0.5">
              {trip.track_geojson && trip.track_distance_m != null
                ? <>
                    {formatDateRange(trip.start_date, trip.end_date)}
                    {" • "}
                    <span className="text-amber-400">{trip.track_distance_m < 1000 ? `${trip.track_distance_m.toFixed(0)} m` : `${(trip.track_distance_m / 1000).toFixed(2)} km`}</span>
                    {trip.track_duration_s != null && <> {" • "}{Math.floor(trip.track_duration_s / 60)} min</>}
                    {" • "}{allMedia.length} photos
                  </>
                : <>{formatDateRange(trip.start_date, trip.end_date)} • {allStops.length} stops • {allMedia.length} photos</>
              }
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Map (main area) — Bug 12: pass geotaggedMedia as mediaMarkers */}
        <div className="flex-1 p-3 md:p-4 min-h-0">
          <MapView
            mapData={mapData}
            activeStopIndex={activeStopIndex}
            routeOverride={routeOverride}
            homeMarkers={homeLocations}
            onStopClick={(stopId) => {
              const idx = allStops.findIndex((s) => s.id === stopId);
              if (idx >= 0) setActiveStopIndex(idx);
              // Open slideshow for clicked stop
              const stop = allStops.find((s) => s.id === stopId);
              if (stop) setSlideshowStop(stop);
            }}
          />
        </div>

        {/* Side panel */}
        <div className="w-full md:w-[380px] border-t md:border-t-0 md:border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden shrink-0 h-[45dvh] md:h-auto">
          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border)] shrink-0">
            {[
              { key: "timeline", label: "Timeline", icon: "⏱" },
              { key: "media", label: "Media", icon: "📷" },
              { key: "add", label: "Add Stop", icon: "📍" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex-1 py-3 text-xs font-medium transition-all ${
                  activeTab === tab.key
                    ? "text-amber-400 border-b-2 border-amber-400"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                <span className="block text-base mb-0.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-4 min-h-0" style={{ position: "relative" }}>
            {activeTab === "timeline" && (
              <>
                {/* Bug 10 — Show description above timeline */}
                {trip.description && (
                  <div className="mb-4 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    <p className="text-xs font-semibold text-[var(--color-text)] mb-1 flex items-center gap-1">
                      📝 About this trip
                    </p>
                    <p className="m-0 text-xs">{trip.description}</p>
                  </div>
                )}
                <TimelineSlider
                  stops={allStops}
                  activeIndex={activeStopIndex}
                  onIndexChange={setActiveStopIndex}
                  isPlaying={isPlaying}
                  onPlayToggle={() => setIsPlaying(!isPlaying)}
                  onStopsUpdate={() => loadTrip()}
                />
              </>
            )}

            {activeTab === "media" && (
              <div className="flex flex-col h-full gap-4">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="w-full py-3 rounded-xl border border-dashed border-teal-500/50 text-teal-400 hover:bg-teal-500/10 transition-colors flex items-center justify-center gap-2 font-medium text-sm shrink-0"
                >
                  <span>📤</span> Upload Media
                </button>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <MediaGallery media={allMedia} onMediaUpdate={() => loadTrip()} />
                </div>
              </div>
            )}

            {activeTab === "add" && (
              <form onSubmit={handleAddStop} className="space-y-4 animate-fade-in">
                {/* Bug 1 — Show location error */}
                {addError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs">
                    {addError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Stop name and location <span className="text-red-400">*</span>
                  </label>
                  <p className="text-[10px] text-[var(--color-text-secondary)] m-0 mb-1.5 leading-relaxed">
                    Search Google, drop a pin (link under the field), or use GPS below. You can always edit the stop name after coordinates are set.
                  </p>
                  <GooglePlacesSearch
                    homeLocations={homeLocations}
                    value={addForm.stopName}
                    onChange={(v) => {
                      setAddForm((prev) => ({ ...prev, stopName: v }));
                      setAddError(null);
                    }}
                    onSelect={(place) => {
                      setAddForm((prev) => ({
                        ...prev,
                        stopName: place.name,
                        latitude: place.lat,
                        longitude: place.lng,
                        placeId: place.place_id,
                        isAirport: place.is_airport,
                      }));
                      setAddError(null);
                    }}
                    placeholder="e.g., Starbucks, Eiffel Tower, or 123 Main St"
                    inputClassName={inputClass}
                    suggestionsZIndex={9999}
                  />
                  {addForm.latitude != null && addForm.longitude != null && (
                    <p className="text-[10px] text-[var(--color-text-secondary)] mt-1.5 flex items-center gap-2">
                      <span className="text-teal-400">✓</span>
                      <span>{addForm.latitude.toFixed(4)}, {addForm.longitude.toFixed(4)}</span>
                      {addForm.isAirport && (
                        <span className="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 text-[9px] font-semibold uppercase tracking-wide">
                          ✈ Airport
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-3 space-y-2">
                  <p className="text-[11px] text-[var(--color-text-secondary)] m-0 leading-relaxed">
                    At a spot Google does not list? With location turned on, save this device’s coordinates and give the stop your own name (edit the field above after we fill a draft).
                  </p>
                  <button
                    type="button"
                    onClick={fillStopFromGeolocation}
                    disabled={geoLoading || addLoading}
                    className="w-full py-2 rounded-lg text-xs font-semibold border border-teal-500/40 text-teal-300 hover:bg-teal-500/15 transition-colors disabled:opacity-40"
                  >
                    {geoLoading ? "Reading GPS…" : "Use my current location"}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Arrival Date
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={addForm.arrivalTime}
                    onChange={(e) => setAddForm({ ...addForm, arrivalTime: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold text-sm hover:from-teal-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-lg shadow-teal-500/20"
                >
                  {addLoading ? "Adding..." : "Add Stop"}
                </button>
              </form>
            )}
          </div>

          {/* Bug 11 — "Finish!!" instead of "Save & Exit" routes to / */}
          <div className="shrink-0 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all bg-gradient-to-r from-amber-500 to-teal-500 text-[#0a0e1a] hover:from-amber-400 hover:to-teal-400 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <span>✓</span>
              Finish!!
            </button>
          </div>
        </div>
      </div>

      {/* Stop Slideshow Modal */}
      {slideshowStop && (
        <StopSlideshowModal
          stopName={slideshowStop.name}
          media={slideshowStop.media}
          onClose={() => setSlideshowStop(null)}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-bold m-0">Upload Media</h3>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="text-[var(--color-text-secondary)] hover:text-white transition-colors p-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <UploadHandler
                tripId={trip.id}
                stopId={allStops[activeStopIndex]?.id}
                defaultLat={allStops[activeStopIndex]?.latitude ?? undefined}
                defaultLng={allStops[activeStopIndex]?.longitude ?? undefined}
                tripStartDate={trip.start_date ?? undefined}
                tripEndDate={trip.end_date ?? undefined}
                onUploadComplete={() => {
                  loadTrip();
                  setShowUploadModal(false);
                }}
                onStopSelected={(stopId) => {
                  const idx = allStops.findIndex(s => s.id === stopId);
                  if (idx >= 0) setActiveStopIndex(idx);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
