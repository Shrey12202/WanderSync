"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTrip, createDay, createStop } from "@/lib/api";
import type { CreateTripRequest } from "@/types";

interface ItineraryStop {
  name: string;
  latitude: number;
  longitude: number;
}

const TITLE_MAX = 100;
const DESC_MAX = 500;

export default function TripForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sessionTokenRef = useRef(crypto.randomUUID());
  const [form, setForm] = useState<CreateTripRequest>({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
  });

  // Itinerary builder state
  const [stops, setStops] = useState<ItineraryStop[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    if (searchQuery.length > 2) {
      const fetchPlaces = async () => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
          const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(searchQuery)}&session_token=${sessionTokenRef.current}&access_token=${token}`);
          const data = await res.json();
          if (data.suggestions) setSuggestions(data.suggestions);
        } catch (e) {
          console.error("Geocoding error:", e);
        }
      };
      const timeoutId = setTimeout(fetchPlaces, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Trip title is required");
      return;
    }

    // Bug 7 — enforce char limits
    if (form.title.length > TITLE_MAX) {
      setError(`Title must be ${TITLE_MAX} characters or fewer`);
      return;
    }
    if ((form.description?.length ?? 0) > DESC_MAX) {
      setError(`Description must be ${DESC_MAX} characters or fewer`);
      return;
    }

    // Bug 6 — date order validation
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      setError("Start date cannot be after the end date.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Create Trip
      const trip = await createTrip({
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      });

      // 2. Add Stops if any exist in the Rapid Itinerary Builder
      if (stops.length > 0) {
        // Create an initial day wrapper
        const day = await createDay(trip.id, {
          day_number: 1,
          title: "Day 1",
        });

        // Loop array and aggressively create chronological stops
        for (let i = 0; i < stops.length; i++) {
          await createStop(day.id, {
            name: stops[i].name,
            latitude: stops[i].latitude,
            longitude: stops[i].longitude,
            sequence_order: i,
          });
        }
      }

      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
      setLoading(false);
    }
  };

  const removeStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder:text-[var(--color-text-secondary)]/50";

  const counterClass = "text-right text-[10px] mt-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in w-full max-w-2xl mx-auto">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Basic Trip Details */}
      <div className="glass p-6 rounded-2xl space-y-4">
        <h3 className="text-lg font-bold text-[var(--color-text)] m-0">Trip Basics</h3>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Trip Title *
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder="e.g., Eurotrip 2026"
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          {/* Bug 7 — character counter */}
          <p className={`${counterClass} ${form.title.length >= TITLE_MAX ? "text-red-400" : "text-[var(--color-text-secondary)]"}`}>
            {form.title.length} / {TITLE_MAX}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Description
          </label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            placeholder="What's the vibe?"
            value={form.description}
            maxLength={DESC_MAX}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {/* Bug 7 — character counter */}
          <p className={`${counterClass} ${(form.description?.length ?? 0) >= DESC_MAX ? "text-red-400" : "text-[var(--color-text-secondary)]"}`}>
            {form.description?.length ?? 0} / {DESC_MAX}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Start Date
            </label>
            <input
              type="date"
              className={inputClass}
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              End Date
            </label>
            <input
              type="date"
              className={inputClass}
              value={form.end_date}
              /* Bug 6 — end date must be >= start date */
              min={form.start_date || undefined}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
        </div>
        {/* Bug 6 — inline date error */}
        {form.start_date && form.end_date && form.start_date > form.end_date && (
          <p className="text-red-400 text-xs flex items-center gap-1">
            ⚠️ End date cannot be before the start date.
          </p>
        )}
      </div>

      {/* Rapid Itinerary Builder */}
      <div className="glass p-6 rounded-2xl space-y-4 border-amber-500/20 border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--color-text)] m-0 text-amber-500">Rapid Itinerary</h3>
          <span className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] px-2 py-1 rounded-md">Optional</span>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] m-0">Sequence destinations now, or add them on the map later!</p>
        
        {stops.length > 0 && (
          <ul className="space-y-2 mt-4 mb-4">
            {stops.map((s, i) => (
              <li key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <button type="button" onClick={() => removeStop(i)} className="text-red-400 hover:text-red-300 text-xs px-2">Remove</button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative mt-2">
          <input
            type="text"
            className={`${inputClass} !border-amber-500/30 placeholder:text-amber-500/40`}
            placeholder="Search for a specific place, business, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {suggestions.length > 0 && (
            <ul className="absolute bottom-full mb-1 z-10 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg max-h-48 overflow-y-auto shadow-xl custom-scrollbar left-0">
              {suggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer truncate transition-colors"
                  onClick={async () => {
                    try {
                      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
                      const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?session_token=${sessionTokenRef.current}&access_token=${token}`);
                      const data = await res.json();
                      if (data.features && data.features.length > 0) {
                        const feature = data.features[0];
                        setStops([...stops, {
                          name: suggestion.name || feature.properties.name || suggestion.full_address,
                          longitude: feature.geometry.coordinates[0],
                          latitude: feature.geometry.coordinates[1],
                        }]);
                        setSearchQuery("");
                        setSuggestions([]);
                        // Reset session token after successful retrieval
                        sessionTokenRef.current = crypto.randomUUID();
                      }
                    } catch (e) {
                      console.error("Retrieve error:", e);
                    }
                  }}
                >
                  <span className="font-medium block truncate">{suggestion.name || suggestion.full_address}</span>
                  <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                    {suggestion.full_address || suggestion.place_formatted}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={loading || !!(form.start_date && form.end_date && form.start_date > form.end_date)}
          className="flex-1 px-6 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a0e1a] font-bold text-base hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 transition-all duration-200 shadow-xl shadow-amber-500/20"
        >
          {loading ? "Constructing Journey..." : `Create Trip with ${stops.length} Stops`}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-4 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-[var(--color-surface-hover)] transition-all font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
