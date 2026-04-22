"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { getAllMedia, getMediaUrl, getThumbnailUrl } from "@/lib/api";
import type { MediaWithContext } from "@/types";

export default function PhotosPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [media, setMedia] = useState<MediaWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => {
    // Wait until Clerk has loaded AND confirmed the user is signed in
    // so the auth token is guaranteed to be in the module-level cache
    if (!isLoaded || !isSignedIn) return;

    async function load() {
      try {
        const data = await getAllMedia();
        setMedia(data);
      } catch (err) {
        console.error("Failed to load photos:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isLoaded, isSignedIn]);

  const filtered = filter === "all" ? media : media.filter((m) => m.file_type === filter);

  const showNext = useCallback(() => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % filtered.length);
    }
  }, [lightboxIndex, filtered.length]);

  const showPrev = useCallback(() => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + filtered.length) % filtered.length);
    }
  }, [lightboxIndex, filtered.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight" && lightboxIndex !== null) showNext();
      if (e.key === "ArrowLeft" && lightboxIndex !== null) showPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, showNext, showPrev]);

  const activeMedia = lightboxIndex !== null ? filtered[lightboxIndex] : null;

  const imageCount = media.filter((m) => m.file_type === "image").length;
  const videoCount = media.filter((m) => m.file_type === "video").length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">
            Photos & Videos
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
            All media across your travels
          </p>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          {[
            { label: "All", value: media.length, key: "all" as const, icon: "🖼️" },
            { label: "Photos", value: imageCount, key: "image" as const, icon: "📷" },
            { label: "Videos", value: videoCount, key: "video" as const, icon: "🎬" },
          ].map((stat) => (
            <button
              key={stat.key}
              onClick={() => setFilter(stat.key)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                filter === stat.key
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              }`}
            >
              <span className="mr-1.5">{stat.icon}</span>
              {stat.label}
              <span className="ml-2 opacity-60">{stat.value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="break-inside-avoid rounded-2xl bg-[var(--color-surface)] animate-pulse border border-[var(--color-border)]"
              style={{ height: `${160 + (i % 3) * 80}px` }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 glass rounded-2xl">
          <span className="text-6xl block mb-4 opacity-40">📷</span>
          <p className="text-[var(--color-text)] font-semibold text-lg">No media yet</p>
          <p className="text-[var(--color-text-secondary)] text-sm mt-2">
            Upload photos from a trip to see them here
          </p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3">
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setLightboxIndex(idx)}
              className="break-inside-avoid block w-full mb-3 rounded-xl overflow-hidden border border-[var(--color-border)] hover:border-amber-500/40 transition-all duration-200 group relative hover:shadow-[0_4px_24px_rgba(245,158,11,0.15)] ring-0 hover:ring-2 hover:ring-amber-500/20 text-left"
            >
              {item.file_type === "image" ? (
                <img
                  src={getThumbnailUrl(item.thumbnail_path, item.file_path)}
                  alt={item.caption || item.file_name}
                  className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-48 bg-[var(--color-bg)] flex flex-col items-center justify-center gap-2">
                  <span className="text-4xl">🎬</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Video</span>
                </div>
              )}

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium border border-amber-500/20 truncate max-w-full">
                    ✈️ {item.trip_title}
                  </span>
                </div>
                {item.stop_name && (
                  <p className="text-[10px] text-teal-300 font-medium flex items-center gap-1 truncate">
                    <span>📍</span> {item.stop_name}
                  </p>
                )}
                {item.caption && (
                  <p className="text-[10px] text-white/80 mt-0.5 truncate">{item.caption}</p>
                )}
              </div>

              {/* Always visible trip badge bottom-right on non-hover */}
              <div className="absolute bottom-2 right-2 opacity-80 group-hover:opacity-0 transition-opacity">
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-black/60 text-white/70 backdrop-blur-sm">
                  {item.trip_title}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {activeMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors z-50 text-4xl"
          >
            &times;
          </button>

          {/* Left Arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); showPrev(); }}
            className="absolute left-4 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50"
          >
            &#8249;
          </button>

          {/* Content */}
          <div
            className="relative max-w-5xl max-h-[85vh] w-full flex flex-col items-center justify-center px-16"
            onClick={(e) => e.stopPropagation()}
          >
            {activeMedia.file_type === "image" ? (
              <img
                src={getMediaUrl(activeMedia.file_path)}
                alt={activeMedia.caption || ""}
                className="max-w-full max-h-[72vh] rounded-xl shadow-2xl object-contain"
              />
            ) : (
              <video
                src={getMediaUrl(activeMedia.file_path)}
                controls
                autoPlay
                className="max-w-full max-h-[72vh] rounded-xl shadow-2xl"
              />
            )}

            {/* Context Bar */}
            <div className="w-full mt-4 flex items-center justify-between text-white/80 font-mono text-xs bg-black/50 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-amber-400 font-sans font-semibold text-sm">
                    ✈️ {activeMedia.trip_title}
                  </span>
                  {activeMedia.stop_name && (
                    <span className="text-teal-400 font-sans text-xs">
                      📍 {activeMedia.stop_name}
                    </span>
                  )}
                </div>
                {activeMedia.caption && (
                  <p className="text-white font-sans text-sm mt-0.5">{activeMedia.caption}</p>
                )}
                {activeMedia.taken_at && (
                  <span className="text-white/50 text-[11px]">
                    {new Date(activeMedia.taken_at).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                {activeMedia.latitude && activeMedia.longitude ? (
                  <>
                    <span className="text-teal-400">GPS Locked</span>
                    <span>{activeMedia.latitude.toFixed(4)}, {activeMedia.longitude.toFixed(4)}</span>
                  </>
                ) : (
                  <span className="text-amber-400/70">No GPS</span>
                )}
                <span className="text-white/30">
                  {lightboxIndex! + 1} / {filtered.length}
                </span>
              </div>
            </div>
          </div>

          {/* Right Arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); showNext(); }}
            className="absolute right-4 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50"
          >
            &#8250;
          </button>
        </div>
      )}
    </div>
  );
}
