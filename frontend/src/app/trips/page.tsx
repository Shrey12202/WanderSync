"use client";

import { useEffect, useState } from "react";
import { getTrips, getAllMedia } from "@/lib/api";
import type { TripSummary } from "@/types";
import TripCard from "@/components/trips/TripCard";
import Link from "next/link";

export default function TripsDashboard() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMediaCount, setTotalMediaCount] = useState(0); // Bug 3 — true total incl. standalone

  useEffect(() => {
    async function load() {
      try {
        // Bug 3 — fetch trips AND all media concurrently so photo count includes standalones
        const [tripsData, allMedia] = await Promise.all([
          getTrips(),
          getAllMedia().catch(() => []),
        ]);
        // Sort by trip date (start_date/end_date) rather than "last added"
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
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalStops = trips.reduce((sum, t) => sum + t.stop_count, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">
            Trips Dashboard
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
            Manage and view your travel experiences
          </p>
        </div>
        <Link
          href="/trips/new"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a0e1a] font-semibold text-sm no-underline hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
        >
          + New Trip
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Trips", value: trips.length, icon: "✈️", color: "amber" },
          { label: "Stops", value: totalStops, icon: "📍", color: "teal" },
          { label: "Photos", value: totalMediaCount, icon: "📷", color: "purple" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass rounded-2xl p-5 animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stat.icon}</span>
              <div>
                <p className="text-2xl font-bold text-[var(--color-text)] m-0">
                  {stat.value}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] m-0">
                  {stat.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trip grid */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)] m-0 mb-4">
          Your Trips
        </h2>
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
          <div className="text-center py-16 glass rounded-2xl">
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
              <TripCard key={trip.id} trip={trip} onTripUpdate={() => {
                // Reload trips and media count after any change
                setLoading(true);
                Promise.all([getTrips(), getAllMedia().catch(() => [])])
                  .then(([t, m]) => { setTrips(t); setTotalMediaCount(m.length); })
                  .catch(console.error)
                  .finally(() => setLoading(false));
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
