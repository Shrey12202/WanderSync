/**
 * Singleton Google Maps JS loader.
 *
 * Multiple components share the same script tag so we never load
 * `maps.googleapis.com/maps/api/js` more than once per page.
 *
 * Free-tier discipline: only the `places` library is requested. We avoid the
 * marker, visualization, and routes libraries — none of them are used by the
 * search component (Mapbox handles all map rendering).
 */

let _promise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }

  // Already on window (HMR or another page mounted earlier)
  const existing = (window as unknown as { google?: typeof google }).google;
  if (existing?.maps?.places) return Promise.resolve(existing);

  if (_promise) return _promise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
  }

  _promise = new Promise<typeof google>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const g = (window as unknown as { google?: typeof google }).google;
      if (g?.maps?.places) resolve(g);
      else reject(new Error("Google Maps loaded but Places library is missing"));
    };
    script.onerror = () => {
      _promise = null; // allow retry
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });

  return _promise;
}

/** Helper used by GooglePlacesSearch — true if the place is an airport. */
export function isAirportType(types: string[] | undefined): boolean {
  if (!types || !Array.isArray(types)) return false;
  return types.some((t) => t === "airport" || t === "international_airport");
}
