# Camera Zoom + Stay-on-Camera Capture Workflow — Design

Date: 2026-08-07
Status: Approved
Component: `app/inspection/capture.tsx`, `src/components/camera/cameraControls.ts`, `useCaptureFlow.ts`, `useGpsTracker.ts`

## Objective

Two coupled changes to the capture screen:

1. **Camera zoom**: functional pinch-to-zoom plus an optional on-screen slider (1.0x–5.0x nominal), with a guarantee that zoom never reduces image quality or capture performance.
2. **Stay-on-camera workflow**: after capturing + watermarking a photo, do NOT leave the screen. Show a brief "Photo Saved" confirmation, soft-reset the preview, and remain on the live camera for the next shot. Only leave via the Back button or a Close button.

## Core Constraint

**The live `CameraView` must never unmount while permission is granted.** Today `CameraView` renders only when `flow.phase === "preview"` (`capture.tsx:343`); during `merging`/`confirm` it unmounts, tearing down the native camera session and resetting ratio/flash/focus natively. The new workflow requires keeping the camera mounted always and rendering merge/feedback states as overlays atop the live preview. This preserves the session and all camera settings across captures.

Current defect: the pinch `PanResponder` tracks `zoom` state but `CameraView` never receives `zoom={zoom}` — pinch only updates a percentage label, not the actual camera zoom.

## Approach

**Approach A — Always-mounted live camera + overlay states.** `CameraView` stays mounted; `merging` / `saved` / `failed` become overlay banners atop the live preview, never separate screen branches.

---

## Zoom Design

- **Normalized zoom state (0–1)** — single source of truth in React state (`zoom`).
- **Pinch** writes directly: `pinchZoomFromDistance(...) -> clamp01 -> setZoom`.
- **Slider** writes directly: PanResponder drag using `locationX` / track width -> `setZoom`.
- **`<CameraView zoom={zoom}>`** — the prop is actually passed (fixes the existing bug).
- **Label 1.0x–5.0x**: nominal mapping `magnification = 1 + zoom * 4`, displayed as `(1 + zoom * 4).toFixed(1) + "x"`. Pure helper `zoomToMagnification(zoom)` in `cameraControls.ts`.
- **No Animated.Value driving camera zoom; no interpolation loop.** "Smooth" comes from the slider's instantaneous drag and the pinch; no smoothing animation.
- **Double-tap** on the camera resets `zoom = 0` **only if `zoom > 0`**; otherwise it behaves as a normal tap. **Single tap** still performs focus ring + `gps.refreshNow()`. Tap coalescing threshold ~300 ms.
- **Slider visible only in `preview`** phase.
- **Persistence**: zoom survives across captures because the screen (and its state) stays mounted.
- **Reset**: initial `useState(0)` resets zoom whenever the capture screen remounts on reopen.
- **Focus/exposure**: unchanged. Manual exposure remains blocked (existing `expo-camera` 17 no-Android-API TODO).
- **Quality/performance**: `zoom` is a sensor-scale transform; it does not change resolution, `PHOTO_QUALITY` (0.8), or `skipProcessing: false`. `takePictureAsync` timing is unaffected. Added render cost is only the slider overlay — no blocking work.

---

## Stay-on-Camera State Machine

Phases (lowercase): `preview | merging | saved | failed` — `confirm` removed.

```
preview
  └─ BEGIN_CAPTURE → merging

merging
  ├─ MERGE_COMPLETED → saved (400 ms)
  └─ MERGE_FAILED → failed

saved
  └─ timer(400 ms) → preview   [soft reset]

failed
  ├─ Retry → merging
  └─ Discard → preview          [cleanup temp + DB row]
```

### `useCaptureFlow` changes
- `CapturePhase` -> `"preview" | "merging" | "saved" | "failed"`.
- New actions/transitions:
  - `MERGE_COMPLETED` (merging -> saved)
  - `MERGE_FAILED` (merging -> failed)
  - `SAVED_TIMEOUT` (saved -> preview, clears `pending`)
  - `RETRY` (failed -> merging)
  - `DISCARD` (failed -> preview, clears `pending`) — replaces the removed `RETAKE` action.
- `retake` helper removed; `discard()` / `savedTimeout()` added.

### `capture.tsx` restructure (Approach A)
- `CameraView` + `.cameraWrap` render unconditionally when permission granted. Never unmounted by phase.
- `preview` (default): no overlay; shutter enabled; slider visible.
- `merging`: small top-center banner ("Merging watermark…" + `ActivityIndicator`) over the live camera; shutter disabled.
- `saved`: "Photo Saved" banner overlay; after 400 ms dispatch `savedTimeout()` -> soft reset.
- **Soft reset** = clear `pending`, re-enable shutter, dismiss overlay; **do not** touch zoom/flash/ratio/facing/GPS (per requirement). No preview re-steady needed — live preview stays behind.
- `failed`: overlay with **Retry** / **Discard**. Retry re-enqueues via existing `retryWatermark` + `flow.retry()`. Discard uses existing `cleanupPending()` (delete temp + DB row + clear watermark state) then `flow.discard()`.
- Removed render branches: the full-screen `merging` (`:458`), `confirm` (`:470`), `failed` (`:489`) blocks.

### Leaving the screen
- Appbar **BackAction**, hardware Back (`handleBack`), and a new **Close** Appbar action all `router.back()`.
- `handleBack` keeps the existing "Discard Photo?" Alert when leaving during `merging` with a pending photo; otherwise `router.back()` directly.
- No `router.back()` on "Keep" anymore (Keep removed).

---

## Capture Performance Instrumentation (±50 ms gate)

- Reuse `perfNow()` / `perfLog()` (`src/utils/perf.ts`).
- Keep existing `perfLog("capture", "takePictureAndWrite", tCapture)`.
- Add markers:
  - `perfLog("capture", "shutterToCamera", tShutter)` — tap -> `takePictureAsync` resolved.
  - `perfLog("capture", "shutterToDbInsert", tShutter)` — tap -> `PhotoRepository.create` resolved.
- Add a `__DEV__`-only periodic summary (every 10 captures): avg / min / max of `takePictureAndWrite` so the dev can compare before/after from one device log.
- No new blocking work in the capture hot path; overlay rendering happens after DB insert.

---

## Files touched

- `app/inspection/capture.tsx` — always-mounted camera, overlay states, zoom prop, double-tap reset, Close action, perf markers.
- `src/components/camera/cameraControls.ts` — add `zoomToMagnification`, double-tap helpers if any.
- `src/components/camera/useCaptureFlow.ts` — phase union, new actions/transitions.
- `src/__tests__/components/camera/cameraControls.test.ts` — tests for `zoomToMagnification`.
- `src/__tests__/components/camera/useCaptureFlow.test.tsx` — update phase set + new transitions.
- `src/components/camera/useGpsTracker.ts` — unchanged (GPS stays active; already fine).

## Testing

- Jest unit tests for new `zoomToMagnification` and updated `useCaptureFlow` transitions.
- Manual device verification by the user:
  1. Baseline: run current build, collect `takePictureAndWrite` log, capture ~10 photos.
  2. Apply change, rerun, collect same log; confirm avg regression `< 50 ms`.
  3. Verify pinch + slider zooms the live preview; label shows 1.0x-5.0x; double-tap resets only when zoomed.
  4. Verify capture -> "Photo Saved" -> soft reset -> camera stays, settings/zoom/flash/ratio/GPS preserved; leave only via Back/Close.