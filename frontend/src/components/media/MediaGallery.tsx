"use client";

import type { MediaItem } from "@/types";
import { getMediaUrl, getThumbnailUrl } from "@/lib/api";
import { useState, useEffect } from "react";

interface MediaGalleryProps {
  media: MediaItem[];
  onMediaClick?: (media: MediaItem) => void;
}

export default function MediaGallery({ media, onMediaClick }: MediaGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Esc key closes lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight" && lightboxIndex !== null) showNext();
      if (e.key === "ArrowLeft" && lightboxIndex !== null) showPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex]);

  const showNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % media.length);
    }
  };

  const showPrev = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + media.length) % media.length);
    }
  };

  if (media.length === 0) {
    return (
      <div className="text-center py-8">
        <span className="text-3xl opacity-30">📷</span>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">No media yet</p>
      </div>
    );
  }

  const activeMedia = lightboxIndex !== null ? media[lightboxIndex] : null;

  return (
    <div>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {media.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => {
              setLightboxIndex(idx);
              onMediaClick?.(item);
            }}
            className="relative aspect-square rounded-xl overflow-hidden border border-[var(--color-border)] hover:border-teal-500 transition-all duration-200 group ring-0 hover:ring-2 hover:ring-teal-500/30"
          >
            {item.file_type === "image" ? (
              <img
                src={getThumbnailUrl(item.thumbnail_path, item.file_path)}
                alt={item.caption || item.file_name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-[var(--color-bg)] flex items-center justify-center">
                <span className="text-2xl">🎬</span>
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end">
              <div className="w-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.caption && (
                  <p className="text-[10px] text-white truncate font-medium">{item.caption}</p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Cinematic Lightbox */}
      {activeMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 animate-fade-in backdrop-blur-md">
          {/* Close button */}
          <button 
            onClick={() => setLightboxIndex(null)}
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors z-50 text-4xl"
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

          {/* Media Content */}
          <div className="relative max-w-5xl max-h-[85vh] w-full flex flex-col items-center justify-center px-16 pointer-events-none">
            {activeMedia.file_type === "image" ? (
              <img
                src={getMediaUrl(activeMedia.file_path)}
                alt={activeMedia.caption || ""}
                className="max-w-full max-h-[80vh] rounded-md shadow-2xl pointer-events-auto"
              />
            ) : (
              <video
                src={getMediaUrl(activeMedia.file_path)}
                controls
                autoPlay
                className="max-w-full max-h-[80vh] rounded-md shadow-2xl pointer-events-auto"
              />
            )}
            
            {/* Context Bar */}
            <div className="w-full mt-4 flex items-center justify-between text-white/80 font-mono text-xs pointer-events-auto bg-black/50 p-4 rounded-xl border border-white/10">
              <div className="flex flex-col gap-1">
                {activeMedia.caption ? (
                  <p className="text-white text-base font-sans">{activeMedia.caption}</p>
                ) : (
                  <p className="text-white/40 italic">No caption</p>
                )}
                {activeMedia.taken_at && (
                  <span>Captured: {new Date(activeMedia.taken_at).toLocaleString()}</span>
                )}
              </div>
              
              <div className="flex flex-col gap-1 items-end text-right">
                {activeMedia.latitude && activeMedia.longitude ? (
                  <>
                    <span className="text-teal-400">GPS Locked</span>
                    <span>{activeMedia.latitude.toFixed(5)}, {activeMedia.longitude.toFixed(5)}</span>
                  </>
                ) : (
                  <span className="text-amber-400">No Location Data</span>
                )}
                <span>{Math.round((activeMedia.file_size || 0) / 1024)} KB</span>
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
