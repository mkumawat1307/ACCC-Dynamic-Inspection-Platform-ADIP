# ACCC Dynamic Inspection Platform (ADIP)

# Architecture Decision Records (ADR)

Version: 1.5

Last Updated: 2026-08-04

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

