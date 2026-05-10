"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { HomeLocation, MapData, MediaItem } from "@/types";
import type { RouteResult } from "@/lib/directions";
import { getThumbnailUrl } from "@/lib/api";
import StopSlideshowModal from "@/components/media/StopSlideshowModal";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const STOP_MARKER_SHADOW_BASE =
  "0 0 0 2px rgba(10,14,26,0.95), 0 1px 0 rgba(255,255,255,0.35) inset, 0 3px 10px rgba(0,0,0,0.35), 0 0 18px rgba(217,119,6,0.42)";
const STOP_MARKER_SHADOW_HOVER =
  "0 0 0 2px rgba(10,14,26,0.95), 0 1px 0 rgba(255,255,255,0.4) inset, 0 4px 14px rgba(0,0,0,0.4), 0 0 26px rgba(217,119,6,0.58), 0 0 12px rgba(15,148,136,0.35)";
const STOP_MARKER_SHADOW_ACTIVE =
  "0 0 0 2px rgba(10,14,26,0.95), 0 1px 0 rgba(255,255,255,0.45) inset, 0 4px 16px rgba(0,0,0,0.4), 0 0 28px rgba(217,119,6,0.62), 0 0 14px rgba(15,148,136,0.4)";

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
  mediaMarkers?: MediaItem[];  // Bug 12: geotagged photos to show as map pins
  /** Optional pre-computed route (road geometry + flight segments). When
   *  provided, replaces the straight-line `mapData.path` rendering with a
   *  road-snapped path plus dashed lines for flight legs. */
  routeOverride?: RouteResult | null;
  /** Saved profile addresses with coordinates — shown as a house pin */
  homeMarkers?: HomeLocation[];
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
  mediaMarkers = [],
  routeOverride = null,
  homeMarkers = [],
}: MapViewProps) {
  // Two separate refs:
  //   wrapperRef → our outer React div (safe to use, position:relative)
  //   canvasRef  → Mapbox's canvas container (NEVER modify its CSS or add children here)
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const innerMarkersRef = useRef<HTMLDivElement[]>([]);
  const mapboxMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const mediaMapboxMarkersRef = useRef<mapboxgl.Marker[]>([]);  // Bug 12
  const homeMapboxMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const spinAnimRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentStyle, setCurrentStyle] = useState("");
  // Bug 12 & Feature — lightbox for clicked media marker cluster
  const [mediaLightbox, setMediaLightbox] = useState<{stopName: string, items: MediaItem[]} | null>(null);

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
    const isSmallScreen = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    // Flat map was feeling too zoomed-in; keep it a bit wider on all screens.
    const initialFlatZoom = isSmallScreen ? 1.25 : 1.5;
    const controlPosition: mapboxgl.ControlPosition = isSmallScreen ? "bottom-right" : "top-right";
    const map = new mapboxgl.Map({
      container: canvasRef.current,
      style: initialStyle,
      center: [0, 20],
      zoom: spinGlobe ? 1 : initialFlatZoom,
      pitch: 0,
      antialias: true,
      projection: spinGlobe ? { name: "globe" } : { name: "mercator" },
    } as any);

    map.addControl(new mapboxgl.NavigationControl(), controlPosition);

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
        // Classic refresh icon SVG
        button.innerHTML = '<svg style="width:16px;height:16px;fill:#333;margin:auto" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.onclick = () => {
          map.flyTo({ zoom: spinGlobe ? 1 : initialFlatZoom, pitch: 0, bearing: 0, duration: 1500 });
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

    map.addControl(new ResetZoomControl(), controlPosition);

    map.on("load", () => {
      setMapLoaded(true);
      setCurrentStyle(initialStyle);

      // Add atmosphere on globe mode
      if (spinGlobe) {
        map.setFog({
          color: "rgb(5, 10, 25)",
          "high-color": "rgb(40, 80, 140)",
          "horizon-blend": 0.2,
          "space-color": "rgb(5, 5, 15)",
          "star-intensity": 0.6,
        });
      }

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
    });

    // ── Auto-spin globe ────────────────────────────────────────────────────
    if (spinGlobe) {
      const SPEED = 0.12;
      const BASE_ZOOM = 1;
      const ZOOM_THRESHOLD = 0.3;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const isZoomedIn = () =>
        (mapRef.current?.getZoom() ?? BASE_ZOOM) > BASE_ZOOM + ZOOM_THRESHOLD;

      const spin = () => {
        if (!isInteractingRef.current && !isZoomedIn() && mapRef.current) {
          const center = mapRef.current.getCenter();
          center.lng -= SPEED;
          mapRef.current.setCenter(center);
        }
        spinAnimRef.current = requestAnimationFrame(spin);
      };

      // Any interaction on the map stops spin
      const stopSpin = () => {
        isInteractingRef.current = true;
        if (idleTimer) clearTimeout(idleTimer);
      };

      // After interaction ends, resume spin after 5s of idle
      const scheduleResume = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { isInteractingRef.current = false; }, 5000);
      };

      // Clicking OUTSIDE the map wrapper resumes spin immediately
      const resumeOnOutsideClick = (e: MouseEvent | TouchEvent) => {
        const wrapper = wrapperRef.current;
        if (wrapper && !wrapper.contains(e.target as Node)) {
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

      spinAnimRef.current = requestAnimationFrame(spin);

      // Store cleanup fn on map for teardown
      (map as any).__spinCleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        document.removeEventListener("mousedown", resumeOnOutsideClick);
        document.removeEventListener("touchstart", resumeOnOutsideClick);
      };
    }

    mapRef.current = map;

    return () => {
      if (spinAnimRef.current) cancelAnimationFrame(spinAnimRef.current);
      // Clean up any document-level spin listeners
      if ((map as any).__spinCleanup) (map as any).__spinCleanup();
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

    // Remove trip path layers (handles both road and flight overlays)
    safeRemoveLayer(map, "trip-path");
    safeRemoveLayer(map, "trip-path-animated");
    safeRemoveLayer(map, "trip-path-flights");
    safeRemoveSource(map, "trip-path-source");
    safeRemoveSource(map, "trip-path-flights-source");

    // Draw path — prefer the road-snapped override when provided, otherwise
    // fall back to the straight-line geometry returned by the backend.
    if (routeOverride && (routeOverride.roadCoordinates.length > 0 || routeOverride.flightSegments.length > 0)) {
      if (routeOverride.roadCoordinates.length > 1) {
        map.addSource("trip-path-source", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: routeOverride.roadCoordinates },
          } as GeoJSON.Feature,
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

      if (routeOverride.flightSegments.length > 0) {
        map.addSource("trip-path-flights-source", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: routeOverride.flightSegments.map((seg) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: seg },
            })),
          } as GeoJSON.FeatureCollection,
        });
        map.addLayer({
          id: "trip-path-flights",
          type: "line",
          source: "trip-path-flights-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#14b8a6",
            "line-width": 2.5,
            "line-opacity": 0.85,
            "line-dasharray": [2, 2],
          },
        });
      }
    } else if (mapData.path) {
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
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      `;

      const inner = document.createElement("div");
      inner.style.cssText = `
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: linear-gradient(145deg, #f0a64c 0%, #d97706 42%, #0f9488 100%);
        border: 2px solid rgba(255, 250, 240, 0.92);
        box-shadow: ${STOP_MARKER_SHADOW_BASE};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        line-height: 1;
        font-weight: 800;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        color: #0c1224;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.25);
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

        inner.style.transform = "scale(1.28)";
        inner.style.boxShadow = STOP_MARKER_SHADOW_HOVER;

        if (!tip || !wrapper || !wRect) return;
        tip.innerHTML = tooltipHTML;
        tip.style.opacity = "1";
        tip.style.left = `${innerRect.left - wRect.left + innerRect.width / 2}px`;
        tip.style.top = `${innerRect.top - wRect.top}px`;
      });

      inner.addEventListener("mouseleave", () => {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = STOP_MARKER_SHADOW_BASE;
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
      });

      inner.addEventListener("click", () => {
        // Hide tooltip immediately — the slideshow modal will overlay the map,
        // preventing the normal mouseleave from firing
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = STOP_MARKER_SHADOW_BASE;
        if (onStopClick) onStopClick(props.id as string);
      });

      // anchor:"center" places the center of `el` at the coordinate.
      // Mapbox will write translate(Xpx, Ypx) translate(-50%,-50%) to el.style.transform.
      // We never touch el.style.transform ourselves.
      const marker = new mapboxgl.Marker({ element: el, anchor: "center", pitchAlignment: "map" })
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
  }, [mapData, mapLoaded, onStopClick, routeOverride, safeRemoveLayer, safeRemoveSource]);

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
    safeRemoveLayer(map, "global-paths-outline-layer");
    safeRemoveSource(map, "global-paths-source");

    if (globalPaths && globalPaths.features?.length > 0) {
      map.addSource("global-paths-source", { type: "geojson", data: globalPaths });
      // Dark outline for contrast at low zoom
      map.addLayer({
        id: "global-paths-outline-layer",
        type: "line",
        source: "global-paths-source",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "rgba(8,10,18,0.55)", "line-width": 7, "line-opacity": 0.82, "line-blur": 0.5 },
      });
      map.addLayer({
        id: "global-paths-layer",
        type: "line",
        source: "global-paths-source",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4.6, "line-opacity": 0.94 },
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
        inner.style.transform = "scale(1.32)";
        inner.style.boxShadow = STOP_MARKER_SHADOW_ACTIVE;
      } else {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = STOP_MARKER_SHADOW_BASE;
      }
    });
  }, [activeStopIndex, mapData]);

  // Saved home addresses from profile (house icon)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    homeMapboxMarkersRef.current.forEach((m) => m.remove());
    homeMapboxMarkersRef.current = [];

    const homes = (homeMarkers ?? []).filter(
      (h) => h.latitude != null && h.longitude != null
    ) as (HomeLocation & { latitude: number; longitude: number })[];

    const houseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="17" height="17" fill="#0c1224" aria-hidden="true"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-9.19-9.2a1.5 1.5 0 00-2.12 0l-9.2 9.19a.75.75 0 101.06 1.06l8.69-8.69z"/><path d="M12 5.43l-6.75 6.75V20.25a.75.75 0 00.75.75H10.5v-4.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v4.5H18a.75.75 0 00.75-.75v-8.07L12 5.43z"/></svg>`;

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    homes.forEach((loc) => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      `;

      const inner = document.createElement("div");
      inner.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: linear-gradient(145deg, #fef3c7 0%, #fcd34d 45%, #14b8a6 100%);
        border: 2px solid rgba(255, 250, 240, 0.95);
        box-shadow: 0 0 0 2px rgba(10,14,26,0.92), 0 2px 8px rgba(0,0,0,0.35), 0 0 14px rgba(245,158,11,0.35);
        cursor: default;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        box-sizing: border-box;
        flex-shrink: 0;
      `;
      inner.innerHTML = houseSvg;

      const title = esc(loc.label?.trim() || "Home");
      const tipHtml = `
        <div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:4px;">🏠 ${title}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.65);line-height:1.35;">${esc(loc.address)}</div>
      `;

      inner.addEventListener("mouseenter", () => {
        inner.style.transform = "scale(1.12)";
        inner.style.boxShadow =
          "0 0 0 2px rgba(10,14,26,0.92), 0 3px 12px rgba(0,0,0,0.4), 0 0 20px rgba(245,158,11,0.5)";
        const tip = tooltipRef.current;
        const wrapper = wrapperRef.current;
        if (!tip || !wrapper) return;
        const innerRect = inner.getBoundingClientRect();
        const wRect = wrapper.getBoundingClientRect();
        tip.innerHTML = tipHtml;
        tip.style.opacity = "1";
        tip.style.left = `${innerRect.left - wRect.left + innerRect.width / 2}px`;
        tip.style.top = `${innerRect.top - wRect.top}px`;
      });

      inner.addEventListener("mouseleave", () => {
        inner.style.transform = "scale(1)";
        inner.style.boxShadow =
          "0 0 0 2px rgba(10,14,26,0.92), 0 2px 8px rgba(0,0,0,0.35), 0 0 14px rgba(245,158,11,0.35)";
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
      });

      el.appendChild(inner);
      const marker = new mapboxgl.Marker({ element: el, anchor: "center", pitchAlignment: "map" })
        .setLngLat([loc.longitude, loc.latitude])
        .addTo(map);
      homeMapboxMarkersRef.current.push(marker);
    });

    return () => {
      homeMapboxMarkersRef.current.forEach((m) => m.remove());
      homeMapboxMarkersRef.current = [];
    };
  }, [homeMarkers, mapLoaded]);

  // Bug 12 & Feature — render clustered photo markers on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old media markers
    mediaMapboxMarkersRef.current.forEach((m) => m.remove());
    mediaMapboxMarkersRef.current = [];
    const intervals: NodeJS.Timeout[] = [];

    // Cluster photos within ~110 meters (0.001 degrees)
    const clusters: { lat: number; lng: number; items: typeof mediaMarkers }[] = [];
    mediaMarkers.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      const existing = clusters.find(
        (c) => Math.abs(c.lat - item.latitude!) < 0.001 && Math.abs(c.lng - item.longitude!) < 0.001
      );
      if (existing) {
        existing.items.push(item);
      } else {
        clusters.push({ lat: item.latitude, lng: item.longitude, items: [item] });
      }
    });

    clusters.forEach((cluster) => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      const inner = document.createElement("div");
      let currentIndex = 0;
      const getUrl = (idx: number) => getThumbnailUrl(cluster.items[idx].thumbnail_path ?? null, cluster.items[idx].file_path);
      
      inner.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: url('${getUrl(0)}') center/cover no-repeat, #f59e0b;
        border: 2px solid #f59e0b;
        cursor: pointer;
        box-shadow: 0 0 8px rgba(245,158,11,0.5);
        transition: transform 0.15s ease, box-shadow 0.15s ease, background-image 0.5s ease-in-out;
        box-sizing: border-box;
        flex-shrink: 0;
      `;
      
      // Add cluster count badge if > 1
      if (cluster.items.length > 1) {
        const badge = document.createElement("div");
        badge.style.cssText = `
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          font-size: 9px;
          font-weight: bold;
          border-radius: 10px;
          padding: 1px 4px;
          border: 1px solid rgba(0,0,0,0.2);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          pointer-events: none;
        `;
        badge.textContent = String(cluster.items.length);
        el.appendChild(badge);
        
        // Rotate image every 3 seconds
        const intervalId = setInterval(() => {
          currentIndex = (currentIndex + 1) % cluster.items.length;
          inner.style.backgroundImage = `url('${getUrl(currentIndex)}'), linear-gradient(#f59e0b, #f59e0b)`;
        }, 3000);
        intervals.push(intervalId);
      }

      el.appendChild(inner);

      const updateTooltip = () => {
        const tip = tooltipRef.current;
        const wrapper = wrapperRef.current;
        if (!tip || !wrapper) return;
        const innerRect = inner.getBoundingClientRect();
        const wRect = wrapper.getBoundingClientRect();
        const currentItem = cluster.items[currentIndex];
        
        tip.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:4px;">
            📷 Photo ${cluster.items.length > 1 ? `(${currentIndex + 1}/${cluster.items.length})` : ''}
          </div>
          <div style="width:80px;height:60px;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
            <img src="${getUrl(currentIndex)}" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          ${currentItem.caption ? `<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:4px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${currentItem.caption}</div>` : ""}
        `;
        tip.style.opacity = "1";
        tip.style.left = `${innerRect.left - wRect.left + innerRect.width / 2}px`;
        tip.style.top = `${innerRect.top - wRect.top}px`;
      };

      inner.addEventListener("mouseenter", () => {
        inner.style.transform = "scale(1.4)";
        inner.style.boxShadow = "0 0 16px rgba(245,158,11,0.9)";
        updateTooltip();
        
        // Also update tooltip continuously while hovering if it rotates
        if (cluster.items.length > 1) {
          inner.dataset.hovering = "true";
        }
      });

      // To keep tooltip in sync when interval fires
      if (cluster.items.length > 1) {
        const hoverInterval = setInterval(() => {
          if (inner.dataset.hovering === "true") updateTooltip();
        }, 3000);
        intervals.push(hoverInterval);
      }

      inner.addEventListener("mouseleave", () => {
        inner.dataset.hovering = "false";
        inner.style.transform = "scale(1)";
        inner.style.boxShadow = "0 0 8px rgba(245,158,11,0.5)";
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
      });

      inner.addEventListener("click", () => {
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
        // Show all items in the cluster
        setMediaLightbox({
          stopName: "Location Photos",
          items: cluster.items
        });
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: "center", pitchAlignment: "map" })
        .setLngLat([cluster.lng, cluster.lat])
        .addTo(map);

      mediaMapboxMarkersRef.current.push(marker);
    });
    
    return () => intervals.forEach(clearInterval);
  }, [mediaMarkers, mapLoaded]);

  return (
    <div ref={wrapperRef} className={`relative w-full h-full ${className}`}>
      {/* Mapbox mounts here — we never add children or change styles on this div */}
      <div ref={canvasRef} className="w-full h-full rounded-2xl overflow-hidden" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)] rounded-2xl pointer-events-none">
          <p className="text-[var(--color-text-secondary)] text-sm animate-pulse">Loading map...</p>
        </div>
      )}

      {/* Bug 12 & Feature — Photo lightbox triggered by media marker click */}
      {mediaLightbox && (
        <StopSlideshowModal
          stopName={mediaLightbox.stopName}
          media={mediaLightbox.items}
          onClose={() => setMediaLightbox(null)}
        />
      )}
    </div>
  );
}
