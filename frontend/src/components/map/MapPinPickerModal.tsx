"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { googleReverseGeocode } from "@/lib/googleGeocode";
import type { GooglePlaceResult } from "@/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type MapPinPickerModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after user confirms; includes lat/lng and best-effort address from reverse geocode */
  onPicked: (place: GooglePlaceResult) => void;
  /** Optional [lng, lat] to center the map when opening */
  initialCenter?: [number, number];
  initialZoom?: number;
};

export default function MapPinPickerModal({
  open,
  onClose,
  onPicked,
  initialCenter,
  initialZoom,
}: MapPinPickerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const tearDownMap = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
    mapRef.current?.remove();
    mapRef.current = null;
    setHasPin(false);
    setHint(null);
  }, []);

  const centerKey = initialCenter ? `${initialCenter[0]},${initialCenter[1]}` : "";

  useEffect(() => {
    if (!open) {
      tearDownMap();
      return;
    }
    if (!mapboxgl.accessToken) {
      setHint("Map is not configured (missing Mapbox token).");
      return () => tearDownMap();
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const el = containerRef.current;
      if (!el) return;

      const center: [number, number] = initialCenter ?? [0, 18];
      const zoom = initialZoom ?? (initialCenter ? 11 : 1.4);

      const map = new mapboxgl.Map({
        container: el,
        style: "mapbox://styles/mapbox/outdoors-v12",
        center,
        zoom,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.once("load", () => {
        map.resize();
      });
      mapRef.current = map;

      const pinEl = document.createElement("div");
      pinEl.style.cssText =
        "width:26px;height:26px;border-radius:50%;background:linear-gradient(145deg,#fcd34d,#d97706);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:grab;";
      pinEl.title = "Drag to adjust";

      const placeOrMoveMarker = (lng: number, lat: number) => {
        if (markerRef.current) {
          markerRef.current.setLngLat([lng, lat]);
        } else {
          const m = new mapboxgl.Marker({ element: pinEl, draggable: true })
            .setLngLat([lng, lat])
            .addTo(map);
          m.on("dragend", () => {
            const ll = m.getLngLat();
            setHint(`${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`);
          });
          markerRef.current = m;
        }
        setHasPin(true);
        setHint(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      };

      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        placeOrMoveMarker(lng, lat);
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      tearDownMap();
    };
  }, [open, centerKey, initialZoom, tearDownMap]);

  const handleConfirm = async () => {
    const marker = markerRef.current;
    if (!marker) return;
    const ll = marker.getLngLat();
    const lat = ll.lat;
    const lng = ll.lng;
    setConfirming(true);
    try {
      const formatted = await googleReverseGeocode(lat, lng);
      const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const address = formatted ?? coordLabel;
      const result: GooglePlaceResult = {
        name: formatted ? address.split(",")[0]?.trim() || "Pinned location" : "Pinned location",
        address,
        lat,
        lng,
        place_id: `map_pin:${lat.toFixed(6)},${lng.toFixed(6)}`,
        types: [],
        is_airport: false,
      };
      onPicked(result);
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-pin-picker-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-start justify-between gap-3">
          <div>
            <h2 id="map-pin-picker-title" className="text-sm font-bold text-[var(--color-text)] m-0">
              Drop a pin
            </h2>
            <p className="text-[11px] text-[var(--color-text-secondary)] m-0 mt-1 leading-relaxed">
              Pan and zoom, then click the map to place a pin. Drag the pin to fine-tune. We only need latitude and longitude; we will fill an address when Google can reverse-geocode it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-2 py-1 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div ref={containerRef} className="w-full h-[min(55vh,22rem)] min-h-[200px] bg-[var(--color-bg)]" />

        {hint && (
          <p className="text-[10px] text-[var(--color-text-secondary)] px-4 py-1.5 m-0 border-t border-[var(--color-border)] font-mono">
            {hint}
          </p>
        )}

        <div className="flex gap-2 p-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasPin || confirming}
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-[#0a0e1a] text-sm font-bold hover:bg-amber-400 disabled:opacity-40"
          >
            {confirming ? "Looking up…" : "Use this location"}
          </button>
        </div>
      </div>
    </div>
  );
}
