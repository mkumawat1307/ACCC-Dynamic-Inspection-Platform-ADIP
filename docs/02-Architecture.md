# ACCC Dynamic Inspection Platform (ADIP)

# System Architecture Document

---

## Document Information

| Item | Value |
|------|-------|
| Document | System Architecture |
| Version | 1.9.1 |
| Status | Active Development |
| Platform | Android (primary) |
| Framework | React Native (Expo SDK 54) |
| Language | TypeScript (strict) |
| Database | SQLite (expo-sqlite 16) |
| Architecture | Offline-First, Configuration-Driven |
| Last Updated | 2026-08-04 |

---

# 1. Introduction

The ACCC Dynamic Inspection Platform (ADIP) is an offline-first mobile application designed to digitize infrastructure inspections.

The application is built using a modular, configuration-driven architecture that allows inspection forms to evolve without requiring major code changes.

The current implementation focuses on pole inspections. The architecture is intentionally designed to support additional inspection types in future releases.

---

# 2. Architectural Goals

The architecture has been designed with the following objectives:

- Offline-first operation
- High maintainability
- Modular design
- Reusable components
- Configuration-driven inspection forms
- DB-driven device options (not hardcoded)
- Minimal code duplication
- Easy scalability
- Consistent user experience
- Simple testing
- Future cloud synchronization support

---

# 3. High-Level Architecture

The application follows a layered architecture.

```
+----------------------------------------------------+
|                  User Interface                    |
| Screens • Components • Forms • Camera • Smart Dashboard |
+----------------------------------------------------+
                     │
                     ▼
+----------------------------------------------------+
|               React Context Layer                  |
| InspectionContext • useInspection()                |
+----------------------------------------------------+
                     │
                     ▼
+----------------------------------------------------+
|              Repository Layer                      |
| Project • Inspection • Section • Field • Option    |
| Photo • Camera • Device* • Dashboard • Statistics  |
| InspectionDataBus (pub/sub, module-level)          |
+----------------------------------------------------+
                     │
                     ▼
+----------------------------------------------------+
|               SQLite Database                      |
| Global DB: Projects, Divisions, Districts, Blocks  |
| Project DB: Templates, Sections, Fields, Values,   |
|             Devices, Photos, DashboardCards        |
+----------------------------------------------------+
```

All database access is routed through `src/database/db.ts`, which enforces a **sequential single-handle** connection model (see Section 10 and ADR-014 in `docs/09-Decisions.md`).

---

# 4. Technology Stack

## Frontend

- React Native 0.81.5
- Expo SDK 54
- TypeScript (strict mode)
- React 19.1.0

## UI

- react-native-paper 5 (Material 3)
- react-native-element-dropdown / react-native-paper-dropdown
- @expo/vector-icons (MaterialCommunityIcons)

## Database

- SQLite via expo-sqlite 16
- expo-file-system (file I/O, exports, SAF photo storage)

## Navigation

- Expo Router 6 (file-based, typed routes)

## State Management

- React Context API (`InspectionContext`)

## Device APIs

- expo-image-picker (camera capture)
- expo-location (GPS)
- expo-media-library / Storage Access Framework (photos)
- expo-document-picker / expo-sharing / expo-intent-launcher (import/export)
- react-native-webview (watermark canvas rendering)

## Development Tools

- VS Code
- Git
- GitHub
- Android Studio
- Node.js
- Yarn 1.22

---

# 5. Design Principles

The project follows these architectural principles.

## Offline First

All inspection activities must work without internet connectivity.

Internet access is optional and reserved for future synchronization.

---

## Configuration Driven

Inspection forms are generated from database configuration.

Templates define:

- Sections
- Fields
- Display order
- Validation
- Visibility

This eliminates hardcoded inspection screens.

---

## DB-Driven Device Options

Device dropdown options (type, status, make, SI, SD card) are stored in the `DeviceOptions` table and field definitions in `DeviceFieldDefinitions`, rather than hardcoded in component source code.

`CameraSection` and `DeviceSection` load dropdown options from `DeviceOptionsRepository`. If the `DeviceOptions` table is empty, components fall back to hardcoded default values for backward compatibility.

---

## Repository Pattern

Database operations are isolated from UI components.

Benefits:

- Easier maintenance
- Better testing
- Cleaner code
- Reduced duplication

---

## Separation of Concerns

Each module has a single responsibility.

Examples:

Database Layer

Stores data.

Repository Layer

Reads and writes data.

Context Layer

Shares application state.

UI Layer

Displays information.

---

## Reusable Components

Components should be generic and reusable.

Examples:

- Text Input
- Dropdown
- Checkbox
- Dynamic Field Renderer (`FieldRenderer`)
- Camera Card (`CameraSection`)
- Generic Device Section (`DeviceSection`)
- Photo Preview

These components can be reused across multiple inspection templates.

---

# 6. Core Architectural Characteristics

The application is designed to be:

✔ Offline First

✔ Modular

✔ Configuration Driven

✔ Repository Based

✔ Component Oriented

✔ Scalable

✔ Maintainable

✔ Extensible

✔ Mobile Optimized

✔ Future Cloud Ready

# 7. Project Folder Structure

The project follows a modular folder structure to improve maintainability, scalability, and separation of responsibilities.

```
ACCC-Dynamic-Inspection-Platform/
│
├── docs/
├── frontend/
│   ├── app/                        (Expo Router routes)
│   │   ├── _layout.tsx             (Root layout — PaperProvider → InspectionProvider)
│   │   ├── +html.tsx               (Web-only HTML shell)
│   │   ├── index.tsx               (Home: project list / search / sort / CRUD)
│   │   ├── components/             (ProjectDialogs)
│   │   ├── inspection/
│   │   │   ├── index.tsx           (Inspection list + multi-select export/delete)
│   │   │   ├── new.tsx             (Dynamic inspection form)
│   │   │   ├── edit.tsx            (Thin wrapper → new.tsx in edit mode)
│   │   │   └── components/         (DeleteInspectionsDialog, ExportDialogs)
│   │   ├── projects/
│   │   │   ├── new.tsx             (Create/Edit project)
│   │   │   ├── dashboard.tsx       (Per-project Smart Dashboard)
│   │   │   └── dashboard-settings.tsx  (Dashboard Cards manager)
│   │   ├── reports/
│   │   │   └── index.tsx           (Reports: Excel/CSV export + preview)
│   │   └── settings/
│   │       ├── index.tsx           (Form settings hub + template import/export)
│   │       ├── sections.tsx
│   │       ├── fields.tsx
│   │       ├── options.tsx
│   │       ├── device-types.tsx
│   │       ├── device-options.tsx
│   │       └── components/         (DeviceTypeBody, DeviceTypeDialogs, Template*Dialogs)
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── inspection/         (FieldRenderer, SectionRenderer, GeneralInformation,
│   │   │   │                        CameraSection, DeviceSection, PhotoSection,
│   │   │   │                        renderFieldInput, photoUtils, usePhotoCapture,
│   │   │   │                        useWatermarkProcessor, PhotoCard, PhotoPreviewModal)
│   │   │   ├── dashboard/          (DashboardCardGrid, DashboardCardManager,
│   │   │   │                        DashboardActionCard, StatBreakdownCard)
│   │   │   ├── export/             (useExportFlow state machine)
│   │   │   ├── reports/            (ReportTablePreview)
│   │   │   ├── template/           (useTemplateFlow state machine)
│   │   │   └── StatCard.tsx
│   │   ├── constants/              (ui.ts — SPACING, COLORS, RADIUS)
│   │   ├── context/
│   │   │   └── InspectionContext.tsx
│   │   ├── database/
│   │   │   ├── db.ts               (Sequential open/close DB manager)
│   │   │   ├── schema.ts           (Global + Project schema creators + migrations)
│   │   │   ├── seed.ts             (Global + Project seed orchestrators)
│   │   │   ├── DatabaseService.ts  (Startup initialization)
│   │   │   ├── tables/             (CREATE TABLE definitions, 18 files)
│   │   │   ├── seeds/              (Idempotent seed data)
│   │   │   ├── constants/          (Legacy DB name constant)
│   │   │   ├── repositories/       (Repository Pattern — 18 repos + 2 helpers)
│   │   │   └── helpers/
│   │   │       └── ProjectDBManager.ts
│   │   ├── hooks/
│   │   │   ├── use-icon-fonts.ts
│   │   │   ├── useDashboardAutoRefresh.ts
│   │   │   └── useSectionCollapse.ts
│   │   ├── models/                 (Project, District, Camera, Switch, DashboardCard,
│   │   │                            InspectionField, InspectionValue, Photo)
│   │   └── utils/
│   │       ├── date.ts
│   │       ├── location.ts
│   │       ├── logger.ts
│   │       ├── InspectionDataBus.ts
│   │       ├── storageManager.ts
│   │       ├── watermarkHtml.ts
│   │       ├── exportData.ts
│   │       └── templateData.ts
│   │
│   ├── assets/
│   ├── __mocks__/                  (expo-sqlite, expo-file-system in-memory mocks)
│   ├── package.json
│   ├── tsconfig.json
│   └── app.json
```

---

# 8. Folder Responsibilities

## app/

Contains all application screens managed by Expo Router. There is exactly **one layout** (the root `_layout.tsx`); every route is a leaf with its own paper `Appbar.Header` (`headerShown: false` at the root Stack).

Examples:

- Home / Project list
- New / Edit Project
- Project Dashboard + Dashboard Settings
- New / Edit Inspection
- Inspection List
- Reports
- Settings (sections, fields, options, device-types, device-options)

Responsibilities

- Navigation (imperative `useRouter()` — no `Link` components)
- Screen layout
- User interaction

---

## components/

Contains reusable UI components.

Examples

- `inspection/` — FieldRenderer, SectionRenderer, GeneralInformation, CameraSection, DeviceSection, PhotoSection, renderFieldInput, photoUtils, usePhotoCapture, useWatermarkProcessor, PhotoCard, PhotoPreviewModal, PhotoSectionHeader
- `dashboard/` — DashboardCardGrid, DashboardCardManager, DashboardActionCard, StatBreakdownCard
- `export/` — useExportFlow
- `reports/` — ReportTablePreview
- `template/` — useTemplateFlow
- StatCard

Rules

- Must not access SQLite directly.
- Should remain reusable.
- Should receive data through props.
- Hooks (e.g. `useExportFlow`, `useTemplateFlow`) encapsulate UI state machines.

---

## context/

Contains React Context providers.

Current providers

- InspectionContext (project, inspectionDate, inspectionId, poleId + open/close/remove project)

Responsibilities

- Shared inspection state

The Context layer communicates with repositories instead of directly accessing the database.

---

## database/

Contains all database-related code.

Structure

database/

db.ts (SQLite connection manager — sequential single-handle)

schema.ts (CREATE TABLE statements, migrations)

seed.ts (Seed orchestrator)

tables/ (Table DDL definitions)

seeds/ (Idempotent seed data)

repositories/ (Repository Pattern — 18 repos)

helpers/ (ProjectDBManager)

Responsibilities

- Table creation
- Database initialization
- Seed data
- CRUD operations via repositories
- Migrations for schema evolution
- Per-project DB lifecycle (create/open/clone/delete)

---

## models/

Contains TypeScript interfaces representing database entities.

Examples

Project

District

Camera

Switch

DashboardCard

InspectionField

InspectionValue

Photo

Responsibilities

- Strong typing
- Compile-time validation
- Shared data contracts

---

## repositories/

Repositories isolate business logic from SQLite.

Location: src/database/repositories/

Responsibilities

- CRUD operations
- Queries
- Transactions
- Data mapping

Current repositories (18):

**Global DB / reference:**
- `ProjectRepository` (CRUD + cloneProject — clones the global row; file clone via `ProjectDBManager.cloneProjectDb`)
- `DistrictRepository` (district list)

**Form configuration (project DB):**
- `SectionRepository` (section CRUD/reorder, hasInspectionValues check)
- `FieldRepository` (field CRUD/reorder/keyExists; exports `FIELD_TYPES`)
- `FieldOptionRepository` (dropdown option CRUD/reorder)
- `InspectionFieldRepository` (fields-by-section, options, active template fields)
- `InspectionValueRepository` (upsert/get/delete field values)

**Inspections (project DB):**
- `InspectionRepository` (inspection CRUD, validation, sections/fields, duplicate-pole lookup; emits `InspectionDataBus` changes)
- `InspectionListRepository` (inspection list with details; `filterByQuery`)
- `inspectionDataHelper.ts` (transactional child-data deletion) and `InspectionTypes.ts` (type-only) — helpers, not repos

**Photos / Cameras / Devices (project DB):**
- `PhotoRepository` (photo CRUD, updateFilePath)
- `CameraRepository` (camera CRUD + transactional saveMultiple)
- `DeviceRecordsRepository` (generic device records, JSON `DeviceData` storage)
- `DeviceOptionsRepository` (per-device-type dropdown options)
- `DeviceFieldDefinitionsRepository` (per-device-type field definitions)

**Dashboard / statistics (project DB):**
- `DashboardCardRepository` (card CRUD, reorder, ensure/migrate/reset default cards, normalizeSections, migrateDeviceCards)
- `DashboardService` (aggregates enabled cards with live counts via StatisticCountService)
- `StatisticCountService` (count, sum, field-count, dropdown/date/device breakdowns)
- `SmartCardGenerator` (auto-creates dashboard cards from form fields)

---

## utils/

Utility functions used throughout the application.

Location: src/utils/

Current files

- date.ts (inspection date formatting/parsing)
- location.ts (getCurrentLocation with permissions)
- logger.ts (prod-safe console wrapper)
- InspectionDataBus.ts (pub/sub for inspection changes)
- storageManager.ts (SAF photo storage — ensureTreeUri/getProjectDir/writePhoto/deletePhoto)
- watermarkHtml.ts (canvas watermark page builder)
- exportData.ts (unified export service: banded Excel/CSV for projects and single inspections)
- templateData.ts (template JSON export and import, v2 + legacy v1)

---

## hooks/

Reusable React hooks.

Location: src/hooks/

Current hooks

- use-icon-fonts (icon font loading under Expo Go)
- useDashboardAutoRefresh (auto-refresh dashboard on inspection data changes, app foreground, midnight, 60s focused poll)
- useSectionCollapse (persists per-project collapsed dashboard sections in AsyncStorage)

---

# 9. Layered Architecture

The application follows a five-layer architecture.

```
User

↓

Screens

↓

Components

↓

Context

↓

Repositories

↓

SQLite Database
```

Each layer communicates only with the layer immediately below it.

This separation improves maintainability and testing.

---

# 10. Database Architecture

The application uses a dual-database SQLite architecture for per-project data isolation.

Database Principles

- Offline-first
- Relational design
- Foreign key support
- Repository Pattern
- Transaction support
- Per-project database isolation

Dual-Database Model

Global DB (`accc_global.db`) — 4 Tables:
- Divisions — division master data
- Districts — district master data (FK → Divisions)
- Blocks — block master data (FK → Districts)
- Projects — list of all projects (name, district, block, client, DBPath, SAFPath)

Project DB (`Projects/<ProjectName>/inspection.db`) — 18 Tables per project:
- InspectionTemplates
- InspectionSections (with IsDefault flag for built-in vs custom)
- InspectionFields
- FieldOptions
- RepeatableGroups
- RepeatableGroupFields
- Inspections
- InspectionValues
- RepeatableRecords
- RepeatableValues
- Cameras
- Switches
- Photos
- DeviceOptions
- DeviceFieldDefinitions
- DeviceRecords
- ProjectDeviceTypes
- DashboardCards

Each project database is created with full seed data (default template, sections, fields, options, device options, device field definitions, dashboard cards) at project creation time.

ProjectDBManager (`src/database/helpers/ProjectDBManager.ts`) handles creating, opening, cloning, and deleting project databases:
- `createProjectDb` — mkdir + schema + all seeds + `seedDashboardCards(projectId)`
- `cloneProjectDb` — **atomic clone** inside `withTransactionAsync`: copies settings + inspection + data tables, dedupes DashboardCards by CardKey, remaps IDs (InspectionID, RecordID)
- `openProjectDb` — opens, validates schema, then runs `migrateProjectSchema(projectId)`
- `deleteProjectDb` / `deleteProjectFolder` — removes the project folder

Connection Management (`db.ts`)

The app uses a **sequential open/close model** with a single `SQLiteDatabase` handle to avoid expo-sqlite Android bugs where multiple simultaneous connections return handles to the wrong database file.

- **Single handle**: Only one `SQLiteDatabase` handle is ever open at a time. `currentDbTarget` tracks which DB file is currently open (`"accc_global.db"` or a cleaned project path).
- **Global-only state**: When `activeProjectPath` is null, `getDatabase()` returns the global DB (`accc_global.db`).
- **Project-active state** (`setActiveProject`): `activeProjectPath` is set. The current DB is closed and the project DB is opened. `getDatabase()` returns the project DB.
- **Switching**: `ensureGlobalDb()` and `ensureProjectDb()` only close+reopen when the requested DB differs from `currentDbTarget`. No redundant switches.
- **`cleanPath()`**: Strips `file://` URI prefix before path comparison to avoid mismatches between `activeProjectPath` (which may include `file://`) and `currentDbTarget` (which never does).
- Project DBs use WAL journal mode. The global DB uses DELETE journal mode.
- PRAGMA configuration failures are caught silently — the database remains usable with SQLite defaults.
- **Do not call `getGlobalDatabase()` during the inspection flow** — it closes the project handle and reopens global, corrupting the native handle. Project data is passed via navigation params + `InspectionContext` instead. The only UI-facing `getGlobalDatabase()` call is `getProjectExportMeta` in `exportData.ts` (export flow, outside the mid-inspection DB session).
- `getInfoAsync` from expo-file-system is **not used** for SQLite `.db` files — it returns false negatives on Android (reports files as non-existent right after `closeAsync()`). Project DB validation uses `SELECT COUNT(*) FROM sqlite_master` instead.

Schema migrations: `migrateProjectSchema(projectId)` in `src/database/schema.ts` runs idempotent per-project migrations (remarks section split, DashboardCards table creation/columns/backfill, default/device card migrations) and is wired into `ProjectDBManager.openProjectDb`.

---

# 11. Entity Relationships

The current high-level relationship model is:

Global DB:

```
Divisions ──────▶ Districts ──────▶ Blocks
                        │
                        ▼
                     Projects
```

Project DB:

```
InspectionTemplates
       │
       ▼
InspectionSections
       │
       ▼
InspectionFields ◀── FieldOptions
       │        ▲
       │        │
       ▼        │
InspectionValues ◀── Inspections ────▶ Camera/Switch/DeviceRecords/Photos
       ▲              │
       │              │
RepeatableGroups ◀───┤
       │              │
       ▼              ▼
RepeatableGroupFields / RepeatableValues

DeviceOptions / DeviceFieldDefinitions ──▶ (standalone config, read by CameraSection/DeviceSection)
ProjectDeviceTypes ──▶ (per-project enabled device types)
DashboardCards ──▶ (per-project, ProjectID + CardKey)
```

`Inspections` is the parent record for all captured information. Device records (`Cameras`, `Switches`, `DeviceRecords`) and `Photos` are associated with an inspection.

`DeviceOptions` is a standalone configuration table that provides dropdown values to `CameraSection` and `DeviceSection` components at runtime.

Future versions may extend these relationships while preserving compatibility with existing inspection data.

---

# 12. Repository Layer

Repositories provide the only approved mechanism for database access.

Responsibilities

- Insert records
- Update records
- Delete records
- Execute queries
- Return strongly typed models

Advantages

- Centralized database logic
- Easier debugging
- Improved testability
- Cleaner UI code

UI components should never execute SQL directly. (A few settings screens run raw SQL via `getDatabase()` for transactional admin operations — reset-to-default, section reorder — which are documented exceptions; see `docs/03-Rules.md` §5.)

---

# 13. Models

Models define the application's data structures.

Examples

Project

District

Camera

Switch

DashboardCard

InspectionField

InspectionValue

Photo

Each model maps to a database entity and is used throughout the application to ensure consistent typing.

---

# 14. Data Flow

The standard flow for user actions is:

```
User Action

↓

Screen

↓

Component

↓

Context

↓

Repository

↓

SQLite

↓

Repository

↓

Context

↓

UI Refresh
```

This predictable flow keeps business logic separate from presentation and storage.

---

# 15. Coding Standards

The architecture follows these standards:

- TypeScript only.
- One responsibility per file.
- Repositories handle database operations.
- Components remain reusable.
- Context manages shared state.
- No SQL inside UI components.
- Strong typing for all models.
- Modular folder structure.
- Avoid duplicate code.
- Prefer composition over inheritance.
- DB-driven device options (never hardcoded dropdown arrays in components).
- Per-Project DB isolation (project data never mixes between projects).
- Sequential single-handle DB access (ADR-014) — never open a second handle or call `getGlobalDatabase()` mid-inspection.

These standards should be followed consistently throughout the project.

# 16. Database Design

The ACCC Dynamic Inspection Platform uses SQLite as its embedded relational database. The database is designed to support offline operation, configurable inspection templates, and future expansion.

## Design Principles

- Offline-first architecture
- Relational database design
- Repository Pattern
- Foreign key relationships
- Transaction support
- Auto-generated primary keys
- Strong data integrity
- Per-project isolation

---

## Core Tables

### Projects (global)

Stores all projects available for inspection.

Primary Information

- ProjectID
- ProjectName
- DistrictID
- Block
- Client
- Description
- InspectorName
- DBPath (path to the project's isolated inspection.db)
- SAFPath (path to the project's photo folder under DCIM/ACCC Inspection)
- CreatedAt
- UpdatedAt

Relationship

```
Project
    │
    ▼
Inspection
```

---

### Divisions / Districts / Blocks (global)

Reference/master data.

- Divisions: DivisionID, DivisionName, IsActive
- Districts: DistrictID, DivisionID (FK), DistrictName, DistrictCode, IsActive
- Blocks: BlockID, DistrictID (FK, ON DELETE CASCADE), BlockName, BlockCode, IsActive

---

### Inspections

Stores one inspection record.

Fields include

- InspectionID
- ProjectID (plain INTEGER, no FK — per-project DB)
- DistrictID
- PoleID
- Status (Draft / Completed)
- Inspection Date
- Latitude (REAL)
- Longitude (REAL)
- InspectorName
- Remarks
- SyncStatus
- SectionsSnapshot (TEXT — deprecated, section config now read live from DB)
- CreatedAt
- UpdatedAt

Each inspection acts as the parent record for all captured information.

---

### InspectionTemplates

Defines available inspection templates.

Examples

Pole Inspection (default, IsDefault=1)

Future

NVR Inspection

Solar Inspection

UPS Inspection

Traffic Signal Inspection

---

### InspectionSections

Defines sections inside a template.

Example

General Information

Pole Structure

Camera

Switch

Photos

Remarks

Sections are ordered using DisplayOrder.

IsDefault column (INTEGER, default 0): The original 11 built-in sections are marked with IsDefault=1. Only default sections appear in inspection forms. Custom sections created by administrators are stored with IsDefault=0 and are hidden from inspection forms but visible in the admin Sections screen.

---

### InspectionFields

Defines every field rendered in the inspection.

Example

Pole ID

Latitude

Longitude

Camera Make

Camera Model

Serial Number

Remarks

Each field includes

- Field Name
- Field Type
- Default Value
- Placeholder
- Validation Rule
- Display Order
- Visibility

Field types (13, see `templateData.ts` `VALID_FIELD_TYPES`): text, number, multiline, dropdown, project dropdown, date, date_auto, time, switch, checkbox, GPS, and two more.

---

### InspectionValues

Stores user-entered inspection values.

This separates the form definition from captured inspection data.

Advantages

- Dynamic forms
- Template reuse
- Easy reporting

---

### Cameras

Stores camera-specific information associated with an inspection.

Fields include

- CameraID
- InspectionID
- CameraNo
- CameraType
- CameraStatus
- CameraMake
- CameraModel
- CameraIP
- CameraSerialNumber
- CameraSI
- SDCardCapacity
- SDCardStatus

### Switches

Stores switch-specific information associated with an inspection.

Fields include

- SwitchID
- InspectionID
- SwitchNo
- SwitchType
- SwitchStatus
- SwitchMake
- SwitchModel
- SwitchIP
- SwitchSerialNumber
- SwitchSI

### DeviceRecords

Generic device records for arbitrary device types (e.g. NVR). `DeviceData` is a JSON string of field values.

- RecordID
- InspectionID
- DeviceType
- DeviceLabel
- DeviceNo
- DeviceData (JSON)
- DisplayOrder
- IsActive

### Photos

Stores photo metadata.

Information includes

- PhotoID
- InspectionID
- PhotoType
- FileName
- FilePath (SAF content URI)
- Latitude
- Longitude
- CapturedAt
- Remarks

### DeviceOptions

Stores configurable dropdown options for camera and device fields.

Fields include

- OptionID (INTEGER PRIMARY KEY AUTOINCREMENT)
- TemplateID (INTEGER NOT NULL DEFAULT 1)
- DeviceType (TEXT — e.g., 'Camera' or 'Switch')
- FieldName (TEXT — e.g., 'CameraType', 'CameraStatus', 'CameraMake', 'CameraSI', 'SDCardCapacity', 'SwitchType', ...)
- OptionLabel (TEXT — display label shown in dropdown)
- OptionValue (TEXT — stored value saved to inspection)
- DisplayOrder (INTEGER — controls dropdown option order)
- IsActive (INTEGER — 1 = active, 0 = inactive)

This table replaces hardcoded dropdown arrays in `CameraSection` and `DeviceSection` components.

### DeviceFieldDefinitions

Defines the fields rendered per device type.

- FieldDefID, TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder, IsActive
- UNIQUE(TemplateID, DeviceType, FieldName)

### ProjectDeviceTypes

Per-project mapping of enabled device types.

- ID, DeviceType (UNIQUE), IsActive

### DashboardCards

Per-project smart dashboard cards.

- CardID, ProjectID, CardKey (UNIQUE with ProjectID), Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, DeviceType, CardMode, SortOrder, Enabled, IsDefault
- CardMode values: `entitycount | dropdown | sum | fieldcount | datebreakdown`
- `IsDefault=1` = seeded default cards; `0` = user-created smart cards

---

# 17. Entity Relationship Diagram

Current logical relationship

Global DB:

```
Divisions ──▶ Districts ──▶ Blocks
                     │
                     ▼
                  Projects
```

Project DB:

```
InspectionTemplates
       │
       ▼
InspectionSections
       │
       ▼
InspectionFields ◀── FieldOptions
       │        ▲
       ▼        │
InspectionValues ◀── Inspections
       ▲              │
       │              ├──────▶ Cameras / Switches / DeviceRecords / Photos
RepeatableGroups      │
       │              │
       ▼              │
RepeatableGroupFields/Values

DeviceOptions / DeviceFieldDefinitions ──▶ (standalone config)
ProjectDeviceTypes
DashboardCards
```

The design supports configurable inspection forms while maintaining a normalized database structure. Each project database is fully isolated with its own complete schema and seed data.

---

# 18. Dynamic Form Engine

The Dynamic Form Engine is the core architectural component of the platform.

Instead of hardcoding forms, the application constructs inspection screens using configuration stored in SQLite.

Workflow

```
Load Template

↓

Load Sections (default sections only — IsDefault=1)

↓

Load Fields

↓

Sort by Display Order

↓

Render UI

↓

Capture Input

↓

Auto Save

↓

SQLite
```

Device Options Loading

`CameraSection` and `DeviceSection` load dropdown options from `DeviceOptionsRepository` at mount time:

1. Query DeviceOptions table for active options matching the device type and field name.
2. If options exist, populate dropdowns from the database.
3. If the DeviceOptions table is empty, fall back to hardcoded default arrays for backward compatibility.

This ensures the application works out of the box while allowing full admin configurability.

Pole ID Lock

`SectionRenderer` maintains a `poleIdLoaded` state and waits for the pole ID to be loaded from the database before determining the form lock state. This prevents false "please enter pole id" messages on sections before the pole ID value has been read. While the pole ID is empty, all other fields render read-only with a "Pole ID Required" alert.

Advantages

- No hardcoded inspection forms
- New templates require minimal code changes
- Device options are admin-configurable without code changes
- Easy maintenance
- Consistent UI
- Future extensibility

---

# 19. Auto Save Workflow

The platform automatically saves user input.

Workflow

```
User edits field

↓

Value changes

↓

Repository

↓

SQLite

↓

UI updated
```

Note: Auto-save occurs directly without a validation step. Validation happens separately when the user saves or exits the inspection.

Benefits

- Prevents data loss
- Eliminates manual Save buttons
- Better field experience
- Faster inspections

---

# 20. Photo Capture Workflow

Photo management is integrated directly into inspections.

Workflow

```
Request Camera + Location Permissions

↓

Open Camera (expo-image-picker, quality 0.8)

↓

Capture Photo

↓

Get GPS Coordinates (with cache fallback + timeout race)

↓

Read Pole ID + Block from Context/DB

↓

Generate Filename (District_Block_PoleId_DDMMMYYYY_Time.jpg)

↓

Create Photo row (PhotoRepository.create)

↓

Enqueue watermark job (Pole ID, District+Block, GPS, Timestamp)

↓

Render watermark on hidden WebView canvas (buildWatermarkPage)

↓

Post base64 back → write to SAF gallery (DCIM/ACCC Inspection/<Project>)

↓

Update Photo FilePath
```

Implemented Features

- Green watermark (#76FF03) on a translucent dark box, burned via a hidden WebView `<canvas>` (`watermarkHtml.ts`), queued serially with one retry (`useWatermarkProcessor`)
- Pole ID and Block read before every capture
- Photos saved to the device gallery via Storage Access Framework (`storageManager.ts`) and the SAF directory is cached per project
- Minimum 1 photo required for inspection validation
- Per-photo watermark state (pending / done / error) shown in the list (`PhotoCard`)

---

# 21. GPS Workflow

The application captures location information during inspections.

Workflow

```
Request Permission

↓

GPS Enabled

↓

Capture Latitude

↓

Capture Longitude

↓

Timestamp

↓

Save to Database
```

Future enhancements

- Reverse Geocoding
- Accuracy
- Altitude
- GIS Integration

---

# 22. Dynamic Device Management

Multiple devices can be inspected within one inspection.

Examples

3 Cameras

2 Switches

Future

4 NVRs

6 UPS Batteries

Dynamic workflow

```
User selects quantity

↓

Application generates device groups

↓

Each group loads configured fields

↓

User enters values

↓

Auto Save
```

Device dropdown options (type, status, make, SI, SD card) are loaded from the `DeviceOptions` database table rather than hardcoded. Field definitions per device type come from `DeviceFieldDefinitions`. This allows administrators to add, edit, reorder, and remove device types and options from the Settings → Device Types screen without modifying source code.

Camera and Switch are built-in device types. Custom types (e.g. NVR) are rendered through the generic `DeviceSection` component, which stores values as JSON in `DeviceRecords.DeviceData`. `ProjectDeviceTypes` tracks which types are enabled per project.

This architecture avoids creating separate screens for every possible device.

---

# 23. Navigation Flow

Current application flow

```
Splash

↓

Project List (Home Screen — index.tsx)

↓
┌─────────────────┬──────────────────┐
↓                 ↓                  ↓
New Project    Open Project      Edit/Clone/Delete
                 ↓
          Project Dashboard
          │         │
          ▼         ▼
   Manage Cards   Quick Actions
                    │
          ┌─────────┼─────────┬─────────┐
          ▼         ▼         ▼         ▼
   New Inspection  Inspection  Settings  Reports
          |          List
          ▼
   General Information → Sections → Photos
          │
          ▼
   Save / Complete
```

Settings navigation

```
Dashboard → Settings

↓

Sections (list/create/edit/reorder) ──▶ Fields (…per section) ──▶ Options (…per dropdown field)
                                     └──▶ Device Types ──▶ Device Options (…per field)

Export Template (JSON v2)
Import Template (JSON v1/v2)
Reset to Default
```

Navigation mechanics: Expo Router typed routes; exactly one root layout (`headerShown: false`); every screen renders its own `Appbar.Header`. Structured data (e.g. a `Project`) is passed as a JSON string in route params (`projectData`) and parsed on the receiving screen. Android hardware back is intercepted in the inspection form to run `validateBeforeExit()`.

---

# 24. State Management

The application uses React Context (InspectionContext).

Current state

- project (Project data)
- inspectionDate (Current inspection date)
- inspectionId (Current inspection ID)
- poleId (Current pole ID)
- openProject() — opens a project DB and sets it as active
- closeProject() — closes the active project DB and resets state
- removeProject() — closes and deletes a project DB
- setProject / setInspectionDate / setInspectionId / setPoleId — direct setters

Additional UI state machines:

- `useExportFlow` — export state (idle → choosing → exporting → success/error)
- `useTemplateFlow` — template import/export state machine
- `useDashboardAutoRefresh` — dashboard reload key on data events / foreground / midnight / poll
- `InspectionDataBus` — module-level pub/sub so screens react to inspection changes

Repositories remain responsible for database access.

---

# 25. Error Handling Strategy

Errors are categorized into

Database Errors

GPS Errors

Camera Errors

Permission Errors

Validation Errors

Storage Errors

The application logs technical details while presenting user-friendly messages. The logger (`src/utils/logger.ts`) suppresses `info`/`warn`/`debug` in production builds while always logging `error`.

---

# 26. Future Cloud Architecture

The current application is fully offline.

Future architecture

```
SQLite

↓

Sync Queue

↓

REST API

↓

Cloud Database

↓

Dashboard

↓

Reports
```

Synchronization Principles

- Offline-first
- Incremental uploads
- Conflict resolution
- Retry mechanism
- Secure communication

---

# 27. Extension Strategy

The platform is designed for long-term growth.

Future inspection modules

- Pole Inspection (implemented)
- NVR Inspection
- UPS Inspection
- Solar Inspection
- OFC Inspection
- Data Centre Inspection
- Smart Pole Inspection
- Control Room Inspection

New modules should primarily require configuration rather than significant code changes.

---

# 28. Architecture Summary

The ACCC Dynamic Inspection Platform is built on the following principles:

- Offline-first
- SQLite persistence
- Repository Pattern
- React Context
- Configuration-driven forms
- DB-driven device options
- Per-Project Database Isolation
- Sequential single-handle DB access (ADR-014)
- Reusable components
- Strong typing with TypeScript
- Modular folder structure
- Extensible architecture
- Future-ready for cloud synchronization

This architecture provides a stable foundation for both current functionality and planned future enhancements.
