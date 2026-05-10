"use client";

/**
 * GooglePlacesSearch
 *
 * Shared autocomplete input backed by Google Places (legacy AutocompleteService
 * + PlacesService). Replaces the bespoke Mapbox Searchbox blocks scattered
 * around the app.
 *
 * Map pin picker (“Drop a pin…”) is on by default everywhere this component is used
 * (profile home, new trip itinerary, trip Add Stop, media location, uploads). Pass
 * `showMapPinPicker={false}` to hide it.
 *
 * Free-tier discipline:
 *   • AutocompleteService (Essentials) — 10K/mo free
 *   • PlacesService.getDetails with a fixed Essentials field list — 10K/mo free
 *   • No photos, no reviews, no Pro fields are requested.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAirportType, loadGoogleMaps } from "@/lib/googleMapsLoader";
import type { GooglePlaceResult, HomeLocation } from "@/types";

const MapPinPickerModal = dynamic(() => import("@/components/map/MapPinPickerModal"), {
  ssr: false,
});

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
  /** Profile “home” rows — shown first when the query matches the start of the label or address */
  homeLocations?: HomeLocation[];
  /** When true, show “Drop a pin” to set lat/lng on a map if Google has no good match */
  showMapPinPicker?: boolean;
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
  homeLocations,
  showMapPinPicker = true,
}: GooglePlacesSearchProps) {
  const [predictions, setPredictions] = useState<GooglePrediction[]>([]);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const detailsRef = useRef<google.maps.places.PlacesService | null>(null);
  const dummyDivRef = useRef<HTMLDivElement | null>(null);
  /** Set to true for one render cycle after a suggestion is picked, so we
   *  don't immediately fetch new suggestions for the value we just stuffed
   *  back into the input. */
  const skipNextFetchRef = useRef(false);

  const homeMatches = useMemo(() => {
    if (!homeLocations?.length) return [];
    const q = value.trim().toLowerCase();
    if (q.length < 1) return [];
    return homeLocations
      .filter((h) => {
        if (h.latitude == null || h.longitude == null) return false;
        const addr = h.address.toLowerCase();
        const lab = (h.label || "").toLowerCase();
        return addr.startsWith(q) || lab.startsWith(q);
      })
      .slice(0, 4);
  }, [homeLocations, value]);

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

  const pickFromMap = useCallback(
    (place: GooglePlaceResult) => {
      skipNextFetchRef.current = true;
      setPredictions([]);
      onChange(place.name);
      onSelect(place);
    },
    [onChange, onSelect]
  );

  const pickHome = useCallback(
    (h: HomeLocation) => {
      if (h.latitude == null || h.longitude == null) return;
      const result: GooglePlaceResult = {
        name: h.label?.trim() || "Home",
        address: h.address,
        lat: h.latitude,
        lng: h.longitude,
        place_id: `saved_home:${h.id}`,
        types: [],
        is_airport: false,
      };
      skipNextFetchRef.current = true;
      setPredictions([]);
      onChange(result.name);
      onSelect(result);
    },
    [onChange, onSelect]
  );

  const showAbove = suggestionsPosition === "above";
  const googleSlots = Math.max(0, 8 - homeMatches.length);
  const hasGoogleList = value.trim().length >= 3 && predictions.length > 0;
  const showDropdown = homeMatches.length > 0 || hasGoogleList;

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
          if (e.key === "Enter" && (homeMatches.length > 0 || predictions.length > 0)) {
            e.preventDefault();
            if (homeMatches.length > 0) pickHome(homeMatches[0]);
            else pick(predictions[0]);
          }
        }}
      />

      {error && (
        <p className="text-[10px] text-red-400 mt-1.5">{error}</p>
      )}

      {showMapPinPicker && ready && (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPinModalOpen(true)}
            className="mt-1.5 text-left text-[11px] text-teal-500/90 hover:text-teal-400 font-medium underline-offset-2 hover:underline disabled:opacity-40"
          >
            No Google result? Drop a pin on the map (lat / long only)
          </button>
          <MapPinPickerModal
            open={pinModalOpen}
            onClose={() => setPinModalOpen(false)}
            onPicked={(place) => {
              pickFromMap(place);
              setPinModalOpen(false);
            }}
          />
        </>
      )}

      {showDropdown && (
        <ul
          className={`absolute left-0 right-0 ${showAbove ? "bottom-full mb-1" : "top-full mt-1"} rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl max-h-72 overflow-y-auto custom-scrollbar`}
          style={{ zIndex: suggestionsZIndex }}
        >
          {homeMatches.map((h) => (
            <li
              key={`saved-home-${h.id}`}
              className="px-3 py-2 text-xs text-[var(--color-text)] hover:bg-amber-500/10 cursor-pointer transition-colors border-b border-[var(--color-border)]"
              onMouseDown={(e) => {
                e.preventDefault();
                pickHome(h);
              }}
            >
              <span className="flex items-center gap-1.5 font-medium truncate min-w-0">
                <span className="shrink-0" aria-hidden>🏠</span>
                <span className="truncate min-w-0">{h.label?.trim() || "Home"}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-500/90 shrink-0 hidden sm:inline">Your place</span>
              </span>
              <span className="block text-[10px] text-[var(--color-text-secondary)] mt-0.5 truncate pl-6">
                {h.address}
              </span>
            </li>
          ))}
          {value.trim().length >= 3 &&
            predictions.slice(0, googleSlots).map((p) => (
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
