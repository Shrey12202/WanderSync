"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => null,
});

/** Decorative globe — uses the same `MapView` + fog as the Map tab’s globe (not a second map “mode”). */
export default function DashboardGlobeBackdrop() {
  return (
    <div className="h-full w-full min-h-[320px] [&_.mapboxgl-ctrl]:!hidden" aria-hidden>
      <MapView spinGlobe mapInteractive={false} className="h-full w-full" />
    </div>
  );
}
