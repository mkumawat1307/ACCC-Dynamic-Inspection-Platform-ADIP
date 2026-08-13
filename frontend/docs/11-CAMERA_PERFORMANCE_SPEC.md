# CAMERA_PERFORMANCE_SPEC.md

# ADIP Camera Performance Specification v1.0

Status: Frozen

---

## Objective

Maintain the optimized camera pipeline while ensuring future development does not introduce performance regressions.

This document defines the performance architecture only.

UI enhancements must NOT modify this architecture without benchmarking.

---

# Current Performance Baseline

Measured on Physical Device

Capture

≈600 ms

Watermark Processing

≈700 ms

Capture → Saved

≈986 ms (Warm Cache)

Target

Maintain Capture → Saved ≤1000 ms

---

# Current Camera Pipeline

Camera

↓

Capture Full Resolution Image

↓

SQLite Create

↓

Persistent WebView

↓

Canvas Watermark

↓

JPEG Encode

↓

SAF Save

↓

SQLite Update

↓

Return To Inspection

---

# Protected Architecture

Do NOT remove or redesign:

✓ Persistent WebView

✓ Persistent HTML

✓ Persistent Canvas

✓ Renderer Reuse

✓ SAF Directory Cache

✓ Tree URI Cache

✓ Performance Instrumentation

✓ Capture Queue

✓ Offline Storage

✓ Current Watermark Rendering Pipeline

---

# Performance Budget

Camera Capture

Target ≤600 ms

SQLite Create

≤50 ms

File Read

≤250 ms

Canvas Draw

≤120 ms

JPEG Encode

≤200 ms

SAF Write

≤150 ms

SQLite Update

≤10 ms

Total

≤1000 ms

---

# Performance Rules

Every optimization must be benchmarked.

Every new feature must preserve current performance.

Any regression >50 ms must be justified.

No feature may reduce image quality.

No feature may reduce capture resolution.

No feature may block the camera preview.

---

# Performance Instrumentation

Keep instrumentation permanently available in Debug builds.

Log

Camera Capture

SQLite Create

File Read

WebView Send

JS Decode

Canvas Draw

JPEG Encode

WebView Return

SAF Write

SQLite Update

Total Capture → Saved

---

# Performance Dashboard

Debug Only

Capture

Watermark

Save

Total

FPS

Memory

Renderer

GPS

Internet

SAF Cache

---

# Future Optimization

Future work must be benchmark driven.

Possible future optimizations

• Direct File URI Rendering

• Native Bitmap Renderer

• Hardware JPEG Encoding

• Parallel Image Processing

Do not implement without measurements.

---

# Acceptance Criteria

✓ Capture → Saved ≤1 second

✓ No dropped frames

✓ No UI lag

✓ WYSIWYG watermark

✓ Preserve EXIF

✓ Preserve image quality

✓ Offline operation

✓ Inspection workflow unchanged
