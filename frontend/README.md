# ACCC Dynamic Inspection Platform (ADIP)

> Offline-First | Configuration-Driven | Android Inspection Platform

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Platform](https://img.shields.io/badge/platform-Android-success)
![Offline](https://img.shields.io/badge/offline-yes-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![Expo SDK](https://img.shields.io/badge/Expo-54-black)
![Tests](https://img.shields.io/badge/tests-1286 passing-brightgreen)

## Overview

ADIP is an **offline-first Android inspection application** built with **Expo (React Native)** and native Android modules. It is designed for field inspection of ACCC infrastructure — pole inspections, asset verification, device recording, and camera-based evidence capture — with fully offline storage on the device and no server dependency during field work.

The app uses a **dynamic form engine**: inspection forms are rendered entirely from database configuration (templates → sections → fields → options), not hardcoded. Administrators can customize sections, fields, dropdown options, device types, and dashboard cards without code changes.

## Key Features

- **Offline-first workflow** — complete field operation with no network dependency; data is stored locally in SQLite.
- **Dynamic inspection forms** — inspections are rendered from database configuration (templates → sections → fields), not hardcoded.
- **Project isolation** — each project owns its own SQLite database file, template, sections, fields, devices, and photos; no cross-project data mixing.
- **Template-based inspections** — reusable, configurable inspection templates define what each inspection captures.
- **Camera capture with live watermark preview** — see the watermark overlaid on the camera preview before you capture.
- **Retake / Keep confirmation flow** — after capture, the photo is shown with the watermark and you can Keep it or Retake it.
- **Native watermark compositing** — a Kotlin `WatermarkEncoderModule` overlays the watermark onto the original JPEG on-device.
- **SAF-based storage** — watermarked photos are written to `Download/ACCC Dynamic Inspection/<Project>/` via the Storage Access Framework.
- **Device management** — configurable device types (cameras, switches, isolators, transformers) with per-type field definitions and dropdown options.
- **Dropdown defaults** — set a default selection for any dropdown field; it auto-fills when a new inspection or device record is created.
- **Pole/Site ID management** — duplicate detection, rename with optional photo file renaming, and audit history.
- **Dashboard with configurable stat cards** — per-project dashboards with reorderable, customizable statistics.
- **Export support** — inspections can be exported as **CSV** or **Excel** (`.xlsx`) with styled formatting.
- **Template backup & restore** — export/import inspection form configurations as JSON.
- **Database backup & restore** — full app backup/restore as ZIP archives.
- **Section & field management** — add, edit, reorder, hide, or delete inspection sections and fields.
- **Reset to default** — restore the inspection form configuration to canonical defaults.

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
watermarked JPEG saved via SAF → Download/ACCC Dynamic Inspection/<Project>/
```

- **Persistent camera session** — the camera stays alive across captures; only one photo is processed at a time through a queue.
- **3-stage processing pipeline** — `overlay` (native overlay composite) → `rgba` (native RGBA encode) → `toblob` (JS canvas toBlob), with automatic fallback on failure.
- **WebView overlay rendering** — a background WebView lays out and rasterizes watermark text (dynamic font size, alignment, background) using layout metrics computed from the final image size.
- **Native `WatermarkEncoderModule`** — a Kotlin Android module decodes the original JPEG, composites the overlay PNG at the computed position, and replies with the watermarked result.
- **Final saved to storage** — the composited image is written to the project folder under Downloads via SAF.
- **Preview WYSIWYG with visual correction** — the live preview watermark matches the saved photo via a cover-fit transform with a 10% visual correction (`visualCorrection = 1.10`).

> **Note:** Expo Go does not support the native watermark module and uses a different (browser-style) encoder path. It is **not representative of production behavior** — use a development or release build on Android to validate watermarking.

## Database Architecture

### Dual SQLite Model

The app uses two types of SQLite databases:

| Database | File | Purpose |
|----------|------|---------|
| **Global** | `accc_global.db` | Projects, Divisions, Districts, Blocks — shared reference data |
| **Per-project** | `Projects/<label>_<hash>/inspection.db` | 19 tables: templates, sections, fields, inspections, values, photos, devices, dashboard cards |

### Sequential Open/Close Model

expo-sqlite v16 on Android has confirmed bugs that prevent safe dual-handle operation. The app uses a **single-handle sequential model**:

1. One `SQLiteDatabase` handle is open at a time.
2. Switching between global and project DBs closes the current handle before opening the next.
3. During the inspection flow, the global DB is **never** accessed — project data is passed via navigation params and React context.

### Project DB Tables (19)

| Table | Purpose |
|-------|---------|
| `InspectionTemplates` | Form templates (one default: "ACCC Dynamic Inspection Platform") |
| `InspectionSections` | 10 sections (General Information, Pole Structure, Junction Box, Earthing, Meter, Connectivity, Camera Info, Switch Info, Remarks, Photos) |
| `InspectionFields` | 28 fields across sections (text, dropdown, number, GPS, date, multiline) |
| `FieldOptions` | 66 options across 16 field keys |
| `RepeatableGroups` | Device groups (Camera, Switch) linked to count fields |
| `RepeatableGroupFields` | Fields within device groups (11 Camera, 9 Switch) |
| `Inspections` | One row per inspection (pole/site visit) |
| `InspectionValues` | EAV store for inspection field answers |
| `RepeatableRecords` | Instances of repeatable groups (Camera #1, Camera #2, etc.) |
| `RepeatableValues` | EAV store for repeatable group field values |
| `Cameras` | Legacy camera device records |
| `Switches` | Legacy switch device records |
| `Photos` | Photo attachments for inspections |
| `InspectionPoleIdHistory` | Audit trail for pole/site ID renames |
| `DeviceOptions` | Dropdown options for device fields |
| `DeviceFieldDefinitions` | Schema for device-type-specific fields (9 Camera, 7 Switch) |
| `DeviceRecords` | Modern device record storage (JSON blob per device) |
| `ProjectDeviceTypes` | Tracks available device types per project |
| `DashboardCards` | Configurable dashboard stat cards |

### Seed Data

Each project DB is seeded with:
- 1 template, 10 sections, 28 fields, 66 field options
- 2 repeatable groups (Camera, Switch) with 20 group fields
- 16 device field definitions, 43 device options
- 6 default dashboard cards

Global DB is seeded with:
- 7 divisions, 41 districts (Rajasthan state, India)

## Screens & Navigation

```text
app/index.tsx (Home — Project List)
  │
  ├── /projects/new (Create / Edit Project)
  │
  ├── /database (Database Backup & Restore)
  │
  └── /projects/dashboard (Project Dashboard)
        │
        ├── /inspection/new (New Inspection Form)
        │     └── /inspection/capture (Camera / Photo Capture)
        │
        ├── /inspection (Inspection List — Final & Drafts tabs)
        │     └── /inspection/edit (Edit Inspection)
        │
        ├── /settings (Project Settings)
        │     ├── /settings/sections (Section Management)
        │     │     ├── /settings/fields (Field Management)
        │     │     │     └── /settings/options (Dropdown Options)
        │     │     └── /settings/device-types (Device Type Management)
        │     │           └── /settings/device-options (Device Field Options)
        │     ├── /settings/template-backup (Template Backup & Restore)
        │     ├── /settings/watermark (Watermark Settings)
        │     ├── /settings/appearance (Appearance)
        │     └── /settings/about (About)
        │
        ├── /reports (Reports & Export)
        │
        └── /projects/dashboard-settings (Dashboard Card Manager)
```

### Home Screen
- Project list with search (across name, district, division, client, inspector) and 8 sort options.
- Per-card actions: Open, Edit, Clone (with custom name), Delete (with confirmation).
- Top buttons: New Project, Database.

### Inspection Form
- Dynamic sections rendered from DB config as expandable accordions.
- General Information section with pole/site ID (duplicate detection, rename flow), date, division, district, block, inspector, GPS.
- Device sections auto-render when device count > 0, with debounced auto-save.
- Photo section with capture, watermark processing, preview, and delete.
- Save validation: mandatory fields, device fields, photo requirements (minimum 1, all processed).
- Form locking: fields locked until pole/site ID is entered.

### Camera Capture
- Full camera with front/back facing, flash modes, aspect ratio switching, pinch-to-zoom, tap-to-focus.
- Real-time GPS tracking with status indicator (fixed/refreshing/denied).
- Live WYSIWYG watermark preview overlay.
- Post-capture watermark merging with progress indicator.

### Inspection List
- Segmented tabs: Final (completed) and Drafts.
- Search across pole ID, division, district, block.
- Multi-select mode with bulk export and bulk delete.
- Per-card export (single) and edit actions.

### Settings
- **Sections**: Add, edit, reorder, delete inspection sections. Pinned sections (General Information, Photos, Remarks) cannot be modified.
- **Fields**: Add, edit, reorder, delete fields within sections. Supports text, number, dropdown, multiline, GPS, date types.
- **Options**: Add, edit, reorder, delete dropdown options with default selection.
- **Device Types**: Manage device types, toggle presence in inspection forms, add/edit/delete device fields.
- **Device Options**: Manage dropdown options per device type field.
- **Template Backup & Restore**: Export/import form configuration as JSON.
- **Watermark**: Configure watermark size, position, colors, opacity, GPS display, address display, date/time format.
- **Reset to Default**: Restore all form configuration to canonical defaults (non-destructive to inspection data).

## Dashboard

Per-project dashboards with configurable stat cards:

- **Card modes**: Entity count, dropdown breakdown, SUM aggregation, field count, date breakdown.
- **Default cards**: Inspection Done (total/today), Pole Availability (total/today), Camera Count (total/today).
- **Smart card generation**: Automatically creates cards for form fields.
- **Card manager**: Add, delete, enable/disable, reorder cards.
- **Collapsible sections**: Total Summary and Today's Summary panels.
- **Auto-refresh**: Updates on app foreground, midnight rollover, and 60-second polling.

## Export

- **Formats**: CSV and Excel (`.xlsx`).
- **Styled Excel**: Merged band rows, borders, alternating fills, auto-filter, freeze panes, auto-sized columns.
- **Data**: Includes all inspection fields, expanded device records, split GPS coordinates (lat/lng).
- **Scope**: Export single, multiple (bulk selection), or all inspections.
- **Metadata**: Division and inspector name included in export.

## Project Structure

```text
frontend/
├── android/                  # Bare Android project — authoritative native source (checked in)
│   └── app/src/main/java/.../watermark/
│       └── WatermarkEncoderModule.kt   # Native watermark compositing
├── app/                      # Expo Router file-based routes (20 screens)
│   ├── _layout.tsx           # Root layout — provider hierarchy + splash
│   ├── index.tsx             # Home — project list
│   ├── database/             # Database backup/restore
│   ├── inspection/           # New, edit, list, capture screens
│   ├── projects/             # Dashboard, create/edit, dashboard settings
│   ├── reports/              # Export & report preview
│   └── settings/             # Sections, fields, options, device types, watermark, appearance, about, template backup
├── assets/                   # App icons, images, fonts
├── scripts/                  # Pre-install guard, bundle measurement
├── src/
│   ├── components/
│   │   ├── camera/           # Camera controls, GPS tracker, watermark overlay, capture flow
│   │   ├── dashboard/        # Stat cards, card grid, card manager, breakdown cards
│   │   ├── export/           # Export flow state machine
│   │   ├── inspection/       # SectionRenderer, FieldRenderer, DeviceSection, GeneralInformation,
│   │   │                     # PhotoSection, useWatermarkProcessor, scroll orchestration
│   │   ├── reports/          # Report table preview
│   │   └── settings/         # Watermark settings form, device type dialogs
│   ├── constants/            # UI design tokens (spacing, colors, radius)
│   ├── context/              # InspectionContext, PhotoStatesContext, WatermarkSettingsContext, InspectionScrollContext
│   ├── database/
│   │   ├── db.ts             # Sequential open/close connection manager
│   │   ├── schema.ts         # DDL — createGlobalSchema() / createProjectSchema() / migrateProjectSchema()
│   │   ├── seed.ts           # Seed orchestrator
│   │   ├── tables/           # Individual CREATE TABLE statements (19 files)
│   │   ├── seeds/            # Seed data (12 files)
│   │   ├── helpers/          # ProjectDBManager, BackupManager
│   │   └── repositories/     # 20 repository/service classes
│   ├── hooks/                # useDashboardAutoRefresh, useSectionCollapse, useIconFonts
│   ├── models/               # TypeScript interfaces (Project, District, InspectionField, etc.)
│   ├── native/               # WatermarkEncoder native module binding
│   ├── utils/                # Storage, export, watermark, logger, geo, date, perf utilities (20 files)
│   └── __tests__/            # Jest test suites (104 files)
├── __mocks__/                # Module mocks (expo-sqlite, expo-file-system, expo-camera, etc.)
├── eas.json                  # EAS Build profiles
├── jest.config.js            # Jest configuration
├── jest.setup.ts             # Test setup
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

## Commands

```bash
yarn start              # Expo dev server
yarn android            # Build and run on Android
yarn test               # Run Jest test suite
yarn lint               # Run ESLint via expo lint
npx tsc --noEmit        # Typecheck
```

## EAS Build

```bash
eas build --profile development --platform android        # dev client APK
eas build --profile preview --platform android            # internal preview APK
eas build --platform android                              # production build
```

Profiles are defined in `eas.json`. The `development` profile builds a dev client with hot reload. The `preview` profile produces an internal APK for testing.

## Testing

- **Framework**: Jest 29.7 with jest-expo preset
- **Coverage**: 22 critical source files have enforced minimums (80% lines/statements/functions, 70% branches)
- **Test count**: 1286 tests across 104 test files
- **Key patterns**: In-memory SQLite mock, react-test-renderer, isolation tests (cross-project data leak detection), state machine testing

```bash
yarn test               # Run all tests
yarn test -- --watch    # Watch mode
```

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
Download/ACCC Dynamic Inspection/<District_ProjectName>/
```

The app creates or reuses the project folder on startup (`src/utils/storageManager.ts`).

Database backups are stored as ZIP archives containing all SQLite database files.

## Architecture Decisions

### Isolation Requirements

Every project's data is fully isolated:
- Per-project data lives in the project DB only — never in the global DB.
- No cross-DB joins — each DB file is standalone.
- Custom/admin data (`IsDefault=0` sections, device types) is created per-project.
- Tests verify that data created in Project A never appears in Project B.

### Sequential Database Access

Due to expo-sqlite v16 Android bugs (dual-handle file mixing, close+reopen corruption), the app uses a single-handle sequential model:
- One `SQLiteDatabase` handle open at a time.
- `getGlobalDatabase()` / `setActiveProject()` switch handles via close-then-open.
- During inspection flow, `getGlobalDatabase()` is never called — project data is passed via navigation params and context.

### Logger Utility

`src/utils/logger.ts` provides production-safe logging:
- `info`, `warn`, `debug`, `trace` only log when `__DEV__` is true.
- `error` always logs.
- Wraps `console.*` methods.

## Notes

- The **checked-in `android/` folder is authoritative** for the native module; EAS builds compile against it.
- **Native watermark diagnostics** are available only in **development builds** (`__DEV__` gating) and require the native module present.
- **Expo Go should not be used** to validate production watermark behavior — it falls back to the web-encoder path and is not representative of release builds.
- The **preinstall guard** (`scripts/cmd-guard.js`) blocks unsafe install commands on Windows.
- **Yarn 1.22** is the required package manager (pinned in `package.json`).

## License

_No license file has been added to this repository yet. All rights reserved until a license is chosen._
