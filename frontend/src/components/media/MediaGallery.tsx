"use client";

import type { MediaItem } from "@/types";
import { getMediaUrl, getThumbnailUrl, updateMedia, deleteMedia } from "@/lib/api";
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
  // Bug 8 — delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit form state
  const [editCaption, setEditCaption] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSearch, setEditSearch] = useState("");
  const [editSuggestions, setEditSuggestions] = useState<any[]>([]);

  const activeMedia = lightboxIndex !== null ? media[lightboxIndex] : null;

  // Populate edit form when lightbox opens or switches photo
  useEffect(() => {
    if (activeMedia) {
      setEditCaption(activeMedia.caption || "");
      setEditLat(activeMedia.latitude != null ? String(activeMedia.latitude) : "");
      setEditLng(activeMedia.longitude != null ? String(activeMedia.longitude) : "");
      setEditDate(activeMedia.taken_at ? new Date(activeMedia.taken_at).toISOString().split("T")[0] : "");
      setEditSearch("");   // will be filled by reverse geocode effect below
      setEditSuggestions([]);
      setSaveError(null);
      setEditing(false);
      setConfirmDelete(false); // Bug 8 — reset on photo switch
    }
  }, [lightboxIndex]);

  // When edit mode opens, reverse-geocode existing lat/lng to populate the search field
  useEffect(() => {
    if (!editing || !activeMedia?.latitude || !activeMedia?.longitude) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
    if (!token) return;

    const lat = activeMedia.latitude;
    const lng = activeMedia.longitude;
    // If editSearch already has content (user typed something), don't overwrite
    if (editSearch) return;

    const reverseGeocode = async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,neighborhood,address&access_token=${token}`
        );
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          setEditSearch(data.features[0].place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } else {
          setEditSearch(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch {
        setEditSearch(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    };
    reverseGeocode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Geocoding in edit mode
  useEffect(() => {
    if (editSearch.length > 2 && editing) {
      const fetch_ = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(
            `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(editSearch)}&limit=10&access_token=${token}`
          );
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

    // Bug 4 — location and date are mandatory
    const hasLat = editLat !== "" && !isNaN(parseFloat(editLat));
    const hasLng = editLng !== "" && !isNaN(parseFloat(editLng));
    if (!hasLat || !hasLng) {
      setSaveError("📍 Location (lat/lng) is required. Images without location won't appear on the Memory Wall.");
      return;
    }
    if (!editDate) {
      setSaveError("📅 Date Taken is required. Images without a date won't appear on the Memory Wall.");
      return;
    }

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

  // Bug 8 — delete handler
  const handleDelete = async () => {
    if (!activeMedia) return;
    setDeleting(true);
    try {
      await deleteMedia(activeMedia.id);
      setLightboxIndex(null);
      setConfirmDelete(false);
      onMediaUpdate?.();
    } catch (err: any) {
      setSaveError(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-start overflow-y-auto bg-black/95 animate-fade-in backdrop-blur-md pt-10 pb-10"
          onClick={() => { if (!editing) { setLightboxIndex(null); setEditing(false); } }}
        >
          {/* Close */}
          <button
            onClick={() => { setLightboxIndex(null); setEditing(false); }}
            className="fixed top-6 right-6 text-white/70 hover:text-white transition-colors z-50 text-4xl"
          >
            &times;
          </button>

          {/* Left Arrow */}
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); showPrev(); }}
              className="fixed left-4 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50"
            >
              &#8249;
            </button>
          )}

          {/* Main content — no max-h, let parent scroll */}
          <div
            className="relative max-w-3xl w-full flex flex-col px-12"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image/Video */}
            <div className="flex items-center justify-center w-full">
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
            </div>

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
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => { setEditing(true); setConfirmDelete(false); }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 text-xs font-semibold hover:bg-white/20 transition-all flex items-center gap-1.5"
                    >
                      ✏️ Edit
                    </button>
                    {/* Bug 8 — Delete button */}
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all flex items-center gap-1.5"
                      >
                        🗑️ Delete
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-red-400 text-[10px] text-center">Sure?</p>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-400 disabled:opacity-50 transition-all"
                        >
                          {deleting ? "..." : "Yes"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 text-white/60 text-xs hover:bg-white/20 transition-all"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
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
                      placeholder="Search for a specific place, business, or city..."
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
                            <span className="font-medium block truncate">{f.properties.name || f.properties.full_address}</span>
                            <span className="block text-[10px] text-white/40 mt-0.5 truncate">
                              {f.properties.full_address || f.properties.place_formatted}
                            </span>
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
              className="fixed right-4 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white transition-colors text-5xl z-50"
            >
              &#8250;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
