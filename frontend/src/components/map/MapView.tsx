"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
    
    setMapLoaded(false); // Pause rendering layers
    map.setStyle(targetStyle);
    if (containerRef.current) containerRef.current.dataset.style = targetStyle;
    
    map.once("style.load", () => {
      setMapLoaded(true); // Reactivate rendering layers
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

      // Glow effect layer
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

      // Main path layer
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

    // Add stop markers — deduplicate by coordinate, show lowest sequence number
    // Build a map of coordKey -> minIndex for all features
    const coordMinIndex = new Map<string, number>();
    mapData.stops.features.forEach((feature, index) => {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      if (!coordMinIndex.has(key) || index < coordMinIndex.get(key)!) {
        coordMinIndex.set(key, index);
      }
    });
    const renderedCoords = new Set<string>();

    mapData.stops.features.forEach((feature, index) => {
      const coords = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      const key = `${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;

      // Only render one marker per unique coordinate (using the minimum index)
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
      `;
      el.textContent = String(displayNumber);
      el.onmouseenter = () => {
        el.style.transform = "scale(1.3)";
        el.style.boxShadow = "0 0 20px rgba(245,158,11,0.7)";
      };
      el.onmouseleave = () => {
        el.style.transform = "scale(1)";
        el.style.boxShadow = "0 0 12px rgba(245,158,11,0.4)";
      };

      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(`
        <div style="min-width:140px">
          <strong style="font-size:14px">${props.name || "Stop " + displayNumber}</strong>
          ${props.arrival_time ? `<p style="margin:4px 0 0;font-size:12px;opacity:0.7">${new Date(props.arrival_time as string).toLocaleString()}</p>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map);

      el.addEventListener("click", () => {
        if (onStopClick) onStopClick(props.id as string);
      });

      markersRef.current.push(marker);
    });

    // Add Media markers
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
        `;
        
        el.onmouseenter = () => { el.style.transform = "scale(2)"; el.style.zIndex = "10"; };
        el.onmouseleave = () => { el.style.transform = "scale(1)"; el.style.zIndex = "1"; };

        const popup = new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(`
          <div style="min-width:140px; text-align:center; padding-top:4px;">
             ${props.caption ? `<p style="margin:4px 0 0; font-size:12px; font-weight:bold; color:#f59e0b;">${props.caption}</p>` : ""}
             ${props.taken_at ? `<p style="margin:2px 0 0; font-size:10px; opacity:0.8;">${new Date(props.taken_at).toLocaleDateString()}</p>` : ""}
          </div>
        `);

        // Adding media markers above the line layer conceptually
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
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
        // Put the paths below the stop-markers but above the map background
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

      // Highlight active marker
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
