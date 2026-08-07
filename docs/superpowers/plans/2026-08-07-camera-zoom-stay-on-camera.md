# Camera Zoom + Stay-on-Camera Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add functional pinch-to-zoom + an on-screen slider (1.0x–5.0x) to the capture screen, pass `zoom` to the live `CameraView`, and change the capture workflow so the screen stays open after a photo is saved (soft-reset with a "Photo Saved" toast), with capture-perf instrumentation to prove a <50 ms regression.

**Architecture:** Approach A — keep `CameraView` mounted unconditionally while permission is granted and render `merging`/`saved`/`failed` as overlay banners atop the live preview, instead of unmounting the camera into separate full-screen branches. Zoom becomes a single `0–1` React state written by both pinch and the slider and passed via `zoom={zoom}`; the `useCaptureFlow` reducer's `confirm` phase is replaced by `saved` (auto-timeout) and `failed` (Retry/Discard) phases.

**Tech Stack:** React Native, expo-camera 17 (`CameraView`, `zoom` normalized 0–1), expo-router, react-native-paper, `PanResponder` (no gesture-handler dependency), existing `perfNow`/`perfLog` from `src/utils/perf.ts`, Jest.

## Global Constraints

- **Camera session must never be recreated** during capture flow. The `<CameraView>` element must stay mounted whenever permission is granted; do not unmount it in any phase branch. This is the whole point of the change.
- **`zoom` is normalized `0–1`** (expo-camera semantics: `1` = device max). Label maps `1 + zoom * 4` shown as `1.0x–5.0x` (nominal, not literal optical magnification).
- **No Animated.Value driving camera zoom, no interpolation loop.** Zoom writes are direct `setZoom` calls.
- **Double-tap resets zoom to `0` only if `zoom > 0`.** Single tap keeps focus-ring + `gps.refreshNow()`.
- **Slider visible only in `preview`** phase.
- **Zoom persists across captures** (state lives on the mounted screen); **resets on reopen** (screen remounts, `useState(0)`).
- **Soft reset** after a save = clear `pending`, dismiss the toast, re-enable shutter. Do **not** change zoom/flash/facing/ratio; do not call `router.back()`.
- **Only leave the screen** via Appbar BackAction, hardware Back, or a Close action. No `router.back()` on any "Keep" confirmation (Keep is removed).
- **`confirm`/`RETAKE` are removed** everywhere (reducer, UI, tests).
- Capture path must add **no blocking work**; perf gate = avg `takePictureAndWrite` regression < 50 ms measured on device by the user.
- Project-wide: TypeScript strict, no `any`, PascalCase components, camelCase variables, no comments unless requested, route DB access through repositories, respect the sequential open/close expo-sqlite model (never call `getGlobalDatabase()` during the inspection flow).

---

### Task 1: Add `zoomToMagnification` helper to `cameraControls.ts`

**Files:**
- Modify: `src/components/camera/cameraControls.ts` (append near `ZOOM_MIN`/`ZOOM_MAX`)
- Test: `src/__tests__/components/camera/cameraControls.test.ts`

**Interfaces:**
- Consumes: existing `ZOOM_MIN = 0`, `ZOOM_MAX = 1` consts in the same file.
- Produces: pure function `zoomToMagnification(zoom: number): number` returning `1 + 4 * zoom` clamped to `[1, 5]`. Later tasks use it only for the label string.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/components/camera/cameraControls.test.ts`:

```ts
import { zoomToMagnification } from "@/src/components/camera/cameraControls";

describe("cameraControls zoomToMagnification", () => {
  it("maps 0 to 1.0x", () => {
    expect(zoomToMagnification(0)).toBe(1);
  });

  it("maps 1 to 5.0x", () => {
    expect(zoomToMagnification(1)).toBe(5);
  });

  it("maps 0.5 to 3.0x", () => {
    expect(zoomToMagnification(0.5)).toBe(3);
  });

  it("clamps out-of-range input", () => {
    expect(zoomToMagnification(-0.5)).toBe(1);
    expect(zoomToMagnification(1.5)).toBe(5);
  });

  it("renders a 1-decimal label ending in x", () => {
    expect(`${zoomToMagnification(0.25).toFixed(1)}x`).toBe("2.0x");
  });
});
```

Note: the existing file already imports `clamp01` etc. Add `zoomToMagnification` to that existing `import { ... } from "@/src/components/camera/cameraControls"` block at the top rather than adding a second import line (there is exactly one import block).

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/__tests__/components/camera/cameraControls.test.ts --silent`
Expected: FAIL — `zoomToMagnification` not exported / "function not defined". The new describe block errors.

- [ ] **Step 3: Implement**

In `src/components/camera/cameraControls.ts`, after the existing `touchDistance` function (end of file), add:

```ts
export function zoomToMagnification(zoom: number): number {
  const clamped = clamp01(zoom);
  return 1 + 4 * clamped;
}
```

This reuses the in-file `clamp01` helper. It satisfies all five assertions: `0→1`, `1→5`, `0.5→3`, clamp of out-of-range, and the 0.25→2.0x label case.

- [ ] **Step 4: Run it to verify it passes**

Run: `yarn test src/__tests__/components/camera/cameraControls.test.ts --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/camera/cameraControls.ts src/__tests__/components/camera/cameraControls.test.ts
git commit -m "feat(camera): add zoomToMagnification label helper"
```

---

### Task 2: Rework `useCaptureFlow` for the stay-on-camera state machine

**Files:**
- Modify: `src/components/camera/useCaptureFlow.ts`
- Test: `src/__tests__/components/camera/useCaptureFlow.test.tsx`

**Interfaces:**
- Consumes: `initialState` and `captureFlowReducer` signatures already exported.
- Produces:
  - `type CapturePhase = "preview" | "merging" | "saved" | "failed"`
  - actions: `BEGIN_CAPTURE | MERGE_COMPLETED | MERGE_FAILED | SAVED_TIMEOUT | RETRY | DISCARD`
  - helpers on the hook return: `beginCapture(photo)`, `markMergeCompleted()`, `markMergeFailed()`, `savedTimeout()`, `retry()`, `discard()`. **`retake` is removed.**

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/__tests__/components/camera/useCaptureFlow.test.tsx`. Keep the existing `pending` fixture and the `useCaptureFlow` integration test's skeleton, but update phase names and transitions. New expected behavior:

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
    expect(captureFlowReducer(initialState, { type: "DISCARD" })).toEqual({
      phase: "preview",
      pending: null,
    });
  });

  it("BEGIN_CAPTURE moves preview -> merging and stores the pending photo", () => {
    const state = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    expect(state.phase).toBe("merging");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_COMPLETED moves merging -> saved, retaining pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    expect(state.phase).toBe("saved");
    expect(state.pending).toEqual(pending);
  });

  it("MERGE_FAILED moves merging -> failed, retaining pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const state = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    expect(state.phase).toBe("failed");
    expect(state.pending).toEqual(pending);
  });

  it("SAVED_TIMEOUT moves saved -> preview and clears pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const saved = captureFlowReducer(merging, { type: "MERGE_COMPLETED" });
    const state = captureFlowReducer(saved, { type: "SAVED_TIMEOUT" });
    expect(state).toEqual({ phase: "preview", pending: null });
  });

  it("RETRY moves failed -> merging", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const failed = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    const state = captureFlowReducer(failed, { type: "RETRY" });
    expect(state.phase).toBe("merging");
  });

  it("DISCARD moves failed -> preview and clears pending", () => {
    const merging = captureFlowReducer(initialState, { type: "BEGIN_CAPTURE", photo: pending });
    const failed = captureFlowReducer(merging, { type: "MERGE_FAILED" });
    const state = captureFlowReducer(failed, { type: "DISCARD" });
    expect(state).toEqual({ phase: "preview", pending: null });
  });

  it("ignores SAVED_TIMEOUT and RETRY outside their valid source phases", () => {
    const preview = captureFlowReducer(initialState, { type: "SAVED_TIMEOUT" });
    expect(preview.phase).toBe("preview");
    const retryFromPreview = captureFlowReducer(initialState, { type: "RETRY" });
    expect(retryFromPreview.phase).toBe("preview");
  });
});

describe("useCaptureFlow", () => {
  it("drives preview -> merging -> saved -> preview via the hook", async () => {
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

    await TestRenderer.act(async () => {
      flowRef!.markMergeCompleted();
    });
    expect(flowRef!.phase).toBe("saved");

    await TestRenderer.act(async () => {
      flowRef!.savedTimeout();
    });
    expect(flowRef!.phase).toBe("preview");

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/__tests__/components/camera/useCaptureFlow.test.tsx --silent`
Expected: FAIL — `CapturePhase` still has `"confirm"` not `"saved"`, and `savedTimeout` / `DISCARD` / `SAVED_TIMEOUT` are undefined.

- [ ] **Step 3: Implement the reducer**

Replace the body of `src/components/camera/useCaptureFlow.ts` with:

```ts
import { useReducer } from "react";

export type CapturePhase = "preview" | "merging" | "saved" | "failed";

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
  | { type: "SAVED_TIMEOUT" }
  | { type: "RETRY" }
  | { type: "DISCARD" };

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
        ? { ...state, phase: "saved" }
        : state;
    case "MERGE_FAILED":
      return state.phase === "merging" && state.pending
        ? { ...state, phase: "failed" }
        : state;
    case "SAVED_TIMEOUT":
      return state.phase === "saved" ? { phase: "preview", pending: null } : state;
    case "RETRY":
      return state.phase === "failed" && state.pending
        ? { ...state, phase: "merging" }
        : state;
    case "DISCARD":
      return state.phase === "failed" ? { phase: "preview", pending: null } : state;
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
    savedTimeout: () => dispatch({ type: "SAVED_TIMEOUT" }),
    retry: () => dispatch({ type: "RETRY" }),
    discard: () => dispatch({ type: "DISCARD" }),
  };
}
```

Notes:
- `discard()` requires no pending — it just resets. The `capture.tsx` layer is responsible for `cleanupPending()` (temp + DB + watermark state) **before** dispatching `discard()`.
- `confirm` / `confirm`/`RETAKE`/`retake` are fully removed.

- [ ] **Step 4: Run it to verify it passes**

Run: `yarn test src/__tests__/components/camera/useCaptureFlow.test.tsx --silent`
Expected: PASS.

- [ ] **Step 5: Update any other references to the removed `retake`/`confirm` and run the full suite**

Search and fix:
Run: `rg -n "retake|confirm" app src` (PowerShell: `Select-String -Path (Get-ChildItem -Recurse app,src -Include *.ts,*.tsx).FullName -Pattern 'retake|confirm'`). The only remaining consumers are in `app/inspection/capture.tsx`, which Task 3 rewrites. Leave them for Task 3; do not edit capture.tsx here.

Run the full suite to confirm nothing else broke:
Run: `yarn test --silent`
Expected: PASS — all suites. (Task 3 will remove the last crash-time references.)

- [ ] **Step 6: Commit**

```bash
git add src/components/camera/useCaptureFlow.ts src/__tests__/components/camera/useCaptureFlow.test.tsx
git commit -m "refactor(camera): replace confirm with saved/failed stay-on-camera phases"
```

---

### Task 3: Rewrite `capture.tsx` — always-mounted camera, zoom wiring, overlay states, close action, perf markers

**Files:**
- Modify: `app/inspection/capture.tsx` (full functional rewrite of the render + state logic; preserve existing style constants and structure)

**Interfaces:**
- Consumes: `zoomToMagnification` from Task 1; new `flow` helpers (`savedTimeout`, `discard`, `retry`) from Task 2; existing `flow.beginCapture`, `flow.markMergeCompleted`, `flow.markMergeFailed`; existing `enqueueWatermark`, `clearWatermarkState`, `retryWatermark`; existing `perfNow`, `perfLog`; existing `useGpsTracker`, `useWatermarkSettings`, `useAddressLookup`, `useWatermarkProcessor`, `useCaptureFlow`.
- Produces: the fully-wired capture screen with zoom slider and overlays; reads all props its existing consumers pass (none changed externally).

- [ ] **Step 1: Add the zoom slider + always-mounted camera render**

Rewrite the `<View style={styles.body}>...</View>` region. Replace the phase-gated block (`capture.tsx:342-509`) so the camera is always mounted and only the overlays change:

```tsx
<View style={styles.body}>
  <View
    style={styles.cameraWrap}
    onLayout={(e) =>
      setCameraSize({
        width: e.nativeEvent.layout.width,
        height: e.nativeEvent.layout.height,
      })
    }
    onTouchStart={handleTap}
    {...pinchResponder.panHandlers}
  >
    {permission?.granted ? (
      <CameraView
        ref={cameraRef}
        facing={facing}
        ratio={ratio}
        flash={flash}
        zoom={zoom}
        style={styles.fill}
      />
    ) : (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    )}

    {cameraSize.width > 0 && (
      <WatermarkOverlay
        width={cameraSize.width}
        height={cameraSize.height}
        lines={previewLines}
        settings={settings}
      />
    )}

    {focusRing && (
      <Animated.View style={[/* existing focusRing style */]} />
    )}

    <View style={styles.gpsPill}>
      <Text style={[styles.gpsPillText, { color: gpsPillColor }]}>
        {gpsPillText(gps.status, gps.accuracyM)}
      </Text>
    </View>
  </View>

  {flow.phase === "merging" && (
    <View style={styles.mergeBanner} pointerEvents="none">
      <ActivityIndicator size="small" />
      <Text style={styles.mergeBannerText}>Merging watermark…</Text>
    </View>
  )}

  {flow.phase === "saved" && (
    <View style={styles.mergeBanner} pointerEvents="none">
      <Text style={styles.mergeBannerText}>Photo Saved</Text>
    </View>
  )}

  {flow.phase === "failed" && (
    <View style={styles.failedOverlay}>
      <Text style={[styles.mergeBannerText, styles.failedText]}>
        Watermarking failed.
      </Text>
      <View style={styles.confirmButtons}>
        <Button mode="outlined" icon="refresh" onPress={handleRetry}>
          Retry
        </Button>
        <Button mode="contained" icon="close" onPress={handleDiscard}>
          Discard
        </Button>
      </View>
    </View>
  )}

  <View style={styles.cameraToolbar}>
    <IconButton icon="close" accessibilityLabel="Close camera" onPress={handleClose} />
    <IconButton
      icon={FACING_ICONS[facing]}
      accessibilityLabel={FACING_LABELS[facing]}
      testID="camera-facing"
      onPress={() => setFacing(nextFacing)}
    />
    <IconButton
      icon={FLASH_ICONS[flash]}
      accessibilityLabel={FLASH_LABELS[flash]}
      testID="camera-flash"
      onPress={() => setFlash(nextFlashMode)}
    />
    <Text style={styles.zoomLabel}>{zoomToMagnification(zoom).toFixed(1)}x</Text>
    <IconButton
      icon="aspect-ratio"
      accessibilityLabel={`Aspect ratio ${RATIO_LABELS[ratio]}`}
      testID="camera-ratio"
      onPress={() => setRatio(nextRatio)}
    />
  </View>

  {flow.phase === "preview" && <ZoomSlider value={zoom} onChange={setZoom} />}

  <View style={styles.controls}>
    <Button
      mode="contained"
      icon="camera"
      loading={shutterBusy}
      disabled={shutterBusy || gps.status !== "fixed" || flow.phase !== "preview"}
      onPress={handleShutter}
    >
      Capture
    </Button>
  </View>
</View>
```

Notes on the render change:
- `zoom={zoom}` is now passed (the bug fix). `zoomToMagnification(zoom).toFixed(1)` renders the label via Task 1's helper. When `zoom===25` the label reads e.g. `3.0x`.
- `ZoomSlider` is a small inline component defined in this same file (Task 3 Step 4). It renders only in `preview`.
- The full-screen `merging`/`confirm`/`failed` branches are removed; overlays replace them. The camera stays mounted.
- Add a **Close** button (Appbar or toolbar). We add it to the toolbar as shown (`handleClose` -> `router.back()`). Ensure the Appbar BackAction still works.

- [ ] **Step 2: Add tap/double-tap handlers**

Replace the single `onTouchStart` with handlers that distinguish single vs double tap and reset zoom on double-tap only when zoomed in:

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

// inside the component:
const lastTapRef = useRef(0);

const handleCameraTouch = useCallback((evt: { nativeEvent: { touches: { locationX: number; locationY: number }[] } }) => {
  const t = evt.nativeEvent.touches?.[0];
  if (!t) return;
  const now = Date.now();
  const double = now - lastTapRef.current < 300;
  lastTapRef.current = now;

  if (double) {
    // double-tap: reset zoom only if zoomed in
    setZoom((z) => (z > 0 ? 0 : z));
    return;
  }

  // single tap: focus ring + GPS refresh (existing behavior)
  setFocusRing({ x: t.locationX, y: t.locationY });
  focusAnim.setValue(0);
  Animated.timing(focusAnim, {
    toValue: 1,
    duration: 600,
    useNativeDriver: true,
  }).start(({ finished }) => {
    if (finished) setFocusRing(null);
  });
  gps.refreshNow();
}, [focusAnim, setFocusRing, setZoom, gps]);
```

Replace the JSX `onTouchStart={(e) => { if (e.nativeEvent.touches.length !==1) return; ... }}` with `onTouchStart={handleCameraTouch}` on `.cameraWrap`.

Note: do NOT let double-tap also fire the slider-less path when the zoom hasn't changed; the `setZoom(z => z>0?0:z)` is idempotent when `z===0`.

- [ ] **Step 3: Replace `clamp01`-style helpers usage and move pinch to the same `zoom` state**

Confirm the current pinch `PanResponder` already writes `setZoom` (it does, in current `capture.tsx`). Update the pinch `onPanResponderGrant` to set `zoomRef.current = zoom` (already present) and leave `onPanResponderMove` unchanged. Ensure the label now uses `zoomToMagnification`.

No new code required beyond confirming `zoomRef`/`zoom` remain consistent — pinch and slider both call `setZoom`. Step 4 adds the slider that also calls `setZoom`.

- [ ] **Step 4: Add the `ZoomSlider` component**

At the bottom of `capture.tsx` (before the `StyleSheet`), define a self-contained `ZoomSlider`. The PanResponder measures the track width via `onLayout` and converts `locationX` (relative to the track view) into `0..1`:

```tsx
function ZoomSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        if (trackWidth <= 0) return;
        const x = evt.nativeEvent.locationX;
        const next = Math.min(1, Math.max(0, x / trackWidth));
        onChange(next);
      },
    })
  ).current;

  return (
    <View
      style={styles.zoomSliderOuter}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      <View style={styles.zoomSliderTrack}>
        <View style={[styles.zoomSliderFill, { width: `${value * 100}%` }]} />
      </View>
      <Text style={styles.zoomLabel}>{`${zoomToMagnification(value).toFixed(1)}x`}</Text>
    </View>
  );
}
```

Add these style entries to the existing `StyleSheet` (inside `capture.tsx`):

```ts
zoomSliderOuter: {
  paddingHorizontal: 24,
  paddingTop: 8,
},
zoomSliderTrack: {
  height: 4,
  borderRadius: 2,
  backgroundColor: "rgba(0,0,0,0.15)",
  overflow: "hidden",
},
zoomSliderFill: {
  height: 4,
  borderRadius: 2,
  backgroundColor: "#76FF03",
},
```

`locationX` on the responder view is relative to that view; dividing by the measured `trackWidth` yields `0..1`. The fill uses a percentage width so the thumb/fill visually track `value`; the label renders via `zoomToMagnification` (Task 1).

- [ ] **Step 5: Wire the new overlay handlers & actions**

Replace `handleRetake` and `handleKeep` with:

```ts
const handleDiscard = async () => {
  await cleanupPending();
  flow.discard();
};

const handleRetry = () => {
  const pending = flow.pending;
  if (!pending) return;
  retryWatermark(pending.photoId);
  flow.retry();
};

const handleClose = () => {
  router.back();
};
```

Remove the `confirm`/`failed` full-screen handlers. The `handleShutter` flow stays the same (env `flow.beginCapture`, `enqueueWatermark`), but the merge complete/failed transitions now go to `saved`/`failed` (handled by the existing `useEffect` that listens to `photoStates` and calls `markMergeCompleted`/`markMergeFailed`). Add the toast timeout effect:

```ts
useEffect(() => {
  if (flow.phase !== "saved") return;
  const t = setTimeout(() => flow.savedTimeout(), 400);
  return () => clearTimeout(t);
}, [flow.phase, flow.savedTimeout]);
```

The existing effect that watches `photoStates` and calls `flow.markMergeCompleted` / `flow.markMergeFailed` stays; it now targets the new `saved`/`failed` phases automatically since the reducer maps those actions onto the new phases.

- [ ] **Step 6: Add capture performance markers**

In `handleShutter`, at the top capture a `const tShutter = perfNow()` (start before `takePictureAsync`). Add two logs as required:

```ts
const tCapture = perfNow();
const result = await cameraRef.current?.takePictureAsync({...});
perfLog("capture", "takePictureAndWrite", tCapture);

// near top of the async fn:
const tShutter = perfNow();
// after DB insert:
perfLog("capture", "shutterToCamera", tShutter);   // at takePicture resolve — see placement
perfLog("capture", "shutterToDbInsert", tShutter);      // after PhotoRepository.create
```

Precisely:
```ts
const tShutter = perfNow();          // just after (setting start of shutter)
// ...await gps fix toggle -> tCapture = perfNow();
// await takePictureAsync
perfLog("capture", "shutterToCamera", tShutter);
// ...
const photoId = await PhotoRepository.create(photo);
perfLog("capture", "shutterToDbInsert", tShutter);
```

Also add a `__DEV__`-only rolling summary. Track an array of `takePictureAndWrite` durations and every 10th` apply:

```ts
const captureTimesRef = useRef<number[]>([]);
// in handleShutter, after the existing perfLog:
if (typeof __DEV__ !== "undefined" && __DEV__) {
  captureTimesRef.current.push(perfNow() - tCapture);
  if (captureTimesRef.current.length >= 10) {
    const arr = captureTimesRef.current;
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    logger.debug(`[Perf:capture] last${arr.length} takePictureAndWrite avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms`);
    captureTimesRef.current = [];
  }
```

No blocking work added to the hot path.

- [ ] **Step 7: Run lint + types + tests**

Run:
```powershell
yarn lint
```
Expected: no errors.

Run:
```powershell
yarn tsc --noEmit  # per repo it's `npx tsc --noEmit`
```
Expected: no type errors. Remove any now-unused imports (`Image`, `RATIO_LABELS`, etc. if the full-screen preview branches were removed — double-check each import is still used; `Image` references the merge preview which is gone).

Run:
```powershell
yarn jest
```
Expected: all suites pass (including Task 1 & 2 tests, plus any capture-related existing suites). Note the existing `useGpsTracker.test.tsx`, `captureIsolation.test.ts`. If a referenced import is unused, remove it.

- [ ] **Step 8: Commit**

```bash
git add app/inspection/capture.tsx
git commit -m "feat(camera): always-on live view, zoom slider + double-tap, stay-on-capture workflow, perf markers"
```

---

## File Structure / Ownership Summary

| File | Owner |
|------|-------|
| `src/components/camera/cameraControls.ts` | Task 1 adds `zoomToMagnification` |
| `src/components/camera/useCaptureFlow.ts` | Task 2 rewrites phases/actions |
| `app/inspection/capture.tsx` | Task 3 full rewrite |
| `src/__tests__/components/camera/cameraControls.test.ts` | Task 1 |
| `src/__tests__/components/camera/useCaptureFlow.test.tsx` | Task 2 |

`useGpsTracker.ts` is intentionally unchanged (GPS stays active across the workflow). `src/utils/perf.ts` reused as-is.

## Self-Review

- **Spec coverage:** zoom state + `zoom={zoom}` (T1, T3) ✓; label 1.0x–5.0x (`zoomToMagnification`, T1) ✓; pinch direct (already present, T3 confirms) ✓; slider direct (T3 Step4) ✓; double-tap reset-if-zoomed (T3 Step2) ✓; single tap focus+GPS (T3 Step2) ✓; slider only in preview (T3 Step4 gated) ✓; always-mounted camera (T3 Step1) ✓; state machine preview/merging/saved/failed (T2, T3) ✓; 400ms saved timeout (T3 Step5) ✓; retry/discard (T2, T3) ✓; leave only via Back/Close (T3 Step1 Close + existing handleBack) ✓; no router.back on Keep (removed) ✓; perf instrumentation + <50ms gate note (T3 Step6) ✓. No remaining `confirm`/`retake` references.
- **Placeholder scan:** Only one flagged placeholder in Step 4 (the initial impossible ZoomSlider skeleton) — must be replaced with the concrete implementation shown beneath it. The comma `placeholder width; see below` line is scaffolding commentary for the worker and must not ship.
- **Type consistency:** `zoomToMagnification(zoom)` returns `number`; label uses `.toFixed(1)`. `flow.markMergeCompleted`/`markMergeFailed` dispatch the same action types the `capture.tsx` effect already uses. `discard`/`retry`/`savedTimeout` exist on the hook return per Task 2.