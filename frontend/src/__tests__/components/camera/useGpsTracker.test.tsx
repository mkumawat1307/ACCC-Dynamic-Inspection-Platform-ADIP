jest.mock("expo-location");

import React from "react";
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
import { useGpsTracker, GpsFix, GPS_STATUS_TICK_MS, GPS_WATCH_VALIDATION_MS } from "@/src/components/camera/useGpsTracker";
import {
  GPS_ONE_SHOT_TIMEOUT_CACHED_MS,
  GPS_ONE_SHOT_TIMEOUT_COLD_MS,
  GPS_STALE_MS,
  GPS_MOVE_THRESHOLD_M,
  GPS_WATCH_ACQUIRING_MIN_MS,
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

  it("rejects fixes above the accuracy threshold and stays acquiring", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25, 99);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("acquiring|none");
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

  it("updates coords from watch callbacks", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      __emitWatchLocation(1, 2, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("flips to stale when the fix ages out and revives on a new watch fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(61_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("stale|1,2");
    await TestRenderer.act(async () => {
      __emitWatchLocation(7, 8, 20);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|7,8");
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
      jest.advanceTimersByTime(61_000);
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

  it("captureGps resolves null on cold-start timeout", async () => {
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
      jest.advanceTimersByTime(GPS_ONE_SHOT_TIMEOUT_COLD_MS + 500);
      await flushAsync();
    });
    expect(outcome).toBe("null");
    if (promise) await promise;
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps resolves null on the cached timeout while holding a stale fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 0);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(61_000);
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
      jest.advanceTimersByTime(GPS_ONE_SHOT_TIMEOUT_CACHED_MS + 500);
      await flushAsync();
    });
    expect(outcome).toBe("null");
    if (promise) await promise;
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

  it("refreshes the fix in the background poll when it becomes stale", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 11_000);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(500);
      await flushAsync();
    });
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("does not refresh in the background poll while the fix is fresh and accurate", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 25, -60_000);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    expect(spy).not.toHaveBeenCalled();
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("background poll requests Balanced accuracy when accuracy degrades", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 30, -60_000); // accuracy above the refresh threshold, fresh age
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushAsync();
    });
    const opt = spy.mock.calls[0]?.[0] as { accuracy?: number } | undefined;
    expect(opt?.accuracy).toBe(Location.Accuracy.Balanced);
    expect(rendered(tree)).toBe("fixed|3,4");
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

  it("registers watchPositionAsync with the configured 10 m distance interval", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const spy = jest.spyOn(Location, "watchPositionAsync");
    const tree = await renderProbe();
    const options = spy.mock.calls.find((c) => typeof c[0] === "object")?.[0] as
      | { distanceInterval?: number }
      | undefined;
    expect(options).toBeDefined();
    expect(options?.distanceInterval).toBe(GPS_MOVE_THRESHOLD_M);
    expect(options?.distanceInterval).toBe(10);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("unmount removes the watcher and remount registers a new active watcher (no duplicate)", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      __emitWatchLocation(1, 1, 5);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,1");
    await TestRenderer.act(async () => { tree.unmount(); });

    await TestRenderer.act(async () => {
      __emitWatchLocation(2, 2, 5);
      await flushAsync();
    });

    __setMockLocation(0, 0, 5);
    const tree2 = await renderProbe();
    expect(rendered(tree2)).toBe("fixed|0,0");
    await TestRenderer.act(async () => {
      __emitWatchLocation(3, 3, 5);
      await flushAsync();
    });
    expect(rendered(tree2)).toBe("acquiring|0,0");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
expect(rendered(tree2)).toBe("fixed|3,3");
    await TestRenderer.act(async () => { tree2.unmount(); });
  });

  it("race A: watcher update just before the settle tick is not consumed by the tick", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    // Move to just before the next free-running settle tick (interval starts at t=0).
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(999);
      await flushAsync();
    });
    await TestRenderer.act(async () => {
      __emitWatchLocation(3, 4, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    // The old free-running tick at the 1000ms mark must NOT consume the pending
    // candidate: the acquiring window must survive until the watcher-resynced timer.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(1);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    // The watcher-resynced validation window (emit + GPS_WATCH_VALIDATION_MS)
    // now validates the candidate.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(999);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("race B: acquiring is guaranteed a minimum dwell and capture refuses while pending", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      __emitWatchLocation(3, 4, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    // Capture must refuse while the watcher fix still awaits validation.
    expect(await gpsRef.current!.captureGps()).toBeNull();
    // Before the minimum acquiring dwell elapses the status must still be acquiring.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_WATCH_ACQUIRING_MIN_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    expect(await gpsRef.current!.captureGps()).toBeNull();
    // After the validation window the fix is adopted and capture becomes available.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_WATCH_VALIDATION_MS - GPS_WATCH_ACQUIRING_MIN_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    const after = await gpsRef.current!.captureGps();
    expect(after).not.toBeNull();
    expect(after!.latitude).toBe(3);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("race C: a later watcher update reschedules the window and supersedes the earlier candidate", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|0,0");
    await TestRenderer.act(async () => {
      __emitWatchLocation(10, 20, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    // New update arrives mid-window: it cancels the previous validation timer.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
      await flushAsync();
    });
    await TestRenderer.act(async () => {
      __emitWatchLocation(30, 40, 6);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    // At the ORIGINAL first-update deadline (+1000 from the first emit) the
    // superseded candidate must NOT be adopted.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(600);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    // The resynced window for the second update validates at +1000 from it.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|30,40");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("race D: invalid watcher fix never becomes the capture source and the old fix is protected", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      __emitWatchLocation(99, 99, 99);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    // While the invalid candidate awaits validation, capture must refuse.
    expect(await gpsRef.current!.captureGps()).toBeNull();
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_WATCH_VALIDATION_MS);
      await flushAsync();
    });
    // Rejected: status returns to the previous valid fix, coords unchanged.
    expect(rendered(tree)).toBe("fixed|1,2");
    const captured = await gpsRef.current!.captureGps();
    expect(captured).not.toBeNull();
    expect(captured!.latitude).toBe(1);
    expect(captured!.longitude).toBe(2);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("race E: every watcher update opens a fresh acquiring window and capture stays gated", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|0,0");
    await TestRenderer.act(async () => {
      __emitWatchLocation(10, 20, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_WATCH_VALIDATION_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|10,20");
    // A second real update re-enters acquiring with its own window.
    await TestRenderer.act(async () => {
      __emitWatchLocation(30, 40, 6);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|10,20");
    expect(await gpsRef.current!.captureGps()).toBeNull();
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_WATCH_VALIDATION_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|30,40");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("race F: unmount clears the pending validation timer and late capture refuses", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    const gpsSnap = gpsRef.current!;
    await TestRenderer.act(async () => {
      __emitWatchLocation(3, 4, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    // Unmount while a validation window is pending.
    await TestRenderer.act(async () => { tree.unmount(); });
    // Advancing across the validation mark after unmount must not throw or
    // mutate state (the resynced timer is cleared on unmount).
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_WATCH_VALIDATION_MS + 5_000);
      await flushAsync();
    });
const late = await gpsSnap.captureGps();
    expect(late).toBeNull();
  });

  it("captureGps after unmount refuses late fixes", async () => {
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    const gpsSnap = gpsRef.current!;
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => { tree.unmount(); });

    await TestRenderer.act(async () => {
      const result = await gpsSnap.captureGps();
      expect(result).toBeNull();
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("test A: watcher valid update goes acquiring then fixed on the next tick", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      __emitWatchLocation(3, 4, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|3,4");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("test B: watcher invalid update goes acquiring then reverts to the old fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => {
      __emitWatchLocation(99, 99, 99);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|1,2");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    const captured = await gpsRef.current!.captureGps();
    expect(captured).not.toBeNull();
    expect(captured!.latitude).toBe(1);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("test C: two sequential valid watcher updates each pass through acquiring", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|0,0");
    await TestRenderer.act(async () => {
      __emitWatchLocation(10, 20, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|0,0");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|10,20");
    await TestRenderer.act(async () => {
      __emitWatchLocation(30, 40, 6);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("acquiring|10,20");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(GPS_STATUS_TICK_MS);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|30,40");
    await TestRenderer.act(async () => { tree.unmount(); });
  });
});