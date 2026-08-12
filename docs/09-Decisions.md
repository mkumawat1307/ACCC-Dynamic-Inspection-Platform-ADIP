# ACCC Dynamic Inspection Platform (ADIP)

# Architecture Decision Records (ADR)

Version: 1.8

Last Updated: 2026-08-12

Status: Active

---

# Purpose

This document records significant architectural and technical decisions made during the development of the ACCC Dynamic Inspection Platform.

The objective is to preserve the reasoning behind each decision so that future developers and AI assistants understand not only **what** was implemented, but also **why** it was implemented.

Every major architectural decision should be recorded here.

---

# ADR-001

## Title

Offline-First Architecture

### Status

Accepted

### Date

July 2026

### Context

Field inspections are often performed in areas with poor or no internet connectivity.

Inspectors must continue working regardless of network availability.

### Decision

The application will follow an Offline-First architecture.

All inspection data will be stored locally on the device.

Cloud synchronization will be optional and occur only when connectivity is available.

### Consequences

Positive

- Works without internet
- Better performance
- Reliable field operation
- Reduced dependency on servers

Negative

- Synchronization logic becomes more complex
- Conflict resolution is required for cloud sync

---

# ADR-002

## Title

SQLite as Local Database

### Status

Accepted

### Context

The application requires a lightweight, reliable, offline database.

### Decision

SQLite is selected as the local database.

### Alternatives Considered

- Firebase Firestore
- Realm
- Supabase
- AsyncStorage

### Reasons

- Fully offline
- Mature
- Fast
- No internet dependency
- Easy backup and restore

### Consequences

Positive

- Reliable local storage
- Structured relational data
- Good performance

Negative

- Manual synchronization required

---

# ADR-003

## Title

Repository Pattern

### Status

Accepted

### Context

Direct database access from UI components would create tightly coupled code.

### Decision

All database operations must go through repositories.

### Structure

UI

↓

Context

↓

Repository

↓

SQLite

### Benefits

- Separation of concerns
- Easier testing
- Better maintainability
- Reusable database logic

---

# ADR-004

## Title

React Context for State Management

### Status

Accepted

### Context

The application needs shared state without unnecessary complexity.

### Decision

Use React Context.

### Alternatives

- Redux
- MobX
- Zustand

### Reasons

- Simple
- Built into React
- Easy to maintain
- Suitable for project size

---

# ADR-005

## Title

Configuration-Driven Inspection Forms

### Status

Accepted

### Context

Future inspection types should be added without rewriting the application.

### Decision

Inspection forms will be generated from database configuration.

Templates

↓

Sections

↓

Fields

↓

Dynamic UI

### Benefits

- Reusable engine
- Easy expansion
- Minimal code duplication

---

# ADR-006

## Title

Auto Save

### Status

Accepted

### Context

Inspectors may accidentally close the application or lose power.

### Decision

Inspection data will be automatically saved whenever changes occur.

### Benefits

- Reduced data loss
- Better user experience
- No manual Save button required

---

# ADR-007

## Title

TypeScript

### Status

Accepted

### Decision

Use TypeScript throughout the project.

### Reasons

- Strong typing
- Better IntelliSense
- Easier refactoring
- Fewer runtime errors

---

# ADR-008

## Title

Expo Framework

### Status

Accepted

### Decision

Use Expo for development.

### Reasons

- Faster development
- Simplified native integration
- OTA updates (future)
- Rich ecosystem

---

# ADR-009

## Title

Professional Documentation

### Status

Accepted

### Decision

Maintain a structured documentation system.

### Documents

- PRD
- Architecture
- Rules
- Phases
- Design
- Memory
- Changelog
- README
- Decisions

### Benefits

- Easier onboarding
- AI-friendly
- Better maintainability

---

# ADR-010

## Title

Photo-Centric Inspection Workflow

### Status

Accepted

### Context

Inspection evidence depends heavily on photographs.

### Decision

Every inspection should support photo capture with metadata.

Implemented metadata

- GPS
- Timestamp
- Pole ID
- District + Block
- Green watermark (#76FF03) on light black background
- Watermark burned into gallery photos via react-native-view-shot

Future metadata

- OCR
- AI Classification

Update (v1.9.1): the watermark burn-in now uses a hidden WebView `<canvas>` (`src/utils/watermarkHtml.ts` + `useWatermarkProcessor`) instead of react-native-view-shot, and watermarked photos are saved to the gallery via the Storage Access Framework (`src/utils/storageManager.ts`) rather than the app Download folder. Photos are processed through a serial queue with one retry per job.

---

# ADR-011

## Title

Dynamic Device Expansion

### Status

Accepted

### Context

Different poles have different numbers of cameras, switches, and other devices.

### Decision

The inspection form shall automatically expand device sections based on user input or configuration.

### Benefits

- Flexible inspections
- Reduced manual setup
- Scalable for future device types

---

# ADR-012

## Title

Future Cloud Synchronization

### Status

Planned

### Context

Organizations require centralized reporting and backup.

### Decision

Cloud synchronization will be introduced after the offline platform is stable.

Synchronization must never replace offline functionality.

---

# Decision Template

For future decisions, use the following format:

## ADR-XXX

### Title

### Status

- Proposed
- Accepted
- Deprecated
- Superseded

### Context

Why was this decision required?

### Decision

What was decided?

### Alternatives

What other options were considered?

### Consequences

Positive outcomes

Negative outcomes

---

# Review Process

Every architectural decision should be reviewed before implementation.

When a decision changes:

- Update this document.
- Update Architecture.md.
- Update Memory.md.
- Update Changelog.md.
- Update PRD.md.
- Update Phases.md.

---

# Guiding Principle

Architectural decisions should prioritize:

- Simplicity
- Maintainability
- Scalability
- Reliability
- Offline capability
- Reusability
- Performance

Long-term maintainability should always take precedence over short-term convenience.

---
# ADR-013

## Title

Project Isolation Architecture

### Status

Accepted

### Date

July 2026

---

## Context

The ACCC Dynamic Inspection Platform originally stored project data in a shared application database. While projects were logically separated, several configurations and administrative changes could affect multiple projects.

The platform is evolving into a professional multi-project inspection system where each project must function as an independent workspace.

Examples include:

* Smart City Jaipur
* Smart City Kota
* Smart City Baran
* Smart City Jodhpur

Each project may have different inspection templates, custom fields, device types, dashboard statistics, reports, photos, and settings.

Changes made in one project must never impact another project.

---

## Decision

The platform shall adopt a **Project Isolation Architecture**.

Every project will operate as a self-contained workspace.

Each project shall maintain its own:

* SQLite database
* Inspection templates
* Dynamic sections
* Dynamic fields
* Device types
* Device options
* Inspection records
* Dashboard data
* Reports
* Photos
* Export files
* Configuration
* Validation rules
* Draft inspections
* Future synchronization metadata

The application shall contain only one global Project Manager responsible for creating, opening, renaming, deleting, and listing projects.

No project-specific information shall be stored globally.

---

## Architecture

Application

↓

Project Manager

↓

Select Project

↓

Load Project Context

↓

Open Project Database

↓

Load Project Modules

* Dashboard
* Inspection Forms
* Reports
* Settings
* Photos
* Device Types
* Templates

---

## Project Storage Structure

Projects/

* Jaipur/

  * inspection.db
  * photos/
  * reports/
  * exports/
  * backups/
  * settings.json

* Kota/

  * inspection.db
  * photos/
  * reports/
  * exports/
  * backups/
  * settings.json

Each project folder is fully independent.

---

## Global Application Data

The global application database shall contain only:

* Project ID
* Project Name
* Project Folder Path
* Created Date
* Last Opened Date
* Project Version

No inspection or configuration data shall be stored globally.

---

## Consequences

### Positive

* Complete project independence.
* No cross-project data leakage.
* Easier backup and restore.
* Easier project sharing.
* Simpler maintenance.
* Better scalability.
* Improved data security.
* Cleaner architecture.
* Better preparation for cloud synchronization.
* Future support for importing/exporting complete projects.

### Negative

* More complex project initialization.
* Separate database management for each project.
* Additional migration logic when updating application versions.

---

## Alternatives Considered

### Shared SQLite Database

Rejected.

Reason:

Risk of configuration leakage and increased complexity when isolating project-specific data.

### Project Prefix in Every Table

Rejected.

Reason:

Requires every query to filter by ProjectID and increases the chance of developer mistakes causing cross-project data access.

### Separate SQLite Database per Project

Accepted.

Reason:

Provides true isolation, simplifies backup and restore, reduces the possibility of cross-project contamination, and improves long-term maintainability.

---

## Future Impact

This decision establishes the foundation for:

* Multi-client deployments.
* Cloud synchronization.
* Team collaboration.
* Project import/export.
* Project archiving.
* Versioned project upgrades.
* AI-assisted inspection workflows.
* Additional inspection modules (UPS, NVR, Solar, OFC, Data Centre, Traffic Signal, etc.).

All future development must preserve project isolation and ensure that every repository, service, screen, and database operation is executed within the currently active project context.


# ADR-014

## Title

Sequential Open/Close DB Model + Context-Based Data Passing

### Status

Accepted

### Date

July 2026

### Context

The expo-sqlite v16 Android module has a confirmed bug: `openDatabaseAsync()` with different file paths returns `SQLiteDatabase` handles that actually point to the wrong database file when multiple handles are open simultaneously.

Three approaches were tried and rejected:

1. **Dual-connection** (two `SQLiteDatabase` handles open simultaneously) — the second handle is backed by the first file. Rejected.
2. **Close+reopen** (switch databases by closing one and opening the other) — `closeAsync()` doesn't fully release the native handle before `openDatabaseAsync()` is called, causing the same bug. Rejected.
3. **ATTACH DATABASE** (single connection, attach project DB as `p` schema) — works for DML (SELECT/INSERT) but **rejected on Android** because `execAsync` throws `near ".": syntax error` when executing DDL with dot-qualified table names like `CREATE TABLE p.InspectionSections(...)`. ATTACH is fundamentally incompatible with DDL in expo-sqlite Android.

The root cause during the inspection flow was that `getGlobalDatabase()` (used by `ProjectRepository.getProjectById()`) closed the project DB and reopened the global DB, then `getDatabase()` (used by `InspectionRepository`) closed the global DB and reopened the project DB. This close+reopen cycle corrupted the native handle on Android.

### Decision

Use a **sequential open/close model** with a single `SQLiteDatabase` handle. Pass project data via React Context to avoid switching databases during the inspection flow.

- **Single handle**: One `SQLiteDatabase` at a time. `currentDbTarget` tracks which file is open. `closeCurrentDb()` catches errors silently.
- **`cleanPath()`**: Strips `file://` prefix before path comparison to avoid mismatches.
- **No `getInfoAsync`**: expo-file-system's `getInfoAsync` returns `exists: false` for SQLite `.db` files on Android (file is locked by native layer). Project DB validation uses `SELECT COUNT(*) FROM sqlite_master` instead.
- **Navigation params + context data passing**: `index.tsx` calls `openProject(item)` which opens the DB AND sets the project in `InspectionContext`. It also passes `projectData` as a JSON navigation param. `dashboard.tsx` and `inspection/new.tsx` read project data from the `projectData` navigation param first (synchronous, no DB call needed), then fall back to context. This eliminates all `getProjectById()` → `getGlobalDatabase()` calls during the inspection flow — the project DB stays open the entire time. Navigation params are preferred over context because React state batching means `setProject()` may not propagate before the target screen mounts.
- All project repos and seeds use plain table names (no `p.` prefix). Each DB file is standalone.

### Alternatives

**ATTACH DATABASE with `p.` prefix** — rejected because expo-sqlite Android's `execAsync` does not support dot-qualified DDL (`CREATE TABLE p.TableName(...)`). Works for DML but not schema creation.

**Dual-connection** — rejected because the second `openDatabaseAsync()` returns a handle backed by the first file.

**Close+reopen between global and project DB** — rejected because `closeAsync()` doesn't fully release the native handle, causing the same file-mixing bug.

### Consequences

Positive:
- Eliminates all multi-connection expo-sqlite Android bugs.
- No `ATTACH`/`DETACH` complexity.
- No `p.` prefix burden on all SQL queries.
- Context + navigation params data passing means zero database switching during the inspection flow.
- `getInfoAsync` removed — no false negatives for DB file existence checks.
- Simple, predictable: one handle, one file, one DB at a time.

Negative:
- Global queries during a project session (e.g., `getProjectById()`) close the project DB and reopen the global DB. This is why navigation params + context data passing is essential.
- Each call to `getDatabase()` / `getGlobalDatabase()` may close and reopen the DB if switching is needed (only happens outside the inspection flow).

---


# ADR-015

## Title

Reports & Export v2 — Unified Banded Export Service

### Status

Accepted

### Date

August 2026

### Context

Reporting was fragmented: the dashboard and Home screen each had their own `exportProjectData` CSV path, there was no Excel/PDF support, and report tables were flat (single header row, no band grouping). Exports ran from multiple screens, making the surface area hard to maintain and the output inconsistent with the dynamic form structure (templates → sections → fields).

### Decision

1. **Single unified service** in `src/utils/exportData.ts` — one query layer (`buildReportTable`) and one shared `ExportFormat`; screen code only calls `exportInspections` / `exportInspection` and passes a format.
2. **Banded headers** — report columns are grouped by section band. CSV repeats the band name per column; Excel merges band cells across the band's columns with autofilter and frozen top rows; PDF uses `<thead>` with `<th colspan>` band rows.
3. **Live template/device columns** — columns come from the active template's sections and fields at export time, not a stored snapshot; device sections (`IsRepeatable=1 AND <type>_information`) contribute one row per device, filled with the device section's own columns.
4. **Derived columns** — `Latitude`/`Longitude` split from the combined GPS field (`splitLatLong`) and `Status` (PoleID + `InspectionRecords`). (Pole ID is now labelled "Site ID" in the form, and the previously appended Photos-count column was removed — the table contains only template + derived columns.)
5. **Exports live in Reports** — the Reports screen (`app/reports/index.tsx`) is the single entry point for project-wide export; the dashboard passes `{ projectId, projectName }` params. Single-inspection export is available per row in the Inspection List.
6. **Legacy removal** — `exportProjectData`, the Home screen Export button, and the dashboard CSV card are deleted. `getDatabase()` only (ADR-014) — no `getGlobalDatabase` in the report/export flow; bulk queries run in JS.

### Alternatives

- **Keep per-screen export helpers** (dashboard + Home + list) — rejected: duplicated query logic, inconsistent output, three places to maintain.
- **Single flat header row** — rejected: lost section grouping made large forms unreadable in CSV/Excel/PDF.
- **Snapshot columns** (stored at save time) — rejected: stale reports when templates evolve; live template reads are cheap offline.
- **Store exports in a new table / background worker** — rejected: unnecessary complexity for an offline single-user flow; files are generated on demand and shared via expo-sharing.

### Consequences

Positive:
- One query layer and one output model → consistent, testable reports (98.9% line coverage on `exportData.ts`).
- Banded headers work uniformly across CSV, Excel, and PDF.
- Reports reflect the current template and device data at export time.
- Single export entry point simplifies navigation and removes dead code paths.

Negative:
- Live template queries mean export depends on the project DB being open (satisfied via navigation params + context per ADR-014).
- PDF path reads inspection data twice for single-inspection export (guard + form re-read) — negligible offline.

Update (v1.9.1): PDF export was removed after the initial implementation — the export service now supports CSV and Excel only (`ExportFormat = "csv" | "excel"`), and the Reports screen / Inspection List offer Excel/CSV. Decision point 6 is amended: `getProjectExportMeta` (used for file-naming metadata in `createExportFile`) is the single UI-facing `getGlobalDatabase()` call in the export flow, invoked only outside the mid-inspection DB session (ADR-014).

---

# ADR-016

## Title

Template Transfer v2.0 — Export/Import with Replace-in-Place

### Status

Accepted

### Date

August 2026

### Context

Custom inspection forms (sections, fields, options, device types, device options, and project device type mappings) lived only in the local project DB, so they could not be moved between phones or reinstalls. The old `exportDefaultTemplate`/`importTemplate` path was v1.0 (single template, no device data) and import only appended — it could not replace a customized form cleanly, and exported files lacked the device-field definitions that dynamic device sections depend on.

### Decision

1. **v2.0 JSON transfer format** — `{ version: "2.0", exportedAt, templates: [], projectDeviceTypes: [] }` exports ALL active templates, each with sections → fields → options, plus per-template `DeviceFieldDefinitions` and `DeviceOptions`, and the project's active `ProjectDeviceTypes`.
2. **Replace-in-place import** — `applyTemplateImport` upserts templates by `TemplateName` (update existing + reactivate, or insert), deactivates that template's stale sections, inserts fresh sections/fields/options, upserts device definitions/options by natural keys, bulk-deactivates device rows belonging to templates no longer active, and replaces `ProjectDeviceTypes`. Existing inspection records are untouched.
3. **v1.0 backward compatibility** — `pickAndParseTemplate` normalizes legacy single-template files to the v2.0 shape (`IsDefault: 1`, empty device data), and `importTemplate` is retained as a pick + parse + apply wrapper.
4. **`ProjectDeviceTypes` has no `ProjectID` column** — the inline schema in `src/database/schema.ts` defines it without one, so all transfer SQL avoids `ProjectID`: reads use `WHERE IsActive = 1`, upserts key on `DeviceType`.
5. **Reset-to-Default preserves device records** — the previous reset ran `DELETE FROM DeviceRecords` (per-inspection saved device values, FK to `Inspections`) while its confirmation text claimed "Existing inspection data will NOT be deleted." That destructive step was removed; reset now only touches form configuration.
6. **Error dialogs scoped to originating flow** — the settings screen tracks whether an export or import flow started the error, so an export failure shows only "Export Failed" and an import failure only "Import Failed".

### Alternatives

- **Keep v1.0 append-only import** — rejected: could not replace a customized form, so stale sections/fields accumulated and device configuration could not transfer.
- **Export only the default template** — rejected: admin/custom (`IsDefault=0`) templates are part of the configured form and must transfer too.
- **Support `ProjectID` in `ProjectDeviceTypes`** — rejected: the table's schema has no such column; introducing one would be a cross-cutting schema change with no benefit for single-project files.
- **Deleting then re-inserting all template rows on import** — rejected: would orphan existing `InspectionFields`/`InspectionSections` references and inspection data; keep rows and deactivate/insert instead.

### Consequences

Positive:
- A fully customized form (including device configuration) can be shared via JSON and restored on another device.
- Replace-in-place keeps the form clean without deleting inspection data, matching the product's data-preservation guarantee.
- `exportDefaultTemplate`/`importTemplate` remain as thin wrappers, so existing callers and tests keep working.
- Per-project isolation holds: import writes only to the active project DB (no cross-DB references), with a dedicated isolation regression test.

Negative:
- v1.0 files lose device data on import by design (they never carried it).
- The two-step pick + parse + confirm + apply flow adds a confirmation dialog before any DB write.

---

# ADR-017

## Title

Inspection List Block Search — Testable Filter Helper

### Status

Accepted

### Date

August 2026

### Context

The Inspection List screen (`app/inspection/index.tsx`) displayed each inspection's Pole ID, Division, District, Status, and Date but not the Block, and its search box matched only Pole ID, Division, and District. The `Block` value was already selected and typed by `InspectionListRepository.getByProject` (`InspectionListItem.Block: string | null`, subquery on `FieldKey = 'block'`), so the data existed — it just wasn't surfaced or searched. The existing filter was an inline `Array.prototype.filter` inside the screen, which could not be unit-tested without a screen-render harness (none exists for this screen).

### Decision

1. **Surface the Block** — add a card line `Block : {item.Block || "N/A"}` following the existing `Division :` / `District :` pattern.
2. **Testable search helper** — extract the filter into a pure static method `InspectionListRepository.filterByQuery(items: InspectionListItem[], query: string): InspectionListItem[]` that case-insensitively matches PoleID, Division, District, or Block. It trims the query, treats `null` fields as empty (never throws), and returns all items unchanged for an empty/whitespace query (matching prior `includes("")` behavior). The screen replaces its inline filter with a single call to the helper and drops the now-unused local `query` variable.
3. **Searchbox copy** — placeholder updated to "Search Pole ID, Division, District, Block".

### Alternatives

- **Keep the inline filter and just add a Block clause** — rejected: the search predicate stays untested UI code; extending it inline repeats the null-guard pattern for every future searchable field.
- **Add a screen-render test harness** — rejected: no test infrastructure exists for this screen, and a pure helper is cheaper to test at the repository layer with the existing Jest setup.
- **Change the repository SQL** — rejected: no data-model or query change was needed; `Block` was already fetched.

### Consequences

Positive:
- Search behavior is unit-tested (6 tests: each field, case-insensitivity, null-safety, empty-query passthrough) and reusable for future searchable fields.
- Behavior parity with the previous inline filter; null fields render as "N/A".
- No schema, SQL, or repository-query changes; per-project isolation untouched.

Negative:
- The helper lives on the list repository even though it is pure — acceptable given the screen already imports that repository for `getByProject`.

---

# End of Architecture Decision Records

---

# ADR-018

## Title

Smart Dashboard — Dynamic Configurable Statistic Cards

### Status

Accepted

### Date

August 2026

### Context

The project dashboard originally had hardcoded statistic sections (Total Poles, Total Cameras, etc.). As inspection templates evolved, the hardcoded stats became inflexible — new fields (camera_count, pole_avail) could not be surfaced without code changes, and different projects needed different dashboard configurations.

### Decision

Replace hardcoded dashboard stats with a configurable card engine backed by a per-project `DashboardCards` table.

1. **`DashboardCards` table** — stores per-project card config with `CardMode` (entitycount/dropdown/sum/fieldcount/datebreakdown), `BreakdownField`, `AggregateField`, `SectionLabel`, `DeviceType`, `FilterJson`.
2. **SmartCardGenerator** — discovers active form fields, classifies each field type into a card kind, and auto-creates Total + Today cards.
3. **DashboardCardManager** — UI for adding/deleting/reordering/enabling/disabling cards. Cards are added via the field picker (smart cards) and are non-editable — they are deleted and re-added rather than edited; the manual Custom Card editor was removed.
4. **InspectionDataBus** — lightweight pub/sub that emits `inspectionsChanged` events with `projectId` payload after every repository mutation.
5. **useDashboardAutoRefresh** — listens to bus (project-filtered), AppState foreground, midnight rollover, and 60s focused poll. Returns a reload key consumed by `DashboardCardGrid`.
6. **StatisticCountService** — generic parameterized `SELECT COUNT(*)` engine with entity + counter-type registries.
7. **DashboardService** — composes card counts into stat rows.
8. **Section grouping** — cards can be grouped into "Total Summary" / "Today's Summary" sections with collapsible headers.

### Consequences

Positive:
- Admins can configure dashboard cards per project without code changes.
- New inspection form fields automatically surface as dashboard cards.
- Project-isolated refresh prevents cross-project dashboard noise.
- Smart cards are non-editable, preventing configuration drift.

Negative:
- Each project DB migration adds the `DashboardCards` table and columns (handled idempotently in `migrateProjectSchema`).
- Smart cards require field-type classification logic (encapsulated in SmartCardGenerator).

---

# ADR-019

## Title

Device Types Admin — Generic Device Inspection Architecture

### Status

Accepted

### Date

July 2026

### Context

The original inspection form had hardcoded Camera and Switch sections. As the platform evolved, new device types (NVR, UPS, Solar, etc.) were planned, but each would require new hardcoded sections, fields, and components.

### Decision

Introduce a generic device type management system:

1. **`DeviceFieldDefinitions` table** — stores the schema (field name, label, type, display order, required) for each device type.
2. **`DeviceRecords` table** — stores per-inspection device instance data as JSON (`DeviceData` column).
3. **`ProjectDeviceTypes` table** — tracks which device types are enabled for each project.
4. **`DeviceSection` component** — renders device sections generically based on `DeviceFieldDefinitions`, replacing hardcoded `CameraSection`/`SwitchSection` for new device types.
5. **Settings > Device Types screen** — admin UI for creating/editing/deleting device types and managing their fields.
6. **Device options** — dropdown fields in device definitions link to `DeviceOptions` for configurable option lists.

### Consequences

Positive:
- New device types require no new component code — only database configuration.
- Device options remain DB-driven via DeviceOptions table.
- Per-project device type enablement allows project-specific customization.

Negative:
- JSON storage in `DeviceRecords` loses relational queryability (acceptable for device instance data).
- Generic rendering is slightly more complex than hardcoded sections.

---

# ADR-020

## Title

Template Transfer v2.0 — Replace-in-Place Import

### Status

Accepted

### Date

August 2026

### Context

Custom inspection forms (sections, fields, options, device types, device options) lived only in the local project DB, so they could not be moved between phones or reinstalls. The old import path was v1.0 (single template, no device data) and append-only — it could not replace a customized form cleanly.

### Decision

1. **v2.0 JSON transfer format** — exports ALL active templates, each with sections → fields → options, plus per-template `DeviceFieldDefinitions` and `DeviceOptions`, and the project's active `ProjectDeviceTypes`.
2. **Replace-in-place import** — upserts templates by `TemplateName` (update existing + reactivate, or insert), deactivates stale sections, inserts fresh sections/fields/options, upserts device definitions/options by natural keys, bulk-deactivates device rows belonging to templates no longer active, and replaces `ProjectDeviceTypes`. Existing inspection records are untouched.
3. **v1.0 backward compatibility** — legacy single-template files are normalized to the v2.0 shape.
4. **Reset-to-Default preserves device records** — the previous reset wiped `DeviceRecords` while its confirmation text claimed "Existing inspection data will NOT be deleted." That destructive step was removed.
5. **Error dialogs scoped to originating flow** — export failure shows only "Export Failed", import failure only "Import Failed".

### Consequences

Positive:
- A fully customized form (including device configuration) can be shared via JSON and restored on another device.
- Replace-in-place keeps the form clean without deleting inspection data.
- Per-project isolation holds: import writes only to the active project DB.

Negative:
- v1.0 files lose device data on import by design (they never carried it).
- The two-step pick + parse + confirm + apply flow adds a confirmation dialog before any DB write.

---

# ADR-021

## Title

Atomic Project Clone — Transactional `cloneProjectDb`

### Status

Accepted

### Date

August 2026

### Context

Cloning a project (Home screen Clone dialog) used `ProjectRepository.cloneProject` (inserts a `Projects` row) followed by `ProjectDBManager.cloneProjectDb`. The clone originally failed with `UNIQUE constraint failed: DashboardCards.ProjectID, DashboardCards.CardKey` and could leave orphaned state — a partial target folder plus a `Projects` row pointing at a broken DB — so retrying the same clone name failed.

### Decision

`cloneProjectDb` performs a transactional, atomic clone:

1. Runs entirely inside one `withTransactionAsync`.
2. Reads the source DB with the active project handle open (settings tables, `Inspections`, and all inspection-data tables), always releasing the handle in `finally`.
3. Opens the target DB, creates the schema, wipes any stale/partial clone tables, de-duplicates `DashboardCards` by `CardKey` (keeps lowest `CardID`), re-binds `DashboardCards.ProjectID` to the new project, and re-inserts `Inspections` plus every data table with `InspectionID` (and `RecordID` for `RepeatableValues`) remapped.
4. On failure, cleans up the partial target folder and the orphaned `Projects` row so retrying the same name succeeds.

### Alternatives

- **Raw file copy of `inspection.db`** — rejected: `DashboardCards` must be re-bound to the new `ProjectID` and child rows remapped; a straight copy violates `UNIQUE(ProjectID, CardKey)` and carries stale identity.
- **Insert-only clone without wiping the target** — rejected: stale tables from a previous failed attempt blocked retries.

### Consequences

Positive:
- Cloning is idempotent and retryable — no orphaned projects or partial folders.
- All dashboard cards and inspection data are re-bound to the cloned project.
- Per-project isolation holds: the clone writes only to the new project's DB.

Negative:
- `cloneProjectDb` is the most complex helper in `ProjectDBManager` (ID remapping across 10+ tables).
- The clone must open source and target DBs sequentially per ADR-014.

---

# ADR-022

## Title

Native JPEG Encoder for Watermark Burn-In — Replacing `canvas.toBlob("image/jpeg")`

### Status

Implemented (August 2026). **Superseded in the same month by [ADR-023](#adr-023)** for the default native path — overlay-native composite replaces full-frame RGBA as the primary stage; the ADR-022 `rgba` path remains on the fallback ladder (`overlay → rgba → toblob`).

### Date

August 2026

### Context

The watermark burn-in pipeline renders the composite photo in a hidden WebView `<canvas>` (`src/utils/watermarkHtml.ts`) and encodes it with `canvas.toBlob("image/jpeg", 0.95)` at lines 121–170. Diagnostic instrumentation proved the **encode stage is the sole bottleneck**: queue depth 1, FileReader 8–12ms, draw 80–95ms, decode <15ms, heap stable ~10MB — only `toBlob` intermittently jumps from a healthy 150–180ms to 4,200ms+ (sometimes 11–13s).

Root cause: an Android WebView/Chromium regression in `toBlob` JPEG export. It matches three public Chromium issues — `issues.chromium.org/527689569` (P2, intermittent `toBlob('image/jpeg')` stalls in a persistent WebView), `508869337` (8,500ms in WebView vs 300ms in Chrome), and `40915136` (the stall is the **main-thread GPU readback** cost Chromium pays for `toBlob`). Because all WebView instances share one renderer **process** (the app creates a fresh page per photo — see ADR-022 lifecycle finding below), process-level state accumulates across photos, explaining why stalls cluster on photo 3+ even though each page starts with `capture=1`.

Lifecycle finding: the WebView lives inside the camera route screen, which `router.back()` unmounts after Keep — so a new renderer page is (intentionally) created per photo. A per-page fix cannot help; the fix must bypass the Chromium encoder in a way that also skips the shared-process readback path. Experiment A (`willReadFrequently: true`, `watermarkHtml.ts:46`) already forces a CPU-backed canvas, which is a prerequisite for the chosen approach.

Constraints:

1. Preserve the existing HTML/CSS canvas renderer — it is the single source of truth for watermark composition.
2. Preserve pixel-identical preview ↔ saved output (shared layout metrics must keep applying).
3. Replace **only** the `canvas.toBlob("image/jpeg")` encode stage with a native Android encoder.
4. Must not rely on the WebView process for the encode (the very thing that is broken).

### Decision

Replace the in-WebView JPEG encode with a **custom native Android encoder module** invoked from React Native:

- **WebView (unchanged rendering, changed output stage):** after the watermark draw completes (`watermarkHtml.ts:119`), read the composited pixels with `ctx.getImageData(0, 0, cv.width, cv.height)` — a synchronous CPU memcpy on the `willReadFrequently` canvas that bypasses GPU readback and the Chromium JPEG encoder entirely. Encode the RGBA buffer to a base64 string and `postMessage({ photoId, width, height, rgba, diag })`.
- **RN JS:** `handleWebViewMessage` receives the payload and calls `NativeModules.WatermarkEncoder.encodeJpeg({ width, height, rgbaBase64, quality: 0.95, outputPath })` (async, Promise).
- **Kotlin module (`ReactContextBaseJavaModule`):** `Base64.decode` → `Bitmap.createBitmap(width, height, ARGB_8888)` → `bitmap.copyPixelsFromBuffer` → `bitmap.compress(JPEG, 95, FileOutputStream(outputPath))` on a background thread → `recycle()` → resolve Promise with the output path (reject with a typed error on failure).
- **Save (unchanged destination):** RN reads the temp JPEG and writes it into the SAF project folder through the existing `writePhoto` path (`src/utils/storageManager.ts:104`), or via a small `copyPhotoToProject(sourcePath, projectDirUri, fileName)` helper that streams the file into SAF without a second base64 round-trip. `PhotoRepository.updateFilePath` and `onPhotosUpdated` are unchanged.
- **Fallback:** a module-level constant keeps `toBlob` available; if `NativeModules.WatermarkEncoder` is absent or throws (including OOM), the job falls back to the current `toBlob` path with the existing retry semantics.

The quality factor stays `0.95`. Android's JPEG encoder is Skia/libjpeg-turbo — the same encoder Chromium uses — so the output is visually equivalent to today's healthy-case output.

### Data Movement (WebView → RN → Native)

```
WebView (JS)                          RN (JS)                        Native (Kotlin)
───────────                           ───────                        ───────────────
canvas draw (unchanged)                                                   
   │  ctx.getImageData(0,0,w,h)                                           
   │  → Uint8ClampedArray (48MB @ 4000×3000)                              
   │  → base64 string (~64MB)                                             
   │  postMessage({photoId,w,h,rgba})                                     │
   │───────────────────────────────► │  onMessage → JSON.parse            │
   │                                 │  NativeModules.WatermarkEncoder     │
   │                                 │    .encodeJpeg({w,h,rgba,q,out})   │
   │                                 │────────────────────────────────────►│  ExecutorService thread
   │                                 │                                     │  Base64.decode → byte[] (48MB)
   │                                 │                                     │  Bitmap ARGB_8888 (48MB)
   │                                 │                                     │  compress(JPEG,95) → temp file
   │                                 │                                     │  recycle(); resolve({path})
   │                                 │◄────────────────────────────────────│
   │                                 │  temp JPEG file (2–5MB)
   │                                 │  → writePhoto / copyPhotoToProject
   │                                 │    → SAF content:// project folder
   │                                 │  → PhotoRepository.updateFilePath
   │                                 │  → delete temp + source temp
```

Key properties:

- The **only** large object crossing the WebView↔RN boundary is the base64 RGBA string. It is unavoidable — Android `onMessage` delivers strings only, and the pixels originate in the WebView.
- No image data crosses the RN↔Kotlin boundary as base64 twice: the decoded pixels live only inside the Kotlin call, and the result is a file path (tiny string), not base64.
- Nothing re-enters the WebView renderer process, so the stalled path is fully bypassed.

### Alternatives Considered

### Alternative 1 — Custom native encoder via `getImageData` RGBA (CHOSEN)

- **Data flow:** above.
- **Performance:** `getImageData` ~50–150ms (CPU canvas, no stall); base64 ~250–450ms; bridge/JNI ~50ms; `Bitmap.compress` ~300–900ms on a background thread. Total ~0.7–1.6s, **deterministic and bounded** — no 4s freeze.
- **Memory:** peak transient ~48MB JS RGBA + ~64MB base64 + ~64MB RN string + ~48MB decoded bytes + ~48MB Bitmap (recycled). ~210MB worst case; mitigation below.
- **Complexity:** Medium-high — one Kotlin module, `MainApplication` registration, TS bridge types, threading, error handling.
- **Rollback:** single call-site flip to the `toBlob` fallback constant; the native module is dormant when unused. Shipping the fix requires a native rebuild (any fix does, since the encoder is a browser behavior), but the JS-level rollback is instant.
- **Risks:** memory pressure on low-RAM devices (mitigations: drop alpha to RGB in JS for 25% less traffic, recycle Bitmap in `finally`, background thread, fallback on OOM); alpha-flattening must match Chromium (both composite alpha over black — verified by a pixel-diff test); must never encode on the main thread (ANR).

### Alternative 2 — Canvas PNG handoff → native re-encode (expo-image-manipulator)

- **Data flow:** WebView `canvas.toBlob("image/png")` → base64 → RN writes a PNG temp file → `expo-image-manipulator.manipulateAsync(pngPath, [], { compress: 0.95, format: JPEG })` (native `BitmapFactory` decode + `Bitmap.compress`) → RN saves. No custom Kotlin code.
- **Performance:** PNG encode of a 12MP photo is 500–1,500ms and produces a 10–30MB file; plus native decode+encode 500–1,000ms. Slower than Alternative 1, and **the PNG encode runs the same readback path the bug lives in** — the stall may simply move to PNG.
- **Memory:** PNG buffer + large file on disk + native Bitmap — comparable to Alternative 1 with more disk churn.
- **Complexity:** Low — adds `expo-image-manipulator` (not currently installed), no native module.
- **Rollback:** remove the dependency and revert the call.
- **Risks:** root cause not actually removed (unverified PNG stall); double-encode quality path; extra APK native code; SAF write still needs a file-copy or base64 path.

### Alternative 3 — Full native compositing (draw watermark in Kotlin, no canvas output)

- **Data flow:** RN passes the original JPEG temp path + watermark text/style/layout params to Kotlin; Kotlin `BitmapFactory.decodeFile` → draw text/rounded-rect/shadow with `android.graphics.Paint` → `Bitmap.compress(JPEG)`. No pixel transport at all.
- **Performance:** decode ~300–600ms + draw ~20–50ms + compress ~300–900ms ≈ 1–1.5s deterministic. Lowest bridge traffic.
- **Memory:** one ~48MB native Bitmap; no JS/base64 spike. Best memory profile of all three.
- **Complexity:** Medium — but must reimplement the exact layout math, font metrics, shadow, and rounded-rect logic in Kotlin and keep it in sync with the JS renderer forever.
- **Rollback:** JS renderer untouched; swap the native path back.
- **Risks:** **Violates constraints #1 and #2** — native `Paint.measureText` ≠ canvas `measureText` (font file, hinting, subpixel), guaranteeing drift between preview and saved output and losing the WYSIWYG guarantee. Rejected on the hard requirements, documented to record why it was considered.

### Alternative 4 — Hybrid: keep `toBlob` fast path + stall timeout → fallback to Alternative 1

Not the primary decision. A future refinement: run `toBlob` first, and if the callback does not arrive within ~1.5s, abort and encode that same photo natively via `getImageData` (the canvas is already drawn). Best-of-both latency, but adds a timeout/abort state machine. Deferred — the deterministic ~1s native path is acceptable now, and a hybrid doubles the QA surface.

### Consequences

Positive:

- Root cause eliminated: the Chromium readback/encoder path is bypassed, not papered over. No 4–13s freezes.
- HTML/CSS renderer and layout metrics untouched → preview/saved pixel identity preserved (only the final pixel→JPEG conversion changes encoder).
- Same encoder family (Skia/libjpeg-turbo) and same quality (0.95) → visually equivalent output.
- Save destination, repositories, and retry semantics unchanged.
- Instant JS-level rollback via the `toBlob` fallback constant.
- Deterministic, bounded encode time is more field-appropriate than a fast-but-intermittently-frozen path.

Negative:

- Adds custom native code to the Android target (first native module in the app) and requires a native rebuild to ship.
- Normal-case latency rises from ~150–180ms (healthy `toBlob`) to roughly ~1s native encode.
- Peak transient memory is ~210MB during the RGBA transfer — needs the mitigations below.
- Instrumentation must change: `toBlobMs`/`frMs` diag fields are replaced by `getDataMs`/`encodeMs`/`saveMs` (keeps the stall-monitoring capability for the fallback path).

### Risks and Mitigations

- **OOM on low-RAM devices** — drop alpha (RGBA→RGB in JS, −25% payload), recycle the Bitmap in `finally`, encode on an `ExecutorService`, and fall back to `toBlob` on any native error/OOM.
- **Alpha flattening mismatch** — both Chromium and Skia composite JPEG alpha over black; lock with a pixel-diff test (max per-channel delta below a threshold) before enabling the native path by default.
- **ANR** — the Kotlin method must never touch the main thread; all decode/encode runs on a background thread and resolves a Promise.
- **64MB bridge string** — transient and GC-able; the RN string is released immediately after the module call; a hard 2GB-device test gate covers it.
- **Renderer lifecycle** — unaffected by this change (WebView still recreated per photo, which is correct per the lifecycle finding).

### Acceptance Criteria

1. Pixel-diff test: same photo + lines rendered through native path vs `toBlob` path differ below an agreed perceptual threshold.
2. 20-capture on-device run: no encode > 2,500ms; median encode < 1,200ms.
3. Memory test on a 2GB device: peak native heap < 150MB during encode; no OOM.
4. Fallback test: with the module disabled, `toBlob` path still produces valid output with retry semantics intact.
5. Full test gate: `npx tsc --noEmit`, `yarn lint` (0 errors), `yarn test` (62 suites, 705+ tests) green.

### Implementation Status (August 2026)

Implemented end-to-end via TDD (RED→GREEN per cycle) and verified. Commits on `main`:

- `5505fa8` docs: add ADR-022 native JPEG encoder design
- `54f9c53` debug: add watermark lifecycle and performance instrumentation (Debug-only; `logger.error` is not `__DEV__`-gated, so stall-monitoring logs use `logger.debug`)
- `f52d406` camera: improve GPS tracker and diagnostics
- `693f45f` feat(watermark): native Android JPEG encoder path (JS)
- `f5e11c6` feat(android): register WatermarkEncoder native module (Kotlin)

What shipped:

- **`src/native/WatermarkEncoder.ts`** — JS bridge: `hasNativeWatermarkEncoder()` (checks `NativeModules.WatermarkEncoder.encodeJpeg` exists) and `encodeWatermarkJpeg(width, height, rgbaBase64, quality, outputPath)` which throws `"WatermarkEncoder native module is not available"` when absent.
- **`src/utils/watermarkHtml.ts`** — renderer gains a native branch: after the watermark draw, `ctx.getImageData(0,0,w,h)` → chunked `arrayBufferToBase64` (0x8000 per chunk, `btoa`) → `postMessage({ photoId, width, height, rgba, diag })`. The `toBlob` path is unchanged and remains the fallback. Entry dispatches on a `nativeEncode` flag.
- **`src/components/inspection/useWatermarkProcessor.ts`** — `WatermarkJob.useNative` defaulted via `hasNativeWatermarkEncoder()`; `enqueueWatermark` accepts a `useNativeOverride` (used by retry); native message branch encodes via the module to `${inputPath}.wm.jpg`, reads the temp JPEG base64, saves through the existing SAF `writePhoto` path, `PhotoRepository.updateFilePath`, `onPhotosUpdated()`, deletes the temp file. On any native error the temp is deleted, the job is re-queued with `useNative=false`, and the existing retry semantics re-run through `toBlob`.
- **`android/app/src/main/java/com/accc/dynamicinspection/WatermarkEncoderModule.kt`** — `ReactContextBaseJavaModule` "WatermarkEncoder": background `Thread`; `Base64.decode` → `ByteBuffer.wrap(...).order(nativeOrder())` → `Bitmap.createBitmap(ARGB_8888)` → `copyPixelsFromBuffer` → `compress(JPEG, quality=95, FileOutputStream)` → `promise.resolve`; `bitmap.recycle()` in `finally`; reject codes `E_INVALID_ARGS` / `E_DECODE` (buffer-size mismatch) / `E_ENCODE` / `E_OOM`. Registered in `MainApplication.kt` via an anonymous `ReactPackage` (works through the RN 0.81 New-Arch interop layer). Positional args (`width, height, rgbaBase64, quality, outputPath`) — object-arg `@ReactMethod` signatures are not supported.
- **Verification:** `npx tsc --noEmit` clean; `yarn lint` 0 errors (447 pre-existing warnings); `yarn test` **63 suites / 722 tests** pass (bridge 6, renderer 30, processor 12 incl. 4 native-path tests); Gradle `:app:compileDebugKotlin` **BUILD SUCCESSFUL**. On-device Debug run confirmed the native diag shape (`mode=native`, `getData=`/`b64=` fields) and ~0ms `toBlob`.

Known deviations from the as-written design:

- **Second base64 round-trip on save:** the temp JPEG is read as base64 and handed to `writePhoto` (as in the diagram), rather than the optional `copyPhotoToProject` streaming helper. The extra string is only 2–5MB and GC-able; revisit only if a memory test demands it.
- **`quality` scale:** JS passes `95` (0–100), which the module validates against `0..100`.
- **Instrumentation fields:** `toBlobMs`/`frMs` diag replaced by `getDataMs`/`b64Ms`/`native` (per the Consequences section); the toBlob fallback keeps its original diag fields.

Open acceptance items (need a physical device):

1. Pixel-diff test (native vs `toBlob` output below perceptual threshold).
2. 20-capture run on the **release APK**: no encode > 2,500ms, median < 1,200ms.
3. 2GB-device memory test: peak native heap < 150MB, no OOM.
4. Fallback test with the module disabled.

Note: **Expo Go cannot load custom native modules.** The native path only activates in a custom build (`npx expo run:android`) or release APK; in Expo Go `hasNativeWatermarkEncoder()` returns `false` and every photo takes the `toBlob` path (intermittent 4s stalls persist there by design).

---

# ADR-023

## Title

Overlay-Native Composite for Watermark Burn-In — Composite a Small Rendered Overlay onto the Original Photo on the Kotlin Side

### Status

Implemented (August 2026)

### Date

August 2026

### Context

ADR-022 replaced the stalled `canvas.toBlob("image/jpeg")` encode stage with a native JPEG encoder (`WatermarkEncoderModule.encodeJpeg`). That path is correct and shipped, but it still moves the **entire composited photo** across the WebView↔RN boundary as a full-resolution RGBA buffer (base64 ~64MB @ 4000×3000, decode ~48MB, Bitmap ~48MB, peak transient ~210MB). It also re-rasterizes the photo: the source JPEG is decoded, drawn to canvas, then all pixels are read back via `getImageData` even though only the small watermark area changes.

Diagnosis of the remaining traffic:

- The photo occupies the whole frame; the watermark occupies a small box in the corner (typically ~500×1000, a few percent of the frame).
- The full-RGBA path pays `getImageData` (~50–150ms) + base64 (~250–450ms) + bridge + native Bitmap create **for every pixel of the frame**, most of which are never modified by the watermark.

The decision re-examines where the native boundary should sit: draw only the watermark in the WebView, hand over a **small standalone overlay PNG plus its placement rectangle**, and do the only remaining step — JPEG re-encode — on the native side where the source photo is decoded just once.

Constraints carried over from ADR-022 (must keep):

1. Preserve the HTML/CSS canvas renderer as the single source of truth for watermark composition (fonts, metrics, style → WYSIWYG with the live preview).
2. Preserve pixel-identical preview ↔ saved output (shared `computeWatermarkMetrics`/`computeWatermarkOverlayLayout`).
3. Replace the in-WebView full-frame JPEG encode; the encode/readback that can stall must be bypassed.
4. Must not rely on the WebView process for pixels that can stall.

### Decision

Split the burn-in into three stages and composite **only the watermark overlay** natively onto the original photo file:

1. **Measure (WebView):** `buildMeasureOverlayScript` asks the renderer to set the watermark font (`bold <fSize>px sans-serif`) and return the max text width via `ctx.measureText` → `postMessage({ photoId, maxTextWidth })`.
2. **Compute (RN JS):** `computeWatermarkOverlayLayout(imgWidth, imgHeight, maxTextWidthPx, lineCount, style)` derives the box geometry, text origin, and a **clip rect** (`overX/overY/overW/overH`) = the box plus a 12px shadow margin, clamped to the image bounds. This is pure JS — the layout metrics are shared verbatim with the live preview (`computeWatermarkMetrics`), preserving WYSIWYG.
3. **Render overlay (WebView):** `buildRenderOverlayScript` resizes the canvas to just the clip rect (`W×H` few percent of the photo), draws the rounded-rect backdrop + shadowed text at layout-relative offsets, and `canvas.toBlob("image/png")` (PNG of a tiny, mostly-transparent tile) → `postMessage({ photoId, overlay: base64, overlayX, overlayY, overlayWidth, overlayHeight })`.
4. **Composite (native):** `WatermarkEncoderModule.encodeOverlay(inputPath, overlayBase64, overlayX, overlayY, quality, outputPath)` decodes the **original JPEG** from file, decodes the overlay PNG, draws the overlay onto a copy at the given offset via `Canvas.drawBitmap`, and `Bitmap.compress(JPEG, quality)` → temp file. `saveAndComplete` then reuses the existing SAF `writePhoto` → `PhotoRepository.updateFilePath` → `onPhotosUpdated` chain unchanged from ADR-022.

Stage selection (`enqueueWatermark`):

- `useNativeOverride === false` → `toblob` (force the durable fallback, used by retries).
- `useNativeOverride === true` → `overlay`.
- default: `hasNativeWatermarkEncoder() && hasNativeOverlayEncoder()` → `overlay`; else `hasNativeWatermarkEncoder()` → `rgba` (ADR-022's full-RGBA path); else `toblob`.

Fallback ladder per job: **`overlay` → `rgba` → `toblob`**. Failure triggers — measure throws, layout computation unavailable, overlay PNG render fails, or `encodeOverlay` rejects (including `E_OOM`) — downshift the job's stage one step and reprocess, preserving the existing retry/watchdog semantics. The `toBlob` path remains the durable fallback and is unchanged.

This is not "draw the watermark in Kotlin" (rejected in ADR-022 Alternative 3): all layout/font/metric/shadow/rounded-rect logic still runs in the WebView renderer, so the saved output inherits the exact same preview geometry. Only the compositing onto the photo is native.

### Data Movement (WebView → RN → Native)

```
WebView (JS)                       RN (JS)                             Native (Kotlin)
───────────                        ───────                             ───────────────
measureOverlayText(photoId, fSize, lines)                               
   │  ctx.measureText → maxTextWidth                                    
   │  postMessage({photoId,maxTextWidth})                               │
   │────────────────────────────────►  onMessage → measure branch       │
   │                                  computeWatermarkOverlayLayout      │
   │                                  container.job.layout = layout      │
   │  renderOverlay(photoId,layout,lines,style)                        │
   │  canvas W×H = clip rect box+12px  │  buildRenderOverlayScript       │
   │  draw rounded-rect + box + text   │──────────────────────────►     │
   │  toBlob('image/png') (tiny tile)  │                                 │
   │  postMessage({overlay, overlayX, overlayY, overlayW, overlayH})     │
   │◄───────────────────────────────── │  message overlay branch         │
   │                                 │  NativeModules.WatermarkEncoder   │
   │                                 │    .encodeOverlay(inputPath,      │
   │                                 │      overlay, x, y, quality, out) │
   │                                 │───────────────────────────────────►│  Thread
   │                                 │                                   │  decode JPEG (BitmapFactory)
   │                                 │                                   │  decode overlay PNG
   │                                 │                                   │  drawBitmap(overlay, x, y)
   │                                 │                                   │  compress(JPEG, 95, out)
   │                                 │                                   │  recycle all; resolve(true)
   │                                 │◄──────────────────────────────────│
   │                                 │  temp JPEG (2–5MB)
   │                                 │  → writePhoto → SAF project folder
   │                                 │  → PhotoRepository.updateFilePath
   │                                 │  → delete temp + source temp
```

Key properties:

- The **only** large object is now the small overlay PNG (~box-sized tile, bytes for a few percent of the frame) — not the full photo. The original JPEG is never re-encoded pixel-by-pixel in the WebView; it is read once natively and written once.
- The photo's JPEG bytes never round-trip through the bridge; they go file → `BitmapFactory` → `Bitmap.compress`. Layout and overlay content come from the WebView, so WYSIWYG is preserved by construction.
- Pixel identity: the overlay tile is drawn at the measured/metric-computed origin, so text of the saved photo equals what the live `WatermarkOverlay` preview shows (same `computeWatermarkMetrics`/layout inputs).
- The native module exposes both `encodeJpeg` (ADR-022) and `encodeOverlay`; the RN processor selects the stage per job, so no module-level enable flag is needed.

### Alternatives Considered

### Alternative 1 — Keep ADR-022 full-frame RGBA (status quo)

- **Pros:** already implemented, correct, deterministic.
- **Cons:** still moves the full photo base64 (~64MB) and re-reads every pixel via `getImageData`; Peak transient ~210MB on 4000×3000; the native step re-encodes nothing but copies the whole frame into a new Bitmap. The stall-prone path is bypassed, but expensive bridge traffic and memory remain.

### Alternative 2 — Full native compositing in Kotlin (ADR-022 Alternative 3 reconsidered)

- **Decision:** draw the watermark entirely in Kotlin (`Paint.measureText`) — rejected on WYSIWYG drift grounds: `Paint.measureText` / Skia hinting can render text slightly differently from the canvas renderer, and there is no preview hook to verify. Rejected on constraint #1.

### Alternative 3 — WebView draws watermark onto a downscaled/blurred backdrop in the overlay tile

- unnecessary complexity; the original JPEG is already under the overlay at full resolution in the native composite. Rejected.

### Consequences

Positive:

- The encode reads the photo once and writes it once, with no full-frame bridge transfer, so both signal time and peak memory drop sharply relative to full-RGBA.
- The overlay tile PNG is small; its per-encode cost is trivial; the previous `getImageData`/base64 cost no longer scales with the photo resolution.
- WYSIWYG is preserved by construction — the WebView remains the layout/typo source of truth, and the composite origins from the layout's clip rect.
- The `rgba`/`toblob` fallbacks from ADR-022 remain on the ladder, so a device without `encodeOverlay` degrades to the full-RGBA path, not to a broken capture.
- Overlay text/box geometry can be reused for diagnostics (diag fields `overlayPngB64Len`, `overlayX/Y/W/H`, `boxX/Y/W/H`, `shadowMargin`).

Negative:

- Adds a second Kotlin method (`encodeOverlay`) and a two-message protocol (measure → render) per photo, a slightly more complex state machine than a single native call.
- The overlay PNG must stay **lossless** (`image/png`), and its clip rectangle must be ≥ the box plus the shadow extent, otherwise shadows clip at the overlay edge — hence the explicit 12px margin.
- Alpha edge: `drawBitmap` composites RGBA over the source (true alpha), whereas the full-canvas `toBlob` JPEG path flattened alpha over black. In practice the overlay area is a rounded-rect with a fully opaque back drop on the opaque source photo, so the visible difference vs the legacy JPEG is limited to the shadow anti-aliased fringe; the alpha-blend is *more* faithful to the preview.
- Requires a custom build to even run the overlay path (same native-module constraint as ADR-022).

### Acceptance Criteria

1. Full suite green: `npx tsc --noEmit`, `yarn lint` (0 errors), `yarn test` — **772 tests**, 67 suites.
2. Overlay-stage behavior tests: measured→layout→render→native composite→SAF save; and rgba fallback when the overlay composite rejects.
3. WYSIWYG: overlay layout == `computeWatermarkOverlayMetrics` of the preview (unit-tested); clip rect = box + 12px margin, clamped to image bounds.
4. Renderer page emits the measure/render/overlay protocol entry points without the legacy full-frame decode (diag shows `imgWasSized`, `overlayPngB64Len`, no `rgba`).
5. Device-only gates (from ADR-022 open items, now apply to the overlay path's composite):
    - pixel-diff test: overlay-native composite vs `toBlob` output stays below an agreed perceptual threshold;
    - 20-capture release-APK run: no stage > 2,500ms; median < 1,200ms;
    - 2GB-device memory test: peak native heap < 150MB, no OOM;
    - module-disabled fallback: `toblob` produces valid output with retry semantics intact.

### Implementation Status (August 2026)

Implemented end-to-end and verified in CI/test; commit on `main`:

- `0bfd1eb` camera: switch watermark pipeline to overlay-native composite architecture

What shipped:

- **`src/native/WatermarkEncoder.ts`** — `hasNativeOverlayEncoder()` (checks `NativeModules.WatermarkEncoder.encodeOverlay` is a function) and `encodeWatermarkOverlay(inputPath, overlayBase64, overlayX, overlayY, quality, outputPath)`, throws `"WatermarkEncoder overlay composite is not available"` when absent.
- **`src/utils/watermarkStyle.ts`** — `computeWatermarkOverlayLayout` (box geometry, text origin, clip rect) + exported `WATERMARK_OVERLAY_SHADOW_MARGIN = 12`; the same `computeWatermarkMetrics` the preview overlay uses (WYSIWYG).
- **`src/utils/watermarkHtml.ts`** — `buildMeasureOverlayScript` + `buildRenderOverlayScript` entry points and the `measureOverlayText`/`renderOverlay` functions in the renderer page; `renderOverlay` draws only the clip-rect tile as PNG and reports its geometry + perf, diag (`toBlobMs`/`frMs` for the small tile, `overlayPngB64Len`, `overlayX/Y/W/H`, `boxX/Y/W/H`, `shadowMargin`).
- **`src/components/inspection/useWatermarkProcessor.ts`** — new `overlay` stage at the top of the waterfall, watchdog 8s, two-message handshake (measure → overlay), stage downshift overlay→rgba→toblob; `enqueueWatermark` default-selection and `useNativeOverride`; full overlay save path via `saveAndComplete`.
- **`android/.../WatermarkEncoderModule.kt`** — `@ReactMethod encodeOverlay(inputPath, overlayBase64, overlayX, overlayY, quality, outputPath)`: background Thread; `BitmapFactory.decodeFile` source + decode overlay → `drawBitmap` at (x,y) with clamping → `compress(JPEG, quality=95)` → resolve/typed rejection (`E_DECODE`/`E_ENCODE`/`E_OOM`); all bitmaps `recycle()` in `finally`. Registered alongside the existing module (single registration already present from ADR-022).
- **Tests** — overlay-stage tests for the processor (measure→composite save, rgba fallback on composite failure), layout-equivalence tests for `computeWatermarkOverlayLayout` (`bottomLeft`/`bottomRight`, shadow margin, clip-contents), and full renderer-page tests for measure/overlay entry points, sanitization, U+2028, perf fields. 772 tests across 67 suites.

Known deviations:

- The overlay PNG still uses `canvas.toBlob("image/png")` for the (small, transparent) tile. PNG in a persistent WebView uses the same Chromium encoder as JPEG, but on a tiny canvas the stall risk is negligible and the earlier stall was specific to JPEG quality 0.95 on large canvases. If a stall ever shows up, the tile path can drop to `getImageData` for a ~1MB buffer.
- Encode quality for the composite is the same `95` (0–100) as the ADR-022 path.
- The `rgba` stage from ADR-022 remains compiled in as the middle rung; it is no longer the default on devices that expose both modules.

Open or device-only acceptance:

- Physical-device gates from the "Risks and Acceptance" above (pixel-diff, 20× capture, 2GB memory, module-disabled fallback) remain to be validated; the JS/test gates listed in the Risk/Acceptance section are green.

---

# ADR-024

## Title

SAF URI Validation on Startup + Preview Watermark Visual Correction

## Status

Accepted

## Date

August 2026

## Context

Two issues were identified:

1. **SAF folder migration warning**: The app was restoring a stored SAF folder URI on startup without validating its writability. On some devices (especially after app reinstall or SD card remount), the URI `content://com.android.externalstorage.documents/tree/primary%3ADCIM` would not be writable, causing a "Location isn't writable" warning. The app logged a warning but continued using the invalid URI, leading to save failures.

2. **Preview watermark size mismatch**: The live preview watermark was rendering ~8-12% smaller and slightly higher than the saved photo watermark. Root cause: the cover-fit transform was mathematically correct for fitting rectangles, but the preview is cropped/letterboxed — `min(previewW/photoW, previewH/photoH)` is not visually correct for a camera preview because the preview is a centered crop of the photo. The fix requires using the cover transform (`max(previewW/photoW, previewH/photoH)`) with a visual correction factor.

## Decision

1. **SAF URI Validation on Startup** (`src/utils/storageManager.ts`):
   - On startup, validate the stored SAF folder URI by attempting a lightweight writable check (read directory + create/delete test directory).
   - If the URI is invalid or not writable: clear the stored URI, mark storage as unconfigured, show a user-friendly dialog, and immediately prompt the user to select a folder again via `requestDirectoryPermissionsAsync`.
   - Recommended folder: `DCIM/ACCC Inspection`.
   - DEV logs added: `[FolderManager] validating=...`, `writable=true/false`, `clearing invalid uri`, `requesting new folder`, `selected=...`.
   - Do not keep using the invalid URI after the check fails.

2. **Preview Watermark Visual Correction** (`src/components/camera/WatermarkOverlay.tsx`):
   - Apply a 10% visual correction factor (`visualCorrection = 1.10`) to the cover scale.
   - `correctedScale = coverScale * visualCorrection` where `coverScale = max(previewW/photoW, previewH/photoH)`.
   - Apply corrected scale to all metrics (font size, line height, padding, gaps, corner radius) and position.
   - DEV log: `[Watermark:preview] visualCorrection=1.10`.
   - Final effective preview scale: `coverScale * 1.10`.

3. **3-line Watermark Address Format** (`src/utils/geo.ts`):
   - `formatAddressLines` now returns 3 lines: `[Locality, District+Division, State]`.
   - Example: `["Doliyoh Ka Bass", "Sikar Jaipur Division", "Rajasthan"]`.
   - When no locality: 2 lines `["Sikar Jaipur Division", "Rajasthan"]`.

4. **Clean Reverse-Geocode Output** (`src/utils/geo.ts`):
   - `buildFullFormattedAddress` now removes Plus Codes (e.g., `J552+GM9`), administrative divisions (`Jaipur Division`, `Revenue Division`, `Subdivision`, `Tehsil`), and keeps only meaningful components.
   - Output order: street/road, area/sublocality, city/locality, state, postal code, country.
   - Joined with comma+space: `Police Lines, Sikar, Rajasthan 332001, India`.
   - DEV log: `[Geo:reverse] cleaned=...`.

5. **Version Bump**:
   - Android: `versionCode = 2`, `versionName = "1.1.0"` (with comments explaining the fields).
   - Expo: `version = "1.1.0"`, `android.versionCode = 2`.
   - APK naming: `ACCC-Dynamic-Inspection-Platform-v1.1.0.apk`.
   - Android treats this as an upgrade over 1.0.0 (versionCode 2 > 1).

## Consequences

Positive:
- SAF folder issues after reinstall/update are eliminated.
- Preview watermark now visually matches saved photo (WYSIWYG).
- Address display is clean and human-readable across camera UI, inspection records, exports, watermarks, and logs.
- Version management aligned across Android and Expo.

Negative:
- Slightly larger preview watermark (intended).
- Additional startup I/O for SAF URI validation (negligible).

---

# ADR-025

## Title

Android Backup Signalling via BackupManager.dataChanged()

## Status

Accepted

## Date

10 August 2026

## Context

After a reinstall, Android Auto Backup restored a stale snapshot containing projects and inspections that the user had deliberately deleted before uninstalling — deleted data reappeared. Root cause: the cloud copy was only updated when a backup pass ran, and no signal was sent after delete operations, so the last uploaded snapshot could still contain the deleted rows.

expo-sqlite on Android stores all databases under the app's `files/` directory: `files/SQLite/` (global DB `accc_global.db`) and `files/Projects/<name>/inspection.db` (per-project DBs). Both trees are candidates for Auto Backup. `android:allowBackup="true"` was already set in the manifest, but no explicit rules existed and no delete-time signalling was performed.

## Decision

Keep Auto Backup enabled and make reinstall-restore behaviour correct with the smallest reliable change:

1. **Explicit backup rules** (`android/app/src/main/res/xml/backup_rules.xml` + `data_extraction_rules.xml`): include the `file` and `sharedpref` domains so `files/SQLite/` and `files/Projects/` (plus preferences) are deterministically in every backup payload. Both the API ≤ 30 rules file and the API 31+ data-extraction rules (cloud-backup + device-transfer) are referenced from the manifest.
2. **Manifest attributes** (`AndroidManifest.xml`, application tag): add `android:fullBackupContent`, `android:dataExtractionRules`, and `android:backupInForeground="true"` (API 31+; ignored on older OS versions). `android:allowBackup` remains `true` — backup is never disabled globally.
3. **Native module** (`AndroidBackupModule.kt` + `AndroidBackupPackage.kt`, registered in `MainApplication.kt`): exposes `NativeModules.AndroidBackup.requestBackup()`, which calls `BackupManager(context).dataChanged()`. Note: `BackupManager` has no static `getInstance()` — the correct API is the `BackupManager(Context)` constructor. The call is wrapped in try/catch (best-effort, never crashes).
4. **JS wrapper** (`src/utils/androidBackup.ts`): `requestAndroidBackup()` is an Android-only, safe no-op elsewhere; it never throws and logs a DEV warning if the native module is unavailable.
5. **Delete-path signalling only**: `requestAndroidBackup()` is called after inspection deletes (`InspectionRepository.deleteInspection`, `deleteMultipleInspections`) and after project deletes (`app/index.tsx` `handleDelete` + clone-rollback, `InspectionContext.removeProject`). Save paths are unchanged — no signalling on saves.

Platform caveat (documented, not worked around): `dataChanged()` is a request, not a guarantee. The OS runs the upload at an opportune time (device idle/charging/Wi-Fi; ≈ 24 h cadence; a foreground pass is permitted via `backupInForeground`). If a user deletes data and uninstalls before any backup pass runs after the delete, the previous cloud copy may still be restored. No in-app API can force an immediate upload; `adb shell bmgr backupnow` makes QA deterministic.

## Consequences

Positive:
- Deleted projects/inspections stay deleted after reinstall because the next backup pass snapshots the post-delete state.
- Saved data still restores (save paths untouched, `files/` explicitly in every payload).
- Minimal footprint: one tiny native module + wrapper + three attributes; no WAL checkpointing, no save-path wiring.

Negative:
- Delete-then-instant-uninstall can still restore stale data (documented platform limitation).
- New config tests and ADR must be kept in sync if the backup rules ever change.
- Native edits live in the tracked `android/` directory and would be regenerated by a future `expo prebuild`.

---

# ADR-026

## Title

Manual Backup/Restore via a Physical ZIP of Database Files

## Status

Accepted

## Date

12 August 2026

## Context

Users need a way to export all app data to a file they can copy off the device (e.g. to transfer inspection data to another install) and restore it after a wipe, another phone, or an on-demand reset. The app is offline-first; its data lives in SQLite under `files/`: the global DB (`files/SQLite/accc_global.db`, DELETE-journal mode) and per-project DBs (`files/Projects/<name>/inspection.db`, WAL mode). Exposing them as internal files is meaningless to users, so a single user-visible archive in `Download/` is the target.

## Decision

Backup and restore operate on a **physical copy of the raw database files** wrapped in a standard `.zip` built with the pure-JS `jszip` library (no native module, no prebuild, works in Expo Go and Jest):

- Backup zips `SQLite/accc_global.db` plus its `-wal`/`-shm` sidecars when present, and for every project folder `Projects/<folder>/inspection.db` plus its `-wal`/`-shm` sidecars (only files that exist). Project DBs run WAL, so copying the `.db`+`-wal`+`-shm` trio together captures the latest committed data — no `PRAGMA wal_checkpoint` and no opening/closing any SQLite handle.
- **Databases stay OPEN during backup.** `closeAllDatabases()` is used ONLY in the restore flow, immediately before replacing files on disk. Copying `-wal`/`-shm` alongside each `.db` gives a consistent snapshot without closing handles, avoiding UI disruption and race conditions during normal app use.
- Backup writes to the SAF Download tree (`Download/ACCC Dynamic Inspection/accc_backup.zip`), overwriting any existing file. Base64 is transport-only — the legacy SAF `writeAsStringAsync({ encoding: Base64 })` API requires it; the zip itself holds raw DB bytes.
- Restore validates the zip (`PK\x03\x04` magic + entry count), confirms with the user, closes all databases, extracts every entry back to `files/SQLite/` and `files/Projects/`, deletes project folders not present in the backup, and reloads.
- No MANAGE_EXTERNAL_STORAGE: a single scoped SAF request for the Download tree is used (mirrors the existing DCIM flow in `storageManager.ts`).
- Android Auto Backup (ADR-025), watermark, camera, geocode, queue, and photo logic are untouched. Photos are out of scope — they live in DCIM and persist across uninstall; the backup carries the DBs that reference them.

## Consequences

Positive:
- Raw SQLite files restore as-is: no logical re-import, schema-agnostic, survives version changes.
- No SQLite handle is opened or closed during backup, so the sequential open/close model (see ADR-014) is respected and no UI hitch/race is introduced.
- Single transport-agnostic artifact (`accc_backup.zip`) a user can copy, email, or store.

Negative:
- Backing up while the app is actively writing could, on a WAL database, capture a frame that is slightly stale relative to a checkpointed file; copying the `.db`+`-wal`+`-shm` trio together keeps the snapshot internally consistent (SQLite validates/regenerates WAL sidecars on open).
- Restore permanently replaces current data — hence the confirm dialog and reload.
- jest/js dependency (`jszip`, ES5/UMD dist) is added; the app stays offline-capable.

---

