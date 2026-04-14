"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MapData } from "@/types";
import { getThumbnailUrl, getMediaUrl } from "@/lib/api";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 20],
      zoom: 2,
      pitch: 0,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      if (containerRef.current) containerRef.current.dataset.style = "mapbox://styles/mapbox/dark-v11";
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Map Style hot-swapper
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const targetStyle = showHeatmap ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/outdoors-v12";
    if (containerRef.current?.dataset.style === targetStyle) return;

    setMapLoaded(false);
    map.setStyle(targetStyle);
    if (containerRef.current) containerRef.current.dataset.style = targetStyle;

    map.once("style.load", () => {
      setMapLoaded(true);
    });
  }, [showHeatmap, mapLoaded]);

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
    ["trip-path-source"].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });

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
        paint: {
          "line-color": "#f59e0b",
          "line-width": 4,
          "line-opacity": 0.3,
          "line-blur": 3,
        },
      });

      map.addLayer({
        id: "trip-path-animated",
        type: "line",
        source: "trip-path-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#fbbf24",
          "line-width": 3.5,
          "line-opacity": 0.9,
        },
      });
    }

    // Build coordKey -> minIndex map for deduplication
    const coordMinIndex = new Map<string, number>();
    // Also gather media per stop coordinate for hover preview
    const coordStopData = new Map<string, { id: string; name: string; mediaUrls: string[] }>();

    mapData.stops.features.forEach((feature, index) => {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      if (!coordMinIndex.has(key) || index < coordMinIndex.get(key)!) {
        coordMinIndex.set(key, index);
      }
    });

    // Map stop id -> media thumbnails (from mapData.media features)
    const stopMediaMap = new Map<string, string[]>();
    if (mapData.media?.features) {
      // Since media features don't carry stop_id we match by proximity — skip for now
      // Instead gather all geotagged media URLs for preview on nearby markers
    }

    const renderedCoords = new Set<string>();

    mapData.stops.features.forEach((feature, index) => {
      const coords = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      const key = `${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;

      if (renderedCoords.has(key)) return;
      renderedCoords.add(key);

      const minIndex = coordMinIndex.get(key)!;
      const displayNumber = minIndex + 1;

      const el = document.createElement("div");
      el.className = "stop-marker";
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 50%;
        background: linear-gradient(135deg, #f59e0b, #14b8a6);
        border: 3px solid #0a0e1a;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #0a0e1a;
        box-shadow: 0 0 12px rgba(245,158,11,0.4);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        position: relative; z-index: 1;
      `;
      el.textContent = String(displayNumber);

      // Custom hover tooltip with photo preview
      const tooltip = document.createElement("div");
      tooltip.style.cssText = `
        position: absolute;
        bottom: 36px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10,14,26,0.95);
        border: 1px solid rgba(245,158,11,0.3);
        border-radius: 12px;
        padding: 10px;
        min-width: 160px;
        max-width: 200px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 100;
        backdrop-filter: blur(8px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        white-space: nowrap;
      `;

      const stopName = props.name || `Stop ${displayNumber}`;
      const arrivalStr = props.arrival_time ? new Date(props.arrival_time as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

      // Find nearby media thumbnails by checking all media features for same coords
      const nearbyMedia: string[] = [];
      if (mapData.media?.features) {
        mapData.media.features.forEach((mf: any) => {
          const [mlng, mlat] = mf.geometry.coordinates as [number, number];
          const mk = `${mlng.toFixed(4)},${mlat.toFixed(4)}`;
          const sk = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`;
          if (mk === sk && nearbyMedia.length < 3) {
            nearbyMedia.push(getThumbnailUrl(mf.properties.thumbnail_path, mf.properties.file_path));
          }
        });
      }

      tooltip.innerHTML = `
        <div style="font-size:12px; font-weight:700; color:#fbbf24; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">
          📍 ${stopName}
        </div>
        ${arrivalStr ? `<div style="font-size:10px; color:rgba(255,255,255,0.5); margin-bottom:6px;">${arrivalStr}</div>` : ""}
        ${nearbyMedia.length > 0 ? `
          <div style="display:flex; gap:4px; margin-top:4px;">
            ${nearbyMedia.map(url => `
              <div style="width:48px; height:48px; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">
                <img src="${url}" style="width:100%;height:100%;object-fit:cover;" />
              </div>
            `).join("")}
          </div>
        ` : `<div style="font-size:10px; color:rgba(255,255,255,0.3);">Click to view stop</div>`}
        <div style="
          position:absolute; bottom:-6px; left:50%; transform:translateX(-50%);
          width:10px; height:10px; background:rgba(10,14,26,0.95);
          border-right:1px solid rgba(245,158,11,0.3);
          border-bottom:1px solid rgba(245,158,11,0.3);
          transform:translateX(-50%) rotate(45deg);
        "></div>
      `;

      el.appendChild(tooltip);

      el.onmouseenter = () => {
        el.style.transform = "scale(1.3)";
        el.style.boxShadow = "0 0 20px rgba(245,158,11,0.7)";
        el.style.zIndex = "10";
        tooltip.style.opacity = "1";
      };
      el.onmouseleave = () => {
        el.style.transform = "scale(1)";
        el.style.boxShadow = "0 0 12px rgba(245,158,11,0.4)";
        el.style.zIndex = "1";
        tooltip.style.opacity = "0";
      };

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map);

      el.addEventListener("click", () => {
        if (onStopClick) onStopClick(props.id as string);
      });

      markersRef.current.push(marker);
    });

    // Add Media markers (geotagged photos on the map)
    if (mapData.media && mapData.media.features) {
      mapData.media.features.forEach((feature: any) => {
        const coords = feature.geometry.coordinates as [number, number];
        const props = feature.properties;
        const thumbUrl = getThumbnailUrl(props.thumbnail_path, props.file_path);

        const el = document.createElement("div");
        el.className = "media-marker";
        el.style.cssText = `
          width: 38px; height: 38px; border-radius: 50%;
          background-image: url('${thumbUrl}');
          background-size: cover; background-position: center;
          border: 3px solid #14b8a6; box-shadow: 0 0 10px rgba(0,0,0,0.5);
          cursor: pointer; transition: transform 0.2s ease, z-index 0.2s;
          position: relative; z-index: 1;
        `;

        // Media hover tooltip
        const mediaTooltip = document.createElement("div");
        mediaTooltip.style.cssText = `
          position: absolute;
          bottom: 44px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(10,14,26,0.95);
          border: 1px solid rgba(20,184,166,0.3);
          border-radius: 10px;
          padding: 8px 10px;
          min-width: 130px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 100;
          backdrop-filter: blur(8px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        `;

        const captionStr = props.caption ? `<div style="font-size:11px;color:white;font-weight:600;margin-bottom:2px;">${props.caption}</div>` : "";
        const dateStr = props.taken_at ? `<div style="font-size:10px;color:rgba(255,255,255,0.4);">${new Date(props.taken_at).toLocaleDateString()}</div>` : "";
        mediaTooltip.innerHTML = `
          <img src="${thumbUrl}" style="width:100%;height:70px;object-fit:cover;border-radius:6px;margin-bottom:6px;" />
          ${captionStr}${dateStr}
        `;
        el.appendChild(mediaTooltip);

        el.onmouseenter = () => { el.style.transform = "scale(1.8)"; el.style.zIndex = "10"; mediaTooltip.style.opacity = "1"; };
        el.onmouseleave = () => { el.style.transform = "scale(1)"; el.style.zIndex = "1"; mediaTooltip.style.opacity = "0"; };

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(coords)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

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
      map.addSource("heatmap-source", {
        type: "geojson",
        data: heatmapData,
      });

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
      map.addSource("global-paths-source", {
        type: "geojson",
        data: globalPaths,
      });

      map.addLayer({
        id: "global-paths-layer",
        type: "line",
        source: "global-paths-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-opacity": 0.8,
        },
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
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)] rounded-2xl">
          <div className="text-[var(--color-text-secondary)] text-sm animate-pulse">
            Loading map...
          </div>
        </div>
      )}
    </div>
  );
}
