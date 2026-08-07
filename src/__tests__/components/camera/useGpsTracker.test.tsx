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
import { useGpsTracker, GpsFix } from "@/src/components/camera/useGpsTracker";

let captureGpsFn: ((graceMs?: number) => Promise<GpsFix | null>) | null = null;
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
    __setPermissionStatus("granted");
    __setMockLocation(0, 0, 5);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      __emitWatchLocation(1, 2, 8);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps resolves null when no fix arrives within the grace window", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    const tree = await renderProbe();
    let outcome: string | null = null;
    let promise: Promise<GpsFix | null> | null = null;
    await TestRenderer.act(async () => {
      promise = captureGpsFn!(5000).then((f) => {
        outcome = f ? "fixed" : "null";
        return f;
      });
      jest.advanceTimersByTime(5000);
      await flushAsync();
    });
    expect(outcome).toBe("null");
    await promise;
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("captureGps resolves the first acceptable fix within the grace window", async () => {
    __setPermissionStatus("granted");
    const tree = await renderProbe();
    let outcome: string | null = null;
    await TestRenderer.act(async () => {
      const p = captureGpsFn!(5000).then((f) => {
        outcome = f ? `${f.latitude},${f.longitude}` : "null";
        return f;
      });
      __setMockLocation(7, 8, 20);
      await flushAsync();
      __emitWatchLocation(7, 8, 20);
      await flushAsync();
      await p;
    });
    expect(outcome).toBe("7,8");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("returns a fresh usable cached fix without a new one-shot", async () => {
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 5, 0);
    const tree = await renderProbe();
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const fix = await gpsRef.current!.captureGps(500);
    expect(fix).not.toBeNull();
    expect(fix!.accuracyM).toBe(5);
    expect(spy).not.toHaveBeenCalled();
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
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(500);
      await flushAsync();
    });
    __setMockLocation(3, 4, 6);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushAsync();
    });
    expect(rendered(tree)).toBe("fixed|1,2");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("refreshNow performs a one-shot and returns the fix", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(9, 9, 4);
    const tree = await renderProbe();
    const fix = await gpsRef.current!.refreshNow();
    expect(fix).not.toBeNull();
    expect(fix!.accuracyM).toBe(4);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("refreshNow requests Highest accuracy and flips refreshing on/off", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLocation(9, 9, 4);
    const tree = await renderProbe();
    let refreshingDuring: boolean | null = null;
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    const p = gpsRef.current!.refreshNow().then((fix) => {
      refreshingDuring = gpsRef.current!.refreshing;
      return fix;
    });
    await TestRenderer.act(async () => {
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

  it("refreshNow adopts an acceptable fresh fix and clears refreshing", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(7, 8, 12);
    const tree = await renderProbe();
    await TestRenderer.act(async () => {
      const fix = (await gpsRef.current!.refreshNow())!;
      expect(fix.latitude).toBe(7);
      expect(fix.longitude).toBe(8);
      expect(fix.accuracyM).toBe(12);
    });
    expect(gpsRef.current!.refreshing).toBe(false);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("refreshNow ignores an unacceptable fix and falls back to the last good fix", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(10, 20, 30, 1000); // seeds a fresh, acceptable, cached fix first
    const tree = await renderProbe();
    expect(rendered(tree)).toBe("fixed|10,20");
    __setMockLocation(5, 6, 99); // unacceptable accuracy
    await TestRenderer.act(async () => {
      const fix = await gpsRef.current!.refreshNow();
      expect(fix).not.toBeNull();
      expect(fix!.latitude).toBe(10);  // falls back to the last good fix
      expect(fix!.longitude).toBe(20);
    });
    // the hook's accepted state must remain the last good fix
    await TestRenderer.act(async () => { await flushAsync(); });
    expect(rendered(tree)).toBe("fixed|10,20"); // not moved to 5,6
    expect(gpsRef.current!.refreshing).toBe(false);
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("background poll still requests Balanced accuracy", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");
    __setMockLastKnown(1, 2, 25, -60_000);
    const tree = await renderProbe();
    const spy = jest.spyOn(Location, "getCurrentPositionAsync");
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(10_000);
      await flushAsync();
    });
    const opt = spy.mock.calls[0]?.[0] as { accuracy?: number } | undefined;
    expect(opt?.accuracy).toBe(Location.Accuracy.Balanced);
    await TestRenderer.act(async () => { tree.unmount(); });
  });
});
