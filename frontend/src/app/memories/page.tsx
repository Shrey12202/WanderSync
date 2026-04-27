"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getGeotaggedMedia, getThumbnailUrl } from "@/lib/api";
import type { MediaWithContext } from "@/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function MemoryWallPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const animRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [20, 30],
      zoom: 1.5,
      projection: { name: "globe" } as any,
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", async () => {
      // Atmosphere / space look
      map.setFog({
        color: "rgb(5, 10, 25)",
        "high-color": "rgb(30, 60, 120)",
        "horizon-blend": 0.04,
        "space-color": "rgb(5, 5, 15)",
        "star-intensity": 0.7,
      });

      // Fetch all geotagged media
      try {
        const media = await getGeotaggedMedia();
        setMediaCount(media.length);
        placeMarkers(media, map);
      } catch (err) {
        console.error("Failed to load geotagged media:", err);
      } finally {
        setLoading(false);
      }
    });

    // Globe spin
    const BASE_ZOOM = 1.5;
    const ZOOM_THRESHOLD = 0.3;
    const isZoomedIn = () => (mapRef.current?.getZoom() ?? BASE_ZOOM) > BASE_ZOOM + ZOOM_THRESHOLD;
    const SPEED = 0.1;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const spin = () => {
      if (!isInteractingRef.current && !isZoomedIn() && mapRef.current) {
        const c = mapRef.current.getCenter();
        c.lng -= SPEED;
        mapRef.current.setCenter(c);
      }
      animRef.current = requestAnimationFrame(spin);
    };

    // Any interaction stops spin
    const stopSpin = () => {
      isInteractingRef.current = true;
      if (idleTimer) clearTimeout(idleTimer);
    };

    // After interaction ends, resume spin after 5s of idle
    const scheduleResume = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { isInteractingRef.current = false; }, 5000);
    };

    // Clicking OUTSIDE the map container resumes spin immediately
    const resumeOnOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (mapContainer.current && !mapContainer.current.contains(e.target as Node)) {
        if (idleTimer) clearTimeout(idleTimer);
        isInteractingRef.current = false;
      }
    };

    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);
    map.on("mouseup", scheduleResume);
    map.on("touchend", scheduleResume);
    map.on("dragend", scheduleResume);
    document.addEventListener("mousedown", resumeOnOutsideClick);
    document.addEventListener("touchstart", resumeOnOutsideClick);

    animRef.current = requestAnimationFrame(spin);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("mousedown", resumeOnOutsideClick);
      document.removeEventListener("touchstart", resumeOnOutsideClick);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [isLoaded, isSignedIn]);

  function placeMarkers(media: MediaWithContext[], map: mapboxgl.Map) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Group media by nearby GPS coordinates (within ~100m)
    const GPS_THRESHOLD = 0.001;
    const groups: { lng: number; lat: number; items: MediaWithContext[] }[] = [];

    media.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      const existing = groups.find(
        (g) => Math.abs(g.lng - item.longitude!) < GPS_THRESHOLD && Math.abs(g.lat - item.latitude!) < GPS_THRESHOLD
      );
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ lng: item.longitude, lat: item.latitude, items: [item] });
      }
    });

    // Store element refs for occlusion checks
    const markerEls: { el: HTMLDivElement; lngLat: mapboxgl.LngLat }[] = [];

    groups.forEach((group) => {
      const firstItem = group.items[0];
      const firstThumb = getThumbnailUrl(firstItem.thumbnail_path ?? null, firstItem.file_path);

      // Outer wrapper — Mapbox positioning only
      const el = document.createElement("div");
      el.style.cssText = `
        width: 56px; height: 56px;
        display: flex; align-items: center; justify-content: center;
        margin: 0; padding: 0; box-sizing: border-box;
        transition: opacity 0.3s ease;
      `;

      const inner = document.createElement("div");
      inner.style.cssText = `
        width: 56px; height: 56px;
        border-radius: 10px; overflow: hidden;
        border: 2px solid rgba(245,158,11,0.8);
        box-shadow: 0 3px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.2);
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        background: #1a1a2e; position: relative; flex-shrink: 0;
      `;

      const img = document.createElement("img");
      img.src = firstThumb;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      img.onerror = () => {
        img.src = "";
        inner.style.background = "linear-gradient(135deg,#f59e0b33,#14b8a633)";
        inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;">🏔️</div>`;
      };
      inner.appendChild(img);

      // Multi-photo badge
      if (group.items.length > 1) {
        const badge = document.createElement("div");
        badge.style.cssText = `
          position:absolute;top:2px;right:2px;
          background:rgba(0,0,0,0.7);color:#fbbf24;
          font-size:9px;font-weight:700;
          padding:1px 4px;border-radius:6px;
          backdrop-filter:blur(4px);
          border:1px solid rgba(245,158,11,0.3);
        `;
        badge.textContent = `${group.items.length}`;
        inner.appendChild(badge);
      }

      el.appendChild(inner);

      // Hover
      inner.addEventListener("mouseenter", () => {
        inner.style.transform = "scale(1.15)";
        inner.style.zIndex = "999";
        inner.style.boxShadow = "0 6px 24px rgba(0,0,0,0.8), 0 0 0 2px rgba(245,158,11,0.6)";
      });
      inner.addEventListener("mouseleave", () => {
        inner.style.transform = "scale(1)";
        inner.style.zIndex = "1";
        inner.style.boxShadow = "0 3px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.2)";
      });

      // Build popup with auto-rotating images for multi-photo groups
      const buildPopupHTML = (idx: number) => {
        const it = group.items[idx];
        const url = getThumbnailUrl(it.thumbnail_path ?? null, it.file_path);
        const counter = group.items.length > 1 ? `<div style="position:absolute;top:6px;right:8px;background:rgba(0,0,0,0.7);color:#fbbf24;font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;">${idx + 1}/${group.items.length}</div>` : "";
        return `
          <div style="background:#0d1117;border-radius:10px;overflow:hidden;font-family:Inter,sans-serif;position:relative;">
            ${counter}
            <img src="${url}" style="width:100%;max-height:120px;object-fit:cover;display:block;" />
            <div style="padding:6px 8px;">
              ${it.caption ? `<p style="color:#fff;font-size:11px;margin:0 0 2px;">${it.caption}</p>` : ""}
              <p style="color:#f59e0b;font-size:10px;margin:0;">${it.trip_title || "Standalone"}</p>
              ${it.taken_at ? `<p style="color:#6b7280;font-size:9px;margin:2px 0 0;">${new Date(it.taken_at).toLocaleDateString()}</p>` : ""}
            </div>
          </div>
        `;
      };

      const popup = new mapboxgl.Popup({ offset: 8, closeButton: true, maxWidth: "180px" })
        .setHTML(buildPopupHTML(0));

      // Auto-rotate for multi-photo
      if (group.items.length > 1) {
        let currentIdx = 0;
        let rotateInterval: ReturnType<typeof setInterval> | null = null;

        popup.on("open", () => {
          currentIdx = 0;
          rotateInterval = setInterval(() => {
            currentIdx = (currentIdx + 1) % group.items.length;
            const el = popup.getElement()?.querySelector(".mapboxgl-popup-content");
            if (el) el.innerHTML = buildPopupHTML(currentIdx);
          }, 3000);
        });

        popup.on("close", () => {
          if (rotateInterval) clearInterval(rotateInterval);
        });
      }

      const lngLat = new mapboxgl.LngLat(group.lng, group.lat);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(lngLat)
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
      markerEls.push({ el, lngLat });
    });

    // ── Globe-edge occlusion — hide markers behind the horizon ──
    const updateOcclusion = () => {
      if (!mapRef.current) return;
      const m = mapRef.current;
      markerEls.forEach(({ el, lngLat }) => {
        // project returns pixel coords; if point is on far side of globe,
        // Mapbox returns coords far outside viewport bounds
        const point = m.project(lngLat);
        const canvas = m.getCanvas();
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);

        // Check if the projected point is within the visible canvas
        // with generous padding. Points far off-screen are on the back of the globe.
        const margin = 60;
        const visible =
          point.x > -margin && point.x < w + margin &&
          point.y > -margin && point.y < h + margin &&
          !isNaN(point.x) && !isNaN(point.y);

        el.style.opacity = visible ? "1" : "0";
        el.style.pointerEvents = visible ? "auto" : "none";
      });
    };

    map.on("move", updateOcclusion);
    map.on("zoom", updateOcclusion);
    map.on("render", updateOcclusion);
    updateOcclusion(); // initial check
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Overlay */}
      <div className="absolute top-6 left-6 z-10 p-5 glass rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-xs pointer-events-none">
        <h1 className="text-2xl font-bold text-[var(--color-text)] m-0">🌍 Memory Wall</h1>
        <p className="text-[var(--color-text-secondary)] mt-1 text-xs">
          Your photos placed at their real GPS locations
        </p>
        {!loading && (
          <p className="text-amber-400 text-xs mt-2 font-medium">
            {mediaCount} {mediaCount === 1 ? "memory" : "memories"} pinned
          </p>
        )}
        {loading && (
          <p className="text-teal-400 text-xs mt-2 animate-pulse">Plotting memories…</p>
        )}
      </div>

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
