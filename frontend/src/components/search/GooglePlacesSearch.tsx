"use client";

/**
 * GooglePlacesSearch
 *
 * Shared autocomplete input backed by Google Places (legacy AutocompleteService
 * + PlacesService). Replaces the bespoke Mapbox Searchbox blocks scattered
 * around the app.
 *
 * Free-tier discipline:
 *   • AutocompleteService (Essentials) — 10K/mo free
 *   • PlacesService.getDetails with a fixed Essentials field list — 10K/mo free
 *   • No photos, no reviews, no Pro fields are requested.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isAirportType, loadGoogleMaps } from "@/lib/googleMapsLoader";
import type { GooglePlaceResult } from "@/types";

type GooglePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

interface GooglePlacesSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: GooglePlaceResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Optional CSS classes for the input element only. */
  inputClassName?: string;
  /** Optional positioning of the suggestion dropdown. Defaults to "below". */
  suggestionsPosition?: "below" | "above";
  /** Optional autoFocus on mount. */
  autoFocus?: boolean;
  /** Optional explicit z-index for the suggestions popup. */
  suggestionsZIndex?: number;
}

const DEFAULT_INPUT =
  "w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-[var(--color-text-secondary)]/50";

export default function GooglePlacesSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Search address, place, or city…",
  className = "",
  disabled = false,
  inputClassName,
  suggestionsPosition = "below",
  autoFocus = false,
  suggestionsZIndex = 50,
}: GooglePlacesSearchProps) {
  const [predictions, setPredictions] = useState<GooglePrediction[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const detailsRef = useRef<google.maps.places.PlacesService | null>(null);
  const dummyDivRef = useRef<HTMLDivElement | null>(null);
  /** Set to true for one render cycle after a suggestion is picked, so we
   *  don't immediately fetch new suggestions for the value we just stuffed
   *  back into the input. */
  const skipNextFetchRef = useRef(false);

  // Load Google Maps once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled) return;
        acRef.current = new g.maps.places.AutocompleteService();
        const div = dummyDivRef.current ?? document.createElement("div");
        dummyDivRef.current = div;
        detailsRef.current = new g.maps.places.PlacesService(div);
        setReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load Google Maps");
      });
    return () => { cancelled = true; };
  }, []);

  // Debounced predictions
  useEffect(() => {
    if (!ready || !acRef.current) return;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setPredictions([]);
      return;
    }

    const handle = window.setTimeout(() => {
      acRef.current!.getPlacePredictions(
        { input: value },
        (res, status) => {
          // status comes back as a string enum; treat anything not OK as empty
          if (status !== google.maps.places.PlacesServiceStatus.OK || !res) {
            setPredictions([]);
            return;
          }
          setPredictions(res as unknown as GooglePrediction[]);
        }
      );
    }, 250);

    return () => window.clearTimeout(handle);
  }, [value, ready]);

  const pick = useCallback(
    (p: GooglePrediction) => {
      if (!detailsRef.current) return;
      detailsRef.current.getDetails(
        {
          placeId: p.place_id,
          // Essentials only — keeps usage in the free tier
          fields: ["formatted_address", "name", "geometry", "types", "place_id", "url"],
        },
        (place, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place?.geometry?.location
          ) {
            setError("Failed to retrieve place details.");
            return;
          }
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const address = place.formatted_address || p.description;
          const types = (place.types as string[] | undefined) ?? [];
          const result: GooglePlaceResult = {
            name: place.name || p.structured_formatting?.main_text || address,
            address,
            lat,
            lng,
            place_id: place.place_id || p.place_id,
            types,
            is_airport: isAirportType(types),
            google_url: place.url,
          };
          skipNextFetchRef.current = true;
          setPredictions([]);
          onChange(result.name);
          onSelect(result);
        }
      );
    },
    [onChange, onSelect]
  );

  const showAbove = suggestionsPosition === "above";

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        className={inputClassName ?? DEFAULT_INPUT}
        placeholder={ready ? placeholder : "Loading search…"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !ready}
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter" && predictions.length > 0) {
            e.preventDefault();
            pick(predictions[0]);
          }
        }}
      />

      {error && (
        <p className="text-[10px] text-red-400 mt-1.5">{error}</p>
      )}

      {predictions.length > 0 && (
        <ul
          className={`absolute left-0 right-0 ${showAbove ? "bottom-full mb-1" : "top-full mt-1"} rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl max-h-72 overflow-y-auto custom-scrollbar`}
          style={{ zIndex: suggestionsZIndex }}
        >
          {predictions.slice(0, 8).map((p) => (
            <li
              key={p.place_id}
              className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors border-b border-[var(--color-border)] last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <span className="block font-medium truncate">
                {p.structured_formatting?.main_text || p.description}
              </span>
              <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate">
                {p.structured_formatting?.secondary_text || ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Reverse-geocode a coordinate pair to a human-readable place name using
 * Google Places (Essentials).
 *
 * Returns null on failure — caller should fall back to a coord string.
 */
export async function googleReverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const g = await loadGoogleMaps();
    return await new Promise<string | null>((resolve) => {
      const geocoder = new g.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          resolve(results[0].formatted_address);
        } else {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
}
