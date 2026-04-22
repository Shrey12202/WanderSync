"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  spinGlobe?: boolean;  // Auto-rotate globe on the home page
  onStopClick?: (stopId: string) => void;
  activeStopIndex?: number;
  className?: string;
}

export default function MapView({
  mapData,
  heatmapData,
  globalPaths,
  showHeatmap = false,
  spinGlobe = false,
  onStopClick,
  activeStopIndex,
  className = "",
}: MapViewProps) {
  // Two separate refs:
  //   wrapperRef → our outer React div (safe to use, position:relative)
  //   canvasRef  → Mapbox's canvas container (NEVER modify its CSS or add children here)
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const innerMarkersRef = useRef<HTMLDivElement[]>([]);
  const mapboxMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const spinAnimRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentStyle, setCurrentStyle] = useState("");

  const normalStyle = "mapbox://styles/mapbox/outdoors-v12";
  const heatmapStyle = "mapbox://styles/mapbox/dark-v11";

  // Helper to safely remove layers/sources
  const safeRemoveLayer = useCallback((map: mapboxgl.Map, id: string) => {
    if (map.getLayer(id)) map.removeLayer(id);
  }, []);
  const safeRemoveSource = useCallback((map: mapboxgl.Map, id: string) => {
    if (map.getSource(id)) map.removeSource(id);
  }, []);

  // Create floating tooltip appended to wrapperRef (NOT to Mapbox's canvas)
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
      transform: translate(-50%, calc(-100% - 10px));
    `;
    wrapperRef.current.appendChild(tip);
    tooltipRef.current = tip;
    return () => {
      tip.remove();
      tooltipRef.current = null;
    };
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!canvasRef.current || mapRef.current) return;

    const initialStyle = spinGlobe ? "mapbox://styles/mapbox/dark-v11" : normalStyle;
    const map = new mapboxgl.Map({
      container: canvasRef.current,
      style: initialStyle,
      center: [0, 20],
      zoom: spinGlobe ? 1.5 : 2,
      pitch: 0,
      antialias: true,
      projection: spinGlobe ? { name: "globe" } : { name: "mercator" },
    } as any);

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      setMapLoaded(true);
      setCurrentStyle(initialStyle);

      // Add atmosphere on globe mode
      if (spinGlobe) {
        map.setFog({
          color: "rgb(5, 10, 25)",
          "high-color": "rgb(40, 80, 140)",
          "horizon-blend": 0.04,
          "space-color": "rgb(5, 5, 15)",
          "star-intensity": 0.6,
        });
      }
    });

    // ── Auto-spin globe ────────────────────────────────────────────────────
    if (spinGlobe) {
      const SPEED = 0.12; // degrees per frame

      const spin = () => {
        if (!isInteractingRef.current && mapRef.current) {
          const center = mapRef.current.getCenter();
          center.lng -= SPEED;
          mapRef.current.setCenter(center);
        }
        spinAnimRef.current = requestAnimationFrame(spin);
      };

      const stopSpin = () => { isInteractingRef.current = true; };
      const resumeSpin = () => {
        setTimeout(() => { isInteractingRef.current = false; }, 2000);
      };

      // Map events catch interaction ON the map
      map.on("mousedown", stopSpin);
      map.on("touchstart", stopSpin);
      map.on("zoomstart", stopSpin);   // catches scroll-wheel zoom
      map.on("mouseup", resumeSpin);
      map.on("touchend", resumeSpin);
      map.on("dragend", resumeSpin);
      map.on("zoomend", resumeSpin);   // resume after zoom finishes
      // Document-level: resume when mouse released anywhere outside map
      document.addEventListener("mouseup", resumeSpin);
      document.addEventListener("touchend", resumeSpin);

      spinAnimRef.current = requestAnimationFrame(spin);
    }

    mapRef.current = map;

    return () => {
      if (spinAnimRef.current) cancelAnimationFrame(spinAnimRef.current);
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
      setCurrentStyle("");
    };
  }, [spinGlobe]);

  // Switch map style when heatmap toggle changes — preserves markers since they're DOM-based
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const targetStyle = showHeatmap ? heatmapStyle : normalStyle;
    if (currentStyle === targetStyle) return;

    setMapLoaded(false); // pause other effects while style loads
    map.setStyle(targetStyle);

    map.once("style.load", () => {
      setCurrentStyle(targetStyle);
      setMapLoaded(true);
    });
  }, [showHeatmap, mapLoaded, currentStyle]);

  // Render trip stops on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !mapData) return;

    // Clear existing Mapbox markers
    mapboxMarkersRef.current.forEach((m) => m.remove());
    mapboxMarkersRef.current = [];
    innerMarkersRef.current = [];

    // Remove trip path layers
    safeRemoveLayer(map, "trip-path");
    safeRemoveLayer(map, "trip-path-animated");
    safeRemoveSource(map, "trip-path-source");

    // Draw path
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

    // Deduplication: earliest index per coordinate
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

      // ── Marker structure ────────────────────────────────────────────────────
      // `el`    — outer wrapper: Mapbox writes its positioning transform here.
      //           Made a flex container so it naturally sizes around `inner`.
      //           We NEVER touch el.style.transform.
      // `inner` — the visible circle: safe to animate scale/shadow freely.
      // ────────────────────────────────────────────────────────────────────────
      const el = document.createElement("div");
      el.style.cssText = `
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      `;

      const inner = document.createElement("div");
      inner.style.cssText = `
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
        line-height: 1;
        font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        color: #0a0e1a;
        box-shadow: 0 0 12px rgba(245,158,11,0.4);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        user-select: none;
        box-sizing: border-box;
        flex-shrink: 0;
      `;
      inner.textContent = String(displayNumber);
      el.appendChild(inner);
      innerMarkersRef.current.push(inner);

      // Build tooltip HTML
      const stopName = props.name || `Stop ${displayNumber}`;
      const arrivalStr = props.arrival_time
        ? new Date(props.arrival_time as string).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        })
        : null;

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

      const tooltipHTML = `
        <div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:${arrivalStr ? "4px" : "2px"};">
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

      // Hover on inner — animate inner only, position tooltip relative to wrapperRef
      inner.addEventListener("mouseenter", () => {
        const tip = tooltipRef.current;
        const wrapper = wrapperRef.current;

        // Read position BEFORE scale so coords are unaffected by transform
        const innerRect = inner.getBoundingClientRect();
        const wRect = wrapper?.getBoundingClientRect();

        inner.style.transform = "scale(1.35)";
        inner.style.boxShadow = "0 0 20px rgba(245,158,11,0.75)";

        if (!tip || !wrapper || !wRect) return;
        tip.innerHTML = tooltipHTML;
        tip.style.opacity = "1";
        tip.style.left = `${innerRect.left - wRect.left + innerRect.width / 2}px`;
        tip.style.top = `${innerRect.top - wRect.top}px`;
      });

      inner.addEventListener("mouseleave", () => {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = "0 0 12px rgba(245,158,11,0.4)";
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
      });

      inner.addEventListener("click", () => {
        if (onStopClick) onStopClick(props.id as string);
      });

      // anchor:"center" places the center of `el` at the coordinate.
      // Mapbox will write translate(Xpx, Ypx) translate(-50%,-50%) to el.style.transform.
      // We never touch el.style.transform ourselves.
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(coords)
        .addTo(map);

      mapboxMarkersRef.current.push(marker);
    });

    // Fit bounds
    if (mapData.bounds) {
      map.fitBounds(
        [mapData.bounds.sw, mapData.bounds.ne] as mapboxgl.LngLatBoundsLike,
        { padding: 80, duration: 1500 }
      );
    }
  }, [mapData, mapLoaded, onStopClick, safeRemoveLayer, safeRemoveSource]);

  // Heatmap layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    safeRemoveLayer(map, "heatmap-layer");
    safeRemoveSource(map, "heatmap-source");

    if (showHeatmap && heatmapData && heatmapData.features?.length > 0) {
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
  }, [heatmapData, showHeatmap, mapLoaded, safeRemoveLayer, safeRemoveSource]);

  // Global paths layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    safeRemoveLayer(map, "global-paths-layer");
    safeRemoveSource(map, "global-paths-source");

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
  }, [globalPaths, mapLoaded, safeRemoveLayer, safeRemoveSource]);

  // Highlight active stop — animate inner circle only, never el
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapData || activeStopIndex === undefined) return;

    const feature = mapData.stops.features[activeStopIndex];
    if (feature) {
      const coords = feature.geometry.coordinates as [number, number];
      map.flyTo({ center: coords, zoom: 14, duration: 1200, pitch: 45 });
    }

    innerMarkersRef.current.forEach((inner, i) => {
      if (i === activeStopIndex) {
        inner.style.transform = "scale(1.4)";
        inner.style.boxShadow = "0 0 24px rgba(245,158,11,0.8)";
      } else {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = "0 0 12px rgba(245,158,11,0.4)";
      }
    });
  }, [activeStopIndex, mapData]);

  return (
    <div ref={wrapperRef} className={`relative w-full h-full ${className}`}>
      {/* Mapbox mounts here — we never add children or change styles on this div */}
      <div ref={canvasRef} className="w-full h-full rounded-2xl overflow-hidden" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)] rounded-2xl pointer-events-none">
          <p className="text-[var(--color-text-secondary)] text-sm animate-pulse">Loading map...</p>
        </div>
      )}
    </div>
  );
}
