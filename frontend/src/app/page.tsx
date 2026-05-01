"use client";

import { useEffect, useState } from "react";
import { getHeatmapData, getGlobalPaths } from "@/lib/api";
import type { GeoJSONFeatureCollection } from "@/types";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--color-surface)] animate-pulse flex items-center justify-center">
      <span className="text-[var(--color-text-secondary)] text-sm">Loading map...</span>
    </div>
  ),
});

export default function HomeMap() {
  const [heatmapData, setHeatmapData] = useState<GeoJSONFeatureCollection | null>(null);
  const [globalPaths, setGlobalPaths] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isGlobeView, setIsGlobeView] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [heatData, pathsData] = await Promise.all([
          getHeatmapData(),
          getGlobalPaths(),
        ]);
        setHeatmapData(heatData);
        setGlobalPaths(pathsData);
      } catch (err) {
        console.error("Failed to load map data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Absolute Header Overlay */}
      {/* Keep a safe right gutter so map controls aren't hidden on mobile */}
      <div className="absolute top-4 left-4 z-10 p-4 md:p-5 glass rounded-2xl border border-[var(--color-border)] shadow-2xl w-[min(24rem,calc(100vw-5.5rem))]">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] m-0">
          WanderSync
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1 text-xs">
          Your global travel footprint
        </p>

        <div className="mt-3 md:mt-4 flex items-center gap-2 flex-wrap">
          {/* Globe / Flat Map toggle */}
          <button
            onClick={() => setIsGlobeView(!isGlobeView)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isGlobeView
                ? "bg-teal-500/15 text-teal-400 border border-teal-500/20"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {isGlobeView ? "🌍 Globe" : "🗺️ Flat Map"}
          </button>

          {/* Heatmap toggle */}
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              showHeatmap
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {showHeatmap ? "🔥 Heatmap On" : "Heatmap Off"}
          </button>

          <span className="text-xs text-[var(--color-text-secondary)] opacity-60">
            {globalPaths?.features?.length || 0} Trips
          </span>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-bg)]/50 backdrop-blur-sm">
          <div className="glass px-6 py-3 rounded-full text-sm font-medium text-[var(--color-text)] animate-pulse">
            Loading geographical data...
          </div>
        </div>
      )}

      {/* Main Map Rendering */}
      <div className="w-full h-full">
        <MapView
          heatmapData={heatmapData}
          showHeatmap={showHeatmap}
          globalPaths={globalPaths}
          spinGlobe={isGlobeView}
        />
      </div>
    </div>
  );
}
