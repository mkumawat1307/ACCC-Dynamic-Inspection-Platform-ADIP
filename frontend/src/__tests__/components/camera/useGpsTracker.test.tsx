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
import { Accelerometer } from "expo-sensors";
import {
  useGpsTracker,
  type GpsFix,
  AUTO_RECOVERY_ACCURACIES,
  MANUAL_RECOVERY_ACCURACIES,
  MOVEMENT_RECOVERY_ACCURACIES,
} from "@/src/components/camera/useGpsTracker";
import {
  GPS_STALE_MS,
  GPS_AUTO_REFRESH_MS,
  GPS_MOVE_THRESHOLD_M,
  GPS_PARALLEL_REQUESTS,
  GPS_ATTEMPT_TIMEOUT_MS,
  GPS_MAX_ATTEMPTS,
  GPS_MAX_ACCEPTABLE_ACCURACY_M,
  MOVEMENT_GPS_DELAY_MS,
  GPS_ONE_SHOT_TIMEOUT_COLD_MS,
} from "@/src/components/camera/captureConfig";
import { getGpsQuality } from "@/src/utils/gpsQuality";

jest.mock("expo-location");
jest.mock("expo-sensors", () => {
  let accelerometerCallback: ((data: { x: number; y: number; z: number }) => void) | null = null;
  return {
    Accelerometer: {
      setUpdateInterval: jest.fn(),
      addListener: jest.fn((callback: (data: { x: number; y: number; z: number }) => void) => {
        accelerometerCallback = callback;
        return { remove: () => { accelerometerCallback = null; } };
      }),
      removeAllListeners: jest.fn(),
      __setMockAcceleration: (x: number, y: number, z: number) => {
        if (accelerometerCallback) {
          accelerometerCallback({ x, y, z });
        }
      },
      __reset: () => { accelerometerCallback = null; },
    },
  };
});

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

function logText(log: { mock: { calls: readonly (readonly unknown[])[] } }): string {
  return log.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
}

function accuracyOf(call: unknown[]): number | undefined {
  return (call[0] as { accuracy?: number } | undefined)?.accuracy;
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

  it("accepts valid fixes up to the 100 m bound during cold start", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 99);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|34.05,-118.25");
    expect(spy).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("accepts 10 m, 50 m, and 100 m fixes without blocking, exposing quality informationally", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(4, 5, 10);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|4,5");
    expect(gpsRef.current!.gpsQuality.level).toBe("excellent");
    await TestRenderer.act(async () => { tree.unmount(); });

    __resetLocationState();
    captureGpsFn = null;
    gpsRef.current = null;
    __setPermissionStatus("granted");
    __setMockLocation(6, 7, 50);
    const tree2 = await renderProbe();
    expect(rendered(tree2)).toBe("fixed|6,7");
    expect(gpsRef.current!.gpsQuality.level).toBe("moderate");
    await TestRenderer.act(async () => { tree2.unmount(); });

    __resetLocationState();
    captureGpsFn = null;
    gpsRef.current = null;
    __setPermissionStatus("granted");
    __setMockLocation(8, 9, 100);
    const tree3 = await renderProbe();
    expect(rendered(tree3)).toBe("fixed|8,9");
    expect(gpsRef.current!.gpsQuality.level).toBe("poor");
    await TestRenderer.act(async () => { tree3.unmount(); });
  });

  it("rejects >100 m results on cold start and reports poor when nothing is usable", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(4, 5, GPS_MAX_ACCEPTABLE_ACCURACY_M + 500);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("poor|none");
    expect(gpsRef.current!.coords).toBeNull();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("initial cold-start acquisition uses Highest accuracy", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 12);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|34.05,-118.25");
    const highestCall = spy.mock.calls.find((c) => accuracyOf(c) === Location.Accuracy.Highest);
    expect(highestCall).toBeDefined();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("initial acquisition uses Highest even when a fresh cached fix exists", async () => {
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 1000);
    __setMockLocation(34.05, -118.25, 99);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    // The cached fix may seed display, but it must NOT substitute for the
    // initial Highest acquisition: the device result is what ends up adopted.
    const highestCall = spy.mock.calls.find((c) => accuracyOf(c) === Location.Accuracy.Highest);
    expect(highestCall).toBeDefined();
    expect(rendered(tree)).toBe("fixed|34.05,-118.25");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("does not adopt a stale last-known position (freshness gate)", async () => {
    __setPermissionStatus("granted");
    // Provide a last-known position that is acceptable (≤100m) but STALE
    // (timestamp older than GPS_STALE_MS). The tracker must NOT adopt it.
    const staleTimestamp = Date.now() - GPS_STALE_MS - 10_000;
    __setMockLastKnown(10, 20, 30, staleTimestamp);
    // Device returns an unacceptable fix (>100m) so initial acquisition fails
    __setMockLocation(5, 6, GPS_MAX_ACCEPTABLE_ACCURACY_M + 500);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    // The stale last-known must NOT be adopted; status should be "poor" (no usable fix)
    expect(rendered(tree)).toBe("poor|none");
    expect(gpsRef.current!.coords).toBeNull();
    // Initial acquisition should still run (Highest attempts)
    expect(spy).toHaveBeenCalledTimes(GPS_MAX_ATTEMPTS);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("adopts a fresh last-known position initially, then upgrades on initial acquisition", async () => {
    __setPermissionStatus("granted");
    // Provide a last-known position that is acceptable AND fresh
    const freshTimestamp = Date.now() - 1_000;
    __setMockLastKnown(10, 20, 30, freshTimestamp);
    __setMockLocation(5, 6, 12);
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const tree = await renderProbe();
    // Fresh last-known is adopted initially, but initial acquisition runs immediately
    // and upgrades to the device fix (5,6) before we can observe the intermediate state.
    // The important thing is that the final adopted fix is the device result.
    expect(rendered(tree)).toBe("fixed|5,6");
    expect(spy).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

it("capture GPS in flight + manual refresh → independent ops (no epoch bump; capture batch still adopted)", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    // Start with a fresh, valid last-known fix. The 4th argument is a RELATIVE
    // age in ms (1000ms = 1 second ago). An absolute timestamp here would be
    // subtracted from the fake-clock "now", collapsing the timestamp to 1970 and
    // making the fix permanently stale.
    __setMockLastKnown(1, 2, 5, 1000);
    // Device returns an unacceptable fix (>100m) for initial acquisition attempts
    // so the initial fix remains the last-known (which is fresh and acceptable)
    __setMockLocation(1, 2, GPS_MAX_ACCEPTABLE_ACCURACY_M + 10); // >100m for initial acquisition
    const tree = await renderProbe();
    // Fresh last-known should be adopted initially
    expect(rendered(tree)).toBe("fixed|1,2");

    // Age the fix past the stale boundary so captureGps must acquire fresh
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("stale|1,2");

    const deferreds: ReturnType<typeof makeDeferred>[] = [];
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    spy.mockImplementation(() => {
      const d = makeDeferred();
      deferreds.push(d);
      return d.promise;
    });

    // Start a capture operation (fires parallel Balanced batch because fix is unusable)
    let capturePromise: Promise<GpsFix | null>;
    await TestRenderer.act(async () => {
      capturePromise = captureGpsFn!();
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS);

    // While the capture is in flight, a manual refresh runs INDEPENDENTLY: it
    // fires its own Highest request instead of joining the capture's batch.
    // A lone capture does not occupy currentOpRef, so refreshNow has nothing to
    // bump — the epoch stays unchanged and the capture is NOT pre-empted.
    let manualPromise: Promise<GpsFix | null>;
    await TestRenderer.act(async () => {
      manualPromise = gpsRef.current!.refreshNow();
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS + 1); // +1 for manual Highest

    // Resolve the manual refresh first: it adopts its own fix.
    await TestRenderer.act(async () => {
      deferreds[GPS_PARALLEL_REQUESTS].resolve(loc(9, 10, 6));
      await manualPromise;
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|9,10");

    // Now resolve the capture batch. With no epoch bump these results are still
    // adopted: the capture runs to completion and returns its own best fix.
    let capturedFix: GpsFix | null = null;
    await TestRenderer.act(async () => {
      deferreds[0].resolve(loc(3, 4, 6));
      for (let i = 1; i < GPS_PARALLEL_REQUESTS; i++) {
        deferreds[i].resolve(loc(7, 8, 8));
      }
      await flushAsync();
      capturedFix = await capturePromise;
      await flushAsync();
    });

    // The capture was NOT aborted; the last resolver's fix wins the display.
    expect(capturedFix).not.toBeNull();
    expect(capturedFix!.latitude).toBe(3);
    expect(rendered(tree)).toBe("fixed|3,4");
    expect(gpsRef.current!.coords).toEqual({ latitude: 3, longitude: 4 });
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("watcher fix with poor accuracy (>100m) does not trigger movement signal", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");

    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const watchSpy = jest.spyOn(Location, "watchPositionAsync");

    // Emit a watcher update with POOR accuracy (>100m) that would exceed the
    // movement threshold if used for distance calculation. The watcher must
    // ignore it and NOT arm the movement window.
    await TestRenderer.act(async () => {
      __emitWatchLocation(50, 50, 500); // 500m accuracy, far from (1,2)
      await flushAsync();
    });
    expect(spy).not.toHaveBeenCalled(); // no movement recovery armed
    expect(rendered(tree)).toBe("fixed|1,2");

    // Now emit a valid watcher fix with good accuracy beyond threshold
    await TestRenderer.act(async () => {
      __setMockLocation(3, 4, 6); // device position for recovery
      __emitWatchLocation(3, 4, 6);
      await flushAsync();
    });
    expect(spy).not.toHaveBeenCalled(); // window not complete yet

    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);
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

  describe("automatic recovery (20 s cadence)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it("fires the first Balanced attempt at the GPS_AUTO_REFRESH_MS cadence and adopts the fix", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 25, -60_000); // future-dated seed: stays fresh
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      __setMockLocation(3, 4, 6); // device position the automatic update reads

      // Just off the cadence: no device work yet (no per-second polling).
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS - 1_000);
        await flushAsync();
      });
      expect(spy).not.toHaveBeenCalled();
      expect(rendered(tree)).toBe("fixed|1,2");

      // Crossing the cadence fires exactly one Balanced automatic recovery
      // attempt which succeeds on the first shot.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(1_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);
      expect(rendered(tree)).toBe("fixed|3,4");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("repeats the cadence, adopting each fresh device fix", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 25, -60_000);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      __setMockLocation(3, 4, 6);
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(rendered(tree)).toBe("fixed|3,4");

      __setMockLocation(5, 6, 8);
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("runs the full Balanced x3 → Highest x2 sequence (max 5 attempts) and reports poor", async () => {
      __setPermissionStatus("granted");
      __setMockLocation(4, 5, 1_500); // every device result is rejected
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("poor|none"); // initial acquisition also rejected

      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      const recoveryCalls = spy.mock.calls.slice(-AUTO_RECOVERY_ACCURACIES.length);
      expect(recoveryCalls.map(accuracyOf)).toEqual([
        Location.Accuracy.Balanced,
        Location.Accuracy.Balanced,
        Location.Accuracy.Balanced,
        Location.Accuracy.Highest,
        Location.Accuracy.Highest,
      ]);
      // The spy is installed AFTER the initial acquisition (line 330), so only
      // the recovery attempts are counted: exactly the auto accuracy sequence.
      expect(spy).toHaveBeenCalledTimes(AUTO_RECOVERY_ACCURACIES.length);
      expect(rendered(tree)).toBe("poor|none");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("stops at the first acceptable attempt (100 m boundary) and resets the timer", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      __setMockLocation(3, 4, GPS_MAX_ACCEPTABLE_ACCURACY_M); // exactly the boundary: accepted

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(rendered(tree)).toBe("fixed|3,4");

      // Success resets the 20 s timer: nothing fires before the next cadence.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS - 1_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(1_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("never overwrites a valid fix with a rejected (>100 m) automatic result", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      __setMockLocation(3, 4, GPS_MAX_ACCEPTABLE_ACCURACY_M + 1); // rejected

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(rendered(tree)).toBe("fixed|1,2"); // old fix retained
      expect(gpsRef.current!.coords).toEqual({ latitude: 1, longitude: 2 });
      expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("skips the automatic tick while another recovery is in progress", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 25, -60_000);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      // A manual recovery starts immediately and stays in flight.
      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        gpsRef.current!.refreshNow().then((f) => { tapped = f; });
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1); // manual Highest #1

      // The cadence fires while manual is running: automatic must skip (no overlap).
      // Manual runs 2 Highest attempts; attempt #1's cached 15 s one-shot timeout
      // fires during the 20 s advance, so attempt #2 opens a NEW device call.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2); // manual Highest #1 and #2

      deferreds[1].resolve(loc(5, 6, 7));
      await TestRenderer.act(async () => { await flushAsync(); });
      expect(tapped).not.toBeNull();
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a rejected automatic refresh never adopts a stale device result (old fix retained)", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      // The mock holds no device position, so every automatic recovery attempt
      // yields nothing. The seed ages past the stale boundary; nothing new is
      // adopted and the old fix is preserved.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalled();
      expect(rendered(tree)).toBe("stale|1,2"); // old fix retained
      await TestRenderer.act(async () => { tree.unmount(); });
    });
  });

  describe("movement recovery (15 s window)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it("movement beyond the threshold arms a 15 s window, then adopts a fresh fix", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      await TestRenderer.act(async () => {
        __setMockLocation(3, 4, 6); // the mock must hold the move so the recovery adopts it
        __emitWatchLocation(3, 4, 6); // ~314 km from (1,2): beyond the 10 m threshold
        await flushAsync();
      });
      // The watcher never adopts coordinates directly and nothing fires early.
      expect(spy).not.toHaveBeenCalled();
      expect(rendered(tree)).toBe("fixed|1,2");

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS - 1);
        await flushAsync();
      });
      expect(spy).not.toHaveBeenCalled(); // window not complete yet

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(1);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);
      expect(rendered(tree)).toBe("fixed|3,4");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("movement within the threshold arms no window and triggers no recovery", async () => {
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
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS + 1_000);
        await flushAsync();
      });
      expect(spy).not.toHaveBeenCalled();
      expect(rendered(tree)).toBe("fixed|1,2"); // coords never adopted from the watcher
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("arms once per movement event: repeat signals do not re-fire, a new event re-arms", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();

      await TestRenderer.act(async () => {
        __setMockLocation(3, 4, 6);
        __emitWatchLocation(3, 4, 6); // signal #1
        __emitWatchLocation(3, 4, 6); // same event — ignored (armed)
        __emitWatchLocation(3, 4, 6); // still armed — ignored
        await flushAsync();
      });
      // Repeat signals do not trigger any device work: the window is armed once
      // and recovery only starts when the window completes.
      expect(spy).not.toHaveBeenCalled();

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1); // exactly ONE movement recovery
      deferreds[0].resolve(loc(3, 4, 6));
      await TestRenderer.act(async () => { await flushAsync(); });
      expect(rendered(tree)).toBe("fixed|3,4");

      // A brand-new event after the window reset re-arms and recovers again.
      await TestRenderer.act(async () => {
        __setMockLocation(9, 9, 6);
        __emitWatchLocation(9, 9, 6);
        await flushAsync();
      });
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2);
      deferreds[1].resolve(loc(9, 9, 6));
      await TestRenderer.act(async () => { await flushAsync(); });
      expect(rendered(tree)).toBe("fixed|9,9");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("movement may run an automatic recovery during the window, which movement pre-empts at window end", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();
      const log = jest.spyOn(console, "log").mockImplementation(() => {});

      // Arm the movement window at t=10 s; it completes at t=25 s.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(10_000);
        __setMockLocation(7, 8, 6);
        __emitWatchLocation(7, 8, 6);
        await flushAsync();
      });

      // t=20 s: the automatic recovery attempt #1 starts (allowed during window).
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(10_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);

      // t=25 s: the window completes and pre-empts the running automatic.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(5_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2);

      // The movement recovery succeeds and its location is adopted.
      await TestRenderer.act(async () => {
        deferreds[1].resolve(loc(7, 8, 6));
        await flushAsync();
      });
      expect(rendered(tree)).toBe("fixed|7,8");

      // The late automatic result arrives after the takeover: ignored entirely.
      await TestRenderer.act(async () => {
        deferreds[0].resolve(loc(3, 4, 6));
        await flushAsync();
      });
      expect(rendered(tree)).toBe("fixed|7,8");
      expect(gpsRef.current!.coords).toEqual({ latitude: 7, longitude: 8 });
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("movement recovery uses the 5-attempt sequence and preserves the existing fix on exhaustion", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      await TestRenderer.act(async () => {
        __setMockLocation(3, 4, 1_000); // rejected by the recovery loop
        __emitWatchLocation(3, 4, 6);
        await flushAsync();
      });
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      expect(spy.mock.calls.map(accuracyOf)).toEqual(
        MOVEMENT_RECOVERY_ACCURACIES.map((acc) => acc)
      );
      expect(spy).toHaveBeenCalledTimes(MOVEMENT_RECOVERY_ACCURACIES.length);
      // Exhausted movement recovery keeps the old valid fix.
      expect(rendered(tree)).toBe("fixed|1,2");
      expect(gpsRef.current!.coords).toEqual({ latitude: 1, longitude: 2 });
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("movement yields to an in-flight manual recovery (manual outranks movement)", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();
      const log = jest.spyOn(console, "log").mockImplementation(() => {});

      // Movement arms a window; a manual tap starts while the window is open.
      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        __setMockLocation(7, 8, 6);
        __emitWatchLocation(7, 8, 6);
        gpsRef.current!.refreshNow().then((f) => { tapped = f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1); // manual Highest only
      });

      // The window completes while manual is still in flight: movement is skipped.
      // Manual's cached 15 s one-shot timeout expires at the same mark, so
      // attempt #2 opens a NEW device call.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2); // manual Highest #1 and #2

      deferreds[1].resolve(loc(7, 8, 6));
      await TestRenderer.act(async () => { await flushAsync(); });
      expect(tapped).not.toBeNull();
      expect(rendered(tree)).toBe("fixed|7,8");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a movement recovery resets the automatic timer (no immediate auto refresh)", async () => {
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
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(rendered(tree)).toBe("fixed|3,4");

      // A full cadence after the movement resolution (t≈15 s): automatic starts
      // at ~35 s. Just before that, nothing fires.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS + 3_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(2_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2); // automatic attempt #1
      await TestRenderer.act(async () => { tree.unmount(); });
    });
  });

  describe("manual refresh (refreshNow)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it("uses Highest, succeeds on the first attempt, returns the fix and clears refreshing", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      __setMockLocation(9, 9, 4);
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      let refreshingDuring: boolean | null = true;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow().then((fix) => {
          refreshingDuring = gpsRef.current!.refreshing;
          return fix;
        });
        await flushAsync();
        await p;
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Highest);
      expect(refreshingDuring).toBe(false); // cleared by the time the promise settles
      expect(rendered(tree)).toBe("fixed|9,9");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("runs Highest #2 only when Highest #1 fails, and stops after 2 attempts", async () => {
      __setPermissionStatus("granted");
      __setMockLocation(4, 5, 1_500); // always rejected
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("poor|none");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      let outcome: GpsFix | null = null;
      await TestRenderer.act(async () => {
        outcome = await gpsRef.current!.refreshNow();
        await flushAsync();
      });
      const manualCalls = spy.mock.calls.slice(-MANUAL_RECOVERY_ACCURACIES.length);
      expect(manualCalls.map(accuracyOf)).toEqual([
        Location.Accuracy.Highest,
        Location.Accuracy.Highest,
      ]);
      expect(outcome).toBeNull();
      expect(gpsRef.current!.refreshing).toBe(false);
      expect(rendered(tree)).toBe("poor|none");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("manual failure preserves the existing valid fix", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      __setMockLocation(5, 6, 1_000); // rejected

      let outcome: GpsFix | null = null;
      await TestRenderer.act(async () => {
        outcome = await gpsRef.current!.refreshNow();
        await flushAsync();
      });
      expect(outcome).toBeNull();
      expect(spy).toHaveBeenCalledTimes(MANUAL_RECOVERY_ACCURACIES.length);
      expect(rendered(tree)).toBe("fixed|1,2"); // preserved
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("manual success resets the automatic timer (no immediate auto refresh)", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      __setMockLocation(3, 4, 6);

      await TestRenderer.act(async () => {
        const f = await gpsRef.current!.refreshNow();
        expect(f).not.toBeNull();
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(rendered(tree)).toBe("fixed|3,4");

      // The next automatic tick is a full cadence away, not immediate.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS - 1_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(1_000);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2); // automatic attempt #1 (Balanced)
      expect(rendered(tree)).toBe("fixed|3,4"); // device still holds 3,4
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a manual tap pre-empts a running manual recovery and requests a NEW fix (no join)", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 1, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,1");

      const { spy, deferreds } = installPerCallSpy();
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      let first: GpsFix | null = null;
      let second: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p1 = gpsRef.current!.refreshNow().then((f) => { first = f; return f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1);
        const p2 = gpsRef.current!.refreshNow().then((f) => { second = f; return f; });
        await flushAsync();
        // The second caller must NOT join the in-flight request: a fresh device
        // call is opened (manual always requests a new fix).
        expect(spy).toHaveBeenCalledTimes(2);

        deferreds[1].resolve(loc(9, 10, 6)); // the newer manual request wins
        await flushAsync();
        await p2;
        // The superseded request's late result must be ignored.
        deferreds[0].resolve(loc(7, 8, 6));
        await flushAsync();
        await p1;
      });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(first).toBeNull();
      expect(second).not.toBeNull();
      expect(second!.latitude).toBe(9);
      expect(gpsRef.current!.coords).toEqual({ latitude: 9, longitude: 10 });
      expect(rendered(tree)).toBe("fixed|9,10");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a manual tap pre-empts a running movement recovery and ignores its late result", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();
      const log = jest.spyOn(console, "log").mockImplementation(() => {});

      // The movement window completes and movement recovery attempt #1 stays in flight.
      await TestRenderer.act(async () => {
        __setMockLocation(3, 4, 6);
        __emitWatchLocation(3, 4, 6);
        await flushAsync();
      });
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1); // movement attempt #1 (Balanced)

      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow().then((f) => { tapped = f; return f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(2);
        deferreds[1].resolve(loc(7, 8, 6));
        await flushAsync();
        await p;
        // The movement result arrives late: it must be ignored.
        deferreds[0].resolve(loc(3, 4, 6));
        await flushAsync();
      });
      expect(tapped).not.toBeNull();
      expect(tapped!.latitude).toBe(7);
      expect(rendered(tree)).toBe("fixed|7,8"); // NOT 3,4
      expect(gpsRef.current!.coords).toEqual({ latitude: 7, longitude: 8 });
      await TestRenderer.act(async () => { tree.unmount(); });
    });
  });

  describe("recovery ownership and logging", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it("assigns unique, monotonically increasing ids to every recovery op", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      __setMockLocation(3, 4, 6);

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      await TestRenderer.act(async () => {
        await gpsRef.current!.refreshNow();
        await flushAsync();
      });
      // Three recovery operations should have been started: 2 automatic + 1 manual
      expect(spy).toHaveBeenCalledTimes(3);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("logs recovery START and SUCCESS summary (no per-attempt noise)", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      __setMockLocation(3, 4, 12);

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      // No per-attempt noise should be logged
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]?.accuracy).toBe(Location.Accuracy.Balanced);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("stale results never update coords, accuracy, status or the current fix", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();
      const log = jest.spyOn(console, "log").mockImplementation(() => {});

      // Start an automatic recovery whose attempt #1 stays in flight.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);

      // Manual pre-empts it and adopts its own fresh fix first.
      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow().then((f) => { tapped = f; return f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(2);
        deferreds[1].resolve(loc(9, 10, 6));
        await flushAsync();
        await p;
      });
      expect(tapped).not.toBeNull();
      expect(tapped!.latitude).toBe(9);
      expect(gpsRef.current!.accuracyM).toBe(6);

      // The stale automatic result arrives late: nothing may change.
      await TestRenderer.act(async () => {
        deferreds[0].resolve(loc(5, 5, 2));
        await flushAsync();
      });
      expect(gpsRef.current!.coords).toEqual({ latitude: 9, longitude: 10 });
      expect(gpsRef.current!.accuracyM).toBe(6);
      expect(gpsRef.current!.status).toBe("fixed");
      expect(gpsRef.current!.currentFix).not.toBeNull();
      expect(gpsRef.current!.currentFix!.latitude).toBe(9);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("unmount stops tracking and clears timers, watcher and pending windows", async () => {
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      // An armed movement window at unmount time.
      await TestRenderer.act(async () => {
        __setMockLocation(3, 4, 6);
        __emitWatchLocation(3, 4, 6);
        await flushAsync();
      });
      await TestRenderer.act(async () => { tree.unmount(); });

      // No device work after unmount: neither the movement window nor the
      // automatic cadence may fire.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS + GPS_AUTO_REFRESH_MS * 2);
        await flushAsync();
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it("stops the automatic refresh when the camera becomes inactive and on unmount", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ActiveProbe />);
      await flushAsync();
    });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(100); // simulated onCameraReady
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|0,0");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    __setMockLocation(3, 4, 6);

    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1); // automatic update while active

    await TestRenderer.act(async () => { tree.unmount(); });
    __setMockLocation(7, 8, 9);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS * 2);
      await flushAsync();
    });
    expect(spy).toHaveBeenCalledTimes(1); // no device work after unmount
  });

  it("registers watchPositionAsync with Balanced accuracy and the configured distance interval", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const spy = jest.spyOn(Location, "watchPositionAsync");
    const tree = await renderProbe();
    const options = spy.mock.calls.find((c) => typeof c[0] === "object")?.[0] as
      | { accuracy?: number; distanceInterval?: number }
      | undefined;
    expect(options).toBeDefined();
    expect(options?.accuracy).toBe(Location.Accuracy.Balanced);
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
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      __setMockLocation(3, 3, 6);
      __emitWatchLocation(3, 3, 6);
      await flushAsync();
    });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
      await flushAsync();
    });
    expect(rendered(tree2)).toBe("fixed|3,3");
    expect(spy).toHaveBeenCalled();
    await TestRenderer.act(async () => { tree2.unmount(); });
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

  it("an automatic recovery resets the movement reference and the fix timestamp", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");

    // The automatic cadence adopts a new device fix.
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    expect(spy).toHaveBeenCalledTimes(1);

    // Reference reset: ~5 m away from the ADOPTED fix is below the threshold,
    // so no further recovery fires (the same point would exceed the threshold
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

  it("a movement recovery resets the movement reference and the fix timestamp", async () => {
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
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
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
    // GPS_MAX_ATTEMPTS x GPS_PARALLEL_REQUESTS capture requests, plus the one
    // automatic recovery attempt #1 that fires at the 20 s cadence during the wait.
    expect(spy).toHaveBeenCalledTimes(
      GPS_PARALLEL_REQUESTS * GPS_MAX_ATTEMPTS + 1
    );
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
    // The capture's GPS_MAX_ATTEMPTS x GPS_PARALLEL_REQUESTS batches, plus the
    // one automatic recovery attempt #1 that fires at the 20 s cadence during
    // the wait. A failed refresh never adopts anything.
    expect(spy).toHaveBeenCalledTimes(
      GPS_PARALLEL_REQUESTS * GPS_MAX_ATTEMPTS + 1
    );
    if (promise) await promise;
    // A failed capture must preserve the stale fix, not adopt anything.
    expect(gpsRef.current!.coords).toEqual({ latitude: 10, longitude: 20 });
    expect(gpsRef.current!.accuracyM).toBe(30);
    expect(rendered(tree)).toBe("stale|10,20");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps accepts a valid one-shot result regardless of its age (freshness gate removed)", async () => {
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
    // The result has valid coordinates and is adopted.
    expect(outcome).toBe("34.05,-118.25");
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

  describe("one-shot concurrency (independent recovery ops)", () => {
    it("manual Highest refresh does NOT join an in-flight automatic recovery", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 25, -60_000);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const { spy, deferreds } = installPerCallSpy();
      // The cadence starts a Balanced attempt that stays in flight.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);

      // A manual tap opens a genuine, separate Highest request.
      let tapped: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = gpsRef.current!.refreshNow().then((f) => { tapped = f; return f; });
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(2);
        expect(accuracyOf(spy.mock.calls[1])).toBe(Location.Accuracy.Highest);
        // The manual result adopts…
        deferreds[1].resolve(loc(5, 6, 7));
        await flushAsync();
        await p;
        // …and the superseded automatic result is ignored.
        deferreds[0].resolve(loc(3, 4, 6));
        await flushAsync();
      });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(tapped).not.toBeNull();
      expect(tapped!.latitude).toBe(5);
      expect(rendered(tree)).toBe("fixed|5,6");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("automatic recovery in flight + captureGps → independent requests (no join)", async () => {
      jest.useFakeTimers();
      __setPermissionStatus("granted");
      __setMockLastKnown(1, 2, 5, 0);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      // Let the seed age past the stale boundary (with no spy installed, so the
      // cadence ticks during this warm-up are not counted) so capture must
      // acquire fresh instead of using the cached snapshot.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_STALE_MS + 1_000);
        await flushAsync();
      });
      expect(rendered(tree)).toBe("stale|1,2");

      const deferreds: ReturnType<typeof makeDeferred>[] = [];
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");
      spy.mockImplementation(() => {
        const d = makeDeferred();
        deferreds.push(d);
        return d.promise;
      });

      // The next automatic cadence tick starts a Balanced attempt left in flight.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(GPS_AUTO_REFRESH_MS);
        await flushAsync();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(accuracyOf(spy.mock.calls[0])).toBe(Location.Accuracy.Balanced);
      });

      let captured: GpsFix | null = null;
      await TestRenderer.act(async () => {
        const p = captureGpsFn!().then((f) => { captured = f; return f; });
        await flushAsync();
        // capture does NOT join the running automatic attempt; it opens its own batch.
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
        // capture starts its own balanced batch, refreshNow its own Highest request.
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

    it("clears the current op after a successful one-shot (next request starts fresh)", async () => {
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

      // A second request must start a NEW device call, not reuse the resolved step.
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

    it("clears the current op after a failed one-shot (next request starts fresh)", async () => {
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
        // Failing attempt #1 triggers manual attempt #2 (also Highest), which
        // opens a fresh device call that must be settled too — otherwise the
        // recovery never completes.
        deferreds[0].reject(new Error("GPS failure"));
        await flushAsync();
        expect(call).toBe(2);
        deferreds[1].reject(new Error("GPS failure"));
        first = await p;
        await flushAsync();
      });
      expect(first).toBeNull();
      expect(rendered(tree)).toBe("fixed|1,2"); // old fix kept, op slot cleared

      await TestRenderer.act(async () => {
        const p2 = gpsRef.current!.refreshNow(); // must start a NEW device call
        await flushAsync();
        expect(call).toBe(3);
        deferreds[2].resolve(loc(9, 10, 4));
        await p2;
        await flushAsync();
      });
      expect(call).toBe(3);
      expect(rendered(tree)).toBe("fixed|9,10");
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("a failed manual recovery does not permanently block future requests", async () => {
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
        // Attempt #1 fails: the shared deferred rejects, so every attempt in
        // this manual recovery returns NO_FIX.
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

    it("policy: captureGps fires Balanced parallel batch while refreshNow fires Highest", async () => {
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
        // captureGps fires GPS_PARALLEL_REQUESTS Balanced requests (its own batch)
        // refreshNow fires 1 Highest request via its manual recovery
        expect(spy).toHaveBeenCalledTimes(GPS_PARALLEL_REQUESTS + 1);
        d.resolve(loc(5, 6, 7));
        await Promise.all([cp, rp]);
        await flushAsync();
      });
      const highestCalls = spy.mock.calls.filter((c) => accuracyOf(c) === Location.Accuracy.Highest);
      const balancedCalls = spy.mock.calls.filter((c) => accuracyOf(c) === Location.Accuracy.Balanced);
      expect(balancedCalls).toHaveLength(GPS_PARALLEL_REQUESTS); // capture batch ran Balanced
      expect(highestCalls).toHaveLength(1); // refreshNow ran its own Highest request
      expect(captured).not.toBeNull();
      expect(captured!.latitude).toBe(5);
      expect(tapped!.latitude).toBe(5);
      expect(gpsRef.current!.refreshing).toBe(false);
      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("refreshing stays true during a manual recovery and clears when it finishes", async () => {
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
          expect(accuracyOf(call)).toBe(Location.Accuracy.Balanced);
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
      // GPS_MAX_ATTEMPTS x GPS_PARALLEL_REQUESTS capture requests, plus the
      // single automatic recovery attempt #1 that fires at the 20 s cadence.
      expect(spy).toHaveBeenCalledTimes(
        GPS_MAX_ATTEMPTS * GPS_PARALLEL_REQUESTS + 1
      );
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

  describe("movement dirty + immediate shutter forces fresh GPS", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("movement dirty → immediate shutter → cached GPS rejected → fresh GPS acquired", async () => {
      __setPermissionStatus("granted");
      // Start with a valid fix at location A
      __setMockLocation(1, 2, 12);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");
      expect(gpsRef.current!.movementDirty).toBe(false);

      // Simulate movement detected by accelerometer (movementDirty becomes true)
      const mockAcc = Accelerometer as any;
      await TestRenderer.act(async () => {
        mockAcc.__setMockAcceleration(0, 0, 12); // 12 m/s² > 1.5 threshold
        jest.advanceTimersByTime(500);
      });
      await flushAsync();
      await TestRenderer.act(async () => {
        mockAcc.__setMockAcceleration(0, 0, 12); // 2nd sample for confirmation
        jest.advanceTimersByTime(500);
      });
      await flushAsync();

      // Movement detected - GPS should be marked dirty
      expect(gpsRef.current!.movementState).toBe("moving");
      expect(gpsRef.current!.movementDirty).toBe(true);

      // Now simulate shutter press IMMEDIATELY (before the 15-second window fires)
      // captureGps() should NOT return the cached fix (1,2) because movementDirty=true
      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      // Set up the mock to return a NEW location B when fresh GPS is requested
      __setMockLocation(8, 9, 10); // New location B

      let captureResult: string | null = null;
      await TestRenderer.act(async () => {
        const result = await captureGpsFn!();
        captureResult = result ? `${result.latitude},${result.longitude}` : "null";
      });

      // Fast path should be blocked — getCurrentPositionAsync should be called
      expect(spy).toHaveBeenCalled();
      // Should return the NEW location B, NOT the old cached location A
      expect(captureResult).toBe("8,9");
      expect(captureResult).not.toBe("1,2"); // Old cached GPS must NOT be returned

      await TestRenderer.act(async () => { tree.unmount(); });
    });

    it("movement-triggered recovery uses Balanced accuracy after the movement window", async () => {
      __setPermissionStatus("granted");
      __setMockLocation(1, 2, 12);
      const tree = await renderProbe();
      expect(rendered(tree)).toBe("fixed|1,2");

      const spy = jest.spyOn(Location, "getCurrentPositionAsync");

      const mockAcc = Accelerometer as any;
      await TestRenderer.act(async () => {
        mockAcc.__setMockAcceleration(0, 0, 12);
        jest.advanceTimersByTime(500);
      });
      await flushAsync();
      await TestRenderer.act(async () => {
        mockAcc.__setMockAcceleration(0, 0, 12);
        jest.advanceTimersByTime(500);
      });
      await flushAsync();
      expect(gpsRef.current!.movementState).toBe("moving");

      // The 15-second movement window completes and fires a Balanced recovery.
      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(MOVEMENT_GPS_DELAY_MS);
        await flushAsync();
      });
      await flushAsync();

      const balancedCall = spy.mock.calls.find(
        (c) => (c[0] as { accuracy?: number } | undefined)?.accuracy === Location.Accuracy.Balanced
      );
      expect(balancedCall).toBeDefined();

      await TestRenderer.act(async () => { tree.unmount(); });
    });
  });
});

describe("GPS Quality Helper", () => {
  it("returns High Accuracy (green) for 0m accuracy", () => {
    expect(getGpsQuality(0)).toEqual({ level: "excellent", label: "High Accuracy ±20 m", color: "#4CAF50" });
  });

  it("returns High Accuracy (green) for 10m accuracy", () => {
    expect(getGpsQuality(10)).toEqual({ level: "excellent", label: "High Accuracy ±20 m", color: "#4CAF50" });
  });

  it("returns High Accuracy (green) at the 20m boundary", () => {
    expect(getGpsQuality(20)).toEqual({ level: "excellent", label: "High Accuracy ±20 m", color: "#4CAF50" });
  });

  it("returns Medium Accuracy (orange) just above 20m", () => {
    expect(getGpsQuality(20.1)).toEqual({ level: "moderate", label: "Medium Accuracy ±50 m", color: "#FF9800" });
  });

  it("returns Medium Accuracy (orange) for 30m accuracy", () => {
    expect(getGpsQuality(30)).toEqual({ level: "moderate", label: "Medium Accuracy ±50 m", color: "#FF9800" });
  });

  it("returns Medium Accuracy (orange) at the 50m boundary", () => {
    expect(getGpsQuality(50)).toEqual({ level: "moderate", label: "Medium Accuracy ±50 m", color: "#FF9800" });
  });

  it("returns Low Accuracy (red) just above 50m", () => {
    expect(getGpsQuality(50.1)).toEqual({ level: "poor", label: "Low Accuracy ±50 m+", color: "#F44336" });
  });

  it("returns Low Accuracy (red) for 95m accuracy", () => {
    expect(getGpsQuality(95)).toEqual({ level: "poor", label: "Low Accuracy ±50 m+", color: "#F44336" });
  });

  it("returns Low Accuracy (red) for 100m accuracy (still a valid fix)", () => {
    expect(getGpsQuality(100)).toEqual({ level: "poor", label: "Low Accuracy ±50 m+", color: "#F44336" });
  });

  it("returns No GPS (gray) for null accuracy", () => {
    expect(getGpsQuality(null)).toEqual({ level: "unavailable", label: "No GPS", color: "#9E9E9E" });
  });

  it("returns No GPS (gray) for undefined accuracy", () => {
    expect(getGpsQuality(undefined)).toEqual({ level: "unavailable", label: "No GPS", color: "#9E9E9E" });
  });

  it("returns No GPS (gray) for NaN accuracy", () => {
    expect(getGpsQuality(NaN)).toEqual({ level: "unavailable", label: "No GPS", color: "#9E9E9E" });
  });

  it("returns No GPS (gray) for negative accuracy", () => {
    expect(getGpsQuality(-1)).toEqual({ level: "unavailable", label: "No GPS", color: "#9E9E9E" });
  });

  it("returns Low Accuracy (red) for Infinity accuracy", () => {
    expect(getGpsQuality(Infinity)).toEqual({ level: "poor", label: "Low Accuracy ±50 m+", color: "#F44336" });
  });
});