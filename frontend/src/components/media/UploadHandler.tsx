"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { uploadMedia, extractExif, getTrip } from "@/lib/api";
import type { ExifData, MediaItem, Stop } from "@/types";

interface UploadHandlerProps {
  tripId?: string;                // Optional — standalone uploads allowed
  stopId?: string;
  defaultLat?: number;
  defaultLng?: number;
  tripStartDate?: string;         // Constrain date picker to trip range
  tripEndDate?: string;
  onUploadComplete: (media: MediaItem) => void;
}

export default function UploadHandler({ tripId, stopId, defaultLat, defaultLng, tripStartDate, tripEndDate, onUploadComplete }: UploadHandlerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "analyzing" | "confirm" | "uploading">("idle");
  const [exif, setExif] = useState<ExifData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // All stops for this trip (for the stop picker)
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [selectedExistingStopId, setSelectedExistingStopId] = useState<string>(stopId || "none");

  // Keep selected stop in sync if the parent prop changes (e.g. they switch tabs)
  useEffect(() => {
    setSelectedExistingStopId(stopId || "none");
  }, [stopId]);

  // Confirmation form state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [overrideLat, setOverrideLat] = useState<string>("");
  const [overrideLng, setOverrideLng] = useState<string>("");
  const [overrideDate, setOverrideDate] = useState<string>("");

  // Prevents geocoding from re-firing immediately after a suggestion is selected
  const skipGeocodingRef = useRef(false);

  // Fetch trip stops
  useEffect(() => {
    if (!tripId) return;
    getTrip(tripId)
      .then((trip) => setTripStops(trip.days.flatMap((d) => d.stops)))
      .catch(() => setTripStops([]));
  }, [tripId]);

  // When user picks an existing stop, auto-fill its coordinates
  useEffect(() => {
    if (!selectedExistingStopId) return;
    const stop = tripStops.find((s) => s.id === selectedExistingStopId);
    if (stop?.latitude != null && stop?.longitude != null) {
      skipGeocodingRef.current = true;
      setOverrideLat(String(stop.latitude));
      setOverrideLng(String(stop.longitude));
      setSearchQuery(stop.name || "");
      setSuggestions([]);
    }
  }, [selectedExistingStopId, tripStops]);

  // Geocoding — CITY/POI level only (types=place,locality,poi,address)
  // Skipped for one cycle after a suggestion or stop is selected
  useEffect(() => {
    if (skipGeocodingRef.current) {
      skipGeocodingRef.current = false;
      return;
    }
    if (searchQuery.length > 2) {
      const fetchPlaces = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(
            `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(searchQuery)}&limit=10&access_token=${token}`
          );
          const data = await res.json();
          if (data.features) setSuggestions(data.features);
        } catch (e) {
          console.error("Geocoding error:", e);
        }
      };
      const id = setTimeout(fetchPlaces, 500);
      return () => clearTimeout(id);
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

      const lat = data.has_gps && data.latitude != null ? String(data.latitude) : (defaultLat !== undefined ? String(defaultLat) : "");
      const lng = data.has_gps && data.longitude != null ? String(data.longitude) : (defaultLng !== undefined ? String(defaultLng) : "");
      const date = data.taken_at ? new Date(data.taken_at).toISOString().split("T")[0] : "";

      setOverrideLat(lat);
      setOverrideLng(lng);
      setOverrideDate(date);

      if (lat && lng) {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&access_token=${token}`);
          const geoData = await res.json();
          if (geoData.features?.length > 0) {
            skipGeocodingRef.current = true;
            setSearchQuery(geoData.features[0].properties.place_formatted || geoData.features[0].properties.full_address || "");
          }
        } catch { /* ignore */ }
      }

      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "Failed to analyze photo");
      setStep("idle");
    }
  };

  const handleConfirmUpload = async () => {
    if (!file) return;

    // ── Validation: location + date are required ──────────────────────────────
    const parsedLat = overrideLat ? parseFloat(overrideLat) : defaultLat;
    const parsedLng = overrideLng ? parseFloat(overrideLng) : defaultLng;

    if (parsedLat == null || parsedLng == null || isNaN(parsedLat) || isNaN(parsedLng)) {
      setError("📍 Location is required. Search for a city or place above.");
      return;
    }
    if (!overrideDate) {
      setError("📅 Date is required. Enter when this photo was taken.");
      return;
    }

    setStep("uploading");
    try {
      const parsedDate = new Date(overrideDate).toISOString();
      const finalStopId = selectedExistingStopId === "none" ? undefined : selectedExistingStopId;

      const media = await uploadMedia(file, tripId, finalStopId, undefined, parsedLat, parsedLng, parsedDate);

      setStep("idle");
      setFile(null);
      setOverrideLat(""); setOverrideLng(""); setOverrideDate("");
      setSearchQuery(""); setSelectedExistingStopId("");
      onUploadComplete(media);
    } catch (err: any) {
      setError(err.message || "Failed to upload");
      setStep("confirm");
    }
  };

  const handleCancel = () => {
    setStep("idle"); setFile(null);
    setOverrideLat(""); setOverrideLng(""); setOverrideDate("");
    setSearchQuery(""); setSuggestions([]); setError(null);
    setExif(null); setSelectedExistingStopId("");
  };

  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (step !== "idle") return;
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  }, [step]);

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
    const hasLat = overrideLat !== "" && !isNaN(parseFloat(overrideLat));
    const hasLng = overrideLng !== "" && !isNaN(parseFloat(overrideLng));

    // Compute which required fields are still missing
    const missingFields: string[] = [];
    if (!hasLat || !hasLng) missingFields.push("📍 Location (lat/lng)");
    if (!overrideDate) missingFields.push("📅 Date Taken");

    return (
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 animate-fade-in shadow-xl shadow-amber-500/10 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">📋</div>
          <div>
            <h3 className="text-[var(--color-text)] font-bold m-0 text-sm">Confirm Photo Details</h3>
            <p className="text-[var(--color-text-secondary)] text-xs m-0 mt-0.5">
              {file?.name} • Location and date required before uploading
            </p>
          </div>
        </div>

        {/* ── Required fields banner — shown proactively when fields are missing ── */}
        {missingFields.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex gap-2.5 items-start">
            <span className="text-red-400 text-base shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-red-400 font-semibold text-xs m-0 mb-1">Required fields missing:</p>
              <ul className="m-0 p-0 list-none space-y-0.5">
                {missingFields.map((f) => (
                  <li key={f} className="text-red-400/80 text-xs">{f}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* EXIF badges */}
        <div className="flex gap-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${hasExifGps ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
            {hasExifGps ? "✓ GPS from photo" : "⚠ No GPS — enter manually"}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${hasExifDate ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
            {hasExifDate ? "✓ Date from photo" : "⚠ No date — enter manually"}
          </span>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Existing stop picker */}
        {tripStops.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">📌 Use existing stop</label>
            <select
              className={inputClass}
              value={selectedExistingStopId}
              onChange={(e) => setSelectedExistingStopId(e.target.value)}
            >
              <option value="none">— None (Standalone trip photo) —</option>
              {tripStops.map((stop) => (
                <option key={stop.id} value={stop.id}>{stop.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Location search */}
        <div className="relative">
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
            📍 Location <span className="text-red-400">*</span>{selectedExistingStopId ? " (auto-filled)" : ""}
          </label>
          <input
            type="text"
            className={`${inputClass} ${!hasLat || !hasLng ? "border-amber-500/40" : "border-teal-500/40"}`}
            placeholder="Search city, landmark, or address..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedExistingStopId("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) {
                e.preventDefault();
                const feature = suggestions[0];
                skipGeocodingRef.current = true;
                setSearchQuery(feature.properties.name || feature.properties.full_address);
                setOverrideLng(String(feature.geometry.coordinates[0]));
                setOverrideLat(String(feature.geometry.coordinates[1]));
                setSuggestions([]);
              }
            }}
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl max-h-44 overflow-y-auto shadow-2xl">
              {suggestions.map((feature, i) => (
                <li
                  key={i}
                  className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                  onMouseDown={(e) => {
                    // Use onMouseDown (not onClick) to fire before input blur
                    e.preventDefault();
                    skipGeocodingRef.current = true;
                    setSearchQuery(feature.properties.name || feature.properties.full_address);
                    setOverrideLng(String(feature.geometry.coordinates[0]));
                    setOverrideLat(String(feature.geometry.coordinates[1]));
                    setSuggestions([]);
                    // If they manually searched a location, disconnect it from the active stop
                    // so it becomes a standalone trip photo.
                    setSelectedExistingStopId("none");
                  }}
                >
                  <span className="font-medium block truncate">{feature.properties.name || feature.properties.full_address}</span>
                  <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                    {feature.properties.full_address || feature.properties.place_formatted}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(!hasLat || !hasLng) && searchQuery.length > 0 && suggestions.length === 0 && (
            <p className="text-[10px] text-amber-500 mt-1.5 ml-1">
              Select a location from the dropdown suggestions or Enter manually below.
            </p>
          )}
        </div>

        {/* Coordinates (read-only display) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">Latitude</label>
            <input type="number" className={inputClass} placeholder="e.g. 28.6139" value={overrideLat}
              onChange={(e) => { setOverrideLat(e.target.value); setSelectedExistingStopId(""); }} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">Longitude</label>
            <input type="number" className={inputClass} placeholder="e.g. 77.2090" value={overrideLng}
              onChange={(e) => { setOverrideLng(e.target.value); setSelectedExistingStopId(""); }} />
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">
            📅 Date Taken <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            className={`${inputClass} ${!overrideDate ? "border-amber-500/40" : "border-teal-500/40"}`}
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
            min={tripStartDate || undefined}
            max={tripEndDate || undefined}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleConfirmUpload}
            disabled={!hasLat || !hasLng || !overrideDate}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-[#0a0e1a] font-bold text-sm hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Upload Photo
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2.5 rounded-xl bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-hover)] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Idle state — drop zone
  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm">{error}</div>
      )}
      <div
        className="h-52 border-2 border-dashed border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-amber-500/50 transition-all cursor-pointer"
        onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag} onDrop={onDrop}
      >
        <span className="text-5xl opacity-60">📸</span>
        <p className="text-sm text-[var(--color-text-secondary)]">Drag & drop or</p>
        <label className="cursor-pointer px-5 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 text-sm font-semibold hover:bg-amber-500/25 transition-all">
          Choose File
          <input type="file" className="hidden" accept="image/*,video/*"
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
        </label>
        <p className="text-xs text-[var(--color-text-secondary)] opacity-50">Location + Date required to upload</p>
      </div>
    </div>
  );
}
