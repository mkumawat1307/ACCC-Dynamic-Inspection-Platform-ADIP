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
  const lines = buildCompactAddressLines(address);
  if (__DEV__) {
    logger.debug(
      `[Geo:format] raw district=${address.district} subregion=${address.subregion} city=${address.city} region=${address.region} => lines=${JSON.stringify(lines)}`
    );
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
  const result = buildCompactAddressLines(address).join("\n");
  if (__DEV__) {
    logger.debug(`[Geo:reverse] cleaned=${result}`);
  }
return result;
}
