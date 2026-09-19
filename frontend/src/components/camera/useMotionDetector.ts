import { useCallback, useEffect, useRef, useState } from "react";
import { Accelerometer } from "expo-sensors";
import { MOVEMENT_ACCELERATION_THRESHOLD, MOVEMENT_STOP_CONFIRM_MS } from "./captureConfig";

export type MovementState = "still" | "moving" | "stopping";

interface MovementInfo {
  state: MovementState;
  durationMs: number;
  lastMovementAt: number | null;
}

export function useMotionDetector(enabled: boolean = true): MovementInfo {
  const [state, setState] = useState<MovementState>("still");
  const [durationMs, setDurationMs] = useState(0);
  const [lastMovementAt, setLastMovementAt] = useState<number | null>(null);

  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSampleTimeRef = useRef(0);
  const movementStartTimeRef = useRef(0);
  const consecutiveMovingSamplesRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const updateDuration = useCallback(() => {
    if (movementStartTimeRef.current > 0) {
      setDurationMs(Date.now() - movementStartTimeRef.current);
    }
  }, []);

  const transitionToMoving = useCallback(() => {
    if (enabledRef.current && state !== "moving") {
      setState("moving");
      movementStartTimeRef.current = Date.now();
      setDurationMs(0);
      setLastMovementAt(Date.now());
    }
  }, [state]);

  const transitionToStopping = useCallback(() => {
    if (enabledRef.current && state === "moving") {
      setState("stopping");
      setLastMovementAt(Date.now());
    }
  }, [state]);

  const transitionToStill = useCallback(() => {
    if (enabledRef.current && state !== "still") {
      setState("still");
      setDurationMs(0);
      movementStartTimeRef.current = 0;
    }
  }, [state]);

  const handleStopConfirmation = useCallback(() => {
    stopTimerRef.current = null;
    if (state === "stopping") {
      transitionToStill();
    }
  }, [state, transitionToStill]);

  const handleAcceleration = useCallback(
    (data: { x: number; y: number; z: number } | null) => {
      if (!enabledRef.current) return;
      const now = Date.now();
      const dt = now - lastSampleTimeRef.current;
      lastSampleTimeRef.current = now;

      if (!data) return;

      // Calculate magnitude of acceleration vector (minus gravity ~9.81 m/s²)
      const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      const acceleration = Math.abs(magnitude - 9.81);

      const isMoving = acceleration > MOVEMENT_ACCELERATION_THRESHOLD;

      if (isMoving) {
        consecutiveMovingSamplesRef.current += 1;
        // Require 2 consecutive moving samples to avoid spurious transitions
        if (consecutiveMovingSamplesRef.current >= 2) {
          if (state === "still") {
            transitionToMoving();
          } else if (state === "stopping") {
            // Movement resumed during stop confirmation
            if (stopTimerRef.current) {
              clearTimeout(stopTimerRef.current);
              stopTimerRef.current = null;
            }
            setState("moving");
          }
        }
        setLastMovementAt(now);
      } else {
        consecutiveMovingSamplesRef.current = 0;
        if (state === "moving" && dt > 0) {
          // Start stop confirmation timer
          if (!stopTimerRef.current) {
            stopTimerRef.current = setTimeout(handleStopConfirmation, MOVEMENT_STOP_CONFIRM_MS);
            transitionToStopping();
          }
        }
      }
    },
    [state, transitionToMoving, transitionToStopping, handleStopConfirmation]
  );

  // Start/stop accelerometer subscription
  useEffect(() => {
    if (!enabled) {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      return;
    }

    Accelerometer.setUpdateInterval(500); // 2 Hz sampling
    const subscription = Accelerometer.addListener(handleAcceleration);
    subscriptionRef.current = subscription;

    // Start duration timer when moving
    durationTimerRef.current = setInterval(() => {
      if (state === "moving") {
        updateDuration();
      }
    }, 1000);

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
    };
  }, [enabled, handleAcceleration, handleAcceleration, updateDuration]);

  return { state, durationMs, lastMovementAt };
}