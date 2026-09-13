import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { isLocationFresh } from "@/src/utils/geo";
import {
  isFixUsable,
  needsGpsRefresh,
  type GpsFix,
} from "./gpsPolicy";
import {
  MAX_GPS_ACCURACY_M,
  GPS_STALE_MS,
  GPS_MOVE_THRESHOLD_M,
  GPS_ONE_SHOT_TIMEOUT_CACHED_MS,
  GPS_ONE_SHOT_TIMEOUT_COLD_MS,
  GPS_REFRESH_AGE_MS,
} from "./captureConfig";

export type { GpsFix } from "./gpsPolicy";

export type GpsStatus = "loading" | "acquiring" | "fixed" | "stale" | "denied";

export const GPS_STATUS_TICK_MS = 1000;

interface LocationLike {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null | undefined;
  };
  timestamp?: number | null;
}

function toFix(loc: LocationLike): GpsFix {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracyM: loc.coords.accuracy ?? 0,
    timestamp: loc.timestamp ?? Date.now(),
  };
}

function isAcceptableFix(loc: LocationLike): boolean {
  return (
    loc.coords.accuracy != null &&
    loc.coords.accuracy <= MAX_GPS_ACCURACY_M
  );
}

export function useGpsTracker() {
  const [status, setStatus] = useState<GpsStatus>("loading");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fixRef = useRef<GpsFix | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);
  const cancelledRef = useRef(false);
  const deniedRef = useRef(false);
  const statusRef = useRef<GpsStatus>("loading");

  const setStatusBoth = useCallback((next: GpsStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const settleStatus = useCallback((duringExplicit: boolean) => {
    if (cancelledRef.current) return;
    if (deniedRef.current) {
      setStatusBoth("denied");
      return;
    }
    const fix = fixRef.current;
    if (statusRef.current === "acquiring" && !duringExplicit && fix == null) {
      return;
    }
    if (fix != null && isFixUsable(fix)) {
      setStatusBoth("fixed");
    } else if (fix != null) {
      setStatusBoth("stale");
    } else {
      setStatusBoth("acquiring");
    }
  }, [setStatusBoth]);

  const acceptFix = useCallback((fix: GpsFix) => {
    if (cancelledRef.current) return;
    fixRef.current = fix;
    setCoords({ latitude: fix.latitude, longitude: fix.longitude });
    setAccuracyM(fix.accuracyM);
    setStatusBoth(isFixUsable(fix) ? "fixed" : "stale");
  }, [setStatusBoth]);

  const oneShotFix = useCallback(
    async (accuracy?: Location.Accuracy): Promise<GpsFix | null> => {
      const timeoutMs = fixRef.current
        ? GPS_ONE_SHOT_TIMEOUT_CACHED_MS
        : GPS_ONE_SHOT_TIMEOUT_COLD_MS;
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: accuracy ?? Location.Accuracy.Balanced,
          }),
          new Promise<null>((_, reject) => {
            raceTimer = setTimeout(() => reject(new Error("GPS timeout")), timeoutMs);
          }),
        ]);
        if (loc && isAcceptableFix(loc)) {
          const fix = toFix(loc);
          if (!cancelledRef.current) acceptFix(fix);
          return fix;
        }
        return null;
      } catch {
        return null;
      } finally {
        if (raceTimer) clearTimeout(raceTimer);
        if (!cancelledRef.current) settleStatus(false);
      }
    },
    [acceptFix, settleStatus]
  );

  const captureGps = useCallback(
    async (): Promise<GpsFix | null> => {
      if (cancelledRef.current || deniedRef.current) return null;
      const current = fixRef.current;
      if (current != null && isFixUsable(current)) {
        return { ...current };
      }
      setStatusBoth("acquiring");
      const fix = await oneShotFix();
      if (cancelledRef.current) return null;
      if (!fix) settleStatus(true);
      return fix;
    },
    [oneShotFix, settleStatus, setStatusBoth]
  );

  const refreshNow = useCallback(
    async (): Promise<GpsFix | null> => {
      if (cancelledRef.current || deniedRef.current) return null;
      setRefreshing(true);
      try {
        setStatusBoth("acquiring");
        const f = await oneShotFix(Location.Accuracy.Highest);
        if (cancelledRef.current) return null;
        if (!f) settleStatus(true);
        return f;
      } catch {
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [oneShotFix, settleStatus, setStatusBoth]
  );

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      let permStatus: string;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        permStatus = perm.status;
      } catch {
        deniedRef.current = true;
        setStatusBoth("denied");
        return;
      }
      if (cancelled) return;
      if (permStatus !== "granted") {
        deniedRef.current = true;
        setStatusBoth("denied");
        return;
      }
      setStatusBoth("acquiring");

      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (
          !cancelled &&
          lastKnown &&
          isAcceptableFix(lastKnown) &&
          isLocationFresh(lastKnown.timestamp ?? Date.now(), Date.now(), GPS_STALE_MS)
        ) {
          acceptFix(toFix(lastKnown));
        }
      } catch {}

      const timeoutMs = fixRef.current
        ? GPS_ONE_SHOT_TIMEOUT_CACHED_MS
        : GPS_ONE_SHOT_TIMEOUT_COLD_MS;
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fresh = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((_, reject) => {
            raceTimer = setTimeout(() => reject(new Error("GPS timeout")), timeoutMs);
          }),
        ]);
        if (!cancelled && fresh && isAcceptableFix(fresh)) {
          acceptFix(toFix(fresh));
        }
      } catch {}
      if (raceTimer) clearTimeout(raceTimer);
      if (cancelled) return;
      if (!fixRef.current) {
        settleStatus(true);
      }

      try {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: GPS_MOVE_THRESHOLD_M },
          (loc: LocationLike) => {
            if (!cancelled && isAcceptableFix(loc)) {
              acceptFix(toFix(loc));
            }
          }
        );
        if (cancelled) {
          sub.remove();
          return;
        }
        subRef.current = sub;
      } catch {}

      interval = setInterval(() => {
        if (needsGpsRefresh(fixRef.current)) {
          oneShotFix().catch(() => {});
        }
      }, GPS_REFRESH_AGE_MS);
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      subRef.current?.remove();
      subRef.current = null;
      if (interval) clearInterval(interval);
    };
  }, [acceptFix, oneShotFix, settleStatus, setStatusBoth]);

  useEffect(() => {
    const t = setInterval(() => {
      settleStatus(false);
    }, GPS_STATUS_TICK_MS);
    return () => clearInterval(t);
  }, [settleStatus]);

  const ageMs = fixRef.current ? Date.now() - fixRef.current.timestamp : null;

  return { status, coords, accuracyM, ageMs, currentFix: fixRef.current, captureGps, refreshNow, refreshing };
}