"use client";

import { useState, useCallback, useMemo } from "react";
import type { Stop } from "@/types";
import { deleteStop, updateStop } from "@/lib/api";

interface TimelineSliderProps {
  stops: Stop[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onStopsUpdate?: () => void;
}

export default function TimelineSlider({
  stops,
  activeIndex,
  onIndexChange,
  isPlaying,
  onPlayToggle,
  onStopsUpdate,
}: TimelineSliderProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const currentStop = stops[activeIndex];

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (stops.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <p className="text-[var(--color-text-secondary)] text-sm">
          No stops to show on timeline
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          Timeline
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
            disabled={activeIndex === 0}
            className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] flex items-center justify-center hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all text-sm"
          >
            ◀
          </button>
          <button
            onClick={onPlayToggle}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
              isPlaying
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => onIndexChange(Math.min(stops.length - 1, activeIndex + 1))}
            disabled={activeIndex === stops.length - 1}
            className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] flex items-center justify-center hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all text-sm"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        className="timeline-slider"
        min={0}
        max={Math.max(0, stops.length - 1)}
        value={activeIndex}
        onChange={(e) => onIndexChange(parseInt(e.target.value))}
      />

      {/* Current stop info */}
      <div className="mt-4 flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-[var(--color-text)] m-0">
            {currentStop?.name || `Stop ${activeIndex + 1}`}
          </p>
          <div className="flex gap-3 items-center mt-1">
            <p className="text-xs text-[var(--color-text-secondary)] m-0">
              {formatTime(currentStop?.arrival_time)}
            </p>
            <button 
              onClick={async () => {
                if (!currentStop?.id || !onStopsUpdate || activeIndex === 0) return;
                setIsDeleting(true);
                try {
                  const prevStop = stops[activeIndex - 1];
                  await Promise.all([
                    updateStop(currentStop.id, { sequence_order: prevStop.sequence_order }),
                    updateStop(prevStop.id, { sequence_order: currentStop.sequence_order })
                  ]);
                  onIndexChange(activeIndex - 1);
                  onStopsUpdate();
                } catch(e) {
                  console.error(e);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting || activeIndex === 0}
              className="text-xs text-teal-400 hover:text-teal-300 transition-colors uppercase font-bold tracking-wider disabled:opacity-30"
            >
              Move ◀
            </button>

            <button 
              onClick={async () => {
                if (!currentStop?.id || !onStopsUpdate || activeIndex === stops.length - 1) return;
                setIsDeleting(true);
                try {
                  const nextStop = stops[activeIndex + 1];
                  await Promise.all([
                    updateStop(currentStop.id, { sequence_order: nextStop.sequence_order }),
                    updateStop(nextStop.id, { sequence_order: currentStop.sequence_order })
                  ]);
                  onIndexChange(activeIndex + 1);
                  onStopsUpdate();
                } catch(e) {
                  console.error(e);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting || activeIndex === stops.length - 1}
              className="text-xs text-teal-400 hover:text-teal-300 transition-colors uppercase font-bold tracking-wider disabled:opacity-30"
            >
              Move ▶
            </button>

            <button 
              onClick={async () => {
                if (!currentStop?.id || !onStopsUpdate) return;
                if (!confirm(`Remove ${currentStop.name}?`)) return;
                setIsDeleting(true);
                try {
                  await deleteStop(currentStop.id);
                  onIndexChange(Math.max(0, activeIndex - 1));
                  onStopsUpdate();
                } catch(e) {
                  console.error(e);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
              className="text-xs text-red-400 hover:text-red-300 transition-colors uppercase font-bold tracking-wider"
            >
              {isDeleting ? "..." : "Drop"}
            </button>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
          {activeIndex + 1} / {stops.length}
        </span>
      </div>

      {/* Stop dots */}
      <div className="flex gap-1.5 mt-4 flex-wrap">
        {stops.map((stop, i) => (
          <button
            key={stop.id}
            onClick={() => onIndexChange(i)}
            title={stop.name || `Stop ${i + 1}`}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
              i === activeIndex
                ? "bg-amber-400 scale-150 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                : i < activeIndex
                ? "bg-teal-500/60"
                : "bg-[var(--color-border)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
