# Live Watermark Camera Capture — Design

**Date:** 2026-08-04
**Status:** Draft (pending user review)
**Type:** New feature (photo capture workflow optimization)

## Goal

Replace the current photo capture flow — which launches the **system camera app** via
`expo-image-picker` (`launchCameraAsync`) and waits for GPS **after** capture (up to 20 s) —
with an **in-app camera screen** (`expo-camera` `CameraView`) that shows a **live watermark
overlay** on the viewfinder, acquires GPS **during** the preview, and merges the watermark in
the background while a confirm screen is shown. The final saved image must be
**pixel-identical to the current watermark output**.

## Decisions (locked with user)

| Decision | Choice | Rationale |
|---|---|---|
| Camera surface | `expo-camera` `CameraView` | System camera cannot have an RN overlay; a live overlay is the "clear technical advantage" that justifies the library swap |
| Final merge | Reuse existing WebView canvas pipeline (`buildWatermarkPage` + `useWatermarkProcessor`) | Guarantees pixel-identical output — same code that produces today's photos |
| GPS timing | Pre-fetch during live preview; shutter gated on acceptable fix | Kills the current 8–20 s post-capture wait |
| GPS refresh | Cached last-valid location, refreshed only when stale or moved beyond threshold | Robustness requirements from user |
| Post-capture | Confirm screen showing merged result with **Retake / Keep** | User sees the watermark burned in before confirming |

## Current Pipeline (baseline)

1. `PhotoSection` capture button → `usePhotoCapture.capturePhoto()` (`usePhotoCapture.ts`).
2. `ImagePicker.launchCameraAsync({ quality: 0.8 })` → **system camera activity**.
3. After return: `getCurrentLocation()` — `getCurrentPositionAsync(Accuracy.Balanced)` raced with
   8 s (cached) / 20 s (no cache) timeout.
4. `InspectionRepository.getInspectionValues(inspectionId)` for `pole_id` / `block`.
5. `PhotoRepository.create(photo)` (row created at capture, `FilePath = asset.uri`).
6. `onPhotoCaptured` → `useWatermarkProcessor.enqueueWatermark(photoId, assetUri, fileName, lines)`.
7. Processor reads file → base64 → `buildWatermarkPage` → hidden WebView canvas → JPEG 0.95 →
   `writePhoto` (SAF) → `updateFilePath(contentUri)` → `photoStates[photoId] = "completed"`.

### Watermark appearance (must stay identical) — `watermarkHtml.ts`

- Font: `bold {fSize}px monospace`, `fSize = max(40, round(min(w,h)/35))`.
- `lh = round(fSize*1.4)`, `padY = round(fSize*0.5)`, `rPad = round(fSize*0.6)`, `gap = round(fSize*0.7)`.
- Box: bottom-left at `(gap, h - rh - gap)`, `bg rgba(0,0,0,0.6)`, `borderRadius 10`.
- Text `#76FF03`, first line `y = ry + padY + i*lh + fSize - 4`.
- 4 lines: `poleId` / `District, Block` / `formatWatermarkDate(timestamp)` / `formatLatLngWM(lat, lng)`.
- Export `image/jpeg` at quality `0.95`.

## New Architecture

### Dependencies / config

- Add `expo-camera` (~17.x for SDK 54) via `npx expo install expo-camera`.
- **Remove `expo-image-picker`** (its only usage is `launchCameraAsync` in `usePhotoCapture.ts`).
- `app.json`: drop the `expo-image-picker` plugin; add `expo-camera` plugin with
  `cameraPermission: "Take photos of the pole and equipment"`. `android.permission.CAMERA`
  already present.
- `usePhotoCapture.ts` is **deleted** (logic moves into the capture screen).

### New files

| Path | Purpose |
|---|---|
| `app/inspection/capture.tsx` | Full-screen `CameraView` route (param: `inspectionId`; `project` via `useInspection()` context) |
| `src/components/camera/useGpsTracker.ts` | GPS acquisition/lifecycle hook (watch + cache + staleness) |
| `src/components/camera/WatermarkOverlay.tsx` | RN overlay replicating the canvas watermark style |
| `src/components/camera/captureConfig.ts` | Tunable thresholds (accuracy, staleness, movement, grace) |
| `src/components/camera/useCaptureFlow.ts` | Capture/confirm state machine (pure reducer + actions) |
| `src/components/camera/WatermarkMergeWebView.tsx` | Extracted hidden WebView (shared by PhotoSection + capture screen) |
| `src/utils/geo.ts` | `haversineMeters`, `isLocationFresh`, `reverseGeocode` helpers |

### 1. GPS tracker — `useGpsTracker`

Robustness requirements mapped:

- **Start immediately on camera screen mount.** `useEffect` runs permission request, last-known
  seed, a one-shot fresh-fix race, and the watch subscription in one go.
- **Prefer a fresh, high-accuracy fix** (your safeguard): on mount, race a single
  `getCurrentPositionAsync({ accuracy: Balanced })` against the existing 8 s (cached) / 20 s
  (no cache) timeout — the fresh fix wins if it arrives.
- **Reuse an acceptable cached fix.** `getLastKnownPositionAsync()` as instant seed; accepted
  immediately if `coords.accuracy <= MAX_ACCURACY_M` (50 m) and age `<= STALE_MS` (60 s). A cached
  fix is **never** used without this accuracy + freshness check.
- **Cache the last valid location while the camera is open.** Every accepted fix replaces the
  cached value (threaded through a ref + state).
- **Refresh only when stale or moved.** Primary stream is `watchPositionAsync({
  accuracy: Balanced, distanceInterval: MOVE_THRESHOLD_M })` (15 m). Callbacks are ignored when
  `coords.accuracy > MAX_ACCURACY_M`. A staleness timer re-requests `getCurrentPositionAsync` when
  the cached fix exceeds `STALE_MS`.
- **Exposes** `{ status: "loading" | "acquiring" | "fixed" | "denied", coords, accuracyM, ageMs }`.
- **`captureGps(graceMs)`** — if `status === "fixed"` return coords immediately; otherwise wait up
  to `GPS_GRACE_MS` (5 s) for a fix (promise resolved by the first acceptable fix); return `null`
  on timeout.
- Cleanup on unmount: `subscription.remove()`, clear timers.

### 2. Watermark overlay — `WatermarkOverlay`

- Pure RN `View` positioned `absolute; bottom: gap; left: gap`, `backgroundColor: "rgba(0,0,0,0.6)"`,
  `borderRadius: 10`, `paddingVertical: padY`, `paddingHorizontal: rPad`.
- 4 `<Text>` lines: bold monospace `#76FF03`, `fontSize = fSize`, `lineHeight = lh`.
- Metrics come from a **shared pure function** `computeWatermarkMetrics(width, height)` (mirrors
  the canvas math in `watermarkHtml.ts`) so overlay and final merge agree.
- Line 4 (GPS) shows `"Acquiring GPS…"` until fixed, then `formatLatLngWM(lat, lng)`. Line 3
  (time) refreshes every second while previewing.
- **Identity guarantee**: the overlay is a *preview approximation* scaled to the viewfinder; the
  final saved image is produced by the *same canvas code as today* (which computes metrics from the
  final image's natural size), so output is pixel-identical to the current watermark. The overlay
  never becomes the saved artifact.

### 3. Capture screen — `app/inspection/capture.tsx`

State machine via `useCaptureFlow`:

```
preview ──shutter──▶ merging ──completed──▶ confirm
  ▲                    │                     │
  └──────retake────────┴───failed──▶ confirm ┴──keep──▶ router.back()
```

- **Mount**: `useGpsTracker` starts; `getInspectionValues(inspectionId)` fetches `pole_id`/`block`;
  reverse geocode starts in parallel **once GPS fixes** (best-effort, network-only; surfaces an
  address line on the confirm screen; never part of the watermark baseline).
- **Preview**: `<CameraView ref={camRef} facing="back" style={fill}>` + `WatermarkOverlay` +
  GPS status pill + shutter / close / flip buttons.
- **Shutter** (enabled only when `gps.status === "fixed"`):
  1. `captureGps(GPS_GRACE_MS)`; if `null` → Alert **"GPS is still being acquired"** with
     Wait/Retry + Cancel (never silently stamps a bad coordinate).
  2. `takePictureAsync({ quality: 0.8, skipProcessing: false })` → temp URI + `width`/`height`.
  3. Freeze `timestamp`, build `fileName` (`generateFileName`), lines array.
  4. `PhotoRepository.create(photo)` (row created here — same as today).
  5. `enqueueWatermark(photoId, tempUri, fileName, lines)` — merge runs **immediately**.
  6. Transition to `merging` → show temp image + "Merging watermark…" spinner.
- **Confirm**: when `photoStates[photoId] === "completed"`, load row via `PhotoRepository.getById`
  and render `content://` image (`getFileUri`). Buttons **Retake** (delete row + temp file +
  `clearWatermarkState`) and **Keep** (→ `router.back()`; PhotoSection reloads and shows the
  completed card).
- **Failed**: show error + **Retry** (`retryWatermark`) — same failed-state machinery.
- **Back without Keep** (including Android hardware back during merge): confirm-guard dialog, or
  clean up the orphan row (delete row + temp + state). Prevents orphan DB rows.
- **Route params**: `inspectionId` (+ `project` data via `useInspection()` context — no
  `getGlobalDatabase()` in the inspection flow; sequential open/close respected).

### 4. Shared WebView — `WatermarkMergeWebView`

Extract the hidden-WebView block from `PhotoSection.tsx:139-148` into
`WatermarkMergeWebView` (props: `html`, `webViewRef`, `onMessage`). PhotoSection and the capture
screen each instantiate `useWatermarkProcessor` + this component. `photoStates` live in
`InspectionContext`, so both instances stay consistent.

## Integration changes

- `PhotoSection.tsx`: `onCapture` now navigates to the capture route instead of calling
  `usePhotoCapture`; remove `usePhotoCapture` import and `capturing` wiring (or keep `capturing`
  = route-pushed state). `WatermarkMergeWebView` replaces the inline WebView.
- `app/inspection/new.tsx`: unaffected (PhotoSection internals change only).
- `PhotoRepository`: no schema change. **Add `getById(photoId)`** (confirmed missing; used by the confirm screen to load the `content://` image after merge completes).

## Config constants (`captureConfig.ts`)

```ts
MAX_GPS_ACCURACY_M = 50   // accept fixes at/below this horizontal accuracy
GPS_STALE_MS       = 60000 // refresh cache when older than this
GPS_MOVE_THRESHOLD_M = 15 // distanceInterval for watch; refresh on movement > this
GPS_GRACE_MS       = 5000 // post-shutter grace wait for a fix before informing the user
PHOTO_QUALITY      = 0.8  // takePictureAsync quality (matches today)
```

## Testing

### Unit

- `src/__tests__/utils/geo.test.ts` — `haversineMeters` (known distances, identical points, cross-hemisphere), `isLocationFresh` (fresh/stale boundary), accuracy filtering.
- `src/__tests__/components/camera/useCaptureFlow.test.tsx` — state transitions (preview→merging→confirm, retake cleanup, failed→retry, keep), GPS-null path alerts, orphan-row cleanup on back.
- `src/__tests__/components/camera/WatermarkOverlay.test.tsx` — `computeWatermarkMetrics` matches canvas math at multiple sizes; overlay renders 4 lines with fallback `"Acquiring GPS…"`.
- Extend `__mocks__/expo-location.ts` with `watchPositionAsync` (controllable callbacks), `reverseGeocodeAsync`, accuracy on coords.
- Extend `__mocks__/expo-camera.ts` (new): `CameraView` mock, `takePictureAsync` returning temp URI + dimensions, `useCameraPermissions`.
- **Isolation regression**: capture flow creates a photo row + SAF file in Project A, opens Project B, asserts nothing leaks. Mirrors `src/__tests__/database/isolation.test.ts`. Mocks stay path-aware.

### Manual / E2E (APK)

- **Visual identity check**: capture the same scene with the current APK and the new build; diff the two watermarked JPEGs (must be pixel-identical except JPEG re-encode of the scene).
- GPS pill states: acquiring → fixed; stale refresh; movement-triggered refresh; permission-denied path.
- Retake / Keep / failed-retry / back-during-merge (orphan cleanup).
- `yarn lint`, `yarn test`, `npx tsc --noEmit`, `expo-doctor`.

## Edge Cases

- GPS never fixes → shutter disabled; if user taps anyway → grace wait → clear "still acquiring" alert with Wait/Cancel; no photo saved with bad coords.
- Reverse geocode offline → returns `null`, address line hidden; watermark unaffected.
- Back during merge → cleanup guard deletes orphan row + temp file + state.
- App backgrounded during merge → WebView render may be suspended; on resume, job retries via existing retry mechanism.
- Camera permission denied → return to form with existing alert; no crash.

## Isolation Requirements

- No new tables/columns → no migration needed.
- Capture screen runs inside the inspection flow: never calls `getGlobalDatabase()`.
- All photo/watermark data stays in the project DB; overlay is a transient UI artifact.
