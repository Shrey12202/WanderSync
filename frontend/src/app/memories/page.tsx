"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getGeotaggedMedia, getThumbnailUrl } from "@/lib/api";
import type { MediaWithContext } from "@/types";
import StopSlideshowModal from "@/components/media/StopSlideshowModal";

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
  const [activeCluster, setActiveCluster] = useState<{stopName: string, items: MediaWithContext[]} | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      center: [20, 30],
      zoom: 1,
      projection: { name: "globe" } as any,
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", async () => {
      // Atmosphere / space look
      map.setFog({
        color: "rgb(5, 10, 25)",
        "high-color": "rgb(30, 60, 120)",
        "horizon-blend": 0.2,
        "space-color": "rgb(5, 5, 15)",
        "star-intensity": 0.7,
      });

      // Hide country labels dynamically so it persists
      const updateLabels = () => {
        const style = map.getStyle();
        if (style && style.layers) {
          const isZoomedIn = map.getZoom() > 3.5;
          style.layers.forEach((layer: any) => {
            if (layer.id.includes('country-label') || layer.id.includes('place-') || layer.id.includes('state-label') || layer.id.includes('settlement-')) {
              try { map.setLayoutProperty(layer.id, 'visibility', isZoomedIn ? 'visible' : 'none'); } catch(e){}
            }
          });
        }
      };
      map.on('style.load', updateLabels);
      map.on('zoom', updateLabels);
      updateLabels();

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

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    class ResetZoomControl {
      _map: mapboxgl.Map | undefined;
      _container: HTMLDivElement | undefined;

      onAdd(map: mapboxgl.Map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        const button = document.createElement('button');
        button.className = 'mapboxgl-ctrl-icon';
        button.type = 'button';
        button.title = 'Reset Zoom & Spin';
        button.innerHTML = '<svg style="width:16px;height:16px;fill:#333;margin:auto" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.onclick = () => {
          map.flyTo({ zoom: 1, pitch: 0, bearing: 0, duration: 1500 });
        };
        this._container.appendChild(button);
        return this._container;
      }
      onRemove() {
        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._map = undefined;
      }
    }

    map.addControl(new ResetZoomControl(), "top-right");

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

    // On mobile, viewport/browser chrome changes frequently. Ensure the map resizes
    // so Marker positions stay aligned with their lng/lat.
    const resize = () => {
      try {
        map.resize();
      } catch {
        // ignore resize errors during teardown
      }
    };
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    let ro: ResizeObserver | null = null;
    if (mapContainer.current && "ResizeObserver" in window) {
      ro = new ResizeObserver(() => resize());
      ro.observe(mapContainer.current);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("mousedown", resumeOnOutsideClick);
      document.removeEventListener("touchstart", resumeOnOutsideClick);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      if (ro) ro.disconnect();
      markersRef.current.forEach((m) => {
        if ((m as any)._rotateInterval) clearInterval((m as any)._rotateInterval);
        m.remove();
      });
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [isLoaded, isSignedIn]);

  const placeMarkers = useCallback((media: MediaWithContext[], map: mapboxgl.Map) => {
    markersRef.current.forEach((m) => {
      if ((m as any)._rotateInterval) clearInterval((m as any)._rotateInterval);
      m.remove();
    });
    markersRef.current = [];

    // Dynamic zoom-based clustering
    const zoom = map.getZoom();
    // Increase threshold when zoomed out to group more. Decrease when zoomed in to separate.
    // At zoom 1 -> threshold is 1.25 degrees. At zoom 10 -> threshold is ~0.002 degrees.
    const GPS_THRESHOLD = 2.5 / Math.pow(2, zoom);
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
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;transition: opacity 0.5s ease-in-out;";
      img.onerror = () => {
        img.src = "";
        inner.style.background = "linear-gradient(135deg,#f59e0b33,#14b8a633)";
        inner.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;">🏔️</div>`;
      };
      inner.appendChild(img);

      // Add rotation to base image
      let rotateInterval: ReturnType<typeof setInterval> | null = null;
      if (group.items.length > 1) {
        let currentIdx = 0;
        rotateInterval = setInterval(() => {
          currentIdx = (currentIdx + 1) % group.items.length;
          const url = getThumbnailUrl(group.items[currentIdx].thumbnail_path ?? null, group.items[currentIdx].file_path);
          img.src = url;
        }, 3000);
      }

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

      // Remove custom popup and use activeCluster React state instead
      inner.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveCluster({
          stopName: "Location Photos",
          items: group.items
        });
      });

      const lngLat = new mapboxgl.LngLat(group.lng, group.lat);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);

      // Attach interval to marker element so it can be cleaned up
      if (rotateInterval) {
        (marker as any)._rotateInterval = rotateInterval;
      }

      markersRef.current.push(marker);
      markerEls.push({ el, lngLat });
    });

    // ── Globe-edge occlusion — hide markers behind the horizon ──
    const updateOcclusion = () => {
      if (!mapRef.current) return;
      const m = mapRef.current;
      const center = m.getCenter();
      const zoom = m.getZoom();
      
      // Calculate approximate horizon distance in meters based on zoom.
      // At zoom 1.5 (default), horizon is ~7,750km.
      const horizonDist = Math.max(1000000, 10000000 - (zoom * 1500000));
      const fadeStart = horizonDist * 0.75; // Start fading at 75% to horizon

      markerEls.forEach(({ el, lngLat }) => {
        const distance = center.distanceTo(lngLat);
        
        let opacity = 1;
        if (distance > horizonDist) {
          opacity = 0;
        } else if (distance > fadeStart) {
          // Smooth fade from 1 to 0
          opacity = 1 - ((distance - fadeStart) / (horizonDist - fadeStart));
        }

        // Fallback: also hide if way outside screen bounds
        const point = m.project(lngLat);
        const canvas = m.getCanvas();
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        const margin = 100;
        if (
          point.x < -margin || point.x > w + margin ||
          point.y < -margin || point.y > h + margin
        ) {
          opacity = 0;
        }

        el.style.opacity = opacity.toFixed(2);
        el.style.pointerEvents = opacity > 0.2 ? "auto" : "none";
      });
    };

    map.on("move", updateOcclusion);
    map.on("zoom", updateOcclusion);
    map.on("render", updateOcclusion);
    
    // Re-cluster on zoom end
    const onZoomEnd = () => {
      placeMarkers(media, map);
    };
    map.on("zoomend", onZoomEnd);
    
    updateOcclusion(); // initial check
    
    // Cleanup local listeners
    (map as any)._onZoomEnd = onZoomEnd;
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Overlay */}
      <div className="absolute top-4 left-4 right-4 md:right-auto md:top-6 md:left-6 z-10 p-4 md:p-5 glass rounded-2xl border border-[var(--color-border)] shadow-2xl md:max-w-xs pointer-events-none">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] m-0">🌍 Memory Wall</h1>
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
      
      {/* Lightbox for clicked clusters */}
      {activeCluster && (
        <StopSlideshowModal
          stopName={activeCluster.stopName}
          media={activeCluster.items}
          onClose={() => setActiveCluster(null)}
        />
      )}
    </div>
  );
}
