"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { getAllMedia, getMediaUrl, getThumbnailUrl, deleteMedia, updateMedia } from "@/lib/api";
import type { MediaWithContext } from "@/types";
import UploadHandler from "@/components/media/UploadHandler";
import Link from "next/link";

export default function PhotosPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [media, setMedia] = useState<MediaWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  // Bug 8 — edit + delete state for Photos lightbox
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Wait until Clerk has loaded AND confirmed the user is signed in
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

  // Reset edit state when lightbox photo changes
  useEffect(() => {
    if (lightboxIndex !== null && filtered[lightboxIndex]) {
      const m = filtered[lightboxIndex];
      setEditCaption(m.caption || "");
      setEditDate(m.taken_at ? new Date(m.taken_at).toISOString().split("T")[0] : "");
      setEditMode(false);
      setConfirmDelete(false);
      setSaveError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex]);

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

  const reloadMedia = async () => {
    try {
      const data = await getAllMedia();
      setMedia(data);
    } catch { /* silent */ }
  };

  // Bug 8 — save edit
  const handleSave = async () => {
    if (!activeMedia) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateMedia(activeMedia.id, {
        caption: editCaption || undefined,
        taken_at: editDate ? new Date(editDate).toISOString() : null,
      });
      setEditMode(false);
      await reloadMedia();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Bug 8 — delete
  const handleDelete = async () => {
    if (!activeMedia) return;
    setDeleting(true);
    try {
      await deleteMedia(activeMedia.id);
      setLightboxIndex(null);
      setConfirmDelete(false);
      await reloadMedia();
    } catch (err: any) {
      setSaveError(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">
            Photos & Videos
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
            All media across your travels
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 md:gap-3">
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

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold text-sm hover:from-teal-400 hover:to-teal-500 transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
        >
          <span>📤</span> Upload New Media
        </button>
        <Link
          href="/exif-viewer"
          className="px-5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] font-semibold text-sm hover:bg-[var(--color-surface-hover)] transition-all flex items-center gap-2 no-underline"
        >
          <span>🔍</span> EXIF Analyzer
        </Link>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
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
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-3">
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
            className="absolute left-1 md:left-4 p-2 md:p-4 text-white/50 hover:text-white transition-colors text-3xl md:text-5xl z-50"
          >
            &#8249;
          </button>

          {/* Content */}
          <div
            className="relative max-w-5xl max-h-[85vh] w-full flex flex-col items-center justify-center px-8 md:px-16"
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
            <div className="w-full mt-4 text-white/80 font-mono text-xs bg-black/50 p-3 md:p-4 rounded-xl border border-white/10 backdrop-blur-sm max-h-[30vh] overflow-y-auto custom-scrollbar">
              {!editMode ? (
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
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
                    {activeMedia.latitude && activeMedia.longitude ? (
                      <span className="text-teal-400">GPS: {activeMedia.latitude.toFixed(4)}, {activeMedia.longitude.toFixed(4)}</span>
                    ) : (
                      <span className="text-amber-400/70">No GPS</span>
                    )}
                    <span className="text-white/30">
                      {lightboxIndex! + 1} / {filtered.length}
                    </span>
                    {saveError && <p className="text-red-400 text-[11px] mt-1">{saveError}</p>}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {/* Bug 8 — Edit button */}
                    <button
                      onClick={() => { setEditMode(true); setConfirmDelete(false); }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 text-xs font-semibold hover:bg-white/20 transition-all"
                    >
                      ✏️ Edit
                    </button>
                    {/* Bug 8 — Delete button */}
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all"
                      >
                        🗑️ Delete
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-red-400 text-[10px] text-center">Sure?</p>
                        <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-400 disabled:opacity-50 transition-all">
                          {deleting ? "..." : "Yes"}
                        </button>
                        <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/60 text-xs hover:bg-white/20 transition-all">
                          No
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Edit mode */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-bold">Edit</span>
                    <button onClick={() => setEditMode(false)} className="text-white/40 hover:text-white text-xs">Cancel</button>
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px] block mb-1">Caption</label>
                    <input type="text" value={editCaption} onChange={(e) => setEditCaption(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:border-amber-500/50 outline-none transition-all placeholder:text-white/30"
                      placeholder="Add a caption..."
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px] block mb-1">📅 Date Taken</label>
                    <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:border-amber-500/50 outline-none transition-all"
                    />
                  </div>
                  {saveError && <p className="text-red-400 text-[10px]">{saveError}</p>}
                  <button onClick={handleSave} disabled={saving}
                    className="w-full py-1.5 rounded-lg bg-amber-500 text-[#0a0e1a] font-bold text-xs hover:bg-amber-400 transition-all disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); showNext(); }}
            className="absolute right-1 md:right-4 p-2 md:p-4 text-white/50 hover:text-white transition-colors text-3xl md:text-5xl z-50"
          >
            &#8250;
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-bold m-0">Upload Standalone Media</h3>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="text-[var(--color-text-secondary)] hover:text-white transition-colors p-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <UploadHandler
                onUploadComplete={() => {
                  reloadMedia();
                  setShowUploadModal(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
