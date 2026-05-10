"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getTrips, getAllMedia, getAllStopsMap } from "@/lib/api";
import type { GeoJSONFeatureCollection, TripSummary } from "@/types";
import TripCard from "@/components/trips/TripCard";
import Link from "next/link";
import { useHomeLocations } from "@/context/HomeLocationsContext";

const DashboardMap = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[220px] bg-[var(--color-surface)] animate-pulse flex items-center justify-center rounded-2xl">
      <span className="text-[var(--color-text-secondary)] text-sm">Loading map…</span>
    </div>
  ),
});

const GlobeBackdrop = dynamic(() => import("@/components/map/DashboardGlobeBackdrop"), {
  ssr: false,
  loading: () => null,
});

export default function TripsDashboard() {
  const { homeLocations } = useHomeLocations();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  const [stopsMap, setStopsMap] = useState<GeoJSONFeatureCollection | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [tripsData, allMedia, stopsData] = await Promise.all([
          getTrips(),
          getAllMedia().catch(() => []),
          getAllStopsMap().catch((e) => {
            console.warn("Dashboard: all-stops-map failed", e);
            return null;
          }),
        ]);
        setStopsMap(stopsData);
        setTrips(
          [...tripsData].sort((a, b) => {
            const aTime = Date.parse(a.start_date ?? a.end_date ?? a.created_at);
            const bTime = Date.parse(b.start_date ?? b.end_date ?? b.created_at);
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          })
        );
        setTotalMediaCount(allMedia.length);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
        setStopsMap(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalStops = trips.reduce((sum, t) => sum + t.stop_count, 0);

  const refreshAfterTripChange = () => {
    setLoading(true);
    Promise.all([
      getTrips(),
      getAllMedia().catch(() => []),
      getAllStopsMap().catch((e) => {
        console.warn("Dashboard: all-stops-map failed", e);
        return null;
      }),
    ])
      .then(([t, m, s]) => {
        setTrips(
          [...t].sort((a, b) => {
            const aTime = Date.parse(a.start_date ?? a.end_date ?? a.created_at);
            const bTime = Date.parse(b.start_date ?? b.end_date ?? b.created_at);
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          })
        );
        setTotalMediaCount(m.length);
        setStopsMap(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  return (
    <div className="relative isolate min-h-full">
      {/* Decorative spinning globe — main column only on desktop */}
      <div
        className="pointer-events-none fixed inset-y-0 right-0 z-0 left-0 lg:left-[280px] opacity-[0.26] sm:opacity-[0.30] md:opacity-[0.34]"
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-br from-sky-950/20 via-transparent to-amber-950/18" />
        <div className="absolute inset-0 -top-[10%] h-[120%] min-h-[480px]">
          <GlobeBackdrop />
        </div>
      </div>

      <div className="relative z-10 p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text)] m-0 tracking-tight">
              Trips Dashboard
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-1.5 text-sm leading-relaxed">
              Manage and view your travel experiences
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/trips/record"
              className="px-4 py-2.5 rounded-xl bg-[var(--color-surface)] text-amber-400 border border-amber-500/30 font-semibold text-sm no-underline hover:bg-amber-500/10 transition-all flex items-center gap-2"
              title="Record a live walk with your phone's GPS"
            >
              <span className="text-base">🚶</span> Record Walk
            </Link>
            <Link
              href="/trips/new"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a0e1a] font-semibold text-sm no-underline hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/25"
            >
              + New Trip
            </Link>
          </div>
        </div>

        <div className="relative h-[min(22rem,42vh)] w-full rounded-2xl overflow-hidden border border-[var(--color-border)] mb-8 shadow-xl shadow-black/25 ring-1 ring-white/[0.04]">
          <div className="pointer-events-none absolute bottom-2 left-2 z-[5] rounded-lg bg-black/45 backdrop-blur-sm border border-white/10 px-2 py-1 text-[10px] font-medium text-white/90 tracking-wide">
            All stops · tap a dot
          </div>
          <DashboardMap
            allStopsScatter={stopsMap}
            homeMarkers={homeLocations}
            spinGlobe={false}
            className="h-full min-h-[220px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Trips", value: trips.length, icon: "✈️" },
            { label: "Stops", value: totalStops, icon: "📍" },
            { label: "Photos", value: totalMediaCount, icon: "📷" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass rounded-2xl p-5 animate-fade-in transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{stat.icon}</span>
                <div>
                  <p className="text-2xl font-bold text-[var(--color-text)] m-0">{stat.value}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] m-0">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)] m-0 mb-4">Your Trips</h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-72 rounded-2xl bg-[var(--color-surface)] animate-pulse border border-[var(--color-border)]"
                />
              ))}
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-16 glass rounded-2xl border border-[var(--color-border)]/80">
              <span className="text-5xl block mb-4">🌍</span>
              <p className="text-[var(--color-text)] font-semibold text-lg">No trips yet</p>
              <p className="text-[var(--color-text-secondary)] text-sm mt-1 mb-4">
                Start documenting your travels
              </p>
              <Link
                href="/trips/new"
                className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a0e1a] font-semibold text-sm no-underline"
              >
                Create Your First Trip
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} onTripUpdate={refreshAfterTripChange} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
