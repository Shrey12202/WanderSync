"use client";

import type { MediaItem } from "@/types";
import { getMediaUrl, getThumbnailUrl, updateMedia } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";

interface MediaGalleryProps {
  media: MediaItem[];
  onMediaUpdate?: () => void;
  onMediaClick?: (media: MediaItem) => void;
}

export default function MediaGallery({ media, onMediaUpdate, onMediaClick }: MediaGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit form state
  const [editCaption, setEditCaption] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSearch, setEditSearch] = useState("");
  const [editSuggestions, setEditSuggestions] = useState<any[]>([]);

  const activeMedia = lightboxIndex !== null ? media[lightboxIndex] : null;

  // Populate edit form when lightbox opens or switches
  useEffect(() => {
    if (activeMedia) {
      setEditCaption(activeMedia.caption || "");
      setEditLat(activeMedia.latitude != null ? String(activeMedia.latitude) : "");
      setEditLng(activeMedia.longitude != null ? String(activeMedia.longitude) : "");
      setEditDate(activeMedia.taken_at ? new Date(activeMedia.taken_at).toISOString().split("T")[0] : "");
      setEditSearch("");
      setEditSuggestions([]);
      setSaveError(null);
      setEditing(false);
    }
  }, [lightboxIndex]);

  // Geocoding in edit mode
  useEffect(() => {
    if (editSearch.length > 2 && editing) {
      const fetch_ = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(editSearch)}&access_token=${token}`);
          const data = await res.json();
          if (data.features) setEditSuggestions(data.features);
        } catch { /* silent */ }
      };
      const t = setTimeout(fetch_, 500);
      return () => clearTimeout(t);
    } else {
      setEditSuggestions([]);
    }
  }, [editSearch, editing]);

  const showNext = useCallback(() => {
    if (lightboxIndex !== null) setLightboxIndex((lightboxIndex + 1) % media.length);
  }, [lightboxIndex, media.length]);

  const showPrev = useCallback(() => {
    if (lightboxIndex !== null) setLightboxIndex((lightboxIndex - 1 + media.length) % media.length);
  }, [lightboxIndex, media.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightboxIndex(null); setEditing(false); }
      if (!editing) {
        if (e.key === "ArrowRight" && lightboxIndex !== null) showNext();
        if (e.key === "ArrowLeft" && lightboxIndex !== null) showPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, editing, showNext, showPrev]);

  const handleSave = async () => {
    if (!activeMedia) return;
    setSaving(true);
    setSaveError(null);
    try {
      const lat = editLat ? parseFloat(editLat) : null;
      const lng = editLng ? parseFloat(editLng) : null;
      const takenAt = editDate ? new Date(editDate).toISOString() : null;
      await updateMedia(activeMedia.id, {
        caption: editCaption || undefined,
        latitude: lat,
        longitude: lng,
        taken_at: takenAt,
      });
      setEditing(false);
      onMediaUpdate?.();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
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

  const inputClass = "w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-amber-500/50 outline-none transition-all placeholder:text-white/30";

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 animate-fade-in backdrop-blur-md"
          onClick={() => { if (!editing) { setLightboxIndex(null); setEditing(false); } }}
        >
          {/* Close */}
          <button
            onClick={() => { setLightboxIndex(null); setEditing(false); }}
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors z-50 text-4xl"
          >
            &times;
          </button>

          {/* Left Arrow */}
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); showPrev(); }}
              className="absolute left-4 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50"
            >
              &#8249;
            </button>
          )}

          {/* Main content */}
          <div
            className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center justify-center px-16"
            onClick={(e) => e.stopPropagation()}
          >
            {activeMedia.file_type === "image" ? (
              <img
                src={getMediaUrl(activeMedia.file_path)}
                alt={activeMedia.caption || ""}
                className="max-w-full max-h-[60vh] rounded-xl shadow-2xl object-contain"
              />
            ) : (
              <video
                src={getMediaUrl(activeMedia.file_path)}
                controls
                autoPlay
                className="max-w-full max-h-[60vh] rounded-xl shadow-2xl"
              />
            )}

            {/* Info / Edit Panel */}
            <div className="w-full mt-4 bg-black/60 border border-white/10 rounded-xl backdrop-blur-sm overflow-hidden">
              {!editing ? (
                /* View mode */
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 font-mono text-xs text-white/70">
                    {activeMedia.caption ? (
                      <p className="text-white text-sm font-sans font-medium">{activeMedia.caption}</p>
                    ) : (
                      <p className="text-white/30 italic text-xs font-sans">No caption</p>
                    )}
                    {activeMedia.taken_at && (
                      <span>📅 {new Date(activeMedia.taken_at).toLocaleString()}</span>
                    )}
                    {activeMedia.latitude && activeMedia.longitude ? (
                      <span className="text-teal-400">
                        📍 GPS: {activeMedia.latitude.toFixed(5)}, {activeMedia.longitude.toFixed(5)}
                      </span>
                    ) : (
                      <span className="text-amber-400">📍 No location data</span>
                    )}
                    <span className="text-white/30">
                      {lightboxIndex! + 1} / {media.length} • {Math.round((activeMedia.file_size || 0) / 1024)} KB
                    </span>
                  </div>
                  <button
                    onClick={() => setEditing(true)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 text-xs font-semibold hover:bg-white/20 transition-all flex items-center gap-1.5"
                  >
                    ✏️ Edit
                  </button>
                </div>
              ) : (
                /* Edit mode */
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-white font-bold text-sm">Edit Metadata</h4>
                    <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white text-xs">Cancel</button>
                  </div>

                  {/* Caption */}
                  <div>
                    <label className="text-white/50 text-[10px] font-semibold block mb-1">Caption</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      placeholder="Add a caption..."
                    />
                  </div>

                  {/* Location search */}
                  <div className="relative">
                    <label className="text-white/50 text-[10px] font-semibold block mb-1">📍 Search Location</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={editSearch}
                      onChange={(e) => setEditSearch(e.target.value)}
                      placeholder="Search a place..."
                    />
                    {editSuggestions.length > 0 && (
                      <ul className="absolute z-20 w-full mt-1 bg-[#1a1f35] border border-white/10 rounded-lg max-h-36 overflow-y-auto shadow-2xl">
                        {editSuggestions.map((f, i) => (
                          <li
                            key={i}
                            className="px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 cursor-pointer"
                            onClick={() => {
                              setEditSearch(f.properties.name || f.properties.full_address || "");
                              setEditLng(String(f.geometry.coordinates[0]));
                              setEditLat(String(f.geometry.coordinates[1]));
                              setEditSuggestions([]);
                            }}
                          >
                            {f.properties.name || f.properties.full_address}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Lat/Lng */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-white/50 text-[10px] font-semibold block mb-1">Latitude</label>
                      <input type="number" step="any" className={inputClass} value={editLat} onChange={(e) => setEditLat(e.target.value)} placeholder="Latitude" />
                    </div>
                    <div>
                      <label className="text-white/50 text-[10px] font-semibold block mb-1">Longitude</label>
                      <input type="number" step="any" className={inputClass} value={editLng} onChange={(e) => setEditLng(e.target.value)} placeholder="Longitude" />
                    </div>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="text-white/50 text-[10px] font-semibold block mb-1">📅 Date Taken</label>
                    <input type="date" className={inputClass} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                  </div>

                  {saveError && <p className="text-red-400 text-xs">{saveError}</p>}

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-2 rounded-lg bg-amber-500 text-[#0a0e1a] font-bold text-xs hover:bg-amber-400 transition-all disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Arrow */}
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); showNext(); }}
              className="absolute right-4 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50"
            >
              &#8250;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
