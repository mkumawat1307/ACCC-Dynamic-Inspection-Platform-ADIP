import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { isLocationFresh } from "@/src/utils/geo";
import {
  MAX_GPS_ACCURACY_M,
  GPS_STALE_MS,
  GPS_MOVE_THRESHOLD_M,
  GPS_GRACE_MS,
  GPS_ONE_SHOT_TIMEOUT_CACHED_MS,
  GPS_ONE_SHOT_TIMEOUT_COLD_MS,
} from "./captureConfig";

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  timestamp: number;
}

export type GpsStatus = "loading" | "acquiring" | "fixed" | "denied";

interface LocationLike {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null | undefined;
  };
  timestamp?: number | null;
}

interface WaitEntry {
  resolve: (fix: GpsFix | null) => void;
  timer: ReturnType<typeof setTimeout>;
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

  const fixRef = useRef<GpsFix | null>(null);
  const waitersRef = useRef<WaitEntry[]>([]);
  const subRef = useRef<{ remove: () => void } | null>(null);

  const acceptFix = useCallback((fix: GpsFix) => {
    fixRef.current = fix;
    setCoords({ latitude: fix.latitude, longitude: fix.longitude });
    setAccuracyM(fix.accuracyM);
    setStatus("fixed");
    waitersRef.current.forEach((w) => {
      clearTimeout(w.timer);
      w.resolve(fix);
    });
    waitersRef.current = [];
  }, []);

  const captureGps = useCallback(
    (graceMs: number = GPS_GRACE_MS): Promise<GpsFix | null> => {
      const current = fixRef.current;
      if (current) return Promise.resolve(current);
      return new Promise((resolve) => {
        const waiter: WaitEntry = {
          resolve,
          timer: setTimeout(() => {
            waitersRef.current = waitersRef.current.filter((w) => w !== waiter);
            resolve(fixRef.current);
          }, graceMs),
        };
        waitersRef.current.push(waiter);
      });
    },
    []
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
        setStatus("denied");
        return;
      }
      if (cancelled) return;
      if (permStatus !== "granted") {
        setStatus("denied");
        return;
      }
      setStatus("acquiring");

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
        setStatus("acquiring");
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
        const current = fixRef.current;
        if (current && !isLocationFresh(current.timestamp, Date.now(), GPS_STALE_MS)) {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then((loc: LocationLike) => {
              if (!cancelled && loc && isAcceptableFix(loc)) acceptFix(toFix(loc));
            })
            .catch(() => {});
        }
      }, GPS_STALE_MS);
    })();

    return () => {
      cancelled = true;
      subRef.current?.remove();
      if (interval) clearInterval(interval);
    };
  }, [acceptFix]);

  const ageMs = fixRef.current ? Date.now() - fixRef.current.timestamp : null;

  return { status, coords, accuracyM, ageMs, captureGps };
}
