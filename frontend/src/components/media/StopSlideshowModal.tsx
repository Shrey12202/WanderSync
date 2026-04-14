"use client";

import { useEffect, useState, useCallback } from "react";
import type { MediaItem } from "@/types";
import { getMediaUrl, getThumbnailUrl } from "@/lib/api";

interface StopSlideshowModalProps {
  stopName: string | null;
  media: MediaItem[];
  onClose: () => void;
}

export default function StopSlideshowModal({
  stopName,
  media,
  onClose,
}: StopSlideshowModalProps) {
  const [index, setIndex] = useState(0);

  const showNext = useCallback(() => {
    if (media.length > 0) setIndex((i) => (i + 1) % media.length);
  }, [media.length]);

  const showPrev = useCallback(() => {
    if (media.length > 0) setIndex((i) => (i - 1 + media.length) % media.length);
  }, [media.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") showNext();
      if (e.key === "ArrowLeft") showPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, showNext, showPrev]);

  const current = media.length > 0 ? media[index] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 to-transparent z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-teal-500 flex items-center justify-center text-[#0a0e1a] font-bold text-sm">
            📍
          </div>
          <div>
            <p className="text-white font-semibold text-sm m-0">
              {stopName || "Unnamed Stop"}
            </p>
            <p className="text-white/50 text-xs m-0">
              {media.length} {media.length === 1 ? "photo" : "photos"}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors text-3xl leading-none"
        >
          &times;
        </button>
      </div>

      {/* No Media State */}
      {media.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-6xl opacity-30">📷</span>
          <p className="text-white/60 font-medium">No photos at this stop</p>
          <p className="text-white/30 text-sm">
            Upload photos linked to this location to see them here
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-5 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          {/* Left Arrow */}
          {media.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); showPrev(); }}
              className="absolute left-4 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50 hover:bg-white/5 rounded-full"
            >
              &#8249;
            </button>
          )}

          {/* Main Media */}
          <div
            className="relative max-w-5xl max-h-[85vh] w-full flex flex-col items-center justify-center px-20"
            onClick={(e) => e.stopPropagation()}
          >
            {current?.file_type === "image" ? (
              <img
                key={current.id}
                src={getMediaUrl(current.file_path)}
                alt={current.caption || ""}
                className="max-w-full max-h-[70vh] rounded-xl shadow-2xl object-contain animate-fade-in"
              />
            ) : current ? (
              <video
                key={current.id}
                src={getMediaUrl(current.file_path)}
                controls
                autoPlay
                className="max-w-full max-h-[70vh] rounded-xl shadow-2xl"
              />
            ) : null}

            {/* Thumbnail Strip */}
            {media.length > 1 && (
              <div className="flex gap-2 mt-4 max-w-full overflow-x-auto pb-1 custom-scrollbar">
                {media.map((m, i) => (
                  <button
                    key={m.id}
                    onClick={() => setIndex(i)}
                    className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                      i === index
                        ? "border-amber-400 scale-110 shadow-lg shadow-amber-500/30"
                        : "border-white/20 hover:border-white/50 opacity-60 hover:opacity-100"
                    }`}
                  >
                    {m.file_type === "image" ? (
                      <img
                        src={getThumbnailUrl(m.thumbnail_path, m.file_path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center text-lg">
                        🎬
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Info Bar */}
            <div className="w-full mt-3 flex items-center justify-between text-white/70 text-xs font-mono bg-black/40 px-4 py-3 rounded-xl border border-white/10 backdrop-blur-sm">
              <div className="flex flex-col gap-0.5">
                {current?.caption && (
                  <p className="text-white font-sans text-sm">{current.caption}</p>
                )}
                {current?.taken_at && (
                  <span>{new Date(current.taken_at).toLocaleString()}</span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {current?.latitude && current?.longitude ? (
                  <>
                    <span className="text-teal-400">GPS Locked</span>
                    <span>
                      {current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}
                    </span>
                  </>
                ) : (
                  <span className="text-amber-400/60">No GPS</span>
                )}
                <span className="text-white/30">
                  {index + 1} / {media.length}
                </span>
              </div>
            </div>
          </div>

          {/* Right Arrow */}
          {media.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); showNext(); }}
              className="absolute right-4 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50 hover:bg-white/5 rounded-full"
            >
              &#8250;
            </button>
          )}
        </>
      )}
    </div>
  );
}
