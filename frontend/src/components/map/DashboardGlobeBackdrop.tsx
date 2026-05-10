"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => null,
});

/** Decorative spinning globe for the trips dashboard — non-interactive, low opacity. */
export default function DashboardGlobeBackdrop() {
  return (
    <div className="h-full w-full min-h-[320px] [&_.mapboxgl-ctrl]:!hidden" aria-hidden>
      <MapView spinGlobe mapInteractive={false} className="h-full w-full" />
    </div>
  );
}
