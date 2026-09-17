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
  return (
    fix != null &&
    fix.accuracyM <= MAX_GPS_ACCURACY_M &&
    nowMs - fix.timestamp < GPS_STALE_MS
  );
}

export function isFixStale(
  fix: GpsFix | null,
  nowMs: number = Date.now()
): boolean {
  return fix != null && !isFixUsable(fix, nowMs);
}