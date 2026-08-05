# ACCC Dynamic Inspection Platform (ADIP)

Offline-first mobile application for infrastructure inspections. Built with React Native (Expo) and targeted at Android. Inspectors capture pole-level inspection data — device details, photos with GPS watermarks, and dropdown fields — entirely on-device, then export structured Excel/CSV reports.

Version 1.9.1 · TypeScript · Expo SDK 54 · Android-first

> This README documents the **current implementation**. It is kept in sync with the source of truth in [`docs/`](docs/).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Screenshots](#2-screenshots)
3. [Features](#3-features)
4. [Tech Stack](#4-tech-stack)
5. [Installation](#5-installation)
6. [Running the App](#6-running-the-app)
7. [Folder Structure](#7-folder-structure)
8. [Architecture](#8-architecture)
9. [Dependencies](#9-dependencies)
10. [Environment Variables](#10-environment-variables)
11. [Configuration](#11-configuration)
12. [Database](#12-database)
13. [API](#13-api)
14. [State Management](#14-state-management)
15. [Navigation](#15-navigation)
16. [Permissions](#16-permissions)
17. [Assets](#17-assets)
18. [Build Instructions](#18-build-instructions)
19. [Troubleshooting](#19-troubleshooting)
20. [License](#20-license)

---

## 1. Project Overview

ADIP lets field inspectors work without a network connection. Each project is a self-contained SQLite database holding its own inspection template (sections, fields, options), device definitions, dashboard cards, and every inspection record. The app:

- Creates projects from a **global template** (seeded once into each project DB).
- Collects inspections through a **dynamic, template-driven form** — the form is rendered from DB configuration, not hardcoded.
- Captures photos that are **watermarked** (pole ID, district/block, date, GPS) via a hidden WebView canvas and stored through Android's Storage Access Framework (SAF).
- Tracks **devices** (cameras, switches, NVR, custom types) per inspection with their own dropdown options.
- Exports **Excel/CSV reports** and **JSON templates** to the device file system for sharing.
- Provides a **smart dashboard** per project: count cards, today's/total summaries, and breakdown cards auto-generated from form fields.

The app is fully offline — there is no server, no network dependency, and no account system.

---

## 2. Screenshots

*Screenshots will be added here as they are captured.*

| Home / Project list | Project dashboard | Inspection form | Reports |
|:---:|:---:|:---:|:---:|
| *Placeholder* | *Placeholder* | *Placeholder* | *Placeholder* |

---

## 3. Features

**Project management**
- Create, edit, clone, and delete projects (each with its own SQLite DB).
- Search and sort projects by name, district, client, and created date.
- Per-project dashboard with smart statistic cards and quick actions.

**Inspection collection**
- Dynamic inspection form built from DB-configured sections and fields.
- Field types rendered by the form engine: text, number, multiline, dropdown, project dropdown, date, date-auto, time, switch, checkbox, and GPS (13 types accepted on template import, including device/camera/calculation).
- Auto-unlock and duplicate-pole detection (redirects to the existing inspection).
- Draft auto-save with debounced persistence; only "Completed" inspections count as final.
- Device detail editors (Camera, Switch, NVR, custom types) with per-type dropdown options.

**Photo capture & watermarking**
- Camera capture with GPS + timestamp watermark rendered on a hidden canvas (WebView).
- Photos stored in `DCIM/ACCC Inspection/<District>_<ProjectName>` via SAF; legacy folders migrate on project open.
- Watermark queue with retry and per-photo status (pending / done / error).

**Dashboard**
- Smart cards auto-generated from form fields (entity counts, dropdown breakdowns, today's/total summaries, date breakdowns).
- Manage, reorder, enable/disable, and delete cards; per-project collapse state.
- Auto-refresh on data change, app foreground, midnight rollover, and 60s poll.

**Form/settings admin**
- CRUD + reorder for sections, fields, and dropdown options.
- Manage device types and their field definitions; toggle device inclusion in the form.
- Reset-to-default (restores the seeded template, removes custom data).
- Template export/import as JSON (v2 format, with legacy v1 support).

**Reporting**
- Excel (`.xlsx`) and CSV export of project inspection data.
- Banded report layout (merged section headers), device rows split per inspection, autofilter + frozen header row.
- Preview table in-app; open or share the generated file.

---

## 4. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 54 · React Native 0.81.5 · React 19.1.0 |
| Language | TypeScript (strict mode) |
| Routing | Expo Router 6 (file-based, typed routes) |
| UI | React Native Paper 5 (Material 3) |
| Local DB | expo-sqlite 16 (SQLite, sequential single-handle model) |
| Photo storage | expo-file-system + Storage Access Framework (SAF) |
| Icons | MaterialCommunityIcons (`@expo/vector-icons`) |
| Charts/export | No chart lib; Excel generated via in-app XLSX builder (no server) |
| Tests | Jest (jest-expo), 41 suites / 507 tests, per-file coverage thresholds |
| Lint | ESLint via `expo lint` |

---

## 5. Installation

Prerequisites: Node.js (LTS), Android Studio/Android SDK, and either the Expo Go app or an Android emulator/device.

```powershell
# 1. Enter the repo
cd "ACCC inspection/frontend"

# 2. Install dependencies (uses npm/npx; yarn is not on PATH)
npm install
```

> **Package manager**: `package.json` pins the `packageManager`. Do not use `yarn` in this repo.

---

## 6. Running the App

```powershell
cd frontend
npx expo start              # Start the Expo dev server
npx expo run:android        # Run on Android device/emulator (or scan QR in Expo Go)
```

Health checks:

```powershell
npx expo lint               # ESLint (expo lint)
npx jest                    # Jest (507 tests)
npx tsc --noEmit            # TypeScript typecheck
```

> Note: the app is designed and tested for **Android**. iOS and web builds exist but are secondary targets.

---

## 7. Folder Structure

```
frontend/
├── app/                          # Expo Router routes (file-based navigation)
│   ├── _layout.tsx               # Root layout: PaperProvider → InspectionProvider → Stack
│   ├── +html.tsx                 # Web-only HTML shell (scroll reset)
│   ├── index.tsx                 # Home: project list / search / sort / CRUD
│   ├── components/               # Route-embedded components (ProjectDialogs)
│   ├── inspection/               # Inspection list, new/edit form, export dialogs
│   ├── projects/                 # New project, dashboard, dashboard settings
│   ├── reports/                  # Reports screen (Excel/CSV export + preview)
│   └── settings/                 # Form settings: sections, fields, options, device types
│       └── components/           # DeviceTypeBody, template import/export dialogs, etc.
├── src/
│   ├── components/               # Shared UI components
│   │   ├── dashboard/            # DashboardCardGrid, StatBreakdownCard, etc.
│   │   ├── export/               # useExportFlow state machine
│   │   ├── inspection/           # Form renderers, photo capture/watermark, camera/device sections
│   │   ├── reports/              # ReportTablePreview
│   │   ├── template/             # useTemplateFlow state machine
│   │   └── StatCard.tsx
│   ├── constants/                # UI tokens (SPACING, COLORS, RADIUS)
│   ├── context/                  # InspectionContext (project + inspection state)
│   ├── database/                 # SQLite connection manager, schema, seeds
│   │   ├── db.ts                 # Sequential open/close connection manager (ADR-014)
│   │   ├── schema.ts             # Global + project DDL + migrations
│   │   ├── seed.ts               # Seed orchestrator
│   │   ├── helpers/              # ProjectDBManager (create/open/clone/delete project DBs)
│   │   ├── repositories/         # All data access (repository pattern)
│   │   └── seeds/                # Seed data (template sections/fields, dashboard cards, device types)
│   ├── hooks/                    # useIconFonts, useDashboardAutoRefresh, useSectionCollapse
│   ├── models/                   # TypeScript interfaces (Project, Photo, Camera, DashboardCard…)
│   └── utils/                    # logger, date, location, storageManager, watermarkHtml, exportData, templateData
├── __mocks__/                    # Jest mocks (expo-sqlite in-memory, expo-file-system)
├── docs/                         # PRD, Architecture, Decisions (ADRs), Rules, Changelog, Database
└── package.json
```

---

## 8. Architecture

ADIP uses a **repository pattern** over a **sequential single-handle SQLite connection**.

```
┌──────────────────────────────────────────────────────────┐
│                         UI (app/**)                      │
│   Home → Dashboard → Inspection form → Reports/Settings │
└───────────────▲─────────────────────┬────────────────────┘
                │                     │
                │         src/components + hooks (state machines)
                │                     │
┌───────────────┴─────────────────────▼────────────────────┐
│                    Repository layer                      │
│   ProjectRepository · InspectionRepository ·             │
│   DashboardService · StatisticCountService ·             │
│   FieldRepository · DeviceOptionsRepository · …          │
└───────────────▲─────────────────────┬────────────────────┘
                │                     │
                │   src/database/db.ts (single handle,
                │   sequential open/close)                 │
┌───────────────┴─────────────────────▼────────────────────┐
│          SQLite (accc_global.db + per-project DB)        │
└──────────────────────────────────────────────────────────┘
```

**Key rules (see `docs/09-Decisions.md`, ADR-014):**

- **Sequential open/close DB model.** expo-sqlite on Android has confirmed bugs with multiple simultaneous handles and close/reopen ordering. `src/database/db.ts` therefore keeps **exactly one** `SQLiteDatabase` handle at a time, switching via `ensureGlobalDb()` / `ensureProjectDb()` with path sanitization.
- **Never call `getGlobalDatabase()` during the inspection flow.** It closes the project DB and reopens the global DB, corrupting the native handle. Project data is passed via navigation params + `InspectionContext` instead.
- **Repository pattern.** All DB access goes through `src/database/repositories/`; the UI never queries SQLite directly.
- **Per-project isolation.** Every project DB is fully standalone (template + seed scoped to that project). No cross-DB joins; tables are per file. Custom/admin data (`IsDefault=0` sections, device types) is created per project, never seeded globally.
- **Migrations.** Schema additions ship as `migrateProjectSchema()` steps wired into `ProjectDBManager.openProjectDb`, so existing project DBs are upgraded in place.

**Data flow example — inspection form:** `app/inspection/new.tsx` → `InspectionRepository.getSections()` → `SectionRenderer`/`GeneralInformation` → `InspectionValueRepository` (debounced saves) → `InspectionDataBus` event → dashboard auto-refresh.

---

## 9. Dependencies

Core runtime dependencies (from `package.json`):

| Package | Purpose |
|---|---|
| `expo` (SDK 54) | React Native / Expo runtime |
| `expo-router` (~6.0.24) | File-based routing with typed routes |
| `expo-sqlite` (~16.0.10) | Local SQLite storage |
| `expo-file-system` | File read/write for exports & photos |
| `expo-camera` | In-app camera viewfinder with live watermark overlay |
| `expo-media-library` | Media library permissions |
| `expo-location` | GPS capture for watermarks |
| `expo-document-picker` | Template import file picking |
| `expo-sharing` | Share exported files |
| `expo-intent-launcher` | Open exported files on Android |
| `react-native-paper` (5.15.3) | Material 3 UI components |
| `@react-native-async-storage/async-storage` | Key/value persistence (collapse state, SAF URIs) |
| `react-native-element-dropdown` | Searchable dropdowns in forms |
| `react-native-paper-dropdown` | Paper-styled dropdowns |
| `react-native-webview` | Hidden watermark canvas renderer |
| `@react-navigation/native` (7) | Navigation primitives used by Expo Router |
| `@expo/vector-icons` | MaterialCommunityIcons |

Dev/test: `jest-expo`, `jest`, `@types/*`, `eslint` (+ `eslint-config-expo`), `typescript`.

---

## 10. Environment Variables

There are **no runtime environment variables** — the app is fully offline and self-contained. All configuration (templates, sections, fields, dashboard cards) lives in SQLite seed data.

For development, standard Expo environment variables apply if you need them (e.g., `EXPO_PUBLIC_*`), but no `EXPO_PUBLIC_*` values are referenced by the current implementation.

---

## 11. Configuration

- **`app.json`** — app metadata, name, scheme, splash (logo + background), Android package `com.accc.dynamicinspection`, iOS info-plist strings (location/camera/photo-library usage descriptions), and the `expo-router` / `expo-splash-screen` / `expo-location` plugins. `experiments.typedRoutes: true` enables type-safe route strings.
- **`tsconfig.json`** — strict TypeScript; `@/*` path alias maps to `frontend/*`.
- **`jest.config.js`** — jest-expo preset; `@/` alias; per-glob coverage thresholds; `__mocks__/` in-memory SQLite + file-system mocks.
- **Seed data** (per project DB) — default template (sections, fields, options), device types + definitions, and default dashboard cards. These are the app's "configuration" and are edited via the in-app Settings screens.

---

## 12. Database

Dual SQLite databases:

| Database | Location | Contents |
|---|---|---|
| Global | `SQLite/accc_global.db` | `Projects`, `Divisions`, `Districts` |
| Per-project | `SQLite/Projects/<Name>/inspection.db` | Full inspection template + data (18 tables) |

**22 tables total: 4 global + 18 per project.** Per-project tables include `Templates`, `TemplateSections`, `TemplateFields`, `FieldOptions`, `Inspections`, `InspectionValues`, `Photos`, `Cameras`, `Switches`, `DeviceRecords`, `DeviceFieldDefinitions`, `DeviceOptions`, `DeviceTypes`, `ProjectDeviceTypes`, `DashboardCards`, `DashboardCardOrder`, `ActivityLogs`, and more.

Key entities:
- `Projects` (global) → one row per project; `DBPath`/`SAFPath` point to the project DB and photo folder.
- `Templates` → `TemplateSections` → `TemplateFields` (+ `FieldOptions`) drive the dynamic form.
- `DashboardCards` → per-project smart cards; `IsDefault` distinguishes seeded vs custom cards.
- `DeviceTypes`/`DeviceFieldDefinitions`/`DeviceOptions`/`DeviceRecords` → device-type config and per-inspection device data.
- `Inspections` + `InspectionValues` → inspection rows and key/value answers.
- `Photos` → captured photos (filename, file path, GPS, captured-at).

See **[`docs/10-DATABASE_ARCHITECTURE.md`](docs/10-DATABASE_ARCHITECTURE.md)** for the full schema, tables, and relationship details.

---

## 13. API

There is **no external API** — ADIP is fully offline. The app's "API surface" is the repository layer + two in-app export formats:

| Format | Producer | Shape |
|---|---|---|
| Excel report (`.xlsx`) | `src/utils/exportData.ts` | Banded worksheet: merged section headers, device rows, autofilter, frozen header |
| CSV report (`.csv`) | `src/utils/exportData.ts` | Flat escaped CSV of the same table |
| Template export (`.json`) | `src/utils/templateData.ts` | v2 JSON: templates, sections, fields, options, device types/options, project device types |

Excel generation uses an in-app XLSX builder (binary structure + compression, no spreadsheet library dependency).

---

## 14. State Management

- **`InspectionContext`** (`src/context/InspectionContext.tsx`) — the only global context. Holds the active `project`, `openProject`/`closeProject`/`removeProject`, plus the current `inspectionDate`, `inspectionId`, and `poleId` (which drives form lock state). Consumed via the `useInspection()` hook; throws outside the provider.
- **Local `useState`** in screens for form/UI state.
- **`InspectionDataBus`** (`src/utils/InspectionDataBus.tsx`) — lightweight pub/sub so the dashboard auto-refreshes when inspection data changes.
- **`useDashboardAutoRefresh`** — returns an incrementing reload key on data-change events, app foreground, midnight, and a 60s poll.
- **`useExportFlow` / `useTemplateFlow`** — typed state machines (`idle → choosing/exporting → success/error`) for export/import flows.

No Redux, Zustand, or other external state library.

---

## 15. Navigation

- **Expo Router** file-based routing with **typed routes** enabled. Exactly **one layout** (the root `app/_layout.tsx`) with `headerShown: false`; every screen renders its own React Native Paper `Appbar.Header`. There are no nested layouts.
- Navigation is **imperative only** (no `Link` components): `useRouter()`, the global `router`, and `router.replace()` (used to redirect to an existing inspection on duplicate Pole ID).
- Structured data (e.g., a `Project`) is passed as a JSON string in route params (`projectData`) and parsed on the receiving screen.
- Android hardware back is intercepted only in the inspection form (`app/inspection/new.tsx`) to run validation before exiting.

Route table — see [`docs/02-Architecture.md`](docs/02-Architecture.md) (navigation section) or `.superpowers/docmap-app-layer.md`.

---

## 16. Permissions

Declared in `app.json` (Android manifest / iOS plist) and requested at runtime:

| Permission | Why | When |
|---|---|---|
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | GPS watermark on captured photos | On photo capture |
| `CAMERA` | Capture inspection photos | On photo capture |
| `WRITE_EXTERNAL_STORAGE` (SAF tree) | Save photos to `DCIM/ACCC Inspection/<District>_<ProjectName>` | On first photo save (SAF directory picker) |
| iOS `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription` | Equivalent iOS usage strings | As above (iOS secondary target) |

---

## 17. Assets

- Splash screen image: `assets/abhay-logo.png` (shown by the `expo-splash-screen` plugin).
- Icons: MaterialCommunityIcons via `@expo/vector-icons`; icon fonts are lazily loaded under Expo Go (`useIconFonts`).
- App icon/adaptive icon: Expo defaults in `app.json` (`assets/icon.png` etc.).

---

## 18. Build Instructions

```powershell
cd frontend

# 1. Verify checks
npx tsc --noEmit
npx jest

# 2. Local production APK (Gradle)
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease

# Output APK:
# android/app/build/outputs/apk/release/app-release.apk
```

The `android/` folder is checked in with release signing configured via `android/keystore.properties` (gitignored). The generated Android app id is `com.accc.dynamicinspection`.

If you need to regenerate the Android native project, run `npx expo prebuild --platform android` from `frontend/` before the Gradle build.

---

## 19. Troubleshooting

**Database handle / file-mixing issues (Android)**
- Symptom: after opening a project, the app reads from the wrong database or a query fails with "no such table".
- Cause: expo-sqlite on Android does not safely support two simultaneous handles or close+reopen ordering (ADR-014).
- Fix: ensure all DB access flows through `src/database/db.ts` (`ensureGlobalDb()` / `ensureProjectDb()`). Never call `getGlobalDatabase()` while a project is open (especially during the inspection flow).

**Watermark failures**
- Symptom: photos stuck in "Watermarking…" or an error chip.
- Check: `DCIM/ACCC Inspection` directory permission (SAF tree grant), available storage, and the hidden WebView's `postMessage` handler (`watermarkHtml.ts`). Jobs retry once.

**Excel export empty**
- Symptom: export returns "no rows".
- Cause: `createExportFile` returns `null` when the project has no inspection data. Add at least one inspection.

**Tests / lint**
- Run `npx jest`, `npx expo lint`, and `npx tsc --noEmit`. Coverage thresholds are enforced per-directory in `jest.config.js`.

**Reinstalling mocks**
- `__mocks__/expo-sqlite.ts` and `__mocks__/expo-file-system.ts` are in-memory test doubles; keep their path-aware behavior in sync if you extend tests (see `docs/03-Rules.md`).

---

## 20. License

Private/internal project. All rights reserved. Contact the project owner before redistribution.
