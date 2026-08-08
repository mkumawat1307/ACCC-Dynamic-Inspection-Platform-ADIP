# ACCC Dynamic Inspection Platform (ADIP)

> Offline-First | Configuration-Driven | Android Inspection Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Android-success)
![Offline](https://img.shields.io/badge/offline-yes-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![Expo SDK](https://img.shields.io/badge/Expo-54-black)

## Short Description

ADIP is an **offline-first Android inspection application** built with **Expo (React Native)** and native Android modules. It is designed for field inspection, asset verification, and camera-based evidence capture — with fully offline storage on the device and no server dependency during field work.

## Key Features

- **Offline-first workflow** — complete field operation with no network dependency; data is stored locally in SQLite.
- **Dynamic inspection forms** — inspections are rendered from database configuration (templates → sections → fields), not hardcoded.
- **Project isolation** — each project owns its database file, template, sections, fields, devices, and photos; no cross-project data mixing.
- **Template-based inspections** — reusable, configurable inspection templates define what each inspection captures.
- **Camera capture with live watermark preview** — see the watermark overlaid on the camera preview before you capture.
- **Retake / Keep confirmation flow** — after capture, the photo is shown with the watermark and you can **Keep** it or **Retake** it.
- **Native watermark compositing** — a Kotlin `WatermarkEncoderModule` overlays the watermark onto the original JPEG on-device.
- **SAF-based storage** — watermarked photos are written to `DCIM/ACCC Inspection/<Project>/` via the Storage Access Framework.
- **Dashboard and reporting** — per-project dashboards, inspection lists, and report previews.
- **Export support** — inspections can be exported as **CSV** or **Excel** (`.xlsx`) via the `xlsx` package.

## Camera & Watermark Architecture

The current implementation uses a **persistent camera session** with a **WebView-rendered overlay** and **native compositing**:

```text
camera session (expo-camera, persistent)
        │  takePictureAsync (original JPEG on disk)
        ▼
useWatermarkProcessor queue ──► hidden WebView
        │                          │  measure overlay text width
        │                          ▼
        │              WebView paints overlay PNG (per-photo layout)
        │                          │
        ▼                          ▼
native WatermarkEncoderModule (Kotlin)
        │  decode original JPEG (BitmapFactory)
        │  composite overlay PNG at layout position
        ▼
watermarked JPEG saved via SAF → DCIM/ACCC Inspection/<Project>/
```

- **Persistent camera session** — the camera stays alive across captures; only one photo is processed at a time through a queue.
- **WebView overlay rendering** — a background WebView lays out and rasterizes watermark text (dynamic font size, alignment, background) using layout metrics computed from the final image size.
- **Native `WatermarkEncoderModule`** — a Kotlin Android module decodes the original JPEG, composites the overlay PNG at the computed position, and replies with the watermarked result.
- **Final saved to storage** — the composited image is written to the project folder under DCIM via SAF.

> **⚠ Note:** Expo Go does not support the native watermark module and uses a different (browser-style) encoder path. It is **not representative of production behavior** — use a development or release build on Android to validate watermarking.

Native overlay compositing is active in **development / preview / release** EAS builds.

## Performance

- Typical full capture–save time is **~1–1.5 seconds on device**.
- Overlay compositing in native code **avoids large RGBA buffer transfers** between JS, WebView, and native.
- Native processing (`WatermarkEncoderModule`) is used in development, preview, and release builds — the rich PNG/JPEG round-trip stays on-device.

## Tech Stack

- **Expo SDK 54**
- **React Native** 0.81
- **TypeScript** (strict)
- **Android native module** (Kotlin) — `WatermarkEncoderModule.kt`
- **EAS Build** (development / preview / submit profiles)

## Project Structure

```text
frontend/
├── android/            # Bare Android project — authoritative native source (checked in)
├── app/                # Expo Router file-based routes (screens)
├── assets/             # App icons, images, fonts
├── scripts/            # Pre-install guard, reset-project, bundle measurements
├── src/
│   ├── components/     # UI components (CameraSection, WatermarkOverlay, etc.)
│   ├── constants/      # Constants and static config
│   ├── context/        # React contexts (inspection, watermark settings)
│   ├── database/       # SQLite schema, connection manager, repositories
│   ├── hooks/          # Custom hooks
│   ├── models/         # TypeScript data models
│   ├── native/         # Native module bindings (TS)
│   ├── utils/          # Storage, export, watermark, logger, perf utilities
│   └── __tests__/      # Jest test suites
├── eas.json            # EAS Build profiles
├── package.json
└── tsconfig.json
```

## Getting Started (Windows)

Prerequisites: Node.js (LTS), Yarn 1.x, Android SDK + a connected device or emulator (USB debugging enabled).

```bash
git clone <repo-url>
cd frontend
yarn install            # runs scripts/cmd-guard.js preinstall guard
adb devices            # confirm the device is listed
npx expo start --dev-client
```

Launch the app from the development build on the device when Metro is ready.

## EAS Build Commands

```bash
eas build --profile development --platform android        # dev client APK
eas build --profile preview --platform android            # internal preview APK
eas build --platform android                              # production build
```

Profiles live in `eas.json`. `development` enables development-client features; `preview` produces an internal APK. The default (`--profile production` or no profile) is not defined in `eas.json`, so it uses EAS's built-in production defaults.

## Debugging

Forward Metro to the device and stream watermark processing logs:

```bash
adb reverse tcp:8081 tcp:8081
adb logcat -s ReactNativeJS:V | findstr /C:"[Watermark:overlay]" /C:"[Watermark:save]"
```

The `[Watermark:overlay]` / `[Watermark:save]` tags log native overlay metrics, save timing, and completion per photo.

## Storage

Watermarked photos are written to the canonical folder via the Storage Access Framework:

```text
DCIM/ACCC Inspection/<Project>/
```

The app grants SAF access to `DCIM`, then creates or reuses the `ACCC Inspection/<Project name>/` folder (`src/utils/storageManager.ts`).

## Notes

- The **checked-in `android/` folder is authoritative** for the native module; EAS builds compile against it.
- **Native watermark diagnostics** are available only in **development builds** (`__DEV__` gating) and require the native module present.
- **Expo Go should not be used** to validate production watermark behavior — it falls back to the web-encoder path and is not representative of release builds.

## License

_No license file has been added to this repository yet. All rights reserved until a license is chosen._