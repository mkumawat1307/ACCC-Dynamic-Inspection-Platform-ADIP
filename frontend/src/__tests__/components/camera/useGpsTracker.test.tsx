jest.mock("expo-location");

import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import {
  __setPermissionStatus,
  __setMockLocation,
  __setMockLastKnown,
  __emitWatchLocation,
  __resetLocationState,
} from "expo-location";
import * as Location from "expo-location";
import { useGpsTracker, GpsFix } from "@/src/components/camera/useGpsTracker";
import {
  GPS_STALE_MS,
  GPS_MOVE_THRESHOLD_M,
  GPS_PARALLEL_REQUESTS,
  GPS_ATTEMPT_TIMEOUT_MS,
  GPS_MAX_ATTEMPTS,
} from "@/src/components/camera/captureConfig";

let captureGpsFn: (() => Promise<GpsFix | null>) | null = null;
let gpsRef: { current: ReturnType<typeof useGpsTracker> | null } = { current: null };

function Probe() {
  const gps = useGpsTracker();
  captureGpsFn = gps.captureGps;
  gpsRef.current = gps;
  const coords = gps.coords ? `${gps.coords.latitude},${gps.coords.longitude}` : "none";
  return <Text>{`${gps.status}|${coords}`}</Text>;
}

// Camera-ready gating probe: the tracker receives active=false until a 100 ms
// timer flips the simulated onCameraReady state.
function ActiveProbe() {
  const [cameraReady, setCameraReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCameraReady(true), 100);
    return () => clearTimeout(t);
  }, []);
  const gps = useGpsTracker(cameraReady);
  captureGpsFn = gps.captureGps;
  gpsRef.current = gps;
  const coords = gps.coords ? `${gps.coords.latitude},${gps.coords.longitude}` : "none";
  return <Text>{`${gps.status}|${coords}`}</Text>;
}

async function flushAsync(times = 20) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

async function renderProbe() {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Probe />);
    await flushAsync();
  });
  return tree;
}

function rendered(tree: ReturnType<typeof TestRenderer.create>): string {
  const text = tree.root.findByType(Text as never);
  return String((text as unknown as { props: { children: string } }).props.children);
}

describe("useGpsTracker", () => {
  beforeEach(() => {
    captureGpsFn = null;
    gpsRef.current = null;
    __resetLocationState();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("becomes fixed when a fresh acceptable fix arrives", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 12);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|34.05,-118.25");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("rejects fixes above the accuracy threshold and abandons the cold-start loop", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 99);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("acquiring|none");
    // The cold-start loop is bounded: exactly GPS_MAX_ATTEMPTS attempts, not a
    // continuous re-acquisition loop while every result is unacceptable.
    expect(spy).toHaveBeenCalledTimes(GPS_MAX_ATTEMPTS);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("seeds from an acceptable, fresh cached fix", async () => {
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 1000);
    __setMockLocation(34.05, -118.25, 99);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|10,20");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("goes denied when permission is not granted", async () => {
    __setPermissionStatus("denied");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("denied|none");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("does not acquire GPS or register a watcher until the camera is ready", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const posSpy = jest.spyOn(Location, "getCurrentPositionAsync");
    const watchSpy = jest.spyOn(Location, "watchPositionAsync");
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ActiveProbe />);
      await flushAsync();
    });
    // Camera not ready: the tracker is inert ("loading", shutter disabled) and
    // must not touch the location API at all.
    expect(rendered(tree)).toBe("loading|none");
    expect(posSpy).not.toHaveBeenCalled();
    expect(watchSpy).not.toHaveBeenCalled();
    // Camera ready: cold-start acquisition runs once and the watcher registers.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(100);
      await flushAsync();
    });
    expect(posSpy).toHaveBeenCalled();
    expect(watchSpy).toHaveBeenCalled();
    expect(rendered(tree)).toBe("fixed|0,0");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("never polls the device while the fix is fresh (zero background GPS work)", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 25, -60_000); // future-dated fix: never stale
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    __setMockLocation(3, 4, 6); // nearby device position that a poll would read
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(30_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    expect(spy).not.toHaveBeenCalled();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("fires exactly ONE stale refresh per stale epoch and rejects stale device results", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");

    // Crossing the stale boundary arms and fires a single refresh. The frozen
    // mock timestamp is stale by now, so the one-shot result is rejected and the
    // stale trigger stays armed for the remainder of the epoch.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rendered(tree)).toBe("stale|1,2");

    // A fresh device position does NOT re-arm a second trigger (no retry loop).
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rendered(tree)).toBe("stale|1,2"); // old fix retained
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("two-step stale→fresh: the armed stale refresh adopts the fresh fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");

    // Just before the stale boundary: the fix is not stale yet, so no refresh
    // fires at this point.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS - 1_000);
      await flushAsync();
    });
    expect(spy).not.toHaveBeenCalled();
    __setMockLocation(3, 4, 6);

    // Crossing the boundary: the armed one-shot reads the fresh mock and adopts.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(2_000);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rendered(tree)).toBe("fixed|3,4");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("a movement beyond the threshold triggers a single refresh and adopts the fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      __setMockLocation(3, 4, 6); // the mock must hold the move so the refresh adopts it
      __emitWatchLocation(3, 4, 6); // ~314 km from (1,2): beyond the 10 m threshold
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rendered(tree)).toBe("fixed|3,4");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("a movement within the threshold neither triggers a refresh nor adopts coords", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      __setMockLocation(1.00005, 2, 6); // ~5.5 m from the reference
      __emitWatchLocation(1.00005, 2, 6);
      await flushAsync();
    });
    expect(spy).not.toHaveBeenCalled();
    expect(rendered(tree)).toBe("fixed|1,2"); // coords never adopted from the watcher
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("movement triggers a refresh even when the reference fix is seconds old", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(3_000); // the reference ages a few seconds; still fresh
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      __setMockLocation(3, 4, 6);
      __emitWatchLocation(3, 4, 6);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rendered(tree)).toBe("fixed|3,4");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("a movement-triggered refresh ignores an unacceptable result", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      __setMockLocation(5, 6, 99); // moves far, but > 50 m accuracy → unacceptable
      __emitWatchLocation(5, 6, 99);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1); // the refresh WAS attempted
    expect(rendered(tree)).toBe("fixed|1,2"); // ...but its result was rejected
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("a stale refresh resets the movement reference and the fix timestamp", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");

    // Two-step stale boundary: still fresh at +299 s, then a NEW fresh mock is
    // placed so the armed refresh (fired at +300 s) reads and adopts it.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS - 1_000);
      await flushAsync();
    });
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(2_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    expect(spy).toHaveBeenCalledTimes(1);

    // Reference reset: ~5 m away from the ADOPTED fix is below the threshold,
    // so no further refresh fires (the same point would exceed the threshold
    // measured from the pre-refresh reference).
    await TestRenderer.act(async () => {
      __setMockLocation(3.00005, 4, 6);
      __emitWatchLocation(3.00005, 4, 6);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);

    // Timestamp reset: the adopted fix is fresh again, so capture reuses the
    // cached snapshot without any new device request.
    let snap: GpsFix | null = null;
    await TestRenderer.act(async () => {
      snap = await gpsRef.current!.captureGps();
    });
    expect(snap).not.toBeNull();
    expect(snap!.latitude).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("a manual refresh resets the movement reference and the fix timestamp", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");

    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      const fix = await gpsRef.current!.refreshNow();
      expect(fix).not.toBeNull();
      expect(fix!.latitude).toBe(3);
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    expect(spy).toHaveBeenCalledTimes(1);

    await TestRenderer.act(async () => {
      __setMockLocation(3.00005, 4, 6);
      __emitWatchLocation(3.00005, 4, 6);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);

    let snap: GpsFix | null = null;
    await TestRenderer.act(async () => {
      snap = await gpsRef.current!.captureGps();
    });
    expect(snap).not.toBeNull();
    expect(snap!.latitude).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("a movement refresh resets the movement reference and the fix timestamp", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");

    await TestRenderer.act(async () => {
      __setMockLocation(3, 4, 6);
      __emitWatchLocation(3, 4, 6);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    expect(spy).toHaveBeenCalledTimes(1);

    // ~5 m from the NEW (adopted) reference is within the threshold; the same
    // point measured from the pre-adoption reference (1,2) would exceed it.
    await TestRenderer.act(async () => {
      __setMockLocation(3.00005, 4, 6);
      __emitWatchLocation(3.00005, 4, 6);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);

    let snap: GpsFix | null = null;
    await TestRenderer.act(async () => {
      snap = await gpsRef.current!.captureGps();
    });
    expect(snap).not.toBeNull();
    expect(snap!.latitude).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("refreshNow performs a Highest one-shot and clears refreshing", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(9, 9, 4);
    const tree = await renderProbe();
    let refreshingDuring: boolean | null = true;
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      const p = gpsRef.current!.refreshNow().then((fix) => {
        refreshingDuring = gpsRef.current!.refreshing;
        return fix;
      });
      jest.advanceTimersByTime(1000);
      await flushAsync();
      await p;
    });
    const refreshCall = spy.mock.calls.find(
      (c) => c[0]?.accuracy === Location.Accuracy.Highest
    );
    expect(refreshCall).toBeDefined();
    expect(refreshingDuring).toBe(false); // cleared by the time the promise settles
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("refreshNow returns null for an unacceptable one-shot and keeps the last good fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 1000); // seeds a fresh, acceptable, cached fix first
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|10,20");
    __setMockLocation(5, 6, 99); // unacceptable accuracy
    let fix: GpsFix | null = null;
    await TestRenderer.act(async () => {
      fix = await gpsRef.current!.refreshNow();
    });
    expect(fix).toBeNull();
    await TestRenderer.act(async () => { await flushAsync(); });
    expect(rendered(tree)).toBe("fixed|10,20"); // stays on the last good fix, no stale fallback
    expect(gpsRef.current!.refreshing).toBe(false);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps returns an immutable snapshot of a fresh cached fix without a new one-shot", async () => {
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const first = await gpsRef.current!.captureGps();
    expect(first).not.toBeNull();
    expect(first!.latitude).toBe(1);
    first!.latitude = 99;
    const second = await gpsRef.current!.captureGps();
    expect(second).not.toBeNull();
    expect(second!.latitude).toBe(1);
    expect(spy).not.toHaveBeenCalled();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps acquires and adopts a fresh fix when none is usable", async () => {
    __setPermissionStatus("granted");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("acquiring|none");
    __setMockLocation(7, 8, 20);
    let outcome: string | null = null;
    await TestRenderer.act(async () => {
      const p = captureGpsFn!().then((f) => {
        outcome = f ? `${f.latitude},${f.longitude}` : "null";
        return f;
      });
      await flushAsync();
      await p;
    });
    expect(outcome).toBe("7,8");
    expect(rendered(tree)).toBe("fixed|7,8");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps acquires a fresh fix when the cached fix is stale", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 0);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("stale|10,20");
    __setMockLocation(7, 8, 20);
    let outcome: string | null = null;
    await TestRenderer.act(async () => {
      const p = captureGpsFn!().then((f) => {
        outcome = f ? `${f.latitude},${f.longitude}` : "null";
        return f;
      });
      await flushAsync();
      await p;
    });
    expect(outcome).toBe("7,8");
    expect(rendered(tree)).toBe("fixed|7,8");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps returns null when denied without querying the device", async () => {
    __setPermissionStatus("denied");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("denied|none");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    let outcome: string | null = null;
    await TestRenderer.act(async () => {
      const p = captureGpsFn!().then((f) => {
        outcome = f ? "fixed" : "null";
        return f;
      });
      await flushAsync();
      await p;
    });
    expect(outcome).toBe("null");
    expect(spy).not.toHaveBeenCalled();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps resolves null on cold-start timeout after the per-attempt deadlines", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("acquiring|none");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    spy.mockImplementation(() => new Promise(() => {}));
    let outcome: string | null = null;
    let promise: Promise<GpsFix | null> | null = null;
    await TestRenderer.act(async () => {
      promise = captureGpsFn!().then((f) => {
        outcome = f ? "fixed" : "null";
        return f;
      });
      await flushAsync();
      // Each attempt arms a fresh GPS_ATTEMPT_TIMEOUT_MS deadline only after the
      // previous attempt concludes (a microtask continuation), so the clock must
      // be advanced once per attempt with a flush between advances.
      for (let i = 0; i < GPS_MAX_ATTEMPTS; i++) {
        jest.advanceTimersByTime(GPS_ATTEMPT_TIMEOUT_MS + 100);
        await flushAsync();
      }
    });
    expect(outcome).toBe("null");
    expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS * GPS_MAX_ATTEMPTS);
    if (promise) await promise;
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps resolves null on the per-attempt deadlines while holding a stale fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 0);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("stale|10,20");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    spy.mockImplementation(() => new Promise(() => {}));
    let outcome: string | null = null;
    let promise: Promise<GpsFix | null> | null = null;
    await TestRenderer.act(async () => {
      promise = captureGpsFn!().then((f) => {
        outcome = f ? "fixed" : "null";
        return f;
      });
      await flushAsync();
      // Each attempt arms a fresh GPS_ATTEMPT_TIMEOUT_MS deadline only after the
      // previous attempt concludes (a microtask continuation), so the clock must
      // be advanced once per attempt with a flush between advances.
      for (let i = 0; i < GPS_MAX_ATTEMPTS; i++) {
        jest.advanceTimersByTime(GPS_ATTEMPT_TIMEOUT_MS + 100);
        await flushAsync();
      }
    });
    expect(outcome).toBe("null");
    // The armed-once stale trigger never re-fires while this epoch is armed and
    // a failed refresh never re-arms it, so the only post-spy device calls are
    // the capture's GPS_MAX_ATTEMPTS x GPS_PARALLEL_REQUESTS batches.
    expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS * GPS_MAX_ATTEMPTS);
    if (promise) await promise;
    // A failed capture must preserve the stale fix, not adopt anything.
    expect(gpsRef.current!.coords).toEqual({ latitude: 10, longitude: 20 });
    expect(gpsRef.current!.accuracyM).toBe(30);
    expect(rendered(tree)).toBe("stale|10,20");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps rejects a stale-but-accurate one-shot result (freshness gate regression)", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 12);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|34.05,-118.25");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("stale|34.05,-118.25");
    let outcome: string | null = null;
    await TestRenderer.act(async () => {
      const p = captureGpsFn!().then((f) => {
        outcome = f ? `${f.latitude},${f.longitude}` : "null";
        return f;
      });
      await flushAsync();
      await p;
    });
    expect(outcome).toBe("null");
    expect(rendered(tree)).toBe("stale|34.05,-118.25");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("acquires GPS automatically on mount before any capture request", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 12);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|34.05,-118.25");
    expect(spy).toHaveBeenCalled();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("registers watchPositionAsync with Low accuracy and the configured distance interval", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const spy = jest.spyOn(Location, "watchPositionAsync");
    const tree = await renderProbe();
    const options = spy.mock.calls.find((c) => typeof c[0] === "object")?.[0] as
      | { accuracy?: number; distanceInterval?: number }
      | undefined;
    expect(options).toBeDefined();
    expect(options?.accuracy).toBe(Location.Accuracy.Low);
    expect(options?.distanceInterval).toBe(GPS_MOVE_THRESHOLD_M);
    expect(options?.distanceInterval).toBe(10);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("unmount removes the watcher and remount registers a new active watcher (no duplicate)", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const watchSpy = jest.spyOn(Location, "watchPositionAsync");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|0,0");
    expect(watchSpy).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => { tree.unmount(); });

    // After unmount the watcher is removed: emitting must be a no-op.
    await TestRenderer.act(async () => {
      __emitWatchLocation(2, 2, 5);
      await flushAsync();
    });
    expect(watchSpy).toHaveBeenCalledTimes(1);

    // A remount registers a fresh active watcher and reacts to movement again.
    __setMockLocation(0, 0, 5);
    const tree2 = await renderProbe();
    expect(rendered(tree2)).toBe("fixed|0,0");
    expect(watchSpy).toHaveBeenCalledTimes(2);
    await TestRenderer.act(async () => {
      __setMockLocation(3, 3, 6);
      __emitWatchLocation(3, 3, 6);
      await flushAsync();
    });
    expect(rendered(tree2)).toBe("fixed|3,3");
    await TestRenderer.act(async () => { tree2.unmount(); });
  });

  describe("one-shot concurrency (event-driven)", () => {
    type OneShotLocation = Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>;

    function makeDeferred() {
      let resolve!: (v: OneShotLocation) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<OneShotLocation>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    function loc(latitude: number, longitude: number, accuracy: number): OneShotLocation {
      return {
        coords: { latitude, longitude, accuracy, altitude: 0, altitudeAccuracy: 0, heading: 0, speed: 0 },
        timestamp: Date.now(),
      };
    }

    it("stale refresh in flight + tap refresh → one getCurrentPositionAsync call (join)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_STALE_MS + 1_000); // stale tick arms its one-shot
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1);
      });
      expect(rendered(tree)).toBe("stale|1,2");

      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow(); // joins the armed in-flight request
        d.resolve(loc(3, 4, 6));
        tapped = await p;
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1); // tap did NOT open a second device call
      expect(tapped).not.toBeNull();
      expect(tapped!.latitude).toBe(3);
      expect(rendered(tree)).toBe("fixed|3,4");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("tap refresh in flight + movement → one getCurrentPositionAsync call (join)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow(); // starts the Highest one-shot
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1);

        // Movement fires while the tap's one-shot is in flight: it joins the
        // running request instead of opening a second device call.
        __setMockLocation(3, 4, 6);
        __emitWatchLocation(3, 4, 6);
        await flushAsync();

        d.resolve(loc(3, 4, 6));
        tapped = await p;
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(tapped).not.toBeNull();
      expect(tapped!.latitude).toBe(3);
      expect(rendered(tree)).toBe("fixed|3,4");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("stale refresh in flight + captureGps → independent requests (no join)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const deferreds: ReturnType<typeof makeDeferred>[] = [];
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => {
        const d = makeDeferred();
        deferreds.push(d);
        return d.promise;
      });

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_STALE_MS + 1_000); // stale tick arms its one-shot
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1);
      });

      let captured: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => { captured = f; return f; });
        await flushAsync();
        // capture does NOT join the running stale one-shot; it opens its own batch.
        expect(spy).toHaveBeenCalledTimes(1 + GPS_PARALLEL_REQUESTS);
        deferreds[0].resolve(loc(1, 2, 5));
        for (let i = 0; i < GPS_PARALLEL_REQUESTS; i++) {
          deferreds[1 + i].resolve(loc(5, 6, 7));
        }
        await p;
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1 + GPS_PARALLEL_REQUESTS);
      expect(captured).not.toBeNull();
      expect(captured!.latitude).toBe(5);
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("capture GPS running + tap refresh → independent requests (capture fires its own parallel batch)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("acquiring|none");

      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      let captured: GpsFix | null = null;
      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const cp = captureGpsFn!().then((f) => { captured = f; return f; });
        const rp = gpsRef.current!.refreshNow().then((f) => { tapped = f; return f; });
        await flushAsync();
        // capture starts its own balanced batch, refreshNow its own Highest one-shot.
        expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS + 1);
        d.resolve(loc(5, 6, 7));
        await Promise.all([cp, rp]);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS + 1);
      expect(captured).not.toBeNull();
      expect(tapped).not.toBeNull();
      expect(captured!.latitude).toBe(5);
      expect(tapped!.latitude).toBe(5);
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("two refreshNow callers waiting on the same in-flight request receive the same fix", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 1, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,1");

      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      let first: GpsFix | null = null;
      let second: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p1 = gpsRef.current!.refreshNow().then((f) => { first = f; return f; });
        const p2 = gpsRef.current!.refreshNow().then((f) => { second = f; return f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1); // second caller joined the in-flight request
        d.resolve(loc(7, 8, 20));
        await Promise.all([p1, p2]);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.latitude).toBe(7);
      expect(second!.latitude).toBe(7);
      expect(first!.longitude).toBe(8);
      expect(second!.longitude).toBe(8);
      expect(rendered(tree)).toBe("fixed|7,8");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("clears the in-flight reference after a successful one-shot (next request starts fresh)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLocation(1, 2, 5);
      const tree = await renderProbe();

      let call = 0;
      const deferreds: ReturnType<typeof makeDeferred>[] = [];
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => {
        call += 1;
        const d = makeDeferred();
        deferreds.push(d);
        return d.promise;
      });

      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow(); // request #1
        await flushAsync();
        expect(call).toBe(1);
        deferreds[0].resolve(loc(3, 4, 6));
        await p;
        await flushAsync();
      });
      expect(call).toBe(1);
      expect(rendered(tree)).toBe("fixed|3,4");

      // A second request must start a NEW device call. If the in-flight slot
      // leaked after success, this would join the already-resolved request.
      await TestRenderer.act(async () => {
        const p2 = gpsRef.current!.refreshNow();
        await flushAsync();
        expect(call).toBe(2);
        deferreds[1].resolve(loc(5, 6, 7));
        await p2;
        await flushAsync();
      });
      expect(call).toBe(2);
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("clears the in-flight reference after a failed one-shot (next request starts fresh)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLocation(1, 2, 5);
      const tree = await renderProbe();

      let call = 0;
      const deferreds: ReturnType<typeof makeDeferred>[] = [];
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => {
        call += 1;
        const d = makeDeferred();
        deferreds.push(d);
        return d.promise;
      });

      let first: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow(); // request #1
        await flushAsync();
        expect(call).toBe(1);
        deferreds[0].reject(new Error("GPS failure"));
        first = await p;
        await flushAsync();
      });
      expect(first).toBeNull();
      expect(rendered(tree)).toBe("fixed|1,2"); // old fix kept, slot cleared

      await TestRenderer.act(async () => {
        const p2 = gpsRef.current!.refreshNow(); // must start a NEW device call
        await flushAsync();
        expect(call).toBe(2);
        deferreds[1].resolve(loc(9, 10, 4));
        await p2;
        await flushAsync();
      });
      expect(call).toBe(2);
      expect(rendered(tree)).toBe("fixed|9,10");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a failed one-shot does not permanently block future requests", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("acquiring|none");

      const realImpl = Location.getCurrentPositionAsync;
      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      let first: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow();
        await flushAsync();
        d.reject(new Error("GPS failure"));
        first = await p;
        await flushAsync();
      });
      expect(first).toBeNull();
      expect(rendered(tree)).toBe("acquiring|none");
      expect(gpsRef.current!.refreshing).toBe(false);

      // Restore the module behavior: a later capture acquires normally.
      __setMockLocation(9, 9, 4);
      spy.mockImplementation((_o) => realImpl(_o));
      let captured: GpsFix | null = null;
      await TestRenderer.act(async () => {
        captured = await captureGpsFn!();
        await flushAsync();
      });
      expect(captured).not.toBeNull();
      expect(captured!.latitude).toBe(9);
      expect(rendered(tree)).toBe("fixed|9,9");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("policy: captureGps fires Balanced parallel batch while refreshNow fires its own Highest request", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("acquiring|none");

      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      let captured: GpsFix | null = null;
      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const cp = captureGpsFn!().then((f) => { captured = f; return f; });
        const rp = gpsRef.current!.refreshNow().then((f) => { tapped = f; return f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS + 1);
        d.resolve(loc(5, 6, 7));
        await Promise.all([cp, rp]);
        await flushAsync();
      });
      const balancedCalls = spy.mock.calls.filter(
        (c) => c[0]?.accuracy === Location.Accuracy.Balanced
      );
      const highestCalls = spy.mock.calls.filter(
        (c) => c[0]?.accuracy === Location.Accuracy.Highest
      );
      expect(balancedCalls).toHaveLength(GPS_PARALLEL_REQUESTS); // capture batch ran Balanced
      expect(highestCalls).toHaveLength(1); // refreshNow ran its own Highest request
      expect(captured).not.toBeNull();
      expect(captured!.latitude).toBe(5);
      expect(tapped!.latitude).toBe(5);
      expect(gpsRef.current!.refreshing).toBe(false);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("refreshNow() refreshing stays true during a shared request and clears when it finishes", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLocation(1, 2, 5);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const d = makeDeferred();
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => d.promise);

      let done = false;
      let tapped: GpsFix | null = null;
      let tappedPromise: Promise<GpsFix | null> | null = null;
      await TestRenderer.act(async () => {
        tappedPromise = gpsRef.current!.refreshNow().then((f) => { tapped = f; done = true; return f; });
        await flushAsync();
        expect(done).toBe(false); // request still in flight
        expect(spy).toHaveBeenCalledTimes(1);
      });
      // After the act boundary the refreshing + acquiring render commits:
      // refreshing stays true while the request is still running.
      expect(done).toBe(false);
      expect(gpsRef.current!.refreshing).toBe(true);
      expect(gpsRef.current!.status).toBe("acquiring");
      await TestRenderer.act(async () => {
        d.resolve(loc(3, 4, 6));
        await tappedPromise;
        await flushAsync();
      });
      expect(done).toBe(true);
      expect(gpsRef.current!.refreshing).toBe(false);
      expect(tapped).not.toBeNull();
      expect(rendered(tree)).toBe("fixed|3,4");
      await TestRenderer.act(async () => { tree.unmount(); });
    });
  });

  describe("parallel capture", () => {
    type OneShotLocation = Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>;

    function makeDeferred() {
      let resolve!: (v: OneShotLocation) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<OneShotLocation>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    function loc(latitude: number, longitude: number, accuracy: number): OneShotLocation {
      return {
        coords: { latitude, longitude, accuracy, altitude: 0, altitudeAccuracy: 0, heading: 0, speed: 0 },
        timestamp: Date.now(),
      };
    }

    function installPerCallSpy() {
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      const deferreds: ReturnType<typeof makeDeferred>[] = [];
      spy.mockImplementation(() => {
        const d = makeDeferred();
        deferreds.push(d);
        return d.promise;
      });
      return { spy, deferreds };
    }

    it("captureGps fires GPS_PARALLEL_REQUESTS Balanced requests and adopts the lowest-accuracy candidate", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("acquiring|none");

      const { spy, deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS);
        for (const call of spy.mock.calls) {
          expect((call[0] as { accuracy?: number } | undefined)?.accuracy).toBe(
            Location.Accuracy.Balanced
          );
        }
        deferreds[0].resolve(loc(1, 1, 30));
        deferreds[1].resolve(loc(2, 2, 5));
        deferreds[2].resolve(loc(3, 3, 10));
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("2,2");
      expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS);
      expect(rendered(tree)).toBe("fixed|2,2");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a later, more accurate candidate supersedes an earlier worse one (no first-result-wins)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        deferreds[0].resolve(loc(1, 1, 40)); // worse result arrives first
        await flushAsync();
        expect(outcome).toBeNull(); // attempted request not concluded on first result
        deferreds[1].resolve(loc(4, 4, 5)); // better result arrives later
        deferreds[2].resolve(loc(7, 7, 30));
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("4,4");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a timed-out attempt retries with a fresh batch of GPS_PARALLEL_REQUESTS", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { spy, deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS); // attempt 1 batch
        jest.advanceTimersByTime(GPS_ATTEMPT_TIMEOUT_MS + 100);
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(2 * GPS_PARALLEL_REQUESTS); // attempt 2 = fresh batch
        deferreds[GPS_PARALLEL_REQUESTS].resolve(loc(5, 6, 7));
        deferreds[GPS_PARALLEL_REQUESTS + 1].resolve(loc(5, 6, 7));
        deferreds[GPS_PARALLEL_REQUESTS + 2].resolve(loc(5, 6, 7));
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("5,6");
      expect(spy).toHaveBeenCalledTimes(2 * GPS_PARALLEL_REQUESTS);
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("results resolved after the attempt deadline are ignored (attempt isolation)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { spy, deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS);
        jest.advanceTimersByTime(GPS_ATTEMPT_TIMEOUT_MS + 100); // attempt 1 deadline
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(2 * GPS_PARALLEL_REQUESTS); // attempt 2 batch

        // attempt 1 results arrive late with a would-be-winning low accuracy.
        deferreds[0].resolve(loc(90, 90, 1));
        deferreds[1].resolve(loc(90, 90, 1));
        deferreds[2].resolve(loc(90, 90, 1));
        await flushAsync();

        deferreds[GPS_PARALLEL_REQUESTS].resolve(loc(8, 9, 20));
        deferreds[GPS_PARALLEL_REQUESTS + 1].resolve(loc(8, 9, 20));
        deferreds[GPS_PARALLEL_REQUESTS + 2].resolve(loc(8, 9, 20));
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("8,9"); // late attempt-1 result must NOT win
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("all attempts timing out returns null after GPS_MAX_ATTEMPTS fresh batches", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { spy } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        for (let i = 0; i < GPS_MAX_ATTEMPTS; i++) {
          jest.advanceTimersByTime(GPS_ATTEMPT_TIMEOUT_MS + 100);
          await flushAsync();
        }
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("null");
      expect(spy).toHaveBeenCalledTimes(GPS_MAX_ATTEMPTS * GPS_PARALLEL_REQUESTS);
      expect(rendered(tree)).toBe("acquiring|none");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("succeeds on the final allowed attempt after earlier attempts time out", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { spy, deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        for (let i = 0; i < GPS_MAX_ATTEMPTS - 1; i++) {
          jest.advanceTimersByTime(GPS_ATTEMPT_TIMEOUT_MS + 100);
          await flushAsync();
        }
        expect(spy).toHaveBeenCalledTimes(GPS_MAX_ATTEMPTS * GPS_PARALLEL_REQUESTS);
        for (let i = 0; i < GPS_PARALLEL_REQUESTS; i++) {
          const idx = (GPS_MAX_ATTEMPTS - 1) * GPS_PARALLEL_REQUESTS + i;
          deferreds[idx].resolve(loc(5, 6, 7));
        }
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("5,6");
      expect(spy).toHaveBeenCalledTimes(GPS_MAX_ATTEMPTS * GPS_PARALLEL_REQUESTS);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("invalid candidates do not win; a valid one is adopted", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        deferreds[0].resolve(loc(1, 1, 99)); // too inaccurate, invalid
        deferreds[1].resolve(loc(2, 2, 8)); // valid
        deferreds[2].resolve(loc(3, 3, 200)); // far too inaccurate, invalid
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("2,2");
      expect(rendered(tree)).toBe("fixed|2,2");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a single rejected request does not fail the attempt when another candidate succeeds", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        deferreds[0].reject(new Error("request failed"));
        deferreds[1].resolve(loc(5, 6, 7));
        deferreds[2].resolve(loc(5, 6, 7));
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a superseding capture invalidates an in-flight capture (operation isolation)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { spy, deferreds } = installPerCallSpy();
      let first: string | null = null;
      let second: string | null = null;
      await TestRenderer.act(async () => {
        const p1 = captureGpsFn!().then((f) => {
          first = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        const p2 = captureGpsFn!().then((f) => {
          second = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(2 * GPS_PARALLEL_REQUESTS);

        // First capture's batch resolves late: it must be discarded entirely.
        deferreds[0].resolve(loc(1, 1, 2));
        deferreds[1].resolve(loc(1, 1, 2));
        deferreds[2].resolve(loc(1, 1, 2));
        await flushAsync();
        await p1;

        // Second capture's batch adopts normally.
        deferreds[GPS_PARALLEL_REQUESTS].resolve(loc(8, 8, 7));
        deferreds[GPS_PARALLEL_REQUESTS + 1].resolve(loc(8, 8, 7));
        deferreds[GPS_PARALLEL_REQUESTS + 2].resolve(loc(8, 8, 7));
        await p2;
        await flushAsync();
      });
      expect(first).toBe("null");
      expect(second).toBe("8,8");
      expect(gpsRef.current!.coords).toEqual({ latitude: 8, longitude: 8 });
      expect(spy).toHaveBeenCalledTimes(2 * GPS_PARALLEL_REQUESTS);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("status is acquiring while the batch is in flight, then fixed after adoption", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
        expect(gpsRef.current!.status).toBe("acquiring");
        expect(outcome).toBeNull(); // still in flight
        deferreds[0].resolve(loc(7, 8, 20));
        deferreds[1].resolve(loc(7, 8, 20));
        deferreds[2].resolve(loc(7, 8, 20));
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("7,8");
      expect(gpsRef.current!.status).toBe("fixed");
      expect(rendered(tree)).toBe("fixed|7,8");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("unmounting mid-attempt resolves capture to null without adopting anything", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      const tree = await renderProbe();

      const { spy, deferreds } = installPerCallSpy();
      let outcome: string | null = null;
      let p: Promise<GpsFix | null> | null = null;
      await TestRenderer.act(async () => {
        p = captureGpsFn!().then((f) => {
          outcome = f ? `${f.latitude},${f.longitude}` : "null";
          return f;
        });
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS);
      await TestRenderer.act(async () => { tree.unmount(); });
      await TestRenderer.act(async () => {
        deferreds[0].resolve(loc(5, 6, 7));
        deferreds[1].resolve(loc(5, 6, 7));
        deferreds[2].resolve(loc(5, 6, 7));
        await flushAsync();
        await p;
        await flushAsync();
      });
      expect(outcome).toBe("null");
      expect(gpsRef.current!.coords).toBeNull();
    });
  });
});