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
  // This is the single source of truth — stop-linked and unlinked deduplicated by id
  const allMedia = tripMedia;


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
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    if (addForm.stopName.length > 2) {
      const fetchPlaces = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(
            `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(addForm.stopName)}&types=poi,place,locality,neighborhood,address&limit=10&access_token=${token}`
          );
          const data = await res.json();
          if (data.features) setSuggestions(data.features);
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
        <Link href="/" className="text-amber-400 text-sm no-underline hover:underline">
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
          <Link
            href="/"
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
        {/* Map (main area) */}
        <div className="flex-1 p-4">
          <MapView
            mapData={mapData}
            activeStopIndex={activeStopIndex}
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
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "timeline" && (
              <TimelineSlider
                stops={allStops}
                activeIndex={activeStopIndex}
                onIndexChange={setActiveStopIndex}
                isPlaying={isPlaying}
                onPlayToggle={() => setIsPlaying(!isPlaying)}
                onStopsUpdate={() => loadTrip()}
              />
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
                onUploadComplete={() => loadTrip()}
              />
            )}

            {activeTab === "add" && (
              <form onSubmit={handleAddStop} className="space-y-4 animate-fade-in">
                <div className="relative">
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Search Location Name
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g., Eiffel Tower"
                    value={addForm.stopName}
                    onChange={(e) => setAddForm({ ...addForm, stopName: e.target.value })}
                  />
                  {suggestions.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg max-h-48 overflow-y-auto shadow-xl custom-scrollbar left-0">
                      {suggestions.map((feature, i) => (
                        <li
                          key={i}
                          className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer truncate transition-colors"
                          onClick={() => {
                            setAddForm({
                              ...addForm,
                              stopName: feature.properties.name || feature.properties.place_formatted || feature.properties.full_address,
                              longitude: String(feature.geometry.coordinates[0]),
                              latitude: String(feature.geometry.coordinates[1]),
                            });
                            setSuggestions([]);
                          }}
                        >
                          {feature.properties.name || feature.properties.full_address || feature.properties.place_formatted}
                          <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                            {feature.properties.full_address || feature.properties.place_formatted}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                      Latitude
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
                      Longitude
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

          {/* ── Finish Trip footer — visible on all tabs ── */}
          <div className="shrink-0 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all bg-gradient-to-r from-amber-500 to-teal-500 text-[#0a0e1a] hover:from-amber-400 hover:to-teal-400 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <span>✓</span>
              Finish &amp; View on Map
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
