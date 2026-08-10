import * as Location from "expo-location";
import { logger } from "@/src/utils/logger";

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

export const RAJASTHAN_DIVISIONS: Record<string, string> = {
  Ajmer: "Ajmer Division",
  Beawar: "Ajmer Division",
  Bhilwara: "Ajmer Division",
  "Didwana-Kuchaman": "Ajmer Division",
  Nagaur: "Ajmer Division",
  Tonk: "Ajmer Division",
  Bharatpur: "Bharatpur Division",
  Deeg: "Bharatpur Division",
  Dholpur: "Bharatpur Division",
  Karauli: "Bharatpur Division",
  "Sawai Madhopur": "Bharatpur Division",
  Bikaner: "Bikaner Division",
  Churu: "Bikaner Division",
  Hanumangarh: "Bikaner Division",
  "Sri Ganganagar": "Bikaner Division",
  Alwar: "Jaipur Division",
  Dausa: "Jaipur Division",
  Jaipur: "Jaipur Division",
  Jhunjhunu: "Jaipur Division",
  "Khairthal-Tijara": "Jaipur Division",
  "Kotputli-Behror": "Jaipur Division",
  Sikar: "Jaipur Division",
  Balotra: "Jodhpur Division",
  Barmer: "Jodhpur Division",
  Jaisalmer: "Jodhpur Division",
  Jalore: "Jodhpur Division",
  Jodhpur: "Jodhpur Division",
  Pali: "Jodhpur Division",
  Phalodi: "Jodhpur Division",
  Sirohi: "Jodhpur Division",
  Baran: "Kota Division",
  Bundi: "Kota Division",
  Jhalawar: "Kota Division",
  Kota: "Kota Division",
  Banswara: "Udaipur Division",
  Chittorgarh: "Udaipur Division",
  Dungarpur: "Udaipur Division",
  Pratapgarh: "Udaipur Division",
  Rajsamand: "Udaipur Division",
  Salumber: "Udaipur Division",
  Udaipur: "Udaipur Division",
};

export function formatAddressLines(address: GeocodedAddress | null): string[] {
  if (!address) return [];

  const locality =
    address.district?.trim() || address.name?.trim() || address.city?.trim() || "";
  const district = address.subregion?.trim() || address.city?.trim() || "";
  const division = district ? RAJASTHAN_DIVISIONS[district] ?? "" : "";
  const state = address.region?.trim() || "";

  // Apply stripPlusCode and dedupe while preserving original position
  const clean = (s: string) => stripPlusCode(s).trim();
  const hasLocality = Boolean(locality);
  const hasDistrict = Boolean(district);
  const hasState = Boolean(state);

  const lines: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string, condition: boolean) => {
    if (!condition) return;
    const part = clean(raw);
    if (!part) return;
    const key = part.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(part);
  };

  if (hasLocality) {
    // Line 1: locality
    add(locality, true);
    // Line 2: district + division
    const mid = [district, division].filter(Boolean).join(" ");
    add(mid, true);
    // Line 3: state
    add(state, true);
  } else if (hasDistrict) {
    // No locality: line 1 = district + division, line 2 = state
    const mid = [district, division].filter(Boolean).join(" ");
    add(mid, true);
    add(state, true);
  } else if (hasState) {
    // Only state
    add(state, true);
  }

  return lines;
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
    if (__DEV__) {
      logger.debug(`[Geo:reverse] lat=${latitude} lon=${longitude}`);
      logger.debug(`[Geo:reverse] address=${formatted}`);
    }
    return { address, formatted };
  } catch {
    return null;
  }
}

function buildFullFormattedAddress(address: GeocodedAddress): string {
  const parts: string[] = [];

  // name / building / featureName
  if (address.name?.trim()) parts.push(address.name.trim());

  // street / road
  const streetNumber = address.streetNumber?.trim() ?? "";
  const street = address.street?.trim() ?? "";
  if (streetNumber && street) parts.push(`${streetNumber} ${street}`);
  else if (street) parts.push(street);

  // subregion / area (subAdminArea - district level on Android)
  if (address.subregion?.trim()) parts.push(address.subregion.trim());

  // city / locality
  if (address.city?.trim()) parts.push(address.city.trim());

  // district (from expo-location's district = subLocality)
  if (address.district?.trim()) parts.push(address.district.trim());

  // state / region
  if (address.region?.trim()) parts.push(address.region.trim());

  // postal code
  if (address.postalCode?.trim()) parts.push(address.postalCode.trim());

  // country
  if (address.country?.trim()) parts.push(address.country.trim());

  return parts.join(", ");
}
