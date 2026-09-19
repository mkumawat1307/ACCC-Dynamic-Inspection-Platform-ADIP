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

export interface FullAddress {
  address: GeocodedAddress;
  formatted: string;
}

export const MAX_ADDRESS_LINE_LENGTH = 44;

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

function isAdminDivisionPart(part: string): boolean {
  return /(^|\s)(division|subdivision|tehsil)$/i.test(part.trim());
}

function buildCompactAddressLines(address: GeocodedAddress): string[] {
  const clean = (s?: string | null) => (s ? stripPlusCode(s).trim() : "");

  const streetNumber = clean(address.streetNumber);
  const street = clean(address.street);
  const streetLine = streetNumber && street ? `${streetNumber} ${street}` : street;

  const area = clean(address.district) || clean(address.name) || streetLine || "";
  const subregion = clean(address.subregion);
  const city = clean(address.city);
  const state = clean(address.region);
  const postal = clean(address.postalCode);

  const parts = [area, subregion, city].filter(Boolean);
  const meaningful = parts.filter((p) => !isAdminDivisionPart(p));
  const kept = meaningful.length > 0 ? meaningful : parts;
  const deduped = kept.filter(
    (p, i) => kept.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i
  );

  const lines: string[] = [];
  const line1 = deduped.slice(0, 2).join(", ");
  if (line1) lines.push(line1);
  const line2 = [state, postal].filter(Boolean).join(" ");
  if (line2) lines.push(line2);
  return lines;
}

export function formatAddressLines(address: GeocodedAddress | null): string[] {
  if (!address) return [];

  const clean = (s?: string | null) => (s ? stripPlusCode(s).trim() : "");

  const houseNumber = clean(address.streetNumber) || clean(address.street);
  const locality = firstUsableAddressPart(
    [
      clean(address.district),
      clean(address.name),
      clean(address.street),
      clean(address.subregion),
    ],
    [houseNumber]
  );
  const district = firstUsableAddressPart(
    [clean(address.city), clean(address.subregion), clean(address.district)],
    [houseNumber, locality]
  );
  const state = firstUsableAddressPart(
    [clean(address.region)],
    [houseNumber, locality, district]
  );

  const line1 = [houseNumber, locality].filter(Boolean).join(", ");
  const line2 = [district, state].filter(Boolean).join(", ");
  return [line1, line2].filter(Boolean);
}

// Picks the first usable address component for a watermark slot. Skips empty
// values, administrative divisions (e.g. "Jaipur division", "Sikar Tehsil")
// and any value already used by an earlier slot, so missing/duplicated fields
// never produce duplicate commas.
function firstUsableAddressPart(candidates: string[], used: string[]): string {
  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value) continue;
    if (isAdminDivisionPart(value)) continue;
    if (used.some((u) => u && u.toLowerCase() === value.toLowerCase())) continue;
    return value;
  }
  return "";
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<FullAddress | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!results || results.length === 0) return null;
    const address = results[0];
    const formatted = buildFullFormattedAddress(address);
    return { address, formatted };
  } catch {
    return null;
  }
}

function buildFullFormattedAddress(address: GeocodedAddress): string {
  const clean = (s?: string | null) => (s ? stripPlusCode(s).trim() : "");

  const streetNumber = clean(address.streetNumber);
  const street = clean(address.street);
  const streetLine = streetNumber && street ? `${streetNumber} ${street}` : street;

  const components = [
    streetLine,
    clean(address.name),
    clean(address.subregion),
    clean(address.district),
    clean(address.city),
    clean(address.region),
    clean(address.postalCode),
    clean(address.country),
  ].filter(Boolean);

  const deduped = components.filter(
    (p, i) => components.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i
  );

  const complete = deduped.join(", ");
  return complete || buildCompactAddressLines(address).join(", ");
}
