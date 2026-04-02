"use client";

import { useState, useCallback, useEffect } from "react";
import { uploadMedia, extractExif } from "@/lib/api";
import type { ExifData } from "@/types";

interface UploadHandlerProps {
  tripId: string;
  stopId?: string;
  defaultLat?: number;
  defaultLng?: number;
  onUploadComplete: () => void;
}

export default function UploadHandler({ tripId, stopId, defaultLat, defaultLng, onUploadComplete }: UploadHandlerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "analyzing" | "missing-data" | "uploading">("idle");
  const [exif, setExif] = useState<ExifData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fallback Overrides State
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [overrideLat, setOverrideLat] = useState<string>("");
  const [overrideLng, setOverrideLng] = useState<string>("");
  const [overrideDate, setOverrideDate] = useState<string>("");

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
      // 1. Pre-flight check via EXIF
      const data = await extractExif(selectedFile);
      setExif(data);

      const hasLocation = data.has_gps || (defaultLat !== undefined && defaultLng !== undefined);

      if (hasLocation && data.taken_at) {
        // Complete data! Auto-upload.
        setStep("uploading");
        
        // Pass defaults if GPS was missing but we have stop coordinates
        const latToUse = data.has_gps ? undefined : defaultLat;
        const lngToUse = data.has_gps ? undefined : defaultLng;
        
        await uploadMedia(selectedFile, tripId, stopId, undefined, latToUse, lngToUse);
        setStep("idle");
        setFile(null);
        onUploadComplete();
      } else {
        // Missing data! Intercept and queue the fallback form.
        setStep("missing-data");
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze photo");
      setStep("idle");
    }
  };

  const handleManualUpload = async () => {
    if (!file) return;
    setStep("uploading");
    try {
      const parsedLat = overrideLat ? parseFloat(overrideLat) : defaultLat;
      const parsedLng = overrideLng ? parseFloat(overrideLng) : defaultLng;
      
      // Convert HTML date to ISO datetime
      const parsedDate = overrideDate ? new Date(overrideDate).toISOString() : undefined;

      await uploadMedia(file, tripId, stopId, undefined, parsedLat, parsedLng, parsedDate);
      
      setStep("idle");
      setFile(null);
      setOverrideLat("");
      setOverrideLng("");
      setOverrideDate("");
      setSearchQuery("");
      onUploadComplete();
    } catch (err: any) {
      setError(err.message || "Failed to upload photo manually");
      setStep("missing-data");
    }
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

  if (step === "analyzing" || step === "uploading") {
    return (
      <div className="h-64 border-2 border-dashed border-teal-500 bg-teal-500/10 rounded-2xl flex flex-col items-center justify-center p-6 animate-pulse">
        <span className="text-4xl mb-4 text-teal-400">⏳</span>
        <p className="text-[var(--color-text)] font-semibold">
          {step === "analyzing" ? "Analyzing EXIF metadata..." : "Uploading securely..."}
        </p>
      </div>
    );
  }

  if (step === "missing-data") {
    const inputClass = "w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:border-amber-500/50 outline-none";
    
    return (
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-6 animate-fade-in shadow-xl shadow-amber-500/10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-[var(--color-text)] font-bold m-0 text-base">Metadata Missing</h3>
            <p className="text-[var(--color-text-secondary)] text-xs m-0">
              We couldn't detect the exact { (!exif?.has_gps && defaultLat === undefined) && !exif?.taken_at ? "location or date" : (!exif?.has_gps && defaultLat === undefined) ? "location" : "date" } for this photo.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {(!exif?.has_gps && defaultLat === undefined) && (
            <div className="relative">
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Search Location
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g., Eiffel Tower"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {suggestions.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg max-h-48 overflow-y-auto shadow-2xl">
                  {suggestions.map((feature, i) => (
                    <li
                      key={i}
                      className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer truncate"
                      onClick={() => {
                        setSearchQuery(feature.properties.name || feature.properties.place_formatted);
                        setOverrideLng(String(feature.geometry.coordinates[0]));
                        setOverrideLat(String(feature.geometry.coordinates[1]));
                        setSuggestions([]);
                      }}
                    >
                      {feature.properties.name || feature.properties.place_formatted}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!exif?.taken_at && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Approximate Date
              </label>
              <input
                type="date"
                className={inputClass}
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
             <button
              onClick={handleManualUpload}
              className="flex-1 px-4 py-3 bg-amber-500 font-bold text-[#0a0e1a] text-sm rounded-xl hover:bg-amber-400 transition-colors"
            >
              Confirm & Upload
            </button>
            <button
              onClick={() => {
                setStep("idle");
                setFile(null);
                setOverrideLat("");
                setOverrideLng("");
                setOverrideDate("");
                setSearchQuery("");
                setError(null);
              }}
              className="px-4 py-3 border border-[var(--color-border)] font-semibold text-[var(--color-text-secondary)] text-sm rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              Cancel
            </button>
          </div>
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
        className="h-48 border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] hover:border-amber-500/50 rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all group"
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={onDrop}
      >
        <span className="text-4xl mb-3 opacity-60 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300">📤</span>
        <p className="text-[var(--color-text)] font-semibold text-sm">
          Drop photos & videos here
        </p>
        <p className="text-[var(--color-text-secondary)] text-xs mt-1 max-w-xs">
          or click to browse • Intercepts missing EXIF GPS Data
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
