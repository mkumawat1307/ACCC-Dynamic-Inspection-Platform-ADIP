# Live Watermark Camera Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the system-camera `expo-image-picker` capture flow with an in-app `expo-camera` `CameraView` screen that shows a live watermark overlay on the viewfinder, acquires GPS during preview (shutter gated on an acceptable fix), and merges the watermark via the existing WebView canvas pipeline while a confirm screen (Retake / Keep) is shown.

**Architecture:** A full-screen route `app/inspection/capture.tsx` hosts `CameraView` + a `WatermarkOverlay` (pure RN preview approximation, metrics from a shared `computeWatermarkMetrics`). `useGpsTracker` seeds from last-known, races a fresh fix, watches with a distance threshold, and re-refreshes when stale; `captureGps(graceMs)` resolves a fix or null. On shutter, a photo row is created, then `enqueueWatermark` runs the existing `useWatermarkProcessor` (hidden `WatermarkMergeWebView`, same `buildWatermarkPage` canvas → JPEG 0.95 → SAF write → `updateFilePath`), so the final saved image is **pixel-identical to today's output**. `useCaptureFlow` is a pure reducer state machine (`preview → merging → confirm`, with `failed`/`retake`). PhotoSection's capture button now navigates to the capture route; `usePhotoCapture.ts` and `expo-image-picker` are deleted.

**Tech Stack:** React Native (Expo SDK 54), `expo-camera` (~17.x), `expo-location` (~19.x), `react-native-webview`, react-native-paper, TypeScript strict, Jest (expo-sqlite / expo-file-system in-memory mocks).

**Spec:** `docs/superpowers/specs/2026-08-04-live-watermark-camera-design.md`

## Global Constraints

- Commits are **SKIPPED** — AGENTS.md forbids committing unless the user explicitly asks. Every task ends with a verification run instead of a commit.
- Run from `frontend/`: verify with `npx tsc --noEmit`, `npx eslint app src`, `npx jest <path>`.
- Path alias `@/*` → `frontend/*`. No comments in code unless requested. TypeScript strict — no `any` in new code.
- ADR-014 / sequential open-close: the capture screen runs **inside the inspection flow** — never call `getGlobalDatabase()`. All DB access goes through repositories using `getDatabase()` (the active project handle). Project data comes from the `useInspection()` context + navigation params, never a fresh `ProjectRepository` fetch.
- No new tables/columns → no schema migration.
- Config constants (`src/components/camera/captureConfig.ts`): `MAX_GPS_ACCURACY_M = 50`, `GPS_STALE_MS = 60000`, `GPS_MOVE_THRESHOLD_M = 15`, `GPS_GRACE_MS = 5000`, `PHOTO_QUALITY = 0.8`, `GPS_ONE_SHOT_TIMEOUT_CACHED_MS = 8000`, `GPS_ONE_SHOT_TIMEOUT_COLD_MS = 20000`.
- Watermark appearance is **locked**: `fSize = max(40, round(min(w,h)/35))`, `lh = round(fSize*1.4)`, `padY = round(fSize*0.5)`, `rPad = round(fSize*0.6)`, `gap = round(fSize*0.7)`; box bottom-left `(gap, h - rh - gap)`, `rgba(0,0,0,0.6)`, radius 10; text `#76FF03` bold monospace; export JPEG 0.95. The **final merge always uses `buildWatermarkPage`** (Task 9 never changes `watermarkHtml.ts`).
- Every new file gets no blanket coverage requirement (not in `jest.config.js` coverageThreshold), but Task 12's full `npx jest` must stay green (41 suites / 507+ tests) and Task 11 ships the isolation regression.
- Do not regress: existing `usePhotoCapture`-independent tests, `location.test.ts` (uses the extended mock — keep `__setMockLocation(lat, lng)` backward compatible), `watermarkHtml.test.ts`.

---

### Task 1: Install `expo-camera` and register its config plugin

**Files:**
- Modify: `frontend/package.json` (via `npx expo install`)
- Modify: `frontend/app.json` (plugins array)

**Interfaces:**
- Consumes: none.
- Produces: `expo-camera` available to import (`CameraView`, `useCameraPermissions`); the `expo-camera` config plugin with `cameraPermission` text.

- [ ] **Step 1: Install the dependency**

Run (in `frontend/`):
```
npx expo install expo-camera
```
Expected: `expo-camera` (~17.x) added to `dependencies` in `package.json` (yarn.lock updated by Expo's resolved version).

- [ ] **Step 2: Register the plugin in `app.json`**

In `frontend/app.json`, inside the top-level `plugins` array (after the `expo-location` entry, before `expo-image-picker`), add:

```json
      [
        "expo-camera",
        {
          "cameraPermission": "Take photos of the pole and equipment"
        }
      ],
```

(`android.permission.CAMERA` is already present under `expo.android.permissions` — no change needed.)

- [ ] **Step 3: Verify**

Run: `npx expo-doctor`
Expected: no config/dependency errors (expo-doctor reports the new package is the SDK-54-correct version).

Run: `npx tsc --noEmit`
Expected: no type errors (the import surface will be exercised from Task 9 onward).

---

### Task 2: Extend the `expo-location` mock and add the `expo-camera` mock

**Files:**
- Modify: `frontend/__mocks__/expo-location.ts`
- Create: `frontend/__mocks__/expo-camera.ts`

**Interfaces:**
- Consumes: existing `expo-location` mock contract (keeps `__setPermissionStatus`, `__setMockLocation`, `__resetLocationState` backward compatible).
- Produces: controllable `watchPositionAsync` + `reverseGeocodeAsync`, accuracy + timestamp on coords, and a `CameraView` mock whose ref exposes `takePictureAsync` returning a temp URI + dimensions.

- [ ] **Step 1: Rewrite `__mocks__/expo-location.ts`**

Replace the whole file with:

```ts
const Accuracy = {
  Low: 1,
  Balanced: 3,
  High: 5,
  Highest: 6,
};

let permissionStatus: "granted" | "denied" | "undetermined" = "granted";
let mockCoords: {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
} | null = null;
let mockLastKnown: {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
} | null = null;
let mockAddresses: Array<{ street?: string; city?: string; region?: string }> | null = null;
let watchCallback: ((loc: unknown) => void) | null = null;

function now(): number {
  return Date.now();
}

export { Accuracy };

export async function requestForegroundPermissionsAsync(): Promise<{
  status: "granted" | "denied" | "undetermined";
  granted: boolean;
  expires: "never" | number;
  canAskAgain: boolean;
}> {
  return {
    status: permissionStatus,
    granted: permissionStatus === "granted",
    expires: "never",
    canAskAgain: true,
  };
}

export async function getCurrentPositionAsync(
  _options?: { accuracy?: number }
): Promise<{
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}> {
  if (!mockCoords) {
    throw new Error("Location not available");
  }
  return { coords: { ...mockCoords }, timestamp: mockCoords.timestamp };
}

export async function getLastKnownPositionAsync(): Promise<{
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
} | null> {
  return mockLastKnown
    ? { coords: { ...mockLastKnown }, timestamp: mockLastKnown.timestamp }
    : null;
}

export async function watchPositionAsync(
  _options: unknown,
  callback: (loc: unknown) => void
): Promise<{ remove: () => void }> {
  watchCallback = callback;
  return {
    remove: () => {
      watchCallback = null;
    },
  };
}

export async function reverseGeocodeAsync(
  _coords: unknown
): Promise<Array<{ street?: string; city?: string; region?: string }> | null> {
  return mockAddresses;
}

export function __setPermissionStatus(status: "granted" | "denied" | "undetermined") {
  permissionStatus = status;
}

export function __setMockLocation(latitude: number, longitude: number, accuracy = 0) {
  mockCoords = { latitude, longitude, accuracy, timestamp: now() };
}

export function __setMockLastKnown(
  latitude: number,
  longitude: number,
  accuracy = 0,
  ageMs = 0
) {
  mockLastKnown = { latitude, longitude, accuracy, timestamp: now() - ageMs };
}

export function __setMockReverseGeocode(
  addresses: Array<{ street?: string; city?: string; region?: string }> | null
) {
  mockAddresses = addresses;
}

export function __emitWatchLocation(
  latitude: number,
  longitude: number,
  accuracy = 0
) {
  if (watchCallback) {
    watchCallback({
      coords: { latitude, longitude, accuracy, timestamp: now() },
      timestamp: now(),
    });
  }
}

export function __resetLocationState() {
  permissionStatus = "granted";
  mockCoords = null;
  mockLastKnown = null;
  mockAddresses = null;
  watchCallback = null;
}
```

Note: `__setMockLocation(lat, lng)` keeps its 2-arg signature (existing `location.test.ts` calls stay valid); `accuracy` defaults to `0` (≤ `MAX_GPS_ACCURACY_M`), and timestamps default to now (fresh).

- [ ] **Step 2: Create `__mocks__/expo-camera.ts`**

```tsx
import React from "react";
import { View } from "react-native";

type CameraViewHandle = {
  takePictureAsync: (options?: { quality?: number; skipProcessing?: boolean }) => Promise<{
    uri: string;
    width: number;
    height: number;
  }>;
};

export const CameraView = React.forwardRef<CameraViewHandle, any>(
  (_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn(async () => ({
        uri: "file:///mock/camera/capture.jpg",
        width: 1080,
        height: 1920,
      })),
    }));
    return <View />;
  }
);
CameraView.displayName = "CameraView";

export function useCameraPermissions(): [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<{ status: string; granted: boolean }>
] {
  const requestPermission = jest.fn(async () => ({ status: "granted", granted: true }));
  return [{ granted: true, canAskAgain: true }, requestPermission];
}
```

- [ ] **Step 3: Verify existing location tests still pass and new mock compiles**

Run: `npx jest src/__tests__/utils/location.test.ts`
Expected: all 3 tests PASS (mock changes are backward compatible).

Run: `npx tsc --noEmit`
Expected: no type errors in the mocks (the `CameraView` ref handle type matches Task 9's `useRef<React.ElementRef<typeof CameraView>>(null)`).

---

### Task 3: `src/utils/geo.ts` — haversine, freshness, reverse geocode

**Files:**
- Create: `frontend/src/utils/geo.ts`
- Create: `frontend/src/__tests__/utils/geo.test.ts`

**Interfaces:**
- Consumes: `expo-location` (mock from Task 2).
- Produces: `haversineMeters(lat1, lon1, lat2, lon2): number`, `isLocationFresh(timestamp, nowMs, staleMs): boolean`, `reverseGeocode(latitude, longitude): Promise<ReverseGeocodeResult | null>` where `ReverseGeocodeResult = { label: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/utils/geo.test.ts`:

```ts
jest.mock("expo-location");

import * as Location from "expo-location";
import { __setMockReverseGeocode, __resetLocationState } from "expo-location";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    const { haversineMeters } = require("@/src/utils/geo");
    expect(haversineMeters(12.34, 56.78, 12.34, 56.78)).toBe(0);
  });

  it("approximates 1 degree of latitude (~111 km)", () => {
    const { haversineMeters } = require("@/src/utils/geo");
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  it("computes a large cross-hemisphere distance", () => {
    const { haversineMeters } = require("@/src/utils/geo");
    const d = haversineMeters(34.05, -118.25, -33.87, 151.21);
    expect(d).toBeGreaterThan(10000000);
    expect(d).toBeLessThan(15000000);
  });
});

describe("isLocationFresh", () => {
  it("returns true while within the staleness window", () => {
    const { isLocationFresh } = require("@/src/utils/geo");
    expect(isLocationFresh(1000, 60000, 60000)).toBe(true);
  });

  it("returns false at/after the staleness boundary", () => {
    const { isLocationFresh } = require("@/src/utils/geo");
    expect(isLocationFresh(0, 60000, 60000)).toBe(false);
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => {
    __resetLocationState();
  });

  it("returns null when no results are available", async () => {
    __setMockReverseGeocode(null);
    const { reverseGeocode } = require("@/src/utils/geo");
    expect(await reverseGeocode(1, 2)).toBeNull();
  });

  it("builds a label from address parts", async () => {
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    const { reverseGeocode } = require("@/src/utils/geo");
    const res = await reverseGeocode(1, 2);
    expect(res?.label).toBe("Main St, Anytown, CA");
  });

  it("returns null when geocoding throws (offline)", async () => {
    __setMockReverseGeocode(null);
    jest.spyOn(Location, "reverseGeocodeAsync").mockRejectedValueOnce(new Error("offline"));
    const { reverseGeocode } = require("@/src/utils/geo");
    expect(await reverseGeocode(1, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/utils/geo.test.ts`
Expected: FAIL — module not found (`@/src/utils/geo`).

- [ ] **Step 3: Implement `src/utils/geo.ts`**

```ts
import * as Location from "expo-location";

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isLocationFresh(
  timestamp: number,
  nowMs: number,
  staleMs: number
): boolean {
  return nowMs - timestamp <= staleMs;
}

export interface ReverseGeocodeResult {
  label: string;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!results || results.length === 0) return null;
    const first = results[0];
    const parts = [first.street, first.city, first.region].filter(Boolean) as string[];
    if (parts.length === 0) return null;
    return { label: parts.join(", ") };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/utils/geo.test.ts`
Expected: all 6 tests PASS.

---

### Task 4: `captureConfig.ts` constants + `WatermarkOverlay.tsx`

**Files:**
- Create: `frontend/src/components/camera/captureConfig.ts`
- Create: `frontend/src/components/camera/WatermarkOverlay.tsx`
- Create: `frontend/src/__tests__/components/camera/WatermarkOverlay.test.tsx`

**Interfaces:**
- Consumes: nothing external (pure).
- Produces: `captureConfig.ts` exports `MAX_GPS_ACCURACY_M`, `GPS_STALE_MS`, `GPS_MOVE_THRESHOLD_M`, `GPS_GRACE_MS`, `PHOTO_QUALITY`, `GPS_ONE_SHOT_TIMEOUT_CACHED_MS`, `GPS_ONE_SHOT_TIMEOUT_COLD_MS`. `WatermarkOverlay` exports `computeWatermarkMetrics(width, height): { fSize, lh, padY, rPad, gap }` and a default `WatermarkOverlay` component with props `{ width, height, poleId, districtBlock, dateLine, gpsLine }`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/camera/WatermarkOverlay.test.tsx`:

```tsx
import React from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import WatermarkOverlay, {
  computeWatermarkMetrics,
} from "@/src/components/camera/WatermarkOverlay";

describe("computeWatermarkMetrics (mirrors watermarkHtml.ts canvas math)", () => {
  it("clamps to fSize 40 for 1080x1920", () => {
    expect(computeWatermarkMetrics(1080, 1920)).toEqual({
      fSize: 40,
      lh: 56,
      padY: 20,
      rPad: 24,
      gap: 28,
    });
  });

  it("scales up for 4000x3000", () => {
    expect(computeWatermarkMetrics(4000, 3000)).toEqual({
      fSize: 86,
      lh: 120,
      padY: 43,
      rPad: 52,
      gap: 60,
    });
  });

  it("scales beyond the floor for 7000x7000", () => {
    expect(computeWatermarkMetrics(7000, 7000)).toEqual({
      fSize: 200,
      lh: 280,
      padY: 100,
      rPad: 120,
      gap: 140,
    });
  });
});

describe("WatermarkOverlay", () => {
  it("renders the 4 watermark lines in order", () => {
    const tree = TestRenderer.create(
      <WatermarkOverlay
        width={1080}
        height={1920}
        poleId="P-101"
        districtBlock="North, B3"
        dateLine="04-Aug-2026 10:00 AM"
        gpsLine="Acquiring GPS…"
      />
    );
    const texts = tree.root
      .findAllByType(Text)
      .map((t) => String((t.props as { children?: unknown }).children));
    expect(texts).toEqual([
      "P-101",
      "North, B3",
      "04-Aug-2026 10:00 AM",
      "Acquiring GPS…",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/components/camera/WatermarkOverlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `captureConfig.ts`**

```ts
export const MAX_GPS_ACCURACY_M = 50;
export const GPS_STALE_MS = 60000;
export const GPS_MOVE_THRESHOLD_M = 15;
export const GPS_GRACE_MS = 5000;
export const PHOTO_QUALITY = 0.8;
export const GPS_ONE_SHOT_TIMEOUT_CACHED_MS = 8000;
export const GPS_ONE_SHOT_TIMEOUT_COLD_MS = 20000;
```

- [ ] **Step 4: Create `WatermarkOverlay.tsx`**

```tsx
import React from "react";
import { StyleSheet, View, Text } from "react-native";

export interface WatermarkMetrics {
  fSize: number;
  lh: number;
  padY: number;
  rPad: number;
  gap: number;
}

export function computeWatermarkMetrics(
  width: number,
  height: number
): WatermarkMetrics {
  const baseSize = Math.min(width, height);
  const fSize = Math.max(40, Math.round(baseSize / 35));
  return {
    fSize,
    lh: Math.round(fSize * 1.4),
    padY: Math.round(fSize * 0.5),
    rPad: Math.round(fSize * 0.6),
    gap: Math.round(fSize * 0.7),
  };
}

interface Props {
  width: number;
  height: number;
  poleId: string;
  districtBlock: string;
  dateLine: string;
  gpsLine: string;
}

export default function WatermarkOverlay({
  width,
  height,
  poleId,
  districtBlock,
  dateLine,
  gpsLine,
}: Props) {
  const m = computeWatermarkMetrics(width, height);
  const lines = [poleId, districtBlock, dateLine, gpsLine];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.box,
        {
          bottom: m.gap,
          left: m.gap,
          paddingVertical: m.padY,
          paddingHorizontal: m.rPad,
          borderRadius: 10,
        },
      ]}
    >
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize: m.fSize,
            lineHeight: m.lh,
            color: "#76FF03",
            fontWeight: "bold",
            fontFamily: "monospace",
          }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/camera/WatermarkOverlay.test.tsx`
Expected: all 4 tests PASS.

---

### Task 5: `useGpsTracker` hook

**Files:**
- Create: `frontend/src/components/camera/useGpsTracker.ts`
- Create: `frontend/src/__tests__/components/camera/useGpsTracker.test.tsx`

**Interfaces:**
- Consumes: `captureConfig` constants (Task 4), `Location` mock (Task 2).
- Produces: `useGpsTracker(): { status: "loading" | "acquiring" | "fixed" | "denied", coords: { latitude, longitude } | null, accuracyM: number | null, ageMs: number | null, captureGps(graceMs?): Promise<GpsFix | null> }` with `GpsFix = { latitude, longitude, accuracyM, timestamp }`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/camera/useGpsTracker.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/components/camera/useGpsTracker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/camera/useGpsTracker.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
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
          Date.now() - (lastKnown.timestamp ?? Date.now()) <= GPS_STALE_MS
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
        if (current && Date.now() - current.timestamp > GPS_STALE_MS) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/camera/useGpsTracker.test.tsx`
Expected: all 7 tests PASS. (No dangling timers: the fresh-fix race timer is cleared right after the race settles; the staleness `interval` is cleared on unmount.)

---

### Task 6: `PhotoRepository.getById`

**Files:**
- Modify: `frontend/src/database/repositories/PhotoRepository.ts`
- Create: `frontend/src/__tests__/database/repositories/PhotoRepository.test.ts`

**Interfaces:**
- Consumes: `getDatabase()` (project handle), existing `Photo` model.
- Produces: `PhotoRepository.getById(photoId): Promise<Photo | null>` — used by the capture screen's confirm state to load the `content://` image after the merge completes.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/database/repositories/PhotoRepository.test.ts`:

```ts
jest.mock("expo-sqlite");

const PROJECT = "/mock/documents/Projects/ProjectX/inspection.db";

describe("PhotoRepository", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("creates, reads by id, lists, updates path, and deletes a photo", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_a.jpg",
      FilePath: "file:///tmp/pole_a.jpg",
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });
    expect(photoId).toBeGreaterThan(0);

    const created = await PhotoRepository.getById(photoId);
    expect(created?.FileName).toBe("pole_a.jpg");
    expect(created?.Latitude).toBe(34.05);

    await PhotoRepository.updateFilePath(photoId, "content://mock/pole_a.jpg");
    const updated = await PhotoRepository.getById(photoId);
    expect(updated?.FilePath).toBe("content://mock/pole_a.jpg");

    const list = await PhotoRepository.getByInspection(1);
    expect(list).toHaveLength(1);

    await PhotoRepository.delete(photoId);
    expect(await PhotoRepository.getById(photoId)).toBeNull();

    await dbModule.clearActiveProject();
  });

  it("returns null for a nonexistent photo", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;
    expect(await PhotoRepository.getById(999)).toBeNull();
    await dbModule.clearActiveProject();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/database/repositories/PhotoRepository.test.ts`
Expected: FAIL — `PhotoRepository.getById is not a function`.

- [ ] **Step 3: Add `getById` to `PhotoRepository.ts`**

Insert after `getByInspection` (line 23):

```ts
  static async getById(photoId: number): Promise<Photo | null> {
    const db = await getDatabase();
    return await db.getFirstAsync<Photo>(
      `
      SELECT *
      FROM Photos
      WHERE PhotoID = ?;
      `,
      [photoId]
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/database/repositories/PhotoRepository.test.ts`
Expected: both tests PASS.

---

### Task 7: `useCaptureFlow` reducer state machine

**Files:**
- Create: `frontend/src/components/camera/useCaptureFlow.ts`
- Create: `frontend/src/__tests__/components/camera/useCaptureFlow.test.tsx`

**Interfaces:**
- Consumes: nothing external (pure reducer + `useReducer`).
- Produces: `captureFlowReducer(state, action)` with `CaptureFlowState = { phase: "preview" | "merging" | "confirm" | "failed", pending: PendingPhoto | null }`, `PendingPhoto = { photoId, tempUri, fileName, lines, timestamp }`, actions `BEGIN_CAPTURE | MERGE_COMPLETED | MERGE_FAILED | RETAKE | RETRY`, plus the hook `useCaptureFlow()` returning `{ phase, pending, beginCapture, markMergeCompleted, markMergeFailed, retake, retry }`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/camera/useCaptureFlow.test.tsx`:

```tsx
import React from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import { captureFlowReducer, initialState, useCaptureFlow } from "@/src/components/camera/useCaptureFlow";

const pending = {
  photoId: 1,
  tempUri: "file:///tmp/a.jpg",
  fileName: "a.jpg",
  lines: ["P-101", "North, B3", "04-Aug-2026 10:00 AM", "34.05, -118.25"],
  timestamp: "2026-08-04T10:00:00.000Z",
};

describe("captureFlowReducer", () => {
  it("starts in preview with no pending photo", () => {
    expect(captureFlowReducer(initialState, { type: "RETAKE" })).toEqual({
      phase: "preview",
      pending: null,
    });
  });

  it("BEGIN_CAPTURE moves preview -> merging and stores the pending photo", () => {
    const state = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    expect(state.phase).toBe("merging");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_COMPLETED moves merging -> confirm", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    expect(state.phase).toBe("confirm");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_FAILED moves merging -> failed", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    expect(state.phase).toBe("failed");
  });

  it("RETRY moves failed -> merging", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const failed = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    const state = captureFlowReducer(failed, { type: "RETRY" });
    expect(state.phase).toBe("merging");
  });

  it("RETAKE clears pending and returns to preview from confirm", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const confirm = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    const state = captureFlowReducer(confirm, { type: "RETAKE" });
    expect(state).toEqual({ phase: "preview", pending: null });
  });

  it("ignores MERGE_COMPLETED outside merging", () => {
    expect(captureFlowReducer(initialState, { type: "MERGE_COMPLETED" })).toEqual(initialState);
  });
});

describe("useCaptureFlow", () => {
  it("drives the preview -> merging -> confirm -> preview cycle via the hook", async () => {
    let flowRef: ReturnType<typeof useCaptureFlow> | null = null;
    function Probe() {
      flowRef = useCaptureFlow();
      return <Text>{flowRef.phase}</Text>;
    }
    let tree!: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Probe />);
    });
    expect(flowRef!.phase).toBe("preview");

    await TestRenderer.act(async () => {
      flowRef!.beginCapture(pending);
    });
    expect(flowRef!.phase).toBe("merging");
    expect(flowRef!.pending).toEqual(pending);

    await TestRenderer.act(async () => {
      flowRef!.markMergeCompleted();
    });
    expect(flowRef!.phase).toBe("confirm");

    await TestRenderer.act(async () => {
      flowRef!.retake();
    });
    expect(flowRef!.phase).toBe("preview");

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/components/camera/useCaptureFlow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/camera/useCaptureFlow.ts`**

```ts
import { useReducer } from "react";

export type CapturePhase = "preview" | "merging" | "confirm" | "failed";

export interface PendingPhoto {
  photoId: number;
  tempUri: string;
  fileName: string;
  lines: string[];
  timestamp: string;
}

export interface CaptureFlowState {
  phase: CapturePhase;
  pending: PendingPhoto | null;
}

export type CaptureFlowAction =
  | { type: "BEGIN_CAPTURE"; photo: PendingPhoto }
  | { type: "MERGE_COMPLETED" }
  | { type: "MERGE_FAILED" }
  | { type: "RETAKE" }
  | { type: "RETRY" };

export const initialState: CaptureFlowState = { phase: "preview", pending: null };

export function captureFlowReducer(
  state: CaptureFlowState,
  action: CaptureFlowAction
): CaptureFlowState {
  switch (action.type) {
    case "BEGIN_CAPTURE":
      return { phase: "merging", pending: action.photo };
    case "MERGE_COMPLETED":
      return state.phase === "merging" && state.pending
        ? { ...state, phase: "confirm" }
        : state;
    case "MERGE_FAILED":
      return state.phase === "merging" && state.pending
        ? { ...state, phase: "failed" }
        : state;
    case "RETRY":
      return state.phase === "failed" && state.pending
        ? { ...state, phase: "merging" }
        : state;
    case "RETAKE":
      return { phase: "preview", pending: null };
    default:
      return state;
  }
}

export function useCaptureFlow() {
  const [state, dispatch] = useReducer(captureFlowReducer, initialState);
  return {
    ...state,
    beginCapture: (photo: PendingPhoto) => dispatch({ type: "BEGIN_CAPTURE", photo }),
    markMergeCompleted: () => dispatch({ type: "MERGE_COMPLETED" }),
    markMergeFailed: () => dispatch({ type: "MERGE_FAILED" }),
    retake: () => dispatch({ type: "RETAKE" }),
    retry: () => dispatch({ type: "RETRY" }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/camera/useCaptureFlow.test.tsx`
Expected: all 7 tests PASS.

---

### Task 8: Extract `WatermarkMergeWebView`

**Files:**
- Create: `frontend/src/components/camera/WatermarkMergeWebView.tsx`
- Create: `frontend/src/__tests__/components/camera/WatermarkMergeWebView.test.tsx`

**Interfaces:**
- Consumes: `react-native-webview` `WebView`, props `{ html: string | null, webViewRef: React.RefObject<WebView | null>, onMessage: (event: any) => void }`.
- Produces: the extracted hidden-WebView block (currently `PhotoSection.tsx:139-148`) as a reusable component, owning its own absolute-offscreen style.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/camera/WatermarkMergeWebView.test.tsx`:

```tsx
jest.mock("react-native-webview", () => ({
  WebView: (props: { testID?: string }) => {
    const { View } = require("react-native");
    return <View testID={props.testID ?? "wv"} />;
  },
}));

import React from "react";
import TestRenderer from "react-test-renderer";
import { WebView } from "react-native-webview";
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";

describe("WatermarkMergeWebView", () => {
  it("renders the hidden WebView when html is provided", () => {
    const ref = React.createRef<WebView>();
    const tree = TestRenderer.create(
      <WatermarkMergeWebView html="<html></html>" webViewRef={ref} onMessage={() => {}} />
    );
    expect(tree.root.findAllByProps({ testID: "wv" })).toHaveLength(1);
  });

  it("renders nothing when html is null", () => {
    const ref = React.createRef<WebView>();
    const tree = TestRenderer.create(
      <WatermarkMergeWebView html={null} webViewRef={ref} onMessage={() => {}} />
    );
    expect(tree.root.findAllByProps({ testID: "wv" })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/components/camera/WatermarkMergeWebView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/camera/WatermarkMergeWebView.tsx`**

```tsx
import React from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  html: string | null;
  webViewRef: React.RefObject<WebView | null>;
  onMessage: (event: any) => void;
}

export default function WatermarkMergeWebView({
  html,
  webViewRef,
  onMessage,
}: Props) {
  if (!html) return null;
  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      style={styles.watermarkWebView}
      javaScriptEnabled
      originWhitelist={["*"]}
      onMessage={onMessage}
    />
  );
}

const styles = StyleSheet.create({
  watermarkWebView: {
    position: "absolute",
    top: -9999,
    width: 1,
    height: 1,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/camera/WatermarkMergeWebView.test.tsx`
Expected: both tests PASS.

---

### Task 9: Capture screen route — `app/inspection/capture.tsx`

**Files:**
- Create: `frontend/app/inspection/capture.tsx`

**Interfaces:**
- Consumes: `useLocalSearchParams<{ inspectionId: string }>`, `useRouter`, `useInspection()` (`project`, `poleId`, `photoStates`), `useGpsTracker` (Task 5), `useCaptureFlow` (Task 7), `useWatermarkProcessor` (existing), `WatermarkMergeWebView` (Task 8), `PhotoRepository.create/getById/delete` (Task 6), `InspectionRepository.getInspectionValues`, `photoUtils` (`generateFileName`, `formatWatermarkDate`, `formatLatLngWM`, `getFileUri`), `storageManager.deletePhoto`.
- Produces: the full-screen route `/inspection/capture` implementing the spec's state machine (`preview → merging → confirm`, `failed`/`retake`, orphan-row cleanup on back-during-merge). PhotoSection navigates to it (Task 10). Verified here by `tsc` + `eslint` (typed routes: the route file must exist for `router.push({ pathname: "/inspection/capture" })` in Task 10 to typecheck).

- [ ] **Step 1: Implement the screen**

Create `app/inspection/capture.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Image, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Button, Text, ActivityIndicator } from "react-native-paper";
import * as FileSystem from "expo-file-system/legacy";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Photo } from "@/src/models/Photo";
import {
  generateFileName,
  formatWatermarkDate,
  formatLatLngWM,
  getFileUri,
} from "@/src/components/inspection/photoUtils";
import { useGpsTracker } from "@/src/components/camera/useGpsTracker";
import WatermarkOverlay from "@/src/components/camera/WatermarkOverlay";
import { useCaptureFlow } from "@/src/components/camera/useCaptureFlow";
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { reverseGeocode } from "@/src/utils/geo";
import { PHOTO_QUALITY, GPS_GRACE_MS } from "@/src/components/camera/captureConfig";
import { deletePhoto as safDelete } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";

export default function CaptureScreen() {
  const router = useRouter();
  const { inspectionId: inspectionIdParam } = useLocalSearchParams<{ inspectionId: string }>();
  const inspectionId = Number(inspectionIdParam);
  const { project, poleId: contextPoleId, photoStates } = useInspection();

  const cameraRef = useRef<React.ElementRef<typeof CameraView>>(null);
  const gps = useGpsTracker();

  const [cameraSize, setCameraSize] = useState({ width: 0, height: 0 });
  const [values, setValues] = useState<{ pole_id: string; block: string }>({
    pole_id: contextPoleId || "",
    block: "",
  });
  const [now, setNow] = useState(() => new Date());
  const [address, setAddress] = useState<string | null>(null);
  const [shutterBusy, setShutterBusy] = useState(false);
  const [confirmedPhoto, setConfirmedPhoto] = useState<Photo | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const flow = useCaptureFlow();
  const {
    watermarkHtml,
    webViewRef,
    handleWebViewMessage,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  } = useWatermarkProcessor({ project, onPhotosUpdated: () => {} });

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      setPermissionDenied(true);
    }
  }, [permission]);

  useEffect(() => {
    if (!inspectionId) return;
    InspectionRepository.getInspectionValues(inspectionId)
      .then((v) =>
        setValues({
          pole_id: v.pole_id || contextPoleId || "",
          block: v.block || "",
        })
      )
      .catch((e) => logger.error("Load values error:", e));
  }, [inspectionId, contextPoleId]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!gps.coords) return;
    let cancelled = false;
    reverseGeocode(gps.coords.latitude, gps.coords.longitude)
      .then((res) => {
        if (!cancelled) setAddress(res?.label ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gps.coords]);

  useEffect(() => {
    if (flow.phase !== "merging" || flow.pending == null) return;
    const s = photoStates[flow.pending.photoId];
    if (s === "completed") flow.markMergeCompleted();
    else if (s === "failed") flow.markMergeFailed();
  }, [flow.phase, flow.pending, photoStates, flow.markMergeCompleted, flow.markMergeFailed]);

  useEffect(() => {
    if (flow.phase !== "confirm" || flow.pending == null) return;
    PhotoRepository.getById(flow.pending.photoId)
      .then((p) => setConfirmedPhoto(p))
      .catch(() => {});
  }, [flow.phase, flow.pending]);

  const cleanupPending = useCallback(async () => {
    const pending = flow.pending;
    if (!pending) return;
    await FileSystem.deleteAsync(pending.tempUri, { idempotent: true }).catch(() => {});
    await PhotoRepository.delete(pending.photoId).catch(() => {});
    clearWatermarkState(pending.photoId);
  }, [flow.pending, clearWatermarkState]);

  const handleBack = useCallback(() => {
    if (flow.phase === "merging" && flow.pending) {
      Alert.alert(
        "Discard Photo?",
        "This photo is still being processed. Leaving now will discard it.",
        [
          { text: "Keep Processing", style: "cancel" },
          {
            text: "Discard & Leave",
            style: "destructive",
            onPress: async () => {
              await cleanupPending();
              router.back();
            },
          },
        ]
      );
      return;
    }
    router.back();
  }, [flow.phase, flow.pending, cleanupPending, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleShutter = async () => {
    if (shutterBusy) return;

    let coords = gps.coords;
    if (!coords) {
      const fix = await gps.captureGps(GPS_GRACE_MS);
      if (!fix) {
        Alert.alert(
          "GPS is still being acquired",
          "Wait a moment and try again.",
          [{ text: "Wait" }, { text: "Cancel", style: "cancel" }]
        );
        return;
      }
      coords = { latitude: fix.latitude, longitude: fix.longitude };
    }

    const result = await cameraRef.current?.takePictureAsync({
      quality: PHOTO_QUALITY,
      skipProcessing: false,
    });
    if (!result?.uri) {
      Alert.alert("Error", "Failed to capture photo.");
      return;
    }

    setShutterBusy(true);
    try {
      const timestamp = new Date().toISOString();
      const poleId = values.pole_id || "NA";
      const block = values.block || "NA";
      const fileName = generateFileName(
        project?.DistrictName || "",
        block,
        poleId,
        timestamp
      );

      const photo: Photo = {
        InspectionID: inspectionId,
        PhotoType: "Pole",
        FileName: fileName,
        FilePath: result.uri,
        Latitude: coords.latitude,
        Longitude: coords.longitude,
        CapturedAt: timestamp,
        Remarks: null,
      };

      const photoId = await PhotoRepository.create(photo);

      const lines = [
        poleId,
        `${project?.DistrictName || ""}, ${block}`,
        formatWatermarkDate(timestamp),
        formatLatLngWM(coords.latitude, coords.longitude),
      ];

      flow.beginCapture({ photoId, tempUri: result.uri, fileName, lines, timestamp });
      enqueueWatermark(photoId, result.uri, fileName, lines);
    } catch (error) {
      logger.error("Capture Error:", error);
      Alert.alert("Error", "Failed to capture photo.");
    } finally {
      setShutterBusy(false);
    }
  };

  const handleRetake = async () => {
    await cleanupPending();
    if (confirmedPhoto?.FilePath.startsWith("content://")) {
      await safDelete(confirmedPhoto.FilePath).catch(() => {});
    }
    setConfirmedPhoto(null);
    flow.retake();
  };

  const handleRetry = () => {
    const pending = flow.pending;
    if (!pending) return;
    retryWatermark(pending.photoId);
    flow.retry();
  };

  const handleKeep = () => {
    router.back();
  };

  const gpsLine = gps.coords
    ? formatLatLngWM(gps.coords.latitude, gps.coords.longitude)
    : "Acquiring GPS…";

  if (permissionDenied) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Camera" />
        </Appbar.Header>
        <View style={styles.center}>
          <Text>Camera permission is required to capture photos.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title="Capture Photo" />
      </Appbar.Header>

      <View style={styles.body}>
        {flow.phase === "preview" && (
          <View
            style={styles.cameraWrap}
            onLayout={(e) =>
              setCameraSize({
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })
            }
          >
            {permission?.granted ? (
              <CameraView ref={cameraRef} facing="back" style={styles.fill} />
            ) : (
              <View style={[styles.fill, styles.center]}>
                <ActivityIndicator size="large" />
              </View>
            )}

            {cameraSize.width > 0 && (
              <WatermarkOverlay
                width={cameraSize.width}
                height={cameraSize.height}
                poleId={values.pole_id || "NA"}
                districtBlock={`${project?.DistrictName || ""}, ${values.block || "NA"}`}
                dateLine={formatWatermarkDate(now.toISOString())}
                gpsLine={gpsLine}
              />
            )}

            <View style={styles.gpsPill}>
              <Text style={styles.gpsPillText}>
                {gps.status === "fixed"
                  ? "GPS OK"
                  : gps.status === "denied"
                  ? "GPS denied"
                  : "Acquiring GPS…"}
              </Text>
            </View>

            <View style={styles.controls}>
              <Button
                mode="contained"
                icon="camera"
                loading={shutterBusy}
                disabled={shutterBusy || gps.status !== "fixed"}
                onPress={handleShutter}
              >
                Capture
              </Button>
            </View>
          </View>
        )}

        {flow.phase === "merging" && flow.pending && (
          <View style={styles.center}>
            <Image
              source={{ uri: getFileUri(flow.pending.tempUri) }}
              style={styles.mergeImage}
              resizeMode="contain"
            />
            <ActivityIndicator size="large" style={{ marginTop: 12 }} />
            <Text style={{ marginTop: 8 }}>Merging watermark…</Text>
          </View>
        )}

        {flow.phase === "confirm" && confirmedPhoto && (
          <View style={styles.center}>
            <Image
              source={{ uri: getFileUri(confirmedPhoto.FilePath) }}
              style={styles.mergeImage}
              resizeMode="contain"
            />
            {address && <Text style={styles.address}>{address}</Text>}
            <View style={styles.confirmButtons}>
              <Button mode="outlined" icon="refresh" onPress={handleRetake}>
                Retake
              </Button>
              <Button mode="contained" icon="check" onPress={handleKeep}>
                Keep
              </Button>
            </View>
          </View>
        )}

        {flow.phase === "failed" && flow.pending && (
          <View style={styles.center}>
            <Image
              source={{ uri: getFileUri(flow.pending.tempUri) }}
              style={styles.mergeImage}
              resizeMode="contain"
            />
            <Text style={[styles.failedText, { marginTop: 8 }]}>
              Watermarking failed.
            </Text>
            <View style={styles.confirmButtons}>
              <Button mode="outlined" icon="refresh" onPress={handleRetake}>
                Retake
              </Button>
              <Button mode="contained" icon="refresh" onPress={handleRetry}>
                Retry
              </Button>
            </View>
          </View>
        )}
      </View>

      <WatermarkMergeWebView
        html={watermarkHtml}
        webViewRef={webViewRef}
        onMessage={handleWebViewMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  body: {
    flex: 1,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: "#000000",
  },
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  gpsPill: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gpsPillText: {
    color: "#76FF03",
    fontSize: 12,
  },
  controls: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  mergeImage: {
    width: "100%",
    height: "70%",
    backgroundColor: "#222222",
  },
  address: {
    marginTop: 8,
    fontSize: 12,
    color: "#555555",
    textAlign: "center",
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  failedText: {
    color: "#C62828",
  },
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no type errors (typed routes now include `/inspection/capture`; the `CameraView` ref type matches the Task 2 mock handle).

Run: `npx eslint app/inspection/capture.tsx`
Expected: 0 errors (pre-existing warnings only).

---

### Task 10: Integrate PhotoSection + delete `usePhotoCapture` + remove `expo-image-picker`

**Files:**
- Modify: `frontend/src/components/inspection/PhotoSection.tsx`
- Delete: `frontend/src/components/inspection/usePhotoCapture.ts`
- Modify: `frontend/app.json` (drop the `expo-image-picker` plugin)
- Modify: `frontend/package.json` + `frontend/yarn.lock` (via `yarn remove expo-image-picker`)

**Interfaces:**
- Consumes: `WatermarkMergeWebView` (Task 8), `useRouter` (`expo-router`), the existing `useWatermarkProcessor`.
- Produces: PhotoSection's Capture button navigates to `/inspection/capture`; the inline hidden WebView is replaced by `WatermarkMergeWebView`; `usePhotoCapture.ts` and `expo-image-picker` are fully removed. `capturing` is hard-coded `false` (the route push is the loading indicator now).

- [ ] **Step 1: Edit `PhotoSection.tsx`**

1. Replace the `usePhotoCapture` import (line 22) with a router import:

```tsx
import { useRouter } from "expo-router";
```

2. Add `const router = useRouter();` at the top of the component body (next to the existing `useInspection()` call).

3. Delete the `usePhotoCapture` invocation block (lines 80-89) and replace it with:

```tsx
  const handleCapture = useCallback(() => {
    if (locked) {
      Alert.alert(
        "Pole ID Required",
        "Please enter Pole ID first before filling the inspection details."
      );
      return;
    }
    router.push({
      pathname: "/inspection/capture",
      params: { inspectionId: String(inspectionId) },
    });
  }, [locked, inspectionId, router]);
```

4. Replace the inline hidden WebView (lines 139-148) with:

```tsx
      <WatermarkMergeWebView
        html={watermarkHtml}
        webViewRef={webViewRef}
        onMessage={handleWebViewMessage}
      />
```

5. Add the import:

```tsx
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";
```

6. Replace the `PhotoSectionHeader` `capturing`/`onCapture` props (lines 159-165) so `capturing={false}` and `onCapture={handleCapture}`.

7. Remove the now-unused `styles.watermarkWebView` entry from the `StyleSheet` (the component owns that style now) and the `WebView` import (`react-native-webview`) if no longer referenced elsewhere.

- [ ] **Step 2: Delete `usePhotoCapture.ts`**

Delete `src/components/inspection/usePhotoCapture.ts`.

- [ ] **Step 3: Remove the `expo-image-picker` plugin from `app.json`**

Remove the `["expo-image-picker", {...}]` entry from the `plugins` array.

- [ ] **Step 4: Remove the dependency**

Run: `yarn remove expo-image-picker`
Expected: package removed from `package.json` dependencies and `yarn.lock`.

- [ ] **Step 5: Make `useWatermarkProcessor` remount-safe (fixes the review finding)**

**Context (from the `review` subagent, verified):** `photoStates` lives in `InspectionContext` while the job queue, `failedJobsRef`, and WebView live in the hook. If PhotoSection unmounts (user leaves the inspection screen) while a photo is `pending`/`processing`, the WebView is destroyed before the merge posts back → nothing ever updates the context state → `validatePhotosForSave` blocks the save **forever**, and the DB row keeps its temp path (never replaced by a `content://` URI). `retryWatermark` is also a no-op after remount because `failedJobsRef` is hook-local and empty.

**Fix — in `src/components/inspection/useWatermarkProcessor.ts`:**

1. Add `useEffect` to the `react` import (line 1).
2. On mount, reconcile any context `photoStates` entry still `pending`/`processing` to `failed`. Such entries can only be orphans of a previous hook instance whose WebView died mid-merge — no live queue exists across a remount, so nothing else will ever update them. `failed` is truthful (the temp file was never replaced), and the PhotoSection delete flow already allows deleting photos whose state is not `processing` (delete + retake is the resolution).

```tsx
useEffect(() => {
  setWatermarkState(prev => {
    const next = { ...prev };
    let changed = false;
    for (const key of Object.keys(next)) {
      const id = Number(key);
      if (next[id] === "pending" || next[id] === "processing") {
        next[id] = "failed";
        changed = true;
      }
    }
    return changed ? next : prev;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Why safe: on a normal mount `photoStates` is `{}` (no-op) or only `completed`/`failed`; `pending`/`processing` can only survive a hook instance that died mid-merge. The functional update never clobbers concurrent writes. `retryWatermark` stays a no-op for reconciled photos (the temp input path isn't persisted in context, so the job can't be rebuilt) — that's acceptable because delete+retake is the path.

- [ ] **Step 6: Add a test for the reconcile**

Create `frontend/src/__tests__/components/inspection/useWatermarkProcessor.test.tsx`, mirroring the `renderHook` + `InspectionProvider` pattern in `InspectionContext.test.tsx`:

```tsx
import React, { useEffect } from "react";
import { renderHook } from "@testing-library/react-native";
import {
  InspectionProvider,
  useInspection,
} from "@/src/context/InspectionContext";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { Project } from "@/src/models/Project";
import { WatermarkState } from "@/src/components/inspection/PhotoCard";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readAsStringAsync: jest.fn(),
}));
jest.mock("react-native-webview", () => {
  const RN = require("react-native");
  return { WebView: () => RN.View };
});

const project = {
  ProjectID: 1,
  ProjectName: "Alpha",
  DistrictName: "D1",
  DBPath: "/mock/db.db",
  SAFPath: null,
} as unknown as Project;

function Seed({ states }: { states: Record<number, WatermarkState> }) {
  const { setPhotoStates } = useInspection();
  useEffect(() => {
    setPhotoStates(states);
  }, [states, setPhotoStates]);
  return null;
}

describe("useWatermarkProcessor remount safety", () => {
  it("reconciles orphaned pending/processing states to failed on mount", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <InspectionProvider>
        <Seed states={{ 1: "processing", 2: "pending", 3: "completed" }} />
        {children}
      </InspectionProvider>
    );

    const { result } = renderHook(
      () => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() }),
      { wrapper }
    );

    expect(result.current.watermarkState).toEqual({
      1: "failed",
      2: "failed",
      3: "completed",
    });
  });

  it("leaves an empty state map untouched", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <InspectionProvider>{children}</InspectionProvider>
    );

    const { result } = renderHook(
      () => useWatermarkProcessor({ project, onPhotosUpdated: jest.fn() }),
      { wrapper }
    );

    expect(result.current.watermarkState).toEqual({});
  });
});
```

Note: `Seed` is rendered before `{children}`, so its effect runs before the hook's mount effect (React runs effects in mount order) — the reconcile sees the seeded orphans. If `@testing-library/react-native` is not the renderHook source used by `InspectionContext.test.tsx`, match that file's import instead.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: no type errors (no remaining references to `usePhotoCapture` or `expo-image-picker`).

Run: `npx eslint app src`
Expected: 0 errors (pre-existing warnings only).

Run: `npx jest`
Expected: all existing suites still PASS (507+ tests) plus the 2 new reconcile tests. Confirm no test imports `usePhotoCapture`/`expo-image-picker` (grep: `rg "usePhotoCapture|expo-image-picker" src app __mocks__` → no matches).

---

### Task 11: Isolation regression test for captured photos

**Files:**
- Create: `frontend/src/__tests__/database/captureIsolation.test.ts`

**Interfaces:**
- Consumes: the `expo-sqlite` + `expo-file-system/legacy` mock pattern from `src/__tests__/database/isolation.test.ts`, `PhotoRepository`.
- Produces: a regression test proving a photo row created while Project A is active does **not** appear when Project B is opened, and is still present back in A. Mirrors the AGENTS.md isolation requirement.

- [ ] **Step 1: Write the test**

Create `src/__tests__/database/captureIsolation.test.ts`:

```ts
jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("Captured-photo cross-project isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db = await dbModule.getDatabase();
    return { dbModule, db };
  }

  it("does not leak a captured photo from Project A into Project B", async () => {
    const { dbModule, db: dbA } = await openProject(PROJECT_A);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "photo_a.jpg",
      FilePath: "file:///mock/tmp/photo_a.jpg",
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });
    expect(photoId).toBeGreaterThan(0);

    const inA = await dbA.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inA).toHaveLength(1);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    const inB = await dbB.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inB).toHaveLength(0);

    const inAAfter = await dbA.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inAAfter).toHaveLength(1);

    await dbModule.clearActiveProject();
  });
});
```

- [ ] **Step 2: Run the isolation tests**

Run: `npx jest src/__tests__/database/captureIsolation.test.ts src/__tests__/database/isolation.test.ts`
Expected: all PASS (both files, isolation requirements intact).

---

### Task 12: Changelog + docs touch-ups + full verification

**Files:**
- Modify: `frontend/docs/07-Changelog.md`
- Modify: `frontend/README.md` (dependency table line for `expo-image-picker`)
- Modify: `frontend/docs/08-README.md` (reference to `usePhotoCapture.ts`)
- Modify: `frontend/docs/02-Architecture.md` (bullets mentioning `expo-image-picker` / `usePhotoCapture`)

- [ ] **Step 1: Add changelog entries**

In `docs/07-Changelog.md`, under `## [Unreleased]` → `### Added` (or the appropriate subsection), append:

```markdown
- In-app live-watermark camera: photo capture now uses an in-app camera viewfinder with a live watermark overlay (ID, district/block, date-time, GPS), acquires GPS during preview (shutter gated on an acceptable fix), and shows a confirm screen with Retake / Keep while the watermark merges in the background. Final images are produced by the same WebView canvas pipeline as before, so output is pixel-identical to the previous watermark.
```

- [ ] **Step 2: Update doc references**

1. In `README.md`, change the `expo-image-picker` row (around line 242) to:

```markdown
| `expo-camera` | In-app camera viewfinder with live watermark overlay |
```

2. In `docs/08-README.md`, change the `usePhotoCapture.ts` line (around line 303) to:

```markdown
- src/components/camera/useGpsTracker.ts — GPS acquisition/lifecycle hook for the in-app capture screen
```

3. In `docs/02-Architecture.md`, replace the `expo-image-picker (camera capture)` bullet (line 118) with:

```markdown
- expo-camera (in-app camera + live watermark overlay)
```

and remove `usePhotoCapture,` from the `inspection/` component lists (lines 288, 365). (Leave any historical section references intact if they are explicitly labeled as superseded — do not rewrite architecture sections beyond these bullets.)

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npx eslint app src`
Expected: 0 errors (pre-existing warnings only).

Run: `npx jest`
Expected: all suites PASS (41 suites / 507+ existing tests + ~20 new tests from Tasks 3-8, 11).

Run: `npx expo-doctor`
Expected: clean config (expo-image-picker gone, expo-camera registered).

---

## Self-Review

**Spec coverage:**
- Decisions table (camera surface, reuse WebView pipeline, GPS timing, cached-refresh, confirm screen) → Task 9 (CameraView) + Task 5 (GPS) + Task 9 (`enqueueWatermark` via `useWatermarkProcessor`) + Task 7 (confirm/retake).
- Dependencies/config → Task 1 (add camera) + Task 10 (remove image-picker); app.json plugin changes in Tasks 1 & 10.
- GPS robustness: start-on-mount + fresh-fix race + cached-last-known seed + watch(distanceInterval) + staleness re-request + `captureGps(graceMs)` → Task 5. Overlay "Acquiring GPS…" + per-second time line → Task 9 (`now` interval) + Task 4 (`gpsLine` prop).
- Watermark identity guarantee → `buildWatermarkPage` untouched; `WatermarkMergeWebView` reuses it (Task 8); overlay is preview-only approximation (Task 4).
- State machine incl. failed→retry, retake cleanup, back-during-merge orphan cleanup → Task 7 (reducer) + Task 9 (cleanup/BackHandler).
- `PhotoRepository.getById` (confirmed missing) → Task 6.
- Config constants → Task 4 (`captureConfig.ts`), exact values copied from spec §Config.
- Testing: geo, useCaptureFlow, WatermarkOverlay, mock extensions, isolation regression → Tasks 3, 7, 4, 2, 11. Manual APK checks → Task 12 verification note (visual-identity diff, GPS pill, retake/keep/failed/back) — these are device-only and documented in the spec §Manual; not automatable here.
- Edge cases (GPS never fixes → shutter disabled + grace alert; reverse geocode offline → null + hidden address; back during merge → cleanup; permission denied → alert) → Task 9.

**Placeholder scan:** every step contains concrete code or an exact expectation; no TBD/TODO/"add error handling".

**Type consistency:**
- `useGpsTracker` returns `captureGps(graceMs?): Promise<GpsFix | null>` — consumed identically in Task 9 and the Task 5 test.
- `PendingPhoto` shape (`photoId/tempUri/fileName/lines/timestamp`) matches between Task 7 and Task 9 (`flow.beginCapture({...})`).
- `captureFlowReducer` actions `BEGIN_CAPTURE | MERGE_COMPLETED | MERGE_FAILED | RETAKE | RETRY` are the only ones dispatched in Task 9 (`beginCapture`, `markMergeCompleted`, `markMergeFailed`, `retake`, `retry`) and the Task 7 tests.
- `WatermarkMergeWebView` props `{ html, webViewRef, onMessage }` match `useWatermarkProcessor`'s `watermarkHtml`/`webViewRef`/`handleWebViewMessage` (Task 8 ↔ Task 9 ↔ Task 10).
- `computeWatermarkMetrics` returns `{ fSize, lh, padY, rPad, gap }` — overlay consumes all five (Task 4); values match the canvas constants in `watermarkHtml.ts`.
- `PhotoRepository.getById` returns `Photo | null`; confirm screen guards on `confirmedPhoto` (Task 6 ↔ Task 9).
- Mock handles: `__emitWatchLocation(lat, lng, accuracy)` in Task 2 matches the hook's `LocationLike` shape; `CameraView` mock ref exposes `takePictureAsync({quality, skipProcessing}) → { uri, width, height }` matching Task 9's call.
