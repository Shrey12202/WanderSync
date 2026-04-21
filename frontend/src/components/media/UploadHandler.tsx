"use client";

import { useState, useCallback, useEffect } from "react";
import { uploadMedia, extractExif, getTrip } from "@/lib/api";
import type { ExifData, MediaItem, Stop } from "@/types";

interface UploadHandlerProps {
  tripId: string;
  stopId?: string;
  defaultLat?: number;
  defaultLng?: number;
  onUploadComplete: (media: MediaItem) => void;
}

export default function UploadHandler({ tripId, stopId, defaultLat, defaultLng, onUploadComplete }: UploadHandlerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "analyzing" | "confirm" | "uploading">("idle");
  const [exif, setExif] = useState<ExifData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // All stops for this trip (used for the stop picker)
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [selectedExistingStopId, setSelectedExistingStopId] = useState<string>("");

  // Confirmation form state — always shown before upload
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [overrideLat, setOverrideLat] = useState<string>("");
  const [overrideLng, setOverrideLng] = useState<string>("");
  const [overrideDate, setOverrideDate] = useState<string>("");

  // Fetch trip stops so user can pick an existing stop for location
  useEffect(() => {
    if (!tripId) return;
    getTrip(tripId)
      .then((trip) => {
        const allStops = trip.days.flatMap((d) => d.stops);
        setTripStops(allStops);
      })
      .catch(() => setTripStops([]));
  }, [tripId]);

  // When user picks an existing stop, auto-fill its coordinates
  useEffect(() => {
    if (!selectedExistingStopId) return;
    const stop = tripStops.find((s) => s.id === selectedExistingStopId);
    if (stop?.latitude != null && stop?.longitude != null) {
      setOverrideLat(String(stop.latitude));
      setOverrideLng(String(stop.longitude));
      setSearchQuery(stop.name || "");
    }
  }, [selectedExistingStopId, tripStops]);

  // Geocoding
  useEffect(() => {
    if (searchQuery.length > 2) {
      const fetchPlaces = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(searchQuery)}&access_token=${token}`);
          const data = await res.json();
          if (data.features) setSuggestions(data.features);
        } catch (e) {
          console.error("Geocoding error:", e);
        }
      };
      const timeoutId = setTimeout(fetchPlaces, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setStep("analyzing");
    setError(null);

    try {
      const data = await extractExif(selectedFile);
      setExif(data);

      // Pre-fill with EXIF data if available, otherwise use stop defaults
      const lat = data.has_gps && data.latitude != null ? String(data.latitude) : (defaultLat !== undefined ? String(defaultLat) : "");
      const lng = data.has_gps && data.longitude != null ? String(data.longitude) : (defaultLng !== undefined ? String(defaultLng) : "");
      const date = data.taken_at ? new Date(data.taken_at).toISOString().split("T")[0] : "";

      setOverrideLat(lat);
      setOverrideLng(lng);
      setOverrideDate(date);
      if (lat && lng) {
        // Reverse geocode to populate the search query for display
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&access_token=${token}`);
          const geoData = await res.json();
          if (geoData.features && geoData.features.length > 0) {
            setSearchQuery(geoData.features[0].properties.place_formatted || geoData.features[0].properties.full_address || "");
          }
        } catch {
          // Ignore reverse geocode errors — user can type manually
        }
      }

      // Always go to the confirm step so user can verify/override
      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "Failed to analyze photo");
      setStep("idle");
    }
  };

  const handleConfirmUpload = async () => {
    if (!file) return;
    setStep("uploading");
    try {
      const parsedLat = overrideLat ? parseFloat(overrideLat) : defaultLat;
      const parsedLng = overrideLng ? parseFloat(overrideLng) : defaultLng;
      const parsedDate = overrideDate ? new Date(overrideDate).toISOString() : undefined;

      const media = await uploadMedia(file, tripId, stopId, undefined, parsedLat, parsedLng, parsedDate);

      setStep("idle");
      setFile(null);
      setOverrideLat("");
      setOverrideLng("");
      setOverrideDate("");
      setSearchQuery("");
      setSelectedExistingStopId("");
      onUploadComplete(media);
    } catch (err: any) {
      setError(err.message || "Failed to upload");
      setStep("confirm");
    }
  };

  const handleCancel = () => {
    setStep("idle");
    setFile(null);
    setOverrideLat("");
    setOverrideLng("");
    setOverrideDate("");
    setSearchQuery("");
    setSuggestions([]);
    setError(null);
    setExif(null);
    setSelectedExistingStopId("");
  };

  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (step !== "idle") return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [step]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:border-amber-500/50 outline-none transition-all placeholder:text-[var(--color-text-secondary)]/50";

  if (step === "analyzing" || step === "uploading") {
    return (
      <div className="h-48 border-2 border-dashed border-teal-500 bg-teal-500/10 rounded-2xl flex flex-col items-center justify-center p-6 animate-pulse">
        <span className="text-4xl mb-4 text-teal-400">⏳</span>
        <p className="text-[var(--color-text)] font-semibold">
          {step === "analyzing" ? "Reading EXIF metadata..." : "Uploading securely..."}
        </p>
      </div>
    );
  }

  if (step === "confirm") {
    const hasExifGps = exif?.has_gps;
    const hasExifDate = !!exif?.taken_at;

    return (
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 animate-fade-in shadow-xl shadow-amber-500/10 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">
            📋
          </div>
          <div>
            <h3 className="text-[var(--color-text)] font-bold m-0 text-sm">Confirm Photo Details</h3>
            <p className="text-[var(--color-text-secondary)] text-xs m-0 mt-0.5">
              {file?.name} • Verify or update location and date before uploading
            </p>
          </div>
        </div>

        {/* EXIF status badges */}
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${hasExifGps ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
            {hasExifGps ? "✓ GPS from photo" : "⚠ No GPS in photo"}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${hasExifDate ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
            {hasExifDate ? "✓ Date from photo" : "⚠ No date in photo"}
          </span>
        </div>

        {/* Existing stop picker */}
        {tripStops.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
              📌 Use existing stop
            </label>
            <select
              className={inputClass}
              value={selectedExistingStopId}
              onChange={(e) => setSelectedExistingStopId(e.target.value)}
            >
              <option value="">— Search / enter location manually —</option>
              {tripStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Location search */}
        <div className="relative">
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
            📍 Location {selectedExistingStopId ? "(auto-filled from stop)" : ""}
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder="Search a place or enter coordinates below..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedExistingStopId(""); }}
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl max-h-44 overflow-y-auto shadow-2xl custom-scrollbar">
              {suggestions.map((feature, i) => (
                <li
                  key={i}
                  className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                  onClick={() => {
                    setSearchQuery(feature.properties.name || feature.properties.place_formatted || feature.properties.full_address);
                    setOverrideLng(String(feature.geometry.coordinates[0]));
                    setOverrideLat(String(feature.geometry.coordinates[1]));
                    setSuggestions([]);
                  }}
                >
                  <span className="font-medium">{feature.properties.name || feature.properties.full_address}</span>
                  <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                    {feature.properties.full_address || feature.properties.place_formatted}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lat/Lng row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">Latitude</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              placeholder="e.g., 48.8584"
              value={overrideLat}
              onChange={(e) => setOverrideLat(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">Longitude</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              placeholder="e.g., 2.2945"
              value={overrideLng}
              onChange={(e) => setOverrideLng(e.target.value)}
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
            📅 Photo Date
          </label>
          <input
            type="date"
            className={inputClass}
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleConfirmUpload}
            className="flex-1 px-4 py-2.5 bg-amber-500 font-bold text-[#0a0e1a] text-sm rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
          >
            Confirm & Upload
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2.5 border border-[var(--color-border)] font-semibold text-[var(--color-text-secondary)] text-sm rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      <div
        className="h-48 border-2 border-dashed border-[var(--color-border)] hover:border-amber-500/50 rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all group cursor-pointer"
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={onDrop}
      >
        <span className="text-4xl mb-3 opacity-60 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300">📤</span>
        <p className="text-[var(--color-text)] font-semibold text-sm">Drop photos & videos here</p>
        <p className="text-[var(--color-text-secondary)] text-xs mt-1 max-w-xs">
          or click to browse • Always confirms date & location before uploading
        </p>

        <label className="mt-4 cursor-pointer px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-xs font-semibold hover:bg-[var(--color-surface-hover)] transition-colors">
          Browse Files
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={onFileChange}
          />
        </label>
      </div>
    </div>
  );
}
