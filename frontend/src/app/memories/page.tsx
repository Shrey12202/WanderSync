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

    const spin = () => {
      if (!isInteractingRef.current && !isZoomedIn() && mapRef.current) {
        const c = mapRef.current.getCenter();
        c.lng -= SPEED;
        mapRef.current.setCenter(c);
      }
      animRef.current = requestAnimationFrame(spin);
    };

    const stopSpin = () => { isInteractingRef.current = true; };

    // Resume spin only when clicking OUTSIDE the map container
    const resumeOnOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (mapContainer.current && !mapContainer.current.contains(e.target as Node)) {
        isInteractingRef.current = false;
      }
    };

    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);
    document.addEventListener("mousedown", resumeOnOutsideClick);
    document.addEventListener("touchstart", resumeOnOutsideClick);

    animRef.current = requestAnimationFrame(spin);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
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

    media.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;

      const thumbUrl = getThumbnailUrl(item.thumbnail_path ?? null, item.file_path);

      // Build a floating card element
      const el = document.createElement("div");
      el.style.cssText = `
        width: 80px;
        height: 80px;
        border-radius: 12px;
        overflow: hidden;
        border: 2px solid rgba(245,158,11,0.8);
        box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.2);
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        background: #1a1a2e;
        position: relative;
      `;

      const img = document.createElement("img");
      img.src = thumbUrl;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      img.onerror = () => {
        img.src = "";
        el.style.background = "linear-gradient(135deg,#f59e0b33,#14b8a633)";
        el.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;">🏔️</div>`;
      };
      el.appendChild(img);

      // Hover effect
      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.15)";
        el.style.zIndex = "999";
        el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.8), 0 0 0 2px rgba(245,158,11,0.6)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
        el.style.zIndex = "1";
        el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.2)";
      });

      // Popup on click
      const popup = new mapboxgl.Popup({ offset: 10, closeButton: true, maxWidth: "260px" })
        .setHTML(`
          <div style="background:#0d1117;border-radius:12px;overflow:hidden;font-family:Inter,sans-serif;">
            <img src="${thumbUrl}" style="width:100%;max-height:180px;object-fit:cover;display:block;" />
            <div style="padding:10px 12px;">
              ${item.caption ? `<p style="color:#fff;font-size:13px;margin:0 0 4px;">${item.caption}</p>` : ""}
              <p style="color:#f59e0b;font-size:11px;margin:0;">${item.trip_title || "Standalone"}</p>
              ${item.taken_at ? `<p style="color:#6b7280;font-size:10px;margin:4px 0 0;">${new Date(item.taken_at).toLocaleDateString()}</p>` : ""}
            </div>
          </div>
        `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([item.longitude, item.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });
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
