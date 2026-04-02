"use client";

import { useEffect, useState } from "react";
import { getTrips } from "@/lib/api";
import type { TripSummary } from "@/types";
import UploadHandler from "@/components/media/UploadHandler";

export default function UploadPage() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTrips()
      .then((data) => {
        setTrips(data);
        if (data.length > 0) setSelectedTripId(data[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">Upload Media</h1>
        <p className="text-[var(--color-text-secondary)] text-sm mt-1">
          Add photos and videos to your trips
        </p>
      </div>

      {/* Trip selector */}
      <div className="glass rounded-2xl p-6 mb-6">
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
          Select Trip
        </label>
        {loading ? (
          <div className="h-10 rounded-xl bg-[var(--color-bg)] animate-pulse" />
        ) : trips.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No trips found. Create a trip first.
          </p>
        ) : (
          <select
            className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 transition-all"
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
          >
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Upload handler */}
      {selectedTripId && (
        <div className="glass rounded-2xl p-6">
          <UploadHandler
            tripId={selectedTripId}
            onUploadComplete={(media) => {
              console.log("Uploaded:", media);
            }}
          />
        </div>
      )}
    </div>
  );
}
