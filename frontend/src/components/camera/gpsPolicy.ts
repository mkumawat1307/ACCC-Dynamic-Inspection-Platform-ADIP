import { MAX_GPS_ACCURACY_M, GPS_STALE_MS } from "./captureConfig";

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  timestamp: number;
}

export function isFixUsable(
  fix: GpsFix | null,
  nowMs: number = Date.now()
): boolean {
  // A fix is usable if it has valid coordinates and is not stale.
  // Accuracy is informational only - we accept any valid GPS fix regardless of accuracy.
  return (
    fix != null &&
    fix.latitude !== null &&
    fix.longitude !== null &&
    fix.timestamp !== null &&
    !isNaN(fix.latitude) &&
    !isNaN(fix.longitude) &&
    !isNaN(fix.timestamp) &&
    nowMs - fix.timestamp < GPS_STALE_MS
  );
}

export function isFixStale(
  fix: GpsFix | null,
  nowMs: number = Date.now()
): boolean {
  return fix != null && !isFixUsable(fix, nowMs);
}