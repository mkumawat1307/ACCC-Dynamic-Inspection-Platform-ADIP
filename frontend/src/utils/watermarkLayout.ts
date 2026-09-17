import {
  formatWatermarkDate,
  formatLatLngWM,
} from "@/src/components/inspection/photoUtils";
import type { WatermarkSettings } from "@/src/utils/watermarkSettings";
import type { GpsStatus } from "@/src/components/camera/useGpsTracker";
import { getGpsQuality, type GpsQualityInfo } from "@/src/utils/gpsQuality";

// Legacy constants for backward compatibility with watermarkLayout tests
export const GPS_ACCURACY_HIGH_M = 20;
export const GPS_ACCURACY_MEDIUM_M = 50;

export type GpsAccuracyCategory = "high" | "medium" | "low";

export function gpsAccuracyCategory(accuracyM: number): GpsAccuracyCategory {
  if (accuracyM <= GPS_ACCURACY_HIGH_M) return "high";
  if (accuracyM <= GPS_ACCURACY_MEDIUM_M) return "medium";
  return "low";
}

export function formatGpsAccuracyLine(accuracyM: number): string {
  return `Accuracy : ±${Math.round(accuracyM)} m`;
}

export const GPS_CATEGORY_COLORS: Record<GpsAccuracyCategory, string> = {
  high: "#76FF03",
  medium: "#FFEB3B",
  low: "#FF5252",
};

export function gpsPillText(
  status: GpsStatus,
  accuracyM: number | null,
  refreshing = false
): string {
  if (refreshing) return "⏳ Refreshing GPS…";
  if (status === "fixed") {
    if (accuracyM == null) return "🟢 High Accuracy";
    const cat = gpsAccuracyCategory(accuracyM);
    if (cat === "high") return "🟢 High Accuracy";
    if (cat === "medium") return "🟡 Medium Accuracy";
    return "🔴 Low Accuracy";
  }
  if (status === "stale") return "🟠 Stale GPS – tap to refresh";
  if (status === "denied") return "GPS denied";
  return "Acquiring GPS…";
}

export function gpsPillTextNew(
  status: GpsStatus,
  accuracyM: number | null,
  refreshing = false,
  gpsQuality?: GpsQualityInfo
): string {
  if (refreshing) return "⏳ Refreshing GPS…";
  if (status === "fixed") {
    if (accuracyM == null) return "🟢 GPS";
    const quality = gpsQuality ?? getGpsQuality(accuracyM);
    const emoji = quality.level === "excellent" ? "🟢" : quality.level === "moderate" ? "🟠" : "🔴";
    return `${emoji} GPS ${accuracyM}m`;
  }
  if (status === "stale") return "🟠 Stale GPS – tap to refresh";
  if (status === "denied") return "GPS denied";
  return "Acquiring GPS…";
}

export interface WatermarkLineInput {
  siteId: string;
  district: string;
  block: string;
  timestampIso: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  addressLines: string[];
  settings: Pick<
    WatermarkSettings,
    "dateFormat" | "timeFormat" | "showGpsAccuracy" | "showAddress"
  >;
}

export function composeWatermarkLines(input: WatermarkLineInput): string[] {
  const { settings } = input;
  const lines = [
    input.siteId,
    [input.district, input.block].filter(Boolean).join(", ") || "NA",
    formatWatermarkDate(input.timestampIso, settings.dateFormat, settings.timeFormat),
  ];
  if (input.latitude == null || input.longitude == null) {
    lines.push("Acquiring GPS…");
    return lines;
  }
  lines.push(formatLatLngWM(input.latitude, input.longitude));
  if (settings.showGpsAccuracy && input.accuracyM != null) {
    lines.push(formatGpsAccuracyLine(input.accuracyM));
  }
  if (settings.showAddress) {
    lines.push(...input.addressLines);
  }
  return lines;
}
