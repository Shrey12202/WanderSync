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
import Link from "next/link";
import { formatDateRange } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--color-surface)] animate-pulse flex items-center justify-center rounded-2xl">
      <span className="text-[var(--color-text-secondary)] text-sm">Loading map...</span>
    </div>
  ),
});

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "media" | "upload" | "add">("timeline");
  const [slideshowStop, setSlideshowStop] = useState<Stop | null>(null);
  const [tripMedia, setTripMedia] = useState<MediaItem[]>([]);
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

  const [addForm, setAddForm] = useState({
    stopName: "",
    latitude: "",
    longitude: "",
    arrivalTime: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null); // Bug 1
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const skipGeocodingRef = useRef(false);

  useEffect(() => {
    if (skipGeocodingRef.current) {
      skipGeocodingRef.current = false;
      return;
    }
    if (addForm.stopName.length > 2) {
      const fetchPlaces = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(
            `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(addForm.stopName)}&session_token=trips-id-session&access_token=${token}`
          );
          const data = await res.json();
          if (data.suggestions) setSuggestions(data.suggestions);
        } catch (e) {
          console.error("Geocoding error:", e);
        }
      };
      const timeoutId = setTimeout(fetchPlaces, 600);
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
    }
  }, [addForm.stopName]);

  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;

    // Bug 1 — Location is mandatory
    const hasLocation =
      addForm.stopName.trim().length > 0 &&
      addForm.latitude.trim().length > 0 &&
      addForm.longitude.trim().length > 0;

    if (!hasLocation) {
      setAddError("📍 Location is required — search for a place and select it from the dropdown.");
      return;
    }
    setAddError(null);

    setAddLoading(true);
    try {
      // Create a day if none exist
      let dayId: string;
      if (trip.days.length === 0) {
        const day = await createDay(trip.id, {
          day_number: 1,
          title: "Day 1",
        });
        dayId = day.id;
      } else {
        dayId = trip.days[trip.days.length - 1].id;
      }

      await createStop(dayId, {
        name: addForm.stopName || undefined,
        latitude: addForm.latitude ? parseFloat(addForm.latitude) : undefined,
        longitude: addForm.longitude ? parseFloat(addForm.longitude) : undefined,
        arrival_time: addForm.arrivalTime || undefined,
        sequence_order: allStops.length,
      });

      setAddForm({ stopName: "", latitude: "", longitude: "", arrivalTime: "" });
      await loadTrip();
    } catch (err) {
      console.error("Failed to add stop:", err);
      setAddError("Failed to add stop. Please try again.");
    } finally {
      setAddLoading(false);
    }
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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <div className="flex items-center gap-4">
          {/* Bug 9 — Back goes to /trips not / */}
          <Link
            href="/trips"
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] no-underline text-sm transition-colors"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)] m-0">{trip.title}</h1>
            <p className="text-xs text-[var(--color-text-secondary)] m-0 mt-0.5">
              {formatDateRange(trip.start_date, trip.end_date)} • {allStops.length} stops • {allMedia.length} photos
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map (main area) — Bug 12: pass geotaggedMedia as mediaMarkers */}
        <div className="flex-1 p-4">
          <MapView
            mapData={mapData}
            activeStopIndex={activeStopIndex}
            mediaMarkers={geotaggedMedia}
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
        <div className="w-[380px] border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border)] shrink-0">
            {[
              { key: "timeline", label: "Timeline", icon: "⏱" },
              { key: "media", label: "Media", icon: "📷" },
              { key: "upload", label: "Upload", icon: "📤" },
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
          <div className="flex-1 overflow-y-auto overflow-x-visible p-4" style={{ position: 'relative' }}>
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
              <MediaGallery media={allMedia} onMediaUpdate={() => loadTrip()} />
            )}

            {activeTab === "upload" && (
              <UploadHandler
                tripId={trip.id}
                stopId={allStops[activeStopIndex]?.id}
                defaultLat={allStops[activeStopIndex]?.latitude ?? undefined}
                defaultLng={allStops[activeStopIndex]?.longitude ?? undefined}
                tripStartDate={trip.start_date ?? undefined}
                tripEndDate={trip.end_date ?? undefined}
                onUploadComplete={() => loadTrip()}
              />
            )}

            {activeTab === "add" && (
              <form onSubmit={handleAddStop} className="space-y-4 animate-fade-in">
                {/* Bug 1 — Show location error */}
                {addError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs">
                    {addError}
                  </div>
                )}
                <div className="relative">
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Search Location Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g., Starbucks, Eiffel Tower, or 123 Main St"
                    value={addForm.stopName}
                    onChange={(e) => {
                      setAddForm({ ...addForm, stopName: e.target.value });
                      setAddError(null);
                    }}
                  />
                  {suggestions.length > 0 && (
                    <ul className="absolute z-[9999] w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg max-h-48 overflow-y-auto shadow-2xl custom-scrollbar left-0" style={{ position: 'absolute' }}>
                      {suggestions.map((suggestion, i) => (
                        <li
                          key={i}
                          className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                          onMouseDown={async (e) => {
                            e.preventDefault();
                            try {
                              const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
                              const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?session_token=trips-id-session&access_token=${token}`);
                              const data = await res.json();
                              if (data.features && data.features.length > 0) {
                                const feature = data.features[0];
                                skipGeocodingRef.current = true;
                                setAddForm({
                                  ...addForm,
                                  stopName: suggestion.name || feature.properties.name || suggestion.full_address,
                                  longitude: String(feature.geometry.coordinates[0]),
                                  latitude: String(feature.geometry.coordinates[1]),
                                });
                                setSuggestions([]);
                                setAddError(null);
                              }
                            } catch (e) {
                              console.error("Retrieve error:", e);
                            }
                          }}
                        >
                          <span className="font-medium block truncate">{suggestion.name || suggestion.full_address}</span>
                          <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                            {suggestion.full_address || suggestion.place_formatted}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                      Latitude <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      className={inputClass}
                      placeholder="48.8584"
                      value={addForm.latitude}
                      onChange={(e) => setAddForm({ ...addForm, latitude: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                      Longitude <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      className={inputClass}
                      placeholder="2.2945"
                      value={addForm.longitude}
                      onChange={(e) => setAddForm({ ...addForm, longitude: e.target.value })}
                    />
                  </div>
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

          {/* Bug 11 — "Save & Exit" instead of "Finish & View on Map" */}
          <div className="shrink-0 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
              onClick={() => router.push("/trips")}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all bg-gradient-to-r from-amber-500 to-teal-500 text-[#0a0e1a] hover:from-amber-400 hover:to-teal-400 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <span>✓</span>
              Save &amp; Exit
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
    </div>
  );
}
