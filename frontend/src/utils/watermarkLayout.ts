import {
  formatWatermarkDate,
  formatLatLngWM,
} from "@/src/components/inspection/photoUtils";
import type { WatermarkSettings } from "@/src/utils/watermarkSettings";
import type { GpsStatus } from "@/src/components/camera/useGpsTracker";
import { type GpsQualityInfo } from "@/src/utils/gpsQuality";

// GPS accuracy is no longer rendered in the photo watermark.
// This constant remains for UI quality classification and legacy references only.
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

// GPS accuracy category colors are now only used for the GPS pill display,
// not the watermark. Kept for backward compatibility.
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
  if (status === "poor") return "🔴 GPS Poor — Refresh GPS";
  if (status === "stale") return "🟠 Stale GPS – tap to refresh";
  if (status === "denied") return "GPS denied";
  if (status === "acquiring") return "Acquiring GPS…";
  if (status === "fixed") {
    if (
      accuracyM == null ||
      typeof accuracyM !== "number" ||
      !isFinite(accuracyM) ||
      accuracyM < 0
    ) {
      return "⚪ No GPS";
    }
    // Determine emoji and category label based on accuracy thresholds
    // (same logic as getGpsQuality), but display the actual rounded accuracy.
    const category = accuracyM <= 20 ? "High Accuracy"
                   : accuracyM <= 50 ? "Medium Accuracy"
                   : "Low Accuracy";
    const emoji = accuracyM <= 20 ? "🟢" : accuracyM <= 50 ? "🟠" : "🔴";
    const rounded = Math.round(accuracyM);
    return `${emoji} ${category} ±${rounded} m`;
  }
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
  if (settings.showAddress) {
    // `addressLines` already contains only the required components
    // ([house/street number], [locality], [district], [state/region]);
    // the WebView renderer wraps them to the photo width without truncating.
    lines.push(...input.addressLines);
  }
  return lines;
}
