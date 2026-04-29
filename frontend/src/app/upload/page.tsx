"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { getTrips, extractExif } from "@/lib/api";
import type { TripSummary, ExifData, MediaItem } from "@/types";
import UploadHandler from "@/components/media/UploadHandler";
import MediaGallery from "@/components/media/MediaGallery";

type Tab = "upload" | "exif";

export default function UploadPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  // "__standalone__" means no trip (memory wall)
  const [selectedTripId, setSelectedTripId] = useState<string>("__standalone__");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upload");

  // Bug 5 — store recently uploaded items so user can edit them inline
  const [recentUploads, setRecentUploads] = useState<MediaItem[]>([]);

  // EXIF state
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [exifLoading, setExifLoading] = useState(false);
  const [exifError, setExifError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    getTrips()
      .then((data) => {
        setTrips(data);
        // Default to standalone (no trip) — user can select a trip if they want
        // (keeps the original behaviour where standalone was the default)
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  const handleExifFile = async (file: File) => {
    setExifLoading(true);
    setExifError(null);
    setExifData(null);
    try {
      const data = await extractExif(file);
      setExifData(data);
    } catch (err: any) {
      setExifError(err instanceof Error ? err.message : "Failed to extract EXIF data");
    } finally {
      setExifLoading(false);
    }
  };

  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleExifFile(e.dataTransfer.files[0]);
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header + Tabs */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">Media Studio</h1>
        <p className="text-[var(--color-text-secondary)] text-sm mt-1">Upload photos or inspect hidden metadata</p>

        <div className="flex gap-2 mt-5">
          {(["upload", "exif"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-text)]"
              }`}
            >
              {t === "upload" ? "📤 Upload" : "🔍 EXIF Analyzer"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Upload Tab ── */}
      {tab === "upload" && (
        <>
          {/* Trip selector */}
          <div className="glass rounded-2xl p-6 mb-6 border border-[var(--color-border)]">
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Attach to Trip <span className="text-xs opacity-60">(optional)</span>
            </label>
            {loading ? (
              <div className="h-10 rounded-xl bg-[var(--color-bg)] animate-pulse" />
            ) : (
              <select
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 transition-all"
                value={selectedTripId}
                onChange={(e) => {
                  setSelectedTripId(e.target.value);
                  // Reset recent uploads when trip changes
                  setRecentUploads([]);
                }}
              >
                <option value="__standalone__">📌 No trip — standalone memory</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>{trip.title}</option>
                ))}
              </select>
            )}
          </div>

          <div className="glass rounded-2xl p-6 border border-[var(--color-border)]">
            <UploadHandler
              tripId={selectedTripId === "__standalone__" ? undefined : selectedTripId}
              onUploadComplete={(media) => {
                // Bug 5 — prepend to recent uploads so user can edit immediately
                setRecentUploads((prev) => [media, ...prev]);
              }}
            />
          </div>

          {/* Bug 5 — Recent uploads gallery with edit capability */}
          {recentUploads.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-[var(--color-text)] m-0">
                  ✅ Just Uploaded
                </h2>
                <span className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] px-2 py-0.5 rounded-full border border-[var(--color-border)]">
                  {recentUploads.length} {recentUploads.length === 1 ? "photo" : "photos"}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] opacity-60 ml-auto">
                  Click to edit metadata ✏️
                </span>
              </div>
              <div className="glass rounded-2xl p-4 border border-teal-500/20">
                <MediaGallery
                  media={recentUploads}
                  onMediaUpdate={() => {
                    // Re-fetch recent uploads isn't necessary here — the lightbox
                    // will already show updated data after the PUT
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── EXIF Analyzer Tab ── */}
      {tab === "exif" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Drop zone */}
          <div
            className={`h-72 md:h-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all cursor-pointer ${
              dragActive
                ? "border-teal-500 bg-teal-500/10 scale-[1.02]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-teal-500/50"
            }`}
            onDragEnter={onDrag}
            onDragLeave={onDrag}
            onDragOver={onDrag}
            onDrop={onDrop}
          >
            <span className="text-6xl mb-4 opacity-80">{exifLoading ? "⏳" : "📸"}</span>
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
              {exifLoading ? "Analyzing..." : "Drop Photo Here"}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">
              Extracts GPS, timestamps, camera info — nothing is uploaded
            </p>
            <label className="cursor-pointer px-6 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm font-medium">
              Browse files
              <input
                type="file"
                className="hidden"
                accept="image/*,video/*"
                onChange={(e) => e.target.files?.[0] && handleExifFile(e.target.files[0])}
                disabled={exifLoading}
              />
            </label>
          </div>

          {/* Result panel */}
          <div className="flex flex-col gap-4">
            {exifError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <p className="m-0 text-sm">{exifError}</p>
              </div>
            )}

            <div className="flex-1 glass border border-[var(--color-border)] rounded-3xl overflow-hidden flex flex-col min-h-[340px]">
              <div className="bg-[#0a0e1a] px-4 py-3 border-b border-[#1f2937] flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                  <div className="w-3 h-3 rounded-full bg-teal-400/80" />
                </div>
                <span className="ml-2 text-xs font-mono text-[#9ca3af]">exif_buffer.json</span>
              </div>
              <div className="flex-1 bg-[#111827] p-5 overflow-y-auto font-mono text-sm">
                {!exifData && !exifLoading && (
                  <div className="h-full flex items-center justify-center text-[#4b5563]">
                    // Waiting for photo injection...
                  </div>
                )}
                {exifLoading && (
                  <div className="text-teal-400 animate-pulse">
                    &gt; Parsing binary stream...<br />
                    &gt; Locating GPS IFD tags...<br />
                    &gt; Extracting chronometry...
                  </div>
                )}
                {exifData && !exifLoading && (
                  <pre className="text-amber-300 whitespace-pre-wrap">{JSON.stringify(exifData, null, 2)}</pre>
                )}
              </div>
            </div>

            {exifData?.has_gps && (
              <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm flex gap-3">
                <span className="text-xl">📍</span>
                <p className="m-0">
                  <strong>GPS Lock Verified!</strong> Lat: {exifData.latitude?.toFixed(4)}, Lng: {exifData.longitude?.toFixed(4)}
                </p>
              </div>
            )}
            {exifData && !exifData.has_gps && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex gap-3">
                <span className="text-xl">⚠️</span>
                <p className="m-0"><strong>No Location Data.</strong> GPS was likely stripped before upload.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
