/**
 * Tiny GPX parser — pure browser DOMParser, no dependencies.
 *
 * Why this exists: web pages can't reliably record long walks (mobile browsers
 * suspend geolocation when the page is hidden), so we let users record their
 * walks with whatever tracker they already use — Apple Fitness, Strava,
 * Garmin, Komoot, AllTrails — and import the resulting .gpx file here.
 *
 * Tolerates:
 *   - Files using either `<trkpt>` (track points) or `<rtept>` (route points)
 *   - Multiple `<trkseg>` segments (joined into one continuous track)
 *   - Optional `<time>` elements; if missing we infer 0 duration
 *   - Different XML namespaces (we read elements by local name)
 */

interface LatLng {
  lat: number;
  lng: number;
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}

export interface ParsedGpx {
  /** Track name from `<trk><name>` or `<metadata><name>`, if present. */
  name?: string;
  /** [lng, lat] pairs in track order — same shape as MapBox / our backend. */
  coordinates: [number, number][];
  /** ISO timestamp of the first point (if `<time>` was present). */
  startTime?: string;
  /** ISO timestamp of the last point (if `<time>` was present). */
  endTime?: string;
  /** Total walked distance in metres (haversine). */
  distanceM: number;
  /** Wall-clock duration in seconds, computed from first→last point time. */
  durationS: number;
}

export async function parseGpxFile(file: File): Promise<ParsedGpx> {
  if (!/\.gpx$/i.test(file.name)) {
    // We don't reject outright in case a phone has saved with the wrong extension
    // (e.g. iCloud sometimes drops .gpx) — but we warn the parser to be strict.
  }
  const text = await file.text();
  return parseGpxString(text);
}

export function parseGpxString(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Couldn't read this file — make sure it's a valid GPX (XML).");
  }

  // GPX exports use varying namespaces, so we find points by local tag name
  // rather than CSS-querying with a namespace prefix.
  let points = Array.from(doc.getElementsByTagName("trkpt"));
  if (points.length === 0) {
    points = Array.from(doc.getElementsByTagName("rtept"));
  }
  if (points.length === 0) {
    throw new Error("This GPX file has no track or route points.");
  }

  const coordinates: [number, number][] = [];
  const times: number[] = [];
  let distanceM = 0;

  for (const pt of points) {
    const lat = parseFloat(pt.getAttribute("lat") || "");
    const lng = parseFloat(pt.getAttribute("lon") || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    coordinates.push([lng, lat]);

    const timeEl = pt.getElementsByTagName("time")[0];
    if (timeEl?.textContent) {
      const t = Date.parse(timeEl.textContent);
      if (!Number.isNaN(t)) times.push(t);
    }

    if (coordinates.length >= 2) {
      const prev = coordinates[coordinates.length - 2];
      distanceM += haversineM(
        { lat: prev[1], lng: prev[0] },
        { lat, lng },
      );
    }
  }

  if (coordinates.length === 0) {
    throw new Error("GPX file has no usable coordinates.");
  }

  const trkName =
    doc.getElementsByTagName("trk")[0]?.getElementsByTagName("name")[0]?.textContent?.trim();
  const metaName =
    doc.getElementsByTagName("metadata")[0]?.getElementsByTagName("name")[0]?.textContent?.trim();
  const name = trkName || metaName || undefined;

  const start = times[0];
  const end = times[times.length - 1];
  const durationS = start && end && end > start ? Math.floor((end - start) / 1000) : 0;

  return {
    name,
    coordinates,
    startTime: start ? new Date(start).toISOString() : undefined,
    endTime: end ? new Date(end).toISOString() : undefined,
    distanceM,
    durationS,
  };
}
