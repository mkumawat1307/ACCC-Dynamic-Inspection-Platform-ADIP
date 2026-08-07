# ACCC Inspection Camera — v1.1 Release Notes

**Release candidate:** `camera-v1.1-rc1`
**Commit:** `e3ea66a` (`main`, `release/camera-v1.1`)

---

## Highlights

- In-app live-watermark camera with persistent session (no remount between captures).
- Fast watermark pipeline (~1.0–1.1s sustained capture-to-saved).
- Professional inspection watermark with live preview (ID, district/block, date-time, GPS).
- Reverse-geocoded address line added to the watermark.
- Tap-to-focus with forced high-accuracy GPS refresh.
- Zoom (pinch + slider).
- Canonical SAF photo folders with lazy legacy-folder migration.
- Draft inspection cleanup and final/draft separation.

## Performance

- Camera capture: ~470–630ms.
- Watermark merge: ~730–860ms.
- Sustained capture-to-saved: ~1.0–1.1s.

## Reliability

- Fixed intermittent 4–13s watermark stalls.
- Canvas and renderer reuse enabled.
- SAF directory caching enabled.
- Draft inspection cleanup improved.

## Changes in this release

- **Live watermark camera**: viewfinder with watermark overlay and Retake / Keep confirmation; final images pixel-identical to preview, produced by the same WebView canvas pipeline.
- **Reverse-geocoded address**: short human-readable address appended below GPS in preview and saved photo, cached per location, "Resolving Address..." while pending, "Address Unavailable" fallback.
- **GPS tap refresh**: tapping the preview forces a fresh high-accuracy fix with a "Refreshing GPS…" pill; unacceptable fixes fall back to the last good fix.
- **Canonical SAF folders**: photos saved to `<District>_<ProjectName>` under `DCIM/ACCC Inspection/`; legacy folders migrated lazily per project.
- **Watermark sizing**: live preview and saved photo share the identical metric math (WYSIWYG preview image).
- **4:3 viewfinder** whose framing matches the captured photo.

## Known limitations

- Watermark encoding uses the WebView canvas `toBlob` path in this release. A native Android JPEG encoder (ADR-022) is planned but **not** included in this RC.

## Notes

- Debug/perf instrumentation is gated on `__DEV__` and disabled in Release builds.