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

export type GeocodedAddress = Location.LocationGeocodedAddress;

export const MAX_ADDRESS_LINE_LENGTH = 44;
export const MAX_ADDRESS_LINES = 3;

export function truncateAddressLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= MAX_ADDRESS_LINE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_ADDRESS_LINE_LENGTH - 3)}...`;
}

export function formatAddressLines(address: GeocodedAddress | null): string[] {
  if (!address) return [];

  const streetNumber = address.streetNumber?.trim() ?? "";
  const street = address.street?.trim() ?? "";
  const road = (streetNumber && street ? `${streetNumber} ${street}` : street) || "";
  const line1 = address.name?.trim() || road;

  const area = address.subregion?.trim() || address.district?.trim() || "";

  const city = address.city?.trim() || "";
  const region = address.region?.trim() || "";
  const place = city && region ? `${city}, ${region}` : city || region;

  const lines: string[] = [];
  for (const raw of [line1, area, place]) {
    const t = raw.trim();
    if (!t) continue;
    lines.push(truncateAddressLine(t));
    if (lines.length === MAX_ADDRESS_LINES) break;
  }
  return lines;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodedAddress | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!results || results.length === 0) return null;
    return results[0];
  } catch {
    return null;
  }
}
