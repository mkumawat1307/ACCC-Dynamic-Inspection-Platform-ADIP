# ACCC Dynamic Inspection Platform (ADIP)

> Offline-First | Configuration-Driven | Android Inspection Platform

![Version](https://img.shields.io/badge/version-1.3.2-blue)
![Platform](https://img.shields.io/badge/platform-Android-success)
![Offline](https://img.shields.io/badge/offline-yes-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![Expo SDK](https://img.shields.io/badge/Expo-54-black)

## Overview

ADIP is an **offline-first Android inspection application** built with **Expo (React Native)**, a bare **native Android project**, and a small **local Kotlin Expo module** for download-storage access. It is designed for field inspection of ACCC infrastructure — pole inspections, asset verification, device recording, and camera-based evidence capture — with fully offline storage on the device and no server dependency during field work.

The app uses a **dynamic form engine**: inspection forms are rendered entirely from database configuration (templates → sections → fields → options), not hardcoded. Administrators can customize sections, fields, dropdown options, device types, and dashboard cards without code changes.

## Key Features

- **Offline-first workflow** — complete field operation with no network dependency; all data is stored locally in SQLite.
- **Dynamic inspection forms** — templates → sections → fields → option lists are all database-driven.
- **Per-project database isolation** — each project owns its own SQLite database file (template, sections, fields, devices, inspections, photos); no cross-project data mixing and no cross-DB joins.
- **Camera capture with live watermark preview** — the watermark is overlaid on the camera preview (WYSIWYG) before capture, and a background WebView composites the final watermarked JPEG.
- **Retake / Keep confirmation flow** — after capture the processed photo is shown and can be kept or retaken.
- **SAF-style download storage** — watermarked photos and exports are written to `Download/ACCC Dynamic Inspection/<Project>/` through a native Kotlin Expo module.
- **Device management** — configurable device types (Camera, Switch) with per-type field definitions and dropdown options.
- **Dropdown defaults** — a default selection can be configured for dropdown fields; it auto-applies for new inspections.
- **Site / Pole ID management** — duplicate detection on save, rename with audit history (`InspectionPoleIdHistory`).
- **Configurable dashboard** — per-project stat cards (counts, dropdown breakdowns, sums) with a card manager and auto-refresh.
- **Reports & export** — inspections export as **CSV** or **Excel** (`.xlsx`) with styled formatting.
- **Template backup & restore** — export/import the inspection form configuration as JSON.
- **Database backup & restore** — full device backup/restore as ZIP archives; Android system auto-backup is also hooked.
- **Section & field management** — add, edit, reorder, hide, or delete inspection sections and fields.
- **Reset to default** — restore the form configuration to the canonical factory defaults.

## Inspection Workflow

1. **Project list (Home)** — search across name/district/division/client/inspector, 8 sort orders, and per-project actions: Open, Edit, Clone (custom name), Delete (with confirmation).
2. **Open a project** — opens (or first-time creates) that project's own SQLite database and lands on the project dashboard.
3. **New Inspection** — each row in the "General Information" section (site/pole ID, inspection date, division/district, inspector name, GPS) seeds a draft inspection.
4. **Complete the form** — expandable sections rendered from DB config; device sections render one row per recorded device; capture photo evidence with the watermark overlay.
5. **Save / validate** — the save gate checks mandatory form fields, mandatory device fields, a minimum of one fully processed photo, and duplicate Site ID detection.
6. **List & export** — completed inspections appear under the **Final** tab, drafts under **Drafts**. Search, multi-select, bulk export, bulk delete, and single-export or edit from the list.

> Existing inspections open through `app/inspection/edit.tsx`, which reuses the same form screen and applies updates through a staged edit-session repository (`InspectionEditSession`) rather than directly mutating stored values.

## Inspection Sections

The form is organized into sections defined in the database. The canonical (factory) section set is:

| Section | Repeatable | Locked |
|---------|-----------|--------|
| General Information | — | ✅ |
| Pole Structure Details | — | |
| Junction Box and Power Cable | — | |
| Earthing Details | — | |
| Metering Information | — | |
| Connectivity Information | — | |
| Camera Information | ✅ (per device row) | |
| Switch Information | ✅ (per device row) | |
| Remarks | — | ✅ |
| Photos | — | ✅ |

- **Locked sections** (`general_information`, `remarks`, `photos`) cannot be deleted or reordered.
- **Custom sections** (`IsDefault = 0`) are created per project only — never seeded globally.
- **Section lifecycle**: sections can be added, edited, reordered, and soft-deleted. Deleting a section hides its fields from the form **but keeps the inspection data you already recorded** ("Fields in this section will be hidden from the form, but inspection data you already recorded is kept.").
- **Dropdown options** carry on similarly — deleting an option removes it from the form but already-saved values resolve to a "Deleted \<Name\>" label in exports and dashboards.
- **Reset to Default** reconstructs the canonical factory sections/fields/options (locked sections are exempt), preserving recorded inspection data. If inspections exist, the app warns that custom (`IsDefault = 0`) sections will be deleted from the library.

## Device Management

- Device types are seeded per project from a factory set (`Camera`, `Switch`).
- Each type has **field definitions** (`DeviceFieldDefinitions`, e.g. Camera Type/Status/Make/Model/IP/Serial Number/SD Card Capacity, Switch equivalents) with per-field required flags, and **dropdown options** (`DeviceOptions`).
- Device rows render dynamically in repeatable sections as the device count increases; each row auto-saves with debounce.
- Mandatory device fields are enforced at save time.

## Inspection Progress

Completion is determined by **recorded status and validation gates**, not a percentage bar:

- **Statuses**: `Draft` (default) → `Completed` → `Submitted`. Drafts and finals are tracked in separate tabs of the inspection list.
- **Save gates**:
  - All required (`IsRequired = 1`) form fields filled.
  - All required device fields for each recorded device filled.
  - At least one photo, and every photo in a terminal watermark state (`completed` — i.e. processed) — pending/processing/failed photos block the save.
  - No duplicate Site / Pole ID (checked against existing inspections for the project).

## Dashboard

- **Card modes**: entity count (`count`/`distinct`), dropdown breakdown, SUM aggregation, field count, date breakdown.
- **Panels**: the dashboard renders **Total Summary** and **Today's Summary** collapsible panels.
- **Seeded default cards** include total inspections, total poles (distinct pole ID), total cameras, today's inspections done (status = Completed), today's poles, etc.
- **Smart card generation** (`SmartCardGenerator`) can propose cards from the form's fields.
- **Card manager** (`projects/dashboard-settings`): add, delete, enable/disable, and reorder cards; custom cards are stored per project.
- **Behavior notes**: cards never include locked sections, and dropdown values are resolved to their labels (including "Deleted \<Name\>" for soft-deleted options) via the stats services.
- **Auto-refresh** on app foreground, midnight rollover, and a polling interval.

## Reports & Export

- **Formats**: CSV and Excel (`.xlsx`) — the reports screen offers "Export as Excel" and "Export as CSV".
- **Scope**: single inspection, bulk-selected inspections, or all.
- **Filters**: only final inspections (`Completed` / `Submitted`) are exported.
- **Layout**: one row per device instance — repeated sections (General Information, Categorization) repeat per device row; inspection-level photos are excluded from the tabular export.
- **Field mapping**: option values are written as their labels; GPS coordinates are split into separate latitude/longitude columns; soft-deleted options read "Deleted \<Name\>".
- **Styled Excel**: merged band rows, borders, alternating fills, auto-filter, freeze panes, auto-sized columns.
- **Files** are written to the download storage (see Data Storage).

## Data Storage

The app uses two kinds of SQLite databases plus the Android file system:

| Database | File | Purpose |
|----------|------|---------|
| **Global** | `accc_global.db` | Divisions, Districts, Projects — shared reference data (Rajasthan divisions/districts seeded) |
| **Per-project** | `Projects/<label>_<hash>/inspection.db` | Everything project-scoped: template, sections, fields, options, inspections, values, photos, devices, dashboard cards (19 tables per project) |

- **Sequential open/close model** — expo-sqlite v16 on Android has confirmed bugs with dual handles (file mixing) and close+reopen corruption. The app keeps exactly one `SQLiteDatabase` handle open at a time and switches via `ensureGlobalDb()` / `ensureProjectDb()` (`src/database/db.ts`). `cleanPath()` strips `file://` before comparison.
- **During the inspection flow, the global DB is never opened** — project data is passed through navigation params and React context to avoid switching handles mid-flow. See `docs/09-Decisions.md` (ADR-014).
- **Photos & exports** are written to `Download/ACCC Dynamic Inspection/<Project>/` (display path in-app: `Download/ACCC Dynamic Inspection/`) via a local Kotlin Expo module (`modules/download-storage`). The app ensures the root/project folder exists on startup (`src/utils/storageManager.ts`).
- **Backups** are ZIP archives containing all SQLite database files (`src/database/helpers/BackupManager.ts`), restored via the document picker.
- **Android system backup** is hooked (`AndroidBackupModule.requestBackup()` → `BackupManager.dataChanged()`); `backup_rules.xml` covers the app's file directory.

### Per-project tables (19)

InspectionTemplates, InspectionSections, InspectionFields, FieldOptions, RepeatableGroups, RepeatableGroupFields, Inspections, InspectionValues, RepeatableRecords, RepeatableValues, Cameras, Switches, Photos, InspectionPoleIdHistory, DeviceOptions, DeviceFieldDefinitions, DeviceRecords, ProjectDeviceTypes, DashboardCards.

> DeviceOptions, DeviceFieldDefinitions, and ProjectDeviceTypes are created inline in `schema.ts`; the remainder come from `src/database/tables/` (18 files). Global `accc_global.db` holds only Divisions, Districts, Projects.

## Configuration / Settings

Per-project settings (reached from the dashboard):

- **Sections** — add, edit, reorder, delete sections; locked/pinned sections (General Information, Photos, Remarks) cannot be deleted or moved.
- **Fields** — add, edit, reorder, delete fields within sections (text, number, dropdown, multiline, GPS, date).
- **Options** — manage dropdown options per field, including default selection.
- **Device Types** — manage device types, toggle presence in forms, edit field definitions.
- **Device Options** — dropdown options per device-type field.
- **Template Backup & Restore** — export/import form configuration as JSON.
- **Watermark** — size, position, colors, opacity, GPS display, address display, date/time format.
- **Appearance** — UI appearance preferences.
- **About** — app/about info.
- **Reset to Default** — restore canonical factory configuration (data-preserving; warns when inspections exist and custom sections will be removed from the library).

## Project Architecture

- **Expo Router** file-based routing: screens live in `app/**/*.tsx`.
- **Repository pattern** — all database access goes through `src/database/repositories/`; UI code never queries SQLite directly.
- **React Context** — `InspectionContext` holds the active project and inspection state; `PhotoStatesContext` tracks photo watermark states.
- **Dynamic form engine** — templates → sections → fields → options rendered by `SectionRenderer` / `FieldRenderer` / `renderFieldInput`; device rows by `DeviceSection`; scroll orchestration via `sectionScrollCoordinator`.
- **Camera & watermark pipeline** —
  1. `expo-camera` captures the original JPEG.
  2. `useWatermarkProcessor` queues each photo (`pending` → `processing` → `completed` / `failed`).
  3. A hidden WebView (`WatermarkMergeWebView`) lays out and composites the watermark onto the JPEG (the active processing stage is the JS/WebView merge; an optional native encoder wrapper exists in `src/native/WatermarkEncoder.ts` but is not compiled into the current build).
  4. The watermarked photo is written to download storage and its `content://` URI is recorded in `Photos`.
- **Native surface** (`android/`) — bare Android project: `MainApplication`/`MainActivity` (com.accc.dynamicinspection), `AndroidBackupModule`/`AndroidBackupPackage` for system backup hook. The local Kotlin Expo module `modules/download-storage` provides download-folder access.

## Technology Stack

- **React Native 0.81.5** / **React 19.1.0** / **Expo SDK 54** (`expo ~54.0.36`)
- **Expo Router ~6.0.24** (file-based routing), **expo-sqlite ~16.0.10**
- **expo-camera**, **expo-location**, **expo-file-system**, **expo-sharing**, **expo-document-picker**, **expo-media-library**, **expo-intent-launcher**
- **react-native-paper** 5.15.3 UI kit; **react-native-element-dropdown** (patched); **react-native-paper-dropdown**; **react-native-webview** 13.15.0 (watermark compositing)
- **react-native-reanimated ~4.1.1** (+ worklets), **react-native-gesture-handler**, **react-native-safe-area-context**, **react-native-screens**
- **jszip** 3.10.1 (backups)
- **TypeScript** strict mode; New Architecture enabled; Android only

## Installation

Prerequisites: Node.js (LTS), Yarn 1.x, Android SDK with a device or emulator (USB debugging enabled).

```bash
git clone <repo-url>
cd frontend
yarn install            # runs the preinstall guard (scripts/cmd-guard.js); pinning via save-exact
adb devices             # confirm the device is listed
npx expo start --dev-client
```

Launch the app from a development build on the device once Metro is ready.

## Development

```bash
yarn start              # Expo dev server
yarn android            # Build and run on Android (expo run:android)
yarn ios                # iOS entry point (project targets Android)
yarn web                # Web entry point (not a target platform)
yarn test               # Jest (see Testing)
yarn lint               # ESLint via expo lint
npx tsc --noEmit        # Typecheck
yarn bundle:measure     # Node scripts/measure-bundle.js
```

- Package manager is Yarn 1.22 (pinned via `packageManager`); `.npmrc` sets `save-exact=true`.
- The `preinstall` hook (`scripts/cmd-guard.js`) blocks unsafe install commands on Windows — do not bypass it.
- Do not run `yarn install` from a directory that would bypass the guard.

## Testing

- **Framework**: Jest (`jest-expo` preset) — `yarn test`.
- **Coverage**: per-glob coverage thresholds (80% lines/statements/functions, 70% branches) enforced for the core database, repository, and watermark files via `jest.config.js` (`collectCoverageFrom` excludes table/seed definitions).
- **Current status**: 116 suites, 1,429 passed, 1 skipped — verified pass on the development branch.
- **Key patterns**:
  - In-memory SQLite mock (`__mocks__/expo-sqlite.ts`), path-aware: tests use distinct DB paths/names and assert isolation.
  - **Isolation tests** — data created in Project A must not appear when Project B is opened (`src/__tests__/database/isolation.test.ts`).
  - Repository, state-machine, and export pipeline tests.

```bash
yarn test               # Run all tests
yarn test -- --watch    # Watch mode
```

## Android Build

- **Config source of truth**: `app.json` — version `1.3.2`, Android `versionCode` 6, package `com.accc.dynamicinspection`. `android/app/build.gradle` reads versionCode/versionName from the Expo config.
- **APK artifact**: `ACCC-Dynamic-Inspection-Platform-v<version>.apk`.
- **EAS profiles** (`eas.json`):

```bash
eas build --profile development --platform android      # dev client (internal)
eas build --profile preview --platform android          # internal preview APK
eas build --platform android                            # production build
```

- The checked-in `android/` bare project is required for APK builds (see `.easignore`); custom native code lives in `android/app/src/main/java/com/accc/dynamicinspection/` and the local module `modules/download-storage/`.
- New Architecture (`react-native-worklets`) is enabled in `android/gradle.properties`; SDK compile/target/min levels follow the Expo SDK 54 gradle plugin defaults.

## Project Structure

```text
frontend/
├── android/                   # Bare Android project — required for APK builds
│   ├── app/src/main/java/com/accc/dynamicinspection/
│   │   ├── MainActivity.kt / MainApplication.kt
│   │   ├── AndroidBackupModule.kt / AndroidBackupPackage.kt   # system-backup hook
│   └── app/src/main/res/xml/backup_rules.xml                  # full file-dir backup
├── modules/download-storage/  # Local Kotlin Expo module (SAF-style download access)
├── app/                       # Expo Router routes (21 files)
│   ├── _layout.tsx            # Root layout — provider hierarchy
│   ├── index.tsx              # Home — project list (search, sort, clone, delete)
│   ├── database/index.tsx     # Database backup & restore
│   ├── inspection/            # index (list Final/Drafts), new, edit, capture
│   ├── projects/              # new, dashboard, dashboard-settings
│   ├── reports/index.tsx      # Reports & export
│   └── settings/              # about, appearance, device-options, device-types,
│                              # fields, index, options, sections, template-backup, watermark
├── assets/                    # Icons, images, fonts
├── scripts/                   # Pre-install guard (cmd-guard.js), bundle measurement
├── src/
│   ├── components/            # camera, dashboard, export, inspection, reports, settings
│   ├── constants/             # UI design tokens
│   ├── context/               # InspectionContext, PhotoStatesContext, others
│   ├── database/
│   │   ├── db.ts              # Sequential open/close connection manager
│   │   ├── schema.ts          # DDL — global + project schema + migrations
│   │   ├── seed.ts            # Global seed orchestrator
│   │   ├── tables/            # CREATE TABLE statements (18 files)
│   │   ├── seeds/             # Factory configs + seed data (13 files)
│   │   ├── helpers/           # ProjectDBManager, BackupManager, DatabaseService
│   │   └── repositories/      # 22 repository/service classes (incl. types)
│   ├── hooks/                 # Dashboard auto-refresh, section collapse, icons
│   ├── models/                # TypeScript interfaces (Project, District, InspectionField, Photo, …)
│   ├── native/                # Native watermark-encoder binding (optional, not compiled today)
│   ├── utils/                 # logger, exportData, location, downloadStorage, storageManager, date, watermark helpers
│   └── __tests__/             # Jest suites (incl. isolation tests)
├── __mocks__/                 # expo-sqlite, expo-file-system, others
├── eas.json / jest.config.js / jest.setup.ts / tsconfig.json / app.json / package.json
└── docs/                      # PRD, ADRs, reports, plans (not shipped in APK)
```

## Data / Database Notes

- **22 tables total** — 3 global (Divisions, Districts, Projects) + 19 per-project.
- Per-project DBs live under `Projects/<label>_<hash>/` (folder identity derives from district + project name). Each new project DB is created with full seed data: template, factory sections (10), fields, options, repeatable groups, device types/fields/options, and dashboard cards.
- Custom (`IsDefault = 0`) sections are created per project, never seeded globally; `IsDefault = 1` sections appear in forms.
- Schema changes ship as migrations (`createProjectSchema()` / `migrateProjectSchema()` wired into `ProjectDBManager`) so existing project DBs are upgraded.
- Sequential open/close of the single SQLite handle is the **only safe pattern** on Android (expo-sqlite v16). Never open a second handle; never call `getGlobalDatabase()` during an inspection flow.
- Duplicate projects (same district + project name) are detected and blocked/flagged at project creation.

## Known Limitations

- **No server sync** — inspections carry a `SyncStatus` column, but there is no backend/upload path; export (CSV/Excel) is the data handoff mechanism.
- **Android-only** — the Gradle/native surface and download-storage module target Android; iOS/web are not built targets for field use.
- **Watermark compositing is JS/WebView-based** in the current build — the optional native encoder (`src/native`) is not compiled in; watermark quality depends on WebView rasterization.
- **Android auto-backup hook is best-effort** — `requestBackup()` only signals `BackupManager.dataChanged()`; it does not guarantee that the OS performs a backup. Use the in-app ZIP backup/restore for deterministic transfer.
- **Portrait-only, light theme** — enforced via `app.json` (`edgeToEdgeEnabled` false, portrait, light).
- **expo-sqlite v16 Android bugs** must be respected (no dual handles, no close+reopen) — see Data / Database Notes and ADR-014.

## Version

| Where | Value |
|-------|-------|
| App version (`app.json`) | 1.3.2 |
| Android versionCode | 6 |
| Package | com.accc.dynamicinspection |
| `package.json` (dev) | 1.3.0 |

## License

_No license file has been added to this repository yet. All rights reserved until a license is chosen._