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

function stripPlusCode(text: string): string {
  return text
    .trim()
    .replace(/^[A-Za-z0-9]+\+[A-Za-z0-9]+(?:\s+|$)/, "")
    .trim();
}

export function formatAddressLines(address: GeocodedAddress | null): string[] {
  if (!address) return [];

  const parts: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string): void => {
    const cleaned = stripPlusCode(raw);
    const t = truncateAddressLine(cleaned);
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(t);
  };

  const streetNumber = address.streetNumber?.trim() ?? "";
  const street = address.street?.trim() ?? "";
  const road = (streetNumber && street ? `${streetNumber} ${street}` : street) || "";
  const name = address.name?.trim() ?? "";
  const nameOrRoad = stripPlusCode(name) || road;
  add(nameOrRoad);

  const district = address.district?.trim() ?? "";
  const subregion = address.subregion?.trim() ?? "";
  const city = address.city?.trim() ?? "";
  const region = address.region?.trim() ?? "";

  add(district);
  add(city);
  if (subregion && !/division$/i.test(subregion)) add(subregion);
  if (!city) add(region);

  return parts.slice(0, MAX_ADDRESS_LINES);
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
