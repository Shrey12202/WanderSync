"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MapData } from "@/types";
import { getThumbnailUrl } from "@/lib/api";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface MapViewProps {
  mapData?: MapData | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heatmapData?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalPaths?: any;
  showHeatmap?: boolean;
  onStopClick?: (stopId: string) => void;
  activeStopIndex?: number;
  className?: string;
}

export default function MapView({
  mapData,
  heatmapData,
  globalPaths,
  showHeatmap = false,
  onStopClick,
  activeStopIndex,
  className = "",
}: MapViewProps) {
  // wrapperRef = outer React-controlled div (safe to modify)
  // canvasRef  = inner Mapbox canvas div (NEVER modify its style/children)
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Create the floating tooltip once, appended to the OUTER wrapper (not the Mapbox canvas)
  useEffect(() => {
    if (!wrapperRef.current) return;
    const tip = document.createElement("div");
    tip.style.cssText = `
      position: absolute;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
      z-index: 20;
      background: rgba(10,14,26,0.96);
      border: 1px solid rgba(245,158,11,0.4);
      border-radius: 12px;
      padding: 10px 12px;
      min-width: 150px;
      max-width: 200px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      font-family: system-ui, sans-serif;
    `;
    wrapperRef.current.appendChild(tip);
    tooltipRef.current = tip;
    return () => { tip.remove(); tooltipRef.current = null; };
  }, []);

  // Initialize map — mount into canvasRef, never touch wrapperRef from Mapbox
  useEffect(() => {
    if (!canvasRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: canvasRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 20],
      zoom: 2,
      pitch: 0,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => setMapLoaded(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Render trip data on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !mapData) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Remove existing sources/layers
    ["trip-path", "trip-path-animated"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("trip-path-source")) map.removeSource("trip-path-source");

    // Add path
    if (mapData.path) {
      map.addSource("trip-path-source", {
        type: "geojson",
        data: mapData.path as GeoJSON.Feature,
      });
      map.addLayer({
        id: "trip-path",
        type: "line",
        source: "trip-path-source",
        paint: { "line-color": "#f59e0b", "line-width": 4, "line-opacity": 0.3, "line-blur": 3 },
      });
      map.addLayer({
        id: "trip-path-animated",
        type: "line",
        source: "trip-path-source",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#fbbf24", "line-width": 3.5, "line-opacity": 0.9 },
      });
    }

    // Deduplication: keep lowest index per coordinate
    const coordMinIndex = new Map<string, number>();
    mapData.stops.features.forEach((feature, index) => {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      if (!coordMinIndex.has(key) || index < coordMinIndex.get(key)!) {
        coordMinIndex.set(key, index);
      }
    });

    const renderedCoords = new Set<string>();

    mapData.stops.features.forEach((feature) => {
      const coords = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      const key = `${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;
      if (renderedCoords.has(key)) return;
      renderedCoords.add(key);

      const minIndex = coordMinIndex.get(key)!;
      const displayNumber = minIndex + 1;

      // ── Pure number marker — NO children, NO relative positioning ──
      const el = document.createElement("div");
      el.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, #f59e0b, #14b8a6);
        border: 3px solid #0a0e1a;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: #0a0e1a;
        box-shadow: 0 0 12px rgba(245,158,11,0.4);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        user-select: none;
      `;
      el.textContent = String(displayNumber);

      // Build tooltip HTML for this stop
      const stopName = props.name || `Stop ${displayNumber}`;
      const arrivalStr = props.arrival_time
        ? new Date(props.arrival_time as string).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          })
        : null;

      // Find matching media thumbnails from mapData.media
      const nearbyThumbs: string[] = [];
      if (mapData.media?.features) {
        mapData.media.features.forEach((mf: any) => {
          const [mlng, mlat] = mf.geometry.coordinates as [number, number];
          if (
            Math.abs(mlng - coords[0]) < 0.0001 &&
            Math.abs(mlat - coords[1]) < 0.0001 &&
            nearbyThumbs.length < 3
          ) {
            nearbyThumbs.push(getThumbnailUrl(mf.properties.thumbnail_path, mf.properties.file_path));
          }
        });
      }

      const buildTooltipHTML = () => `
        <div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:${arrivalStr ? "4px" : "0"};">
          📍 ${stopName}
        </div>
        ${arrivalStr ? `<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:${nearbyThumbs.length ? "6px" : "0"};">${arrivalStr}</div>` : ""}
        ${nearbyThumbs.length > 0
          ? `<div style="display:flex;gap:4px;margin-top:4px;">
               ${nearbyThumbs.map(url =>
                 `<div style="width:44px;height:44px;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);flex-shrink:0;">
                    <img src="${url}" style="width:100%;height:100%;object-fit:cover;" />
                  </div>`
               ).join("")}
             </div>`
          : `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px;">Click to view stop</div>`
        }
      `;

      // Hover: position the tooltip in the OUTER WRAPPER, not inside the marker
      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.35)";
        el.style.boxShadow = "0 0 20px rgba(245,158,11,0.75)";

        const tip = tooltipRef.current;
        const wrapper = wrapperRef.current;
        if (!tip || !wrapper) return;

        tip.innerHTML = buildTooltipHTML();
        tip.style.opacity = "1";

        // Position relative to wrapperRef
        const elRect = el.getBoundingClientRect();
        const wRect = wrapper.getBoundingClientRect();

        const tipLeft = elRect.left - wRect.left + elRect.width / 2;
        const tipTop = elRect.top - wRect.top;

        tip.style.left = `${tipLeft}px`;
        tip.style.top = `${tipTop}px`;
        // After measuring tip width/height, offset upward
        tip.style.transform = "translate(-50%, calc(-100% - 10px))";
      });

      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
        el.style.boxShadow = "0 0 12px rgba(245,158,11,0.4)";
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
      });

      el.addEventListener("click", () => {
        if (onStopClick) onStopClick(props.id as string);
      });

      // anchor: "center" so the number circle sits exactly on the coordinate
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(coords)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (mapData.bounds) {
      map.fitBounds(
        [mapData.bounds.sw, mapData.bounds.ne] as mapboxgl.LngLatBoundsLike,
        { padding: 80, duration: 1500 }
      );
    }
  }, [mapData, mapLoaded, onStopClick]);

  // Heatmap layer  
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer("heatmap-layer")) map.removeLayer("heatmap-layer");
    if (map.getSource("heatmap-source")) map.removeSource("heatmap-source");

    if (showHeatmap && heatmapData && heatmapData.features.length > 0) {
      map.addSource("heatmap-source", { type: "geojson", data: heatmapData });
      map.addLayer({
        id: "heatmap-layer",
        type: "heatmap",
        source: "heatmap-source",
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": 1,
          "heatmap-radius": 30,
          "heatmap-opacity": 0.7,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "rgba(20,184,166,0.4)",
            0.4, "rgba(245,158,11,0.6)",
            0.6, "rgba(251,191,36,0.7)",
            0.8, "rgba(239,68,68,0.8)",
            1, "rgba(239,68,68,1)",
          ],
        },
      });
    }
  }, [heatmapData, showHeatmap, mapLoaded]);

  // Global paths layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer("global-paths-layer")) map.removeLayer("global-paths-layer");
    if (map.getSource("global-paths-source")) map.removeSource("global-paths-source");

    if (globalPaths && globalPaths.features?.length > 0) {
      map.addSource("global-paths-source", { type: "geojson", data: globalPaths });
      map.addLayer({
        id: "global-paths-layer",
        type: "line",
        source: "global-paths-source",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.8 },
      });
    }
  }, [globalPaths, mapLoaded]);

  // Fly to active stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapData || activeStopIndex === undefined) return;

    const feature = mapData.stops.features[activeStopIndex];
    if (feature) {
      const coords = feature.geometry.coordinates as [number, number];
      map.flyTo({ center: coords, zoom: 14, duration: 1200, pitch: 45 });

      markersRef.current.forEach((marker, i) => {
        const el = marker.getElement();
        if (i === activeStopIndex) {
          el.style.transform = "scale(1.4)";
          el.style.boxShadow = "0 0 24px rgba(245,158,11,0.8)";
        } else {
          el.style.transform = "scale(1)";
          el.style.boxShadow = "0 0 12px rgba(245,158,11,0.4)";
        }
      });
    }
  }, [activeStopIndex, mapData]);

  return (
    // wrapperRef: outer React div — safe to append tooltip, set position:relative
    <div ref={wrapperRef} className={`relative w-full h-full ${className}`}>
      {/* canvasRef: Mapbox mounts here — never add children or change styles */}
      <div ref={canvasRef} className="w-full h-full rounded-2xl overflow-hidden" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)] rounded-2xl pointer-events-none">
          <div className="text-[var(--color-text-secondary)] text-sm animate-pulse">
            Loading map...
          </div>
        </div>
      )}
    </div>
  );
}
