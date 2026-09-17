import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { haversineMeters } from "@/src/utils/geo";
import { isFixUsable, type GpsFix } from "./gpsPolicy";
import {
  GPS_MOVE_THRESHOLD_M,
  GPS_ONE_SHOT_TIMEOUT_CACHED_MS,
  GPS_ONE_SHOT_TIMEOUT_COLD_MS,
  GPS_PARALLEL_REQUESTS,
  GPS_ATTEMPT_TIMEOUT_MS,
  GPS_MAX_ATTEMPTS,
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
  // A fix is only acceptable for capture if it is BOTH accurate and fresh.
  // Accuracy alone is not enough — a one-shot result that resolves to a
  // stale/cached timestamp must never be accepted as the photo's GPS snapshot.
  return isFixUsable(toFix(loc), Date.now());
}

// Event-driven GPS tracker. There is NO continuous acquisition loop:
//  - cold-start acquisition runs once (bounded retries) when `active` first
//    becomes true (camera ready),
//  - a low-accuracy distance watcher refreshes only when the user moves more
//    than GPS_MOVE_THRESHOLD_M from the last accepted fix,
//  - an armed stale trigger fires ONE refresh per stale epoch,
//  - refreshNow() (tap) and captureGps() (shutter) request on demand.
// Every accepted fix resets both the movement reference AND the fix timestamp.
export function useGpsTracker(active: boolean = true) {
  const [status, setStatus] = useState<GpsStatus>("loading");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fixRef = useRef<GpsFix | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);
  const cancelledRef = useRef(false);
  const deniedRef = useRef(false);
  const statusRef = useRef<GpsStatus>("loading");
  const activeRef = useRef(active);
  activeRef.current = active;
  // Movement reference: the last accepted fix. The distance watcher compares
  // against this and it is reset ONLY by acceptFix.
  const movementRef = useRef<GpsFix | null>(null);
  // Set to true when a stale-refresh trigger is armed, reset only when a new
  // fix is accepted, so a failed refresh never re-arms on the next tick.
  const staleArmedRef = useRef(false);
  // Shared in-flight one-shot acquisition for refresh paths. While a
  // getCurrentPositionAsync request is active, automatic refresh and tap
  // refresh join it instead of issuing a second device request. captureGps
  // does NOT use this slot — it fires its own parallel batch per attempt.
  const inFlightOneShotRef = useRef<{
    request: Promise<GpsFix | null>;
    accuracy: Location.Accuracy;
  } | null>(null);
  // Monotonic capture-operation id. Each captureGps() invocation increments it;
  // any attempt that completes while a newer operation is current must be
  // discarded (its results may never be adopted nor settle status).
  const captureOpRef = useRef(0);

  const setStatusBoth = useCallback((next: GpsStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const acceptFix = useCallback(
    (fix: GpsFix) => {
      if (cancelledRef.current) return;
      fixRef.current = fix;
      // Reset the movement reference (distance is always measured from the
      // latest accepted fix) and dis-arm the stale trigger (a fresh fix means
      // the stale epoch is over).
      movementRef.current = fix;
      staleArmedRef.current = false;
      setCoords({ latitude: fix.latitude, longitude: fix.longitude });
      setAccuracyM(fix.accuracyM);
      setStatusBoth(isFixUsable(fix) ? "fixed" : "stale");
    },
    [setStatusBoth]
  );

  const settleStatus = useCallback(
    (duringExplicit: boolean) => {
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
    },
    [setStatusBoth]
  );

  const runOneShot = useCallback(
    async (accuracy: Location.Accuracy): Promise<GpsFix | null> => {
      const timeoutMs = fixRef.current
        ? GPS_ONE_SHOT_TIMEOUT_CACHED_MS
        : GPS_ONE_SHOT_TIMEOUT_COLD_MS;
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy }),
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

  // Concurrency guard: only ONE one-shot acquisition may be active at a time.
  // If a request is already in flight, later callers await/reuse it and never
  // call getCurrentPositionAsync again. Accuracy policy: the first-started
  // request's accuracy governs the shared result; a later explicit
  // Higher-accuracy request joins the running request instead of opening a
  // second device call (documented by the concurrency regression tests).
  const oneShotFix = useCallback(
    async (accuracy?: Location.Accuracy): Promise<GpsFix | null> => {
      const requested = accuracy ?? Location.Accuracy.Balanced;
      const running = inFlightOneShotRef.current;
      if (running != null) {
        return running.request;
      }
      const request = runOneShot(requested);
      inFlightOneShotRef.current = { request, accuracy: requested };
      try {
        return await request;
      } finally {
        if (inFlightOneShotRef.current?.request === request) {
          inFlightOneShotRef.current = null;
        }
      }
    },
    [runOneShot]
  );

  const triggerStaleRefreshIfNeeded = useCallback(() => {
    if (cancelledRef.current || deniedRef.current) return;
    const fix = fixRef.current;
    if (fix != null && !isFixUsable(fix) && !staleArmedRef.current) {
      staleArmedRef.current = true;
      oneShotFix().catch(() => {});
    }
  }, [oneShotFix]);

  // Runs one capture attempt: GPS_PARALLEL_REQUESTS independent requests are
  // fired at once and the attempt waits for all of them to settle OR the
  // per-attempt deadline, whichever comes first. Only results delivered before
  // the deadline are candidates; the best candidate is the lowest accuracy.
  // Requests that resolve after the deadline are ignored entirely — they must
  // neither influence the concluded attempt nor a later attempt.
  const runCaptureAttempt = useCallback(
    async (opId: number): Promise<GpsFix | null> => {
      let conclude!: () => void;
      let concluded = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const candidates: GpsFix[] = [];
      let remaining = GPS_PARALLEL_REQUESTS;

      const allSettled = new Promise<void>((resolve) => {
        conclude = resolve;
      });
      // The deadline bounds the attempt wait. The timer marks the attempt
      // concluded and resolves the race so the concluded attempt is evaluated
      // even when some requests are still pending.
      const deadline = new Promise<void>((resolve) => {
        deadlineTimer = setTimeout(() => {
          concluded = true;
          resolve();
        }, GPS_ATTEMPT_TIMEOUT_MS);
      });

      const onResult = (fix: GpsFix | null) => {
        // A result that arrives after this attempt concluded is garbage: it
        // must never be recorded for this attempt nor leak into a later one.
        if (concluded) return;
        if (fix) candidates.push(fix);
        remaining -= 1;
        if (remaining === 0) conclude();
      };

      for (let i = 0; i < GPS_PARALLEL_REQUESTS; i++) {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((loc) => {
            onResult(loc && isAcceptableFix(loc) ? toFix(loc) : null);
          })
          .catch(() => onResult(null));
      }

      await Promise.race([allSettled, deadline]);
      concluded = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);

      // This capture operation was superseded: none of its results may be
      // adopted or trigger status settlement.
      if (cancelledRef.current || captureOpRef.current !== opId) return null;

      let best: GpsFix | null = null;
      for (const fix of candidates) {
        if (best == null || fix.accuracyM < best.accuracyM) best = fix;
      }
      if (best) acceptFix(best);
      return best;
    },
    [acceptFix]
  );

  const captureGps = useCallback(
    async (): Promise<GpsFix | null> => {
      if (cancelledRef.current || deniedRef.current) return null;
      const current = fixRef.current;
      if (current != null && isFixUsable(current)) {
        return { ...current };
      }
      const opId = ++captureOpRef.current;
      setStatusBoth("acquiring");
      for (let attempt = 0; attempt < GPS_MAX_ATTEMPTS; attempt++) {
        const fix = await runCaptureAttempt(opId);
        if (cancelledRef.current || captureOpRef.current !== opId) return null;
        if (fix) return fix;
      }
      settleStatus(true);
      return null;
    },
    [runCaptureAttempt, settleStatus, setStatusBoth]
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
    if (!active) return;
    let cancelled = false;
    cancelledRef.current = false;
    deniedRef.current = false;

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
        if (!cancelled && lastKnown && isAcceptableFix(lastKnown)) {
          acceptFix(toFix(lastKnown));
        }
      } catch {}

      // Bounded cold-start acquisition. A single one-shot is attempted at a
      // time and retried only after a failure, so an unreliable cold start can
      // recover without ever turning into a continuous acquisition loop.
      if (!fixRef.current || !isFixUsable(fixRef.current)) {
        for (let attempt = 0; attempt < GPS_MAX_ATTEMPTS; attempt++) {
          const fix = await oneShotFix();
          if (cancelled) return;
          if (fix) break;
        }
      }
      if (cancelled) return;
      if (!fixRef.current) {
        settleStatus(true);
      }

      // The watcher is a pure movement detector: it never adopts coordinates
      // or status directly. When the user moves beyond the threshold from the
      // last accepted fix it fires a single shared one-shot refresh.
      try {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Low, distanceInterval: GPS_MOVE_THRESHOLD_M },
          (loc: LocationLike) => {
            if (cancelled) return;
            const current = movementRef.current ?? fixRef.current;
            if (!current) return;
            const fix = toFix(loc);
            const movedM = haversineMeters(
              current.latitude,
              current.longitude,
              fix.latitude,
              fix.longitude
            );
            if (movedM > GPS_MOVE_THRESHOLD_M) {
              oneShotFix().catch(() => {});
            }
          }
        );
        if (cancelled) {
          sub.remove();
          return;
        }
        subRef.current = sub;
      } catch {}
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [active, acceptFix, oneShotFix, settleStatus, setStatusBoth]);

  // Slow status settle + stale triggering, driven by a single lightweight tick.
  // No GPS device calls happen here — the stale trigger arms at most one
  // refresh per stale epoch, and the settle only reconciles existing state.
  useEffect(() => {
    const t = setInterval(() => {
      if (!activeRef.current) return;
      triggerStaleRefreshIfNeeded();
      settleStatus(false);
    }, GPS_STATUS_TICK_MS);
    return () => clearInterval(t);
  }, [triggerStaleRefreshIfNeeded, settleStatus]);

  const ageMs = fixRef.current ? Date.now() - fixRef.current.timestamp : null;

  return { status, coords, accuracyM, ageMs, currentFix: fixRef.current, captureGps, refreshNow, refreshing };
}