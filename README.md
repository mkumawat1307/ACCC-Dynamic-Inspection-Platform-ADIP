# ACCC Dynamic Inspection Platform (ADIP)

> Offline-First | Configuration-Driven | Android Inspection Platform

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Platform](https://img.shields.io/badge/platform-Android-success)
![Offline](https://img.shields.io/badge/offline-yes-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![Expo SDK](https://img.shields.io/badge/Expo-54-black)

## Overview

ADIP is an **offline-first Android inspection application** built with **Expo (React Native)** and native Android modules. It is designed for field inspection of ACCC infrastructure — pole inspections, asset verification, device recording, and camera-based evidence capture — with fully offline storage on the device and no server dependency during field work.

The app uses a **dynamic form engine**: inspection forms are rendered entirely from database configuration (templates → sections → fields → options), not hardcoded.

## Project Structure

```
├── frontend/            # Expo React Native app (all source code)
│   ├── app/             # Expo Router screens
│   ├── src/             # Components, hooks, utils, database, context
│   ├── android/         # Native Android build config
│   ├── modules/         # Custom native modules (download-storage, watermark)
│   └── docs/            # Architecture docs, ADRs, design specs
├── .gitignore
└── README.md
```

## Quick Start

```bash
cd frontend
yarn install
yarn start              # Expo dev server
```

## Build

```bash
cd frontend
eas build --platform android --profile preview    # Preview APK
eas build --platform android --profile production # Production APK
```

## Key Features

- **Offline-first workflow** — complete field operation with no network dependency
- **Dynamic inspection forms** — rendered from database configuration, not hardcoded
- **Project isolation** — each project owns its own SQLite database
- **Camera capture with live watermark preview** — see the watermark before you capture
- **Native watermark compositing** — Kotlin module overlays watermark onto JPEG on-device
- **Device management** — configurable device types with per-type fields and dropdowns
- **Dropdown defaults** — auto-fill default selections for any dropdown field
- **Site ID management** — duplicate detection, rename with photo file renaming, audit history
- **Template import/export** — share inspection configurations between projects
- **Reset to defaults** — full property restoration for sections, fields, and devices
- **Reports & export** — CSV, Excel, and PDF export with banded headers and device rows

## Documentation

Detailed documentation lives in [`frontend/docs/`](frontend/docs/):

- [PRD](frontend/docs/01-PRD.md) — Product Requirements Document
- [Architecture](frontend/docs/02-Architecture.md) — System architecture
- [Rules](frontend/docs/03-Rules.md) — Coding rules and conventions
- [Changelog](frontend/docs/07-Changelog.md) — Version history
- [Decisions](frontend/docs/09-Decisions.md) — Architecture Decision Records
- [Database Architecture](frontend/docs/10-DATABASE_ARCHITECTURE.md) — Dual SQLite database design

## Testing

```bash
cd frontend
yarn test               # Run all tests
npx tsc --noEmit        # Typecheck
yarn lint               # Lint
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + React Native |
| Navigation | Expo Router (file-based) |
| Language | TypeScript (strict mode) |
| Database | expo-sqlite (dual SQLite) |
| UI | React Native Paper |
| Native | Kotlin (watermark encoder, download storage) |
| Testing | Jest (104 suites, 1283+ tests) |
| Build | EAS Build |

## License

Proprietary — ACCC Internal Use Only
