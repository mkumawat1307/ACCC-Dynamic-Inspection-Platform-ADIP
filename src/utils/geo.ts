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

  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of [locality, district, division, state].map(stripPlusCode)) {
    const part = raw.trim();
    if (!part) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }

  return parts.length > 0 ? [parts.join(" ")] : [];
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
