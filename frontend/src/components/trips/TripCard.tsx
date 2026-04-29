"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { TripSummary, UpdateTripRequest } from "@/types";
import { formatDateRange, getDurationDays } from "@/lib/utils";
import { updateTrip, deleteTrip } from "@/lib/api";

const TITLE_MAX = 100;
const DESC_MAX = 500;

interface TripCardProps {
  trip: TripSummary;
  onTripUpdate?: () => void;
}

export default function TripCard({ trip, onTripUpdate }: TripCardProps) {
  const duration = getDurationDays(trip.start_date, trip.end_date);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState<"rename" | "details" | null>(null);
  const [editTitle, setEditTitle] = useState(trip.title);
  const [editDesc, setEditDesc] = useState(trip.description || "");
  const [editStart, setEditStart] = useState(trip.start_date || "");
  const [editEnd, setEditEnd] = useState(trip.end_date || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: UpdateTripRequest = {};
      if (editMode === "rename") {
        if (!editTitle.trim()) return;
        if (editTitle.length > TITLE_MAX) return;
        data.title = editTitle.trim();
      } else {
        if (!editTitle.trim()) return;
        if (editTitle.length > TITLE_MAX) return;
        if (editDesc.length > DESC_MAX) return;
        // Bug 6 — validate date order
        if (editStart && editEnd && editStart > editEnd) return;
        data.title = editTitle.trim();
        data.description = editDesc.trim() || undefined;
        data.start_date = editStart || undefined;
        data.end_date = editEnd || undefined;
      }
      await updateTrip(trip.id, data);
      setEditMode(null);
      onTripUpdate?.();
    } catch (err) {
      console.error("Failed to update trip:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteTrip(trip.id);
      onTripUpdate?.();
    } catch (err) {
      console.error("Failed to delete trip:", err);
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-[var(--color-text-secondary)]/50";
  const counterClass = "text-right text-[10px] mt-1";

  // ── Inline edit modal ────────────────────────────────────────
  if (editMode) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-[var(--color-surface)] p-5 animate-fade-in shadow-xl shadow-amber-500/10 space-y-3">
        <h4 className="text-sm font-bold text-amber-400 m-0">
          {editMode === "rename" ? "✏️ Rename Trip" : "📝 Edit Trip Details"}
        </h4>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Title</label>
          <input
            type="text"
            className={inputClass}
            value={editTitle}
            maxLength={TITLE_MAX}
            onChange={(e) => setEditTitle(e.target.value)}
            autoFocus
          />
          {/* Bug 7 — counter */}
          <p className={`${counterClass} ${editTitle.length >= TITLE_MAX ? "text-red-400" : "text-[var(--color-text-secondary)]"}`}>
            {editTitle.length} / {TITLE_MAX}
          </p>
        </div>

        {editMode === "details" && (
          <>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Description / Vibe</label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={2}
                placeholder="What's the vibe?"
                value={editDesc}
                maxLength={DESC_MAX}
                onChange={(e) => setEditDesc(e.target.value)}
              />
              {/* Bug 7 — counter */}
              <p className={`${counterClass} ${editDesc.length >= DESC_MAX ? "text-red-400" : "text-[var(--color-text-secondary)]"}`}>
                {editDesc.length} / {DESC_MAX}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Start</label>
                <input type="date" className={inputClass} value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">End</label>
                {/* Bug 6 — min keeps end >= start */}
                <input type="date" className={inputClass} value={editEnd} min={editStart || undefined} onChange={(e) => setEditEnd(e.target.value)} />
              </div>
            </div>
            {/* Bug 6 — inline error */}
            {editStart && editEnd && editStart > editEnd && (
              <p className="text-red-400 text-xs flex items-center gap-1">
                ⚠️ End date cannot be before the start date.
              </p>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || editTitle.length > TITLE_MAX || editDesc.length > DESC_MAX || !!(editStart && editEnd && editStart > editEnd)}
            className="flex-1 py-2 rounded-lg bg-amber-500 text-[#0a0e1a] font-bold text-xs hover:bg-amber-400 disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setEditMode(null)}
            className="px-4 py-2 rounded-lg bg-[var(--color-bg)] text-[var(--color-text-secondary)] text-xs border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Delete confirmation ──────────────────────────────────────
  if (confirmDelete) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-[var(--color-surface)] p-5 animate-fade-in shadow-xl shadow-red-500/10 space-y-3">
        <h4 className="text-sm font-bold text-red-400 m-0">🗑️ Delete Trip</h4>
        <p className="text-xs text-[var(--color-text-secondary)] m-0">
          Are you sure you want to delete <strong className="text-[var(--color-text)]">{trip.title}</strong>? This will remove all stops, days, and media. This cannot be undone.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDelete}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-red-500 text-white font-bold text-xs hover:bg-red-400 disabled:opacity-50 transition-all"
          >
            {saving ? "Deleting..." : "Yes, Delete"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-4 py-2 rounded-lg bg-[var(--color-bg)] text-[var(--color-text-secondary)] text-xs border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Normal card ──────────────────────────────────────────────
  return (
    <div className="group block animate-fade-in relative">
      <Link href={`/trips/${trip.id}`} className="block no-underline">
        <div className="relative rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-amber-500/30 transition-all duration-300 hover:shadow-[0_8px_40px_rgba(245,158,11,0.1)]">
          {/* Cover image or gradient */}
          <div className="h-40 relative overflow-hidden">
            {trip.cover_image ? (
              <img
                src={trip.cover_image}
                alt={trip.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-600/20 via-teal-600/20 to-purple-600/20 flex items-center justify-center">
                <span className="text-5xl opacity-30">🌍</span>
              </div>
            )}
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-transparent to-transparent" />

            {/* Duration badge */}
            {duration > 0 && (
              <span className="absolute top-3 right-12 text-xs px-2.5 py-1 rounded-full glass text-[var(--color-text)] font-medium">
                {duration} {duration === 1 ? "day" : "days"}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="p-5">
            <h3 className="text-lg font-semibold text-[var(--color-text)] m-0 group-hover:text-amber-400 transition-colors">
              {trip.title}
            </h3>

            <p className="text-sm text-[var(--color-text-secondary)] m-0 mt-1.5">
              {formatDateRange(trip.start_date, trip.end_date)}
            </p>

            {trip.description && (
              <p className="text-sm text-[var(--color-text-secondary)] m-0 mt-2 line-clamp-2 opacity-70">
                {trip.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                <span className="text-teal-400">📍</span>
                {trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                <span className="text-amber-400">📷</span>
                {trip.media_count} {trip.media_count === 1 ? "photo" : "photos"}
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* 3-dot menu button */}
      <div ref={menuRef} className="absolute top-3 right-3 z-20">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="w-8 h-8 rounded-full glass flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-all text-sm font-bold opacity-0 group-hover:opacity-100"
        >
          ⋮
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden animate-fade-in z-50">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                setEditTitle(trip.title);
                setEditMode("rename");
              }}
              className="w-full px-4 py-2.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
            >
              <span>✏️</span> Rename
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                setEditTitle(trip.title);
                setEditDesc(trip.description || "");
                setEditStart(trip.start_date || "");
                setEditEnd(trip.end_date || "");
                setEditMode("details");
              }}
              className="w-full px-4 py-2.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
            >
              <span>📝</span> Edit Details
            </button>
            <div className="border-t border-[var(--color-border)]" />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
              className="w-full px-4 py-2.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
            >
              <span>🗑️</span> Delete Trip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
