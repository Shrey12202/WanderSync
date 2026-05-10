import { loadGoogleMaps } from "@/lib/googleMapsLoader";

/**
 * Reverse-geocode a coordinate pair using Google Geocoder (Essentials).
 * Returns null on failure — caller may fall back to a coord string.
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
