import * as Location from "expo-location";

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isLocationFresh(
  timestamp: number,
  nowMs: number,
  staleMs: number
): boolean {
  return nowMs - timestamp < staleMs;
}

export interface ReverseGeocodeResult {
  label: string;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!results || results.length === 0) return null;
    const first = results[0];
    const parts = [first.street, first.city, first.region].filter(Boolean) as string[];
    if (parts.length === 0) return null;
    return { label: parts.join(", ") };
  } catch {
    return null;
  }
}
