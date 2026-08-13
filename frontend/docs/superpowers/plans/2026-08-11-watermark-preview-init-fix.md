# Implementation Plan: Fix Watermark Preview Initialization Bug

**Plan file:** `docs/superpowers/plans/2026-08-11-watermark-preview-init-fix.md`
**Date:** 2026-08-11
**Status:** APPROVED (user: "continue")

## Requirements Restatement

Fix the camera screen so the live preview watermark is correct the moment the camera opens — never oversized, never shrinking after the first capture. The final saved-photo watermark (already correct) and the WYSIWYG scaling math stay completely untouched. The fix: determine the expected capture resolution *before* the first photo using the camera's real supported picture sizes (`getAvailablePictureSizesAsync()`, verified present in the installed expo-camera 17.0.10 types) filtered by the selected ratio, then feed those dimensions to `WatermarkOverlay` on mount. No hardcoded resolutions in app code. Add `[Watermark:init]` DEV logs. Run tsc/lint/tests. **No commits or pushes.**

## Phase 1 — Pure selection helper (TDD, testable without native mocks)

- **Task 1**: Create `src/components/camera/expectedPhotoSize.ts` + `src/__tests__/components/camera/expectedPhotoSize.test.ts`: `parsePictureSize("WxH")` and `pickExpectedPhotoSize(sizes, {previewWidth, previewHeight, ratio})` — picks the largest candidate whose aspect matches the ratio, rotated to preview orientation (portrait app → swap W/H, matching `takePictureAsync`'s rotated output). Red → green → ~12 passing tests.
- **Task 2**: Modify `src/utils/watermarkStyle.ts` + `WatermarkOverlay.tsx:38`: export `WATERMARK_PREVIEW_VISUAL_CORRECTION = 1.10`; replace the literal — value-identical, enables the `scale=` log to match the overlay's real math.

## Phase 2 — Wiring

- **Task 3**: Modify `__mocks__/expo-camera.ts`: add `getAvailablePictureSizesAsync` to the mock handle (API parity).
- **Task 4**: Modify `app/inspection/capture.tsx`: add `expectedPhotoSize` + `cameraReady` state; seed via `onCameraReady` effect (re-runs on ratio/facing/camera-size change); DEV logs `[Watermark:init] preview=...`, `[Watermark:init] expectedPhoto=...`, `[Watermark:init] scale=...`; pass `photoWidth={capturedPhotoSize?.width ?? expectedPhotoSize?.width}` and gate overlay render on dims existing — the fallback branch becomes unreachable, killing the oversized state entirely.

## Phase 3 — Verification

- **Task 5**: `npx tsc --noEmit`, `yarn lint`, `yarn test` (507-test baseline + new suite), manual Android checklist (open → correct size; capture → no change; ratio/facing switch → re-seed; saved photo matches preview), then report exact files + source used.

## Dependencies

- `expo-camera@17.0.10` built-ins: `CameraView.getAvailablePictureSizesAsync()`, `onCameraReady` — **no new packages**.
- Unchanged by design: `useWatermarkProcessor`, `WatermarkMergeWebView`, `enqueueWatermark`, `takePictureAsync` options, WebView warmup, overlay WYSIWYG math.

## Risks

- **MEDIUM** — expected vs actual capture dims can differ. Mitigation: expected comes from the same API the camera honors; post-capture the actual dims take over (`capturedPhotoSize ?? expectedPhotoSize`), keeping saved-photo parity. Mismatch is normally zero → no jump.
- **MEDIUM** — API failure/empty list → watermark hidden until first capture (no oversized state, but no watermark). Mitigation: DEV warn log; acceptable; rare on Android.
- **LOW** — `capture.tsx` has no unit test (route pulls in DB/GPS/FileSystem). Mitigation: thin wiring, verified via DEV logs + manual checklist.
- **LOW** — `watermarkStyle.ts` has an 80% coverage threshold: the added constant is exercised by existing tests.
- **LOW** — existing overlay tests pin the fallback branch: branch is preserved, so they stay green.

## Estimated Complexity

LOW-MEDIUM (~90 min total).
