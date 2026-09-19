import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { haversineMeters, isLocationFresh } from "@/src/utils/geo";
import { isFixUsable, type GpsFix } from "./gpsPolicy";
import { useMotionDetector, type MovementState } from "./useMotionDetector";
import { getGpsQuality, type GpsQualityInfo } from "@/src/utils/gpsQuality";
import {
  GPS_MOVE_THRESHOLD_M,
  GPS_ONE_SHOT_TIMEOUT_CACHED_MS,
  GPS_ONE_SHOT_TIMEOUT_COLD_MS,
  GPS_PARALLEL_REQUESTS,
  GPS_ATTEMPT_TIMEOUT_MS,
  GPS_MAX_ATTEMPTS,
  GPS_AUTO_REFRESH_MS,
  GPS_MAX_ACCEPTABLE_ACCURACY_M,
  MOVEMENT_GPS_DELAY_MS,
  GPS_STALE_MS,
} from "./captureConfig";

export type { GpsFix } from "./gpsPolicy";

export type GpsStatus = "loading" | "acquiring" | "fixed" | "stale" | "denied" | "poor";

export const GPS_STATUS_TICK_MS = 1000;

export type RecoveryTrigger = "automatic" | "movement" | "manual";

// Recovery accuracy sequences:
// - automatic: Balanced x3, then Highest x2 (max 5 attempts, no Highest #3)
// - movement: identical to automatic
// - manual: Highest x2 (max 2 attempts)
export const AUTO_RECOVERY_ACCURACIES: Location.Accuracy[] = [
  Location.Accuracy.Balanced,
  Location.Accuracy.Balanced,
  Location.Accuracy.Balanced,
  Location.Accuracy.Highest,
  Location.Accuracy.Highest,
];
export const MOVEMENT_RECOVERY_ACCURACIES = AUTO_RECOVERY_ACCURACIES;
export const MANUAL_RECOVERY_ACCURACIES: Location.Accuracy[] = [
  Location.Accuracy.Highest,
  Location.Accuracy.Highest,
];

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
  // A fix is acceptable for adoption when it carries valid coordinates and its
  // horizontal accuracy is within the acceptable bound. Within that bound,
  // accuracy stays display-only; fixes beyond it are never adopted as the
  // current fix, the movement reference, the capture GPS, or the watermark GPS.
  const fix = toFix(loc);
  if (fix.accuracyM > GPS_MAX_ACCEPTABLE_ACCURACY_M) return false;
  return fix.latitude !== null && fix.longitude !== null && fix.timestamp !== null &&
         !isNaN(fix.latitude) && !isNaN(fix.longitude) && !isNaN(fix.timestamp);
}

function isAcceptedFix(fix: GpsFix): boolean {
  return (
    fix.latitude !== null &&
    fix.longitude !== null &&
    fix.timestamp !== null &&
    !isNaN(fix.latitude) &&
    !isNaN(fix.longitude) &&
    !isNaN(fix.timestamp) &&
    fix.accuracyM <= GPS_MAX_ACCEPTABLE_ACCURACY_M
  );
}

export function useGpsTracker(active: boolean = true) {
  const [status, setStatus] = useState<GpsStatus>("loading");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [movementState, setMovementState] = useState<MovementState>("still");
  const [movementDurationMs, setMovementDurationMs] = useState(0);
  const [gpsQuality, setGpsQuality] = useState<GpsQualityInfo>(() => getGpsQuality(null));

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
  // Set when the only device result available was rejected because its
  // accuracy exceeded GPS_MAX_ACCEPTABLE_ACCURACY_M. Cleared by acceptFix, so
  // "poor" is only ever reported while no usable fix has been accepted.
  const poorAccuracyRef = useRef(false);
  // Movement dirty flag: set to true when movement is detected. While true,
  // the cached GPS fix MUST NOT be used via the capture fast path — a fresh
  // fix is required before the shutter proceeds.
  const movementDirtyRef = useRef(false);
  // The 15-second movement window. Armed once per NEW movement event; when it
  // fires, a movement recovery is started (unless manual is running).
  const movementWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movementWindowArmedRef = useRef(false);
  // Monotonic capture-operation id. Each captureGps() invocation increments it;
  // any attempt that completes while a newer operation is current must be
  // discarded (its results may never be adopted nor settle status).
  const captureOpRef = useRef(0);
  // Recovery ownership: every recovery op gets a unique id and the current
  // generation (epoch). An op whose epoch no longer matches was pre-empted by
  // a higher-priority op (movement > automatic, manual > both) and MUST ignore
  // every late result — it may never update coords, accuracy, status, the
  // current/last-valid fix, or the automatic timer.
  const opSeqRef = useRef(0);
  const epochRef = useRef(0);
  const currentOpRef = useRef<{ id: number; trigger: RecoveryTrigger; epoch: number } | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const motion = useMotionDetector(active);

  // Dispatchers stored in refs to keep the timer/recovery callbacks free of
  // definition-order cycles. They are assigned fresh on every render.
  const kickAutomaticRef = useRef<() => void>(() => {});
  const kickMovementRef = useRef<() => void>(() => {});
  // The accelerometer-transition effect below must not reference
  // onMovementSignal directly (it is declared later in the hook body), so it
  // dispatches through a ref just like the kick refs above.
  const movementSignalRef = useRef<() => void>(() => {});

  // Sync motion detector state to local state for shutter/gps logic
  useEffect(() => {
    setMovementState(motion.state);
    setMovementDurationMs(motion.durationMs);
  }, [motion.state, motion.durationMs]);

  // Detect the transition INTO a "moving" state and route it through the same
  // signal used by the distance watcher. Leaving "moving" does not trigger any
  // GPS work; it simply means a future NEW movement can re-arm the window.
  const prevMotionStateRef = useRef<MovementState>("still");
  useEffect(() => {
    const prev = prevMotionStateRef.current;
    prevMotionStateRef.current = motion.state;
    if (motion.state === "moving" && prev !== "moving") {
      movementSignalRef.current();
    }
  }, [motion.state]);

  const setStatusBoth = useCallback((next: GpsStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearMovementWindow = useCallback(() => {
    if (movementWindowTimerRef.current) {
      clearTimeout(movementWindowTimerRef.current);
      movementWindowTimerRef.current = null;
    }
    movementWindowArmedRef.current = false;
  }, []);

  const acceptFix = useCallback(
    (fix: GpsFix) => {
      if (cancelledRef.current) return;
      fixRef.current = fix;
      // Reset the movement reference (distance is always measured from the
      // latest accepted fix), clear the poor-accuracy marker (a usable fix
      // means "poor" is over), clear the movement-dirty flag and cancel any
      // pending movement window (a fresh fix already accounts for movement).
      movementRef.current = fix;
      poorAccuracyRef.current = false;
      movementDirtyRef.current = false;
      clearMovementWindow();
      const quality = getGpsQuality(fix.accuracyM);
      setCoords({ latitude: fix.latitude, longitude: fix.longitude });
      setAccuracyM(fix.accuracyM);
      setGpsQuality(quality);
      const next = isFixUsable(fix) ? "fixed" : "stale";
      setStatusBoth(next);
    },
    [setStatusBoth, clearMovementWindow]
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
      } else if (poorAccuracyRef.current) {
        // No usable fix has ever been accepted and the only results so far were
        // rejected for exceeding the acceptable accuracy bound.
        setStatusBoth("poor");
      } else {
        setStatusBoth("acquiring");
      }
    },
    [setStatusBoth]
  );

  // Single device call. Pure and silent: it returns the RAW fix even when the
  // accuracy exceeds the acceptable bound — adoption decisions belong to the
  // recovery loop via isAcceptedFix/acceptFix. Returns null on error/timeout.
  const runSingle = useCallback(
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
        return loc ? toFix(loc) : null;
      } catch {
        return null;
      } finally {
        if (raceTimer) clearTimeout(raceTimer);
      }
    },
    []
  );

  // Arms the automatic 20-second timer. Every successful (or exhausted)
  // recovery resets it, so nothing fires an immediate auto refresh right after
  // a manual or movement success.
  const scheduleAutomatic = useCallback((reason: string = "reschedule") => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null;
      if (cancelledRef.current || deniedRef.current) return;
      kickAutomaticRef.current();
    }, GPS_AUTO_REFRESH_MS);
  }, []);

  const runRecovery = useCallback(
    async (trigger: RecoveryTrigger): Promise<GpsFix | null> => {
      if (cancelledRef.current || deniedRef.current) return null;

      const op = { id: ++opSeqRef.current, trigger, epoch: epochRef.current };
      currentOpRef.current = op;

      // Releases the single-slot ownership when this op finishes. Identity
      // guarded: a superseding recovery already replaced `currentOpRef`,
      // so it must never be cleared by a stale completion.
      const finish = (result: GpsFix | null): GpsFix | null => {
        if (currentOpRef.current === op) {
          currentOpRef.current = null;
        }
        return result;
      };

      const accuracies =
        trigger === "manual" ? MANUAL_RECOVERY_ACCURACIES : AUTO_RECOVERY_ACCURACIES;
      let attempts = 0;

      for (const accuracy of accuracies) {
        attempts += 1;
        if (cancelledRef.current) return finish(null);
        if (op.epoch !== epochRef.current) {
        return finish(null);
        }
        const fix = await runSingle(accuracy);
      if (cancelledRef.current) return finish(null);
      if (op.epoch !== epochRef.current) {
        return finish(null);
      }
      if (fix == null) {
        continue;
      }
      const roundedM = Math.round(fix.accuracyM);
      if (isAcceptedFix(fix)) {
        acceptFix(fix);
        return finish(fix);
      }
      if (fix.accuracyM > GPS_MAX_ACCEPTABLE_ACCURACY_M) {
        poorAccuracyRef.current = true;
      }
    }

      // Exhausted the sequence without an acceptable fix. Status is only
      // downgraded when there is no usable fix to preserve — a valid fix is
      // never overwritten by an exhausted recovery.
      if (!fixRef.current) {
        settleStatus(true);
      }
      return finish(null);
    },
    [runSingle, acceptFix, settleStatus]
  );

  // Runs a recovery op and always re-arms the automatic timer once it is done.
  // Success resets it ("success"); exhaustion reschedules it ("reschedule").
  const executeRecovery = useCallback(
    async (trigger: RecoveryTrigger): Promise<GpsFix | null> => {
      const fix = await runRecovery(trigger);
      scheduleAutomatic(fix != null ? "success" : "reschedule");
      return fix;
    },
    [runRecovery, scheduleAutomatic]
  );

  const startAutomaticRecovery = useCallback(() => {
    if (cancelledRef.current || deniedRef.current) return;
    if (currentOpRef.current) {
      const cur = currentOpRef.current;
      return;
    }
    void executeRecovery("automatic");
  }, [executeRecovery]);

  // Entry point for the movement window expiry. Movement outranks automatic but
  // never manual: if manual is running the movement recovery is skipped.
  const startMovementRecovery = useCallback(() => {
    if (cancelledRef.current || deniedRef.current) return;
    const cur = currentOpRef.current;
    if (cur?.trigger === "manual") {
      return;
    }
    if (cur?.trigger === "movement") {
      return;
    }
    if (cur) {
      // An automatic recovery is in flight: pre-empt it. The bumped epoch makes
      // any late automatic result a stale result that will be ignored.
      epochRef.current += 1;
    }
    void executeRecovery("movement");
  }, [executeRecovery]);

  kickAutomaticRef.current = startAutomaticRecovery;
  kickMovementRef.current = startMovementRecovery;

  const onMovementWindowComplete = useCallback(() => {
    movementWindowTimerRef.current = null;
    movementWindowArmedRef.current = false;
    kickMovementRef.current();
  }, []);

  // Unified movement signal shared by the accelerometer and the distance
  // watcher. A NEW movement event arms a 15-second window; repeat signals for
  // the same event (or while the window is pending) are ignored. Leaving the
  // "moving" state does not cancel a pending window.
  const onMovementSignal = useCallback(() => {
    if (cancelledRef.current || deniedRef.current) return;
    if (movementWindowArmedRef.current) return;
    movementDirtyRef.current = true;
    movementWindowArmedRef.current = true;
    movementWindowTimerRef.current = setTimeout(onMovementWindowComplete, MOVEMENT_GPS_DELAY_MS);
  }, [onMovementWindowComplete]);

  movementSignalRef.current = onMovementSignal;

  // Manual refresh — highest priority. It pre-empts any running automatic or
  // movement recovery (bumping the epoch so late results are ignored) and MUST
  // request a NEW device fix. Success resets the automatic timer.
  const refreshNow = useCallback(
    async (): Promise<GpsFix | null> => {
      if (cancelledRef.current || deniedRef.current) return null;
      const cur = currentOpRef.current;
      if (cur) {
        epochRef.current += 1;
        currentOpRef.current = null;
      }
      setRefreshing(true);
      setStatusBoth("acquiring");
      try {
        const fix = await executeRecovery("manual");
        // The explicit refresh is over: restore a settled display status so a
        // failed refresh leaves the previously shown state (and never a stale
        // "acquiring") unless the fix is genuinely lost.
        if (!fix) settleStatus(true);
        return fix;
      } finally {
        setRefreshing(false);
      }
    },
    [executeRecovery, settleStatus, setStatusBoth]
  );

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
      // Capture the epoch at start; if a higher-priority recovery pre-empts
      // this capture, its results must be discarded.
      const captureEpoch = epochRef.current;

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
        // If a higher-priority recovery has pre-empted this capture, discard
        // any late results immediately.
        if (captureEpoch !== epochRef.current) return;
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
      // Also abort if a higher-priority recovery (manual/movement) has pre-empted
      // this capture by bumping the epoch.
      if (cancelledRef.current || captureOpRef.current !== opId) return null;
      if (captureEpoch !== epochRef.current) return null;

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
      // FAST PATH: only use cached fix if it's valid, fresh, AND not movement-dirty
      if (current != null && isFixUsable(current) && !movementDirtyRef.current) {
        return { ...current };
      }
      // GPS is stale, invalid, or movement-dirty — must acquire fresh
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

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    cancelledRef.current = false;
    deniedRef.current = false;
    poorAccuracyRef.current = false;
    movementDirtyRef.current = false;
    currentOpRef.current = null;
    clearMovementWindow();
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

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

      // Bounded initial acquisition at Highest accuracy. This ALWAYS runs, even
      // when a fresh cached last-known fix was just adopted: the cached fix only
      // seeds the display, while the device result (when it arrives) is the
      // authoritative initial fix. Retrying after a failure lets an unreliable
      // cold start recover without ever turning into a continuous loop. This is
      // NOT a logged recovery op.
      for (let attempt = 0; attempt < GPS_MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        const fix = await runSingle(Location.Accuracy.Highest);
        if (cancelled) return;
        if (fix && isAcceptedFix(fix)) {
          acceptFix(fix);
          break;
        }
        if (fix && fix.accuracyM > GPS_MAX_ACCEPTABLE_ACCURACY_M) {
          poorAccuracyRef.current = true;
        }
      }
      if (cancelled) return;
      if (!fixRef.current) {
        settleStatus(true);
      }

      // The watcher is a pure movement detector: it never adopts coordinates
      // or status directly. When the user moves beyond the threshold from the
      // last accepted fix it routes a movement signal through the same 15-second
      // window used by the accelerometer. Use Balanced accuracy for reliable
      // distance calculation; ignore watcher fixes with poor accuracy.
      try {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: GPS_MOVE_THRESHOLD_M },
          (loc: LocationLike) => {
            if (cancelled) return;
            const current = movementRef.current ?? fixRef.current;
            if (!current) return;
            const fix = toFix(loc);
            // Ignore watcher fixes with poor accuracy — they're unreliable for
            // distance calculation and could trigger false movement signals.
            if (fix.accuracyM > GPS_MAX_ACCEPTABLE_ACCURACY_M) return;
            const movedM = haversineMeters(
              current.latitude,
              current.longitude,
              fix.latitude,
              fix.longitude
            );
            if (movedM > GPS_MOVE_THRESHOLD_M) {
              onMovementSignal();
            }
          }
        );
        if (cancelled) {
          sub.remove();
          return;
        }
        subRef.current = sub;
      } catch {}

      if (cancelled) return;
      scheduleAutomatic("start");
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      subRef.current?.remove();
      subRef.current = null;
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      clearMovementWindow();
      currentOpRef.current = null;
      if (epochRef.current) {
        // Ensure no in-flight recovery op can survive into the next activation.
        epochRef.current += 1;
      }
    };
  }, [
    active,
    acceptFix,
    runSingle,
    settleStatus,
    setStatusBoth,
    onMovementSignal,
    scheduleAutomatic,
    clearMovementWindow,
  ]);

  // Slow status settle, driven by a single lightweight tick. No GPS device
  // calls happen here — the settle only reconciles existing state.
  useEffect(() => {
    const t = setInterval(() => {
      if (!activeRef.current) return;
      settleStatus(false);
    }, GPS_STATUS_TICK_MS);
    return () => clearInterval(t);
  }, [settleStatus]);

  const ageMs = fixRef.current ? Date.now() - fixRef.current.timestamp : null;

  return {
    status,
    coords,
    accuracyM,
    ageMs,
    currentFix: fixRef.current,
    captureGps,
    refreshNow,
    refreshing,
    // GPS quality for UI indicator
    gpsQuality,
    // Expose movement state for shutter safety
    movementState,
    movementDurationMs,
    movementDirty: movementDirtyRef.current,
  };
}