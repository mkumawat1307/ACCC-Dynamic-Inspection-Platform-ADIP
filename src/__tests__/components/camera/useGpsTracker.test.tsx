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
import { useGpsTracker, GpsFix } from "@/src/components/camera/useGpsTracker";

let captureGpsFn: ((graceMs?: number) => Promise<GpsFix | null>) | null = null;

function Probe() {
  const gps = useGpsTracker();
  captureGpsFn = gps.captureGps;
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
});
