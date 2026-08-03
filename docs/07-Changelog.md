# ACCC Dynamic Inspection Platform (ADIP)

# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on **Keep a Changelog** and follows **Semantic Versioning (SemVer)**.

---

# Version Format

Major.Minor.Patch

Example:

1.0.0

Major → Breaking changes

Minor → New features

Patch → Bug fixes

---

## [Unreleased]

### Added

- Template Export/Import (v2.0): export all templates, sections, fields, options, custom device types, device options, and project device type mappings to a JSON file; import replaces the current form in-place (deactivate + add) while preserving existing inspection data.
- Full modal UI for export (progress, success, share) and import (picker, parse, confirmation, progress, success, error with retry).
- Isolation regression test for template import across projects.
- Reset-to-Default no longer deletes saved device records: per-inspection `DeviceRecords` (FK to `Inspections`) are preserved on template reset, matching the "Existing inspection data will NOT be deleted" message (previously the reset wiped them).
- Error dialogs are scoped to the originating flow: an export failure shows only "Export Failed", an import failure only "Import Failed".
- Inspection List shows the Block name on each card (falls back to "N/A") and the search box now matches Block in addition to Pole ID, Division, and District — via a new testable static `InspectionListRepository.filterByQuery` helper (case-insensitive, trim, null-safe; 6 unit tests).
- Dynamic Dashboard Statistic Cards: the hardcoded stat sections on the Project Dashboard are replaced with a configurable card engine. Per-project `DashboardCards` table with four auto-seeded defaults (Total Poles, Total Cameras, Today's Poles, Today's Cameras). A new Dashboard Settings screen (`app/projects/dashboard-settings.tsx`) lets admins add/edit/delete/reorder/enable/disable cards, choose icon + color, entity (Inspections/Cameras/Switches/Devices), counter type (Total/Today's), count mode (Count/`COUNT(DISTINCT ...)`), and per-entity allowlist-validated filters serialized to `FilterJson`. Backed by `DashboardCardRepository` (CRUD + `ensureDefaultCards` that re-seeds deleted defaults without touching edited/disabled ones), `StatisticCountService` (generic parameterized `SELECT COUNT(*)` engine with entity + counter-type registries), and `DashboardService` (compose). Two registry extension points documented in the plan: new counter types add one `COUNTER_TYPES` entry; new entities add one `COUNT_ENTITIES` entry.
- Dashboard cards: 6-card default set (Total Inspections, Today's Inspections Done added); Breakdown card type grouping inspections by any inspection-form field (Add/Edit Card → Breakdown → pick field), rendered as per-value rows.
- Existing projects auto-upgrade to the new defaults and gain the `BreakdownField` column on next open (idempotent migrations in `migrateProjectSchema`).
- New projects seed a sectioned 6-card default dashboard: two labeled groups ("Total", "Today's"), each with Inspection Done (count of `Status = Completed`), Pole Status (`pole_avail` Yes/No breakdown), and Camera Count (SUM of `camera_count`). Backed by new nullable `DashboardCards` columns `SectionLabel` and `AggregateField`; the dashboard renders section headers and `StatisticCountService` gained a `fieldCard` SUM engine for numeric aggregate fields. Set-aware reconciliation (`selectDefaultSet`) keeps existing projects on their current cards and only seeds the sectioned set for fresh projects.
- Manage Cards dialog: the Add/Edit card form is now scrollable and every nested picker dialog (entity, counter, count mode, distinct column, group-by field, filter column) has a Cancel button that closes the picker without applying.
- Smart Dashboard: the "+ Add Card" button now shows a field picker listing every field from the Inspection Form (single source of truth). Selecting a field auto-creates two cards — Total Inspection Report and Today's Inspection Report — with calculations determined by field type (dropdown/switch/checkbox/text/multiline → breakdown by value; number → SUM aggregate; date → per-date breakdown; GPS/device/camera/calculation → skipped). No manual formula configuration needed.
- `InspectionDataBus` event bus: a lightweight module-level pub/sub that emits `inspectionsChanged` events with a `projectId` payload. All `InspectionRepository` mutations (create, save field value, update pole ID, update status, delete) emit after the write commits; `deleteInspection`/`deleteMultipleInspections` resolve the `projectId` before the transaction so deletes can emit correctly.
- `useDashboardAutoRefresh(projectId, focused)` hook: listens to the bus (only matching `projectId`), AppState "active" transitions, midnight rollover (self-rescheduling), and a 60s interval that only runs while the screen is focused. Returns a monotonically increasing reload key consumed by `DashboardCardGrid`.
- `DashboardCardGrid` now accepts a `focused` prop and uses `useDashboardAutoRefresh` so the dashboard refreshes automatically whenever inspection data changes, the app returns to the foreground, midnight passes, or the 60s poll fires.
- `SmartCardGenerator` service: discovers all active form fields (with field-type and option metadata), classifies each field type into a card kind (breakdown/aggregate/skip), and generates `DashboardCard` rows — two per field (Total + Today's) with correct `BreakdownField`/`AggregateField`/`CounterType`/`SectionLabel` wiring.
- Isolation test: smart cards created from a field in Project A do not appear in Project B.

### Changed

- Smart Dashboard cards now carry a required `CardMode` column (`entitycount` / `dropdown` / `sum` / `fieldcount` / `datebreakdown`). Existing project DBs migrate and backfill automatically on next open (`migrateProjectSchema`): entity-count cards stay `entitycount`; cards whose breakdown/aggregate field no longer exists fall back to `entitycount` instead of aborting the migration.
- Smart cards are rendered by their `CardMode`: dropdown/switch/checkbox fields → per-value breakdown; numeric fields → SUM aggregate; text/multiline fields → field-count; date fields → per-date breakdown; device fields (Camera/Switch, dropdown/switch/checkbox types) group Cameras/Switches by column; the `Remarks` field is excluded. Entity-count cards (Total/Today's poles, cameras, inspections) use `entitycount`.
- Smart cards are non-editable: the card manager is picker-only and the manual Custom Card editor is removed; smart cards are deleted and re-added rather than edited. Deleting one card of a Total/Today's pair hides the field from the picker until both are removed, and re-adding never raises the `UNIQUE(ProjectID, CardKey)` constraint.
- Project Dashboard UI refinement: consistent spacing, alignment, and grouping across the dashboard screen and its stat/action components via new design tokens (`src/constants/ui.ts`). Project Information is a compact aligned label/value grid, Statistics renders full-bleed with grouped stat cards, action tiles share one style, and the card-grid empty state no longer shows a literal `\u201C` escape.
- Dashboard card sections are now a first-class grouping: summary sections are renamed to "Total Summary" / "Today's Summary", rendered bold/uppercase with a divider, and collapse per-project (state persisted in AsyncStorage, default expanded). Smart-added cards merge into the canonical sections; reorder arrows are locked at section boundaries; "Reset Defaults" now performs a full factory reset of the project's cards.
- Device-type cards now count real data from `DeviceRecords` (`json_extract` of the `DeviceData` JSON), including the default camera cards and any migrated `smart_dev_*` cards, instead of the unused `Cameras`/`Switches` tables.

### Fixed

- `DashboardCardRepository.createCard` INSERT column/placeholder mismatch (14 columns / 15 placeholders) that real SQLite would reject — now 16 columns / 16 placeholders including `SectionLabel` and `AggregateField`.

### Fixed

- Foreign-key guard for inspection value writes: `InspectionValueRepository.saveValue` and `InspectionRepository.saveFieldValue` now verify the parent `Inspections`/`InspectionFields` rows exist before inserting/updating `InspectionValues`. A write targeting a missing or stale inspection/field ID is skipped with a warning instead of raising a `FOREIGN KEY constraint failed` error (with `PRAGMA foreign_keys = ON`) or creating an orphaned row. Includes an isolation regression test proving a stale inspection ID from one project never writes into another project's DB.
- Crash on opening pre-existing project databases (`no such table: DashboardCards`): `migrateProjectSchema()` early-returned when the legacy `remarks` section was already present, so the `DashboardCards` table creation and default-card seeding — which lived inside that early-returning block — never ran for existing project DBs. The `DashboardCards` migration now runs unconditionally on every project open (table creation is `CREATE TABLE IF NOT EXISTS` and `ensureDefaultCards` is idempotent), fixing all DBs created before the dynamic dashboard cards feature.

---

# [1.9.0] - 01-Aug-2026

## Added

### Reports & Export v2

- Reports screen (`app/reports/index.tsx`) with live banded table preview (`ReportTablePreview`) — reachable from the Project Dashboard.
- Project-wide export from Reports in three formats:
  - **CSV** — banded two-row headers (band name repeated per column), built in JS with `getDatabase()` (no cross-DB joins, ADR-014 compliant).
  - **Excel (xlsx)** — SheetJS-generated workbook with merged band headers, autofilter, and frozen top rows.
  - **PDF** — banded `<thead>` table with `<th colspan>` band rows, shared via expo-sharing.
- Single-inspection export from the Inspection List (export icon per row → format chooser → `exportInspection`): PDF (form-like layout with saved date fallback), Excel, CSV.
- Derived columns in reports: `Latitude`/`Longitude` (from combined GPS field via `splitLatLong`) and `Status` (PoleID + `InspectionRecords`), plus Photos count appended.
- Device sections included in reports: one row per device (`IsRepeatable=1 AND <type>_information`), device rows filled with the device section's own columns.

## Removed

- Legacy `exportProjectData` function and its 5 tests — export now lives in the Reports screen.
- Home screen "Export" button and the dashboard CSV export card — the dashboard "Generate inspection reports" card now passes `{ projectId, projectName }` to `/reports`.

## Changed

- `src/utils/exportData.ts` is now a single unified service: `buildReportTable`, `buildCsv`, `buildExcelBase64`, `buildProjectPdfHtml`, `buildInspectionPdfHtml`, `loadInspectionFormData`, `exportInspections`, `exportInspection`, `splitLatLong`.

## Fixed

### Sequential Open/Close DB Model + Context-Based Project Isolation

Rewrote `db.ts` to use a sequential open/close model with a single `SQLiteDatabase` handle. Eliminated `ATTACH DATABASE` approach (rejected on Android — expo-sqlite's `execAsync` does not support dot-qualified DDL like `CREATE TABLE p.InspectionSections(...)`). Fixed the inspection flow to pass project data via React Context instead of switching between global and project databases.

**Changes:**
- `db.ts`: Sequential open/close — single `database` handle, `currentDbTarget` tracks which file is open, `cleanPath()` strips `file://` before path comparison.
- `schema.ts`: Removed `pSchema()` helper. All project DDL uses plain table names (no prefix). `createProjectSchema()` takes no `db` parameter.
- `ProjectDBManager.ts`: Removed all `getInfoAsync` calls for SQLite `.db` files (unreliable on Android). `openProjectDb()` validates by querying `sqlite_master` for `InspectionTemplates`. `deleteProjectDb()` and `deleteProjectFolder()` delete directly without existence checks. `listProjectFolders()` lists folder names without per-file checks.
- `index.tsx`: Uses `openProject(item)` instead of `openProjectDb(item.DBPath)` — sets both the DB and the React Context. Passes `projectData` JSON navigation param to `dashboard.tsx`.
- `dashboard.tsx`: Reads project from `projectData` navigation param first (synchronous, no DB call), then falls back to context. Passes `projectData` JSON param to `inspection/new.tsx`. Avoids `getProjectById()` → `getGlobalDatabase()` during inspection flow.
- `inspection/new.tsx`: Reads project from `projectData` navigation param first (synchronous, no DB call), then falls back to context. Never calls `getProjectById()` — avoids `getGlobalDatabase()` during inspection flow.
- `GeneralInformation.tsx`: Removed `getProjectById()` fallback — waits for context propagation instead of corrupting the DB handle.
- All 17 project repositories: Plain table names (no `p.` prefix).
- All 9 seed files: Plain table names (no `p.` prefix).
- `DistrictRepository.ts`: Removed `WHERE IsActive = 1` filter (fails on older DBs missing column). Added `IsActive` column migration to `schema.ts`.
- `Immutable` option removed from `FileSystem.deleteAsync()` calls (not valid in expo-file-system type definitions).
- TSC compiles with zero errors.

---

# [1.8.1] - 25-Jul-2026

## Added

- App renamed to "ACCC Dynamic Inspection Platform" (was "ACCC Pole Inspection")
- Bundle ID changed to `com.accc.dynamicinspection` (was `com.emergent.poledataexcel.p9sjtu`)
- Permission strings updated to match new app name
- All `com.emergent` references removed from codebase

## Fixed

- Fixed "no such table: Projects" error during project creation — migrated to ATTACH DATABASE approach (single connection, no double-open handle issue)
- DistrictRepository.getAll() removed `WHERE IsActive = 1` filter (fails on older DBs missing the column)

## Removed

- android/ folder deleted (regenerate with `npx expo prebuild`)
- Old android package name `com.emergent.poledataexcel.p9sjtu`

---

# [1.8] - 25-Jul-2026

## Added

### Per-Project Database Isolation Architecture

- Dual-database model: Global DB (accc_global.db) + Project DB (inspection.db per project)
- Global DB stores only Projects, Divisions, Districts, Blocks (4 tables)
- Each project gets its own inspection.db with full schema (17+ tables) and seed data
- ProjectDBManager utility for creating, opening, and deleting project databases
- Project DB stored at Projects/<ProjectName>/inspection.db
- Photos stored in project folder alongside the database
- Exports stored in project folder
- Each project DB seeded with default template, sections, fields, options, device options

## Removed

- TemplateSyncHelper deleted (no longer needed with isolated databases)
- TemplateID column removed from Project model
- cloneDefaultTemplate() removed
- Settings screens no longer sync changes to cloned templates

---

# [1.5] - 25-Jul-2026

## Added

### Device Options Admin Panel

- DeviceOptions database table (18th table in schema)
- DeviceOptionsRepository with CRUD operations
- DeviceOptions seed data for Camera and Switch dropdown options
- Settings > Device Options screen for admin-configurable dropdown values
- Camera type, status, make, model, and IP options now loaded from database instead of hardcoded values
- Switch type, status, make, model, and IP options now loaded from database instead of hardcoded values
- Drill-down admin navigation: Settings → Sections → Fields → Options → Device Options

### Section IsDefault Flag

- IsDefault column added to InspectionSections table
- InspectionRepository now filters sections by IsDefault = 1
- Only default sections appear in new inspection forms
- IsDefault toggle in Section Management admin panel

### Pole ID Lock Fix

- SectionRenderer now waits for database load before locking Pole ID field
- Added poleIdLoaded state to prevent premature form locking
- Prevents blank Pole ID on rapid inspection creation

### Project Edit and Delete

- ProjectRepository.updateProject() method added
- Project edit modal with pre-filled form
- Project delete with confirmation warning dialog
- Warning dialog informs user that all inspections within the project will be deleted

### Project-wise CSV Export

- Export inspection data for a specific project to CSV format
- Uses expo-sharing to share exported CSV file
- Export button accessible from project dashboard

### Template Import/Export

- Export templates to JSON format (templateData.ts utility)
- Import templates from JSON files via expo-document-picker
- Self-contained JSON with all template, section, field, and option data
- Import creates new template from JSON data
- Accessible from Settings screen

### Utility Files

- src/utils/exportData.ts — CSV export utilities
- src/utils/templateData.ts — Template JSON import/export utilities
- app/settings/device-options.tsx — Device Options admin screen

### Schema Changes

- inspections.table.ts — SectionsSnapshot column deprecated (replaced by live DB query)
- schema.ts — Migration to add DeviceOptions table and IsDefault column

## Changed

- CameraSection.tsx — Now loads camera options from database instead of hardcoded arrays
- SwitchSection.tsx — Now loads switch options from database instead of hardcoded arrays
- SectionRenderer.tsx — Added poleIdLoaded state for DB-aware form locking
- InspectionRepository.ts — Added IsDefault filter for section rendering
- seed.ts — Added device options seed data during database initialization

---

# [1.4] - 24-Jul-2026

## Added

### Administration Panel (Phase 4)

- Template Management (list, create, edit, delete)
- Section Management (list, create, edit, delete, reorder)
- Field Management (list, create, edit, delete, reorder)
- 10 field types: text, number, multiline, dropdown, date, date_auto, time, GPS, checkbox, switch
- Field Options / Dropdown Management (list, create, edit, delete, reorder)
- Section reorder with up/down arrows
- Field reorder with up/down arrows
- Option reorder with up/down arrows
- Section repeatable toggle
- Section visibility toggle
- Field required/visible/readOnly toggles
- Settings navigation wired to all admin screens

### Repositories

- TemplateRepository (CRUD + hasInspections check)
- SectionRepository (CRUD + reorder + hasInspectionValues check)
- FieldRepository (CRUD + reorder + keyExists check + 10 field types)
- FieldOptionRepository (CRUD + reorder + getByFieldKey)

---

# [1.3] - 24-Jul-2026

## Fixed

- Fixed stale poleId/block in watermark — now reads fresh from DB before every capture
- ViewShot moved from off-screen to on-screen for reliable Android capture
- Added onLayout callback to ensure ViewShot is rendered before capture

## Changed

- Watermark text changed from white (#FFFFFF) to green (#76FF03)
- ViewShot background changed from #000 to transparent (only watermark strip has light black bg)
- Updated project.md and PROJECT_MASTER_DOCUMENT.md to v1.3

---

# [1.2] - 24-Jul-2026

## Added

- Watermark burned into gallery photos via react-native-view-shot
- Photos saved to Download/Inspection/{District}/ folder
- Photo preview modal

## Changed

- Watermark background changed to light black (rgba(0, 0, 0, 0.5))
- Block name in watermark sourced from inspection form (InspectionValues)
- Filename fallback changed from "Unknown" to "NA"
- Filename format standardized: District_Block_PoleId_DDMMMYYYY_Time.jpg
- Gallery save made async/non-blocking for fast capture
- App logo changed to abhay-logo.png

---

# [1.1] - 24-Jul-2026

## Added

- GPS mandatory for photo capture (blocks capture if unavailable)
- Green watermark (#76FF03) on photos
- Auto-save with debouncing (500ms) to CameraSection and SwitchSection
- Numeric count input for camera_count and switch_count (was dropdown)

## Changed

- Removed manual Save/Save All buttons from CameraSection and SwitchSection
- Removed "ACCC" prefix from watermark text
- GPS remains manual button in General Information, validated on save
- Fixed touch sensitivity on dropdowns (increased height to 56px)

## Fixed

- Fixed expo-media-library AUDIO permission error
- Fixed PhotoRepository.create() to return lastInsertRowId
- No preview modal appears after photo capture

---

# [1.0] - 24-Jul-2026

## Added

### Major Bug Fixes

- Fixed GPS save format (single "gps" field as "lat, lng")
- Removed DROP TABLE on restart (data loss prevention)
- Fixed all seed field keys to snake_case
- Fixed FieldOptions empty seed (PascalCase -> snake_case)
- Fixed GeneralInformation not rendering in inspection form
- Fixed camera/switch count not persisting on section reload
- Fixed camera/switch sections rendering in wrong sections
- Fixed photos section not rendering (missing sectionKey)
- Fixed Division/District auto-fill not saving to DB
- Removed duplicate poleInspectionFields export

### Camera Module

- CameraSection with 9 dynamic fields (Type, Status, Make, Model, IP, Serial, SI, SD Capacity, SD Status)
- Camera options aligned to ACCC spec (Bullet/Box/PTZ, VMS/Local/Non-Live, Sparsh/Prama/Hikvision/CP Plus/Secura)
- Auto-save with debouncing, data preservation on count decrease

### Switch Module

- SwitchSection with 7 dynamic fields (Type, Status, Make, Model, IP, Serial, SI)
- Switch options aligned to ACCC spec (4-Port/8-Port, D-Link/Cisco/Allied/Tejas)
- Auto-save with debouncing, data preservation on count decrease

### Photo Module

- PhotoSection with camera capture, GPS mandatory, green watermark overlay
- Photos saved to app document directory
- Filename: District_Block_PoleId_DDMMMYYYY_Time.jpg
- Minimum 1 photo required for validation

---

# [0.3.0] - Current Development

## Added

- Inspection Template support
- Dynamic Sections
- Dynamic Fields
- Auto Save improvements
- Repository enhancements
- SQLite schema updates
- Project documentation

## Changed

- Inspection engine prepared for configuration-driven forms
- Folder structure improvements
- Better code organization

## Fixed

- Various inspection editing issues
- Auto-save stability improvements

---

# [0.2.0]

## Added

### Inspection Engine

- Create Inspection
- Edit Inspection
- Delete Inspection
- Search Inspection
- Draft Inspection support

### GPS

- Latitude capture
- Longitude capture
- Permission handling

### Photos

- Photo capture
- Local storage
- Metadata storage

### Dashboard

- Inspection statistics
- Recent inspections
- Search

### Database

- SQLite integration
- Repository Pattern
- Initial schema

---

# [0.1.0]

## Added

### Project Setup

- Expo project
- TypeScript
- React Context
- Expo Router
- Initial folder structure

### Database

- SQLite initialization
- Database schema
- Seed data

### Foundation

- Navigation
- Basic Dashboard
- Project configuration

---

# Future Releases

## Version 1.6.0

Planned

### Added

- PDF Reports
- Excel Reports
- Dashboard Analytics
- Photo Reports

---

## Version 1.7.0

Planned

### Added

- Cloud Synchronization
- Authentication
- User Roles
- Notifications
- REST API Integration

---

# Changelog Guidelines

Every release should document:

## Added

New features.

## Changed

Modified behaviour.

## Deprecated

Features planned for removal.

## Removed

Removed functionality.

## Fixed

Bug fixes.

## Security

Security improvements.

---

# Release Checklist

Before creating a new release:

- Update version number.
- Update Memory.md.
- Update Phases.md.
- Update README.md if required.
- Tag Git release.
- Commit all changes.

---

# Git Tag Examples

v0.1.0

v0.2.0

v0.3.0

v1.0.0

v1.5.0

---

# End of Changelog
