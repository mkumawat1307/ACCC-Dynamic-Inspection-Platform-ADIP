import {
  MAX_GPS_ACCURACY_M,
  GPS_STALE_MS,
  GPS_REFRESH_AGE_MS,
  GPS_ACCURACY_REFRESH_M,
} from "./captureConfig";

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

export function needsGpsRefresh(
  fix: GpsFix | null,
  nowMs: number = Date.now()
): boolean {
  return (
    fix != null &&
    (nowMs - fix.timestamp >= GPS_REFRESH_AGE_MS ||
      fix.accuracyM > GPS_ACCURACY_REFRESH_M)
  );
}