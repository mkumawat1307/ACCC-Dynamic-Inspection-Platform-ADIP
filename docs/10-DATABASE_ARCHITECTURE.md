# Database Architecture

## Overview

The app uses a **per-project database isolation** model. Each project gets its own SQLite database file, photos folder, and exports folder. The only shared (global) database stores the project list and reference data.

## Database Files

```
documentDirectory/
  accc_global.db              # Global DB: Projects list + Divisions/Districts
  Projects/
    <ProjectName>/
      inspection.db           # Project DB: template, sections, fields, inspections, photos, devices
      photos/                 # Project photos
      Download/Inspection/    # Watermarked copies
```

## Global Database (`accc_global.db`)

Tables:
- **Divisions** — reference data (shared lookup)
- **Districts** — reference data (shared lookup)
- **Blocks** — reference data (shared lookup)
- **Projects** — project list with `DBPath` pointing to project DB file

## Project Database (`inspection.db`)

Each project DB contains a full, self-contained schema:

### Template Engine
- **InspectionTemplates** — single default template record (IsDefault=1)
- **InspectionSections** — section definitions (10 default sections)
- **InspectionFields** — field definitions within sections
- **FieldOptions** — dropdown options for fields
- **RepeatableGroups** — repeatable section groups (Camera, Switch)
- **RepeatableGroupFields** — fields within repeatable groups

### Inspection Data
- **Inspections** — inspection records (one per pole)
- **InspectionValues** — dynamic field values
- **RepeatableRecords** — repeatable group instances
- **RepeatableValues** — repeatable field values

### Device Data
- **DeviceFieldDefinitions** — custom device type field definitions
- **DeviceOptions** — dropdown options for device fields
- **DeviceRecords** — device instance data per inspection
- **ProjectDeviceTypes** — enabled device types for this project

### Media
- **Cameras** — camera device records
- **Switches** — switch device records
- **Photos** — inspection photos

## Connection Model

The app uses a **single SQLite connection** that is opened once and never closed. Project databases are attached/detached using `ATTACH DATABASE`/`DETACH DATABASE` as needed.

- Only one `SQLiteDatabase` handle is ever open (pointing to `accc_global.db`).
- When no project is active: the global DB is the only database on the connection. All queries are unqualified.
- When a project is active (`setActiveProject`): `ATTACH DATABASE 'Projects/<Name>/inspection.db' AS p` attaches the project DB. Global table queries are unqualified (they resolve in `main` = global DB). Project table queries use the `p.` schema prefix (`p.InspectionTemplates`, `p.Inspections`, etc.).
- `clearActiveProject()` detaches the project DB.
- Project DBs use WAL journal mode (via `PRAGMA p.journal_mode = WAL`).
- `file://` URI prefixes are stripped before ATTACH (SQLite requires raw filesystem paths).

### `pSchema()` Helper

`schema.ts` exports a `pSchema(sql)` function that automatically adds `p.` prefix to all project table names in DDL strings. This avoids manually updating 15+ table definition files — `createProjectSchema()` calls `pSchema(createInspectionTemplatesTable)` etc. and all `CREATE TABLE p.InspectionTemplates (...)` statements work correctly.

### Why ATTACH Instead of Separate Connections

An earlier dual-connection approach (opening two `SQLiteDatabase` handles simultaneously) was attempted but failed due to an expo-sqlite Android bug: `openDatabaseAsync()` for a second file returns a handle backed by the first file's native connection, causing "no such table" errors on project queries.

The ATTACH approach avoids this entirely since there is only one native connection at any time.

### `db.ts`

```typescript
// Returns the single open connection (always points to accc_global.db)
getDatabase(): Promise<SQLiteDatabase>
getGlobalDatabase(): Promise<SQLiteDatabase>

// Project DB attachment (both work on the single connection)
setActiveProject(dbPath: string): Promise<void>    // ATTACH DATABASE '...' AS p
clearActiveProject(): Promise<void>                // DETACH DATABASE p
getActiveProjectPath(): string | null
getProjectDatabase(): Promise<SQLiteDatabase | null>
```

### `ProjectDBManager.ts`

```typescript
// Create a new project (folder + DB + seed data)
createProjectDb(projectName: string, dbPath: string): Promise<void>

// Open an existing project DB
openProjectDb(dbPath: string): Promise<void>

// Delete project folder
deleteProjectDb(dbPath: string): Promise<void>
deleteProjectFolder(projectName: string): Promise<void>

// Helpers
getProjectDbPath(projectName: string): string
getProjectFolderPath(projectName: string): string
listProjectFolders(): Promise<string[]>
```

### `schema.ts`

```typescript
// Global schema (Divisions, Districts, Blocks, Projects)
createGlobalSchema(): Promise<void>

// Project schema — auto-prefixes all project table names with p.
pSchema(sql: string): string
createProjectSchema(db: any): Promise<void>

// Backward-compatible: auto-detects global vs project DB
createSchema(): Promise<void>
```

### `seed.ts`

```typescript
// Seeds global DB (Divisions + Districts only)
seedGlobalDatabase(): Promise<void>

// Seeds project DB (template, sections, fields, options, devices)
seedProjectDatabase(): Promise<void>

// Backward-compatible: seeds whatever DB is currently active
seedDatabase(): Promise<void>
```

## Startup Flow

1. `_layout.tsx` calls `initializeDatabase()`
2. `initializeDatabase()` calls `createGlobalSchema()` + `seedGlobalDatabase()` + `getGlobalDatabase()` (fresh handle, initializes singleton)
3. App shows project list (from global DB)
4. User taps "Open" → `setActiveProject(dbPath)` runs `ATTACH DATABASE '...' AS p`
5. All project queries use `p.` prefix (e.g., `SELECT * FROM p.InspectionTemplates`)
6. All global queries are unqualified (resolve in `main` schema)
7. User taps "Back" → `clearActiveProject()` runs `DETACH DATABASE p`

## Project Creation Flow

1. User fills in project details on `projects/new.tsx`
2. `createProjectDb(name, dbPath)` creates:
   - Project folder
   - New SQLite DB with full schema (using `pSchema()` for all project tables)
   - Seeds all default data (template, sections, fields, options, devices)
3. `ProjectRepository.createProject(...)` stores project record in global DB with `DBPath`

## Project Deletion Flow

1. User confirms deletion on home screen
2. `closeProject()` clears active project if this one is open
3. `deleteProjectDb(dbPath)` deletes the project folder + DB file
4. `ProjectRepository.deleteProject(projectId)` removes record from global DB

## Files Modified

| File | Change |
|---|---|
| `src/database/db.ts` | Rewritten to single-connection ATTACH model; no more dual connections |
| `src/database/schema.ts` | `createGlobalSchema()` now creates tables in `global_db.` schema |
| `src/database/seed.ts` | Split into `seedGlobalDatabase()` + `seedProjectDatabase()` |
| `src/database/DatabaseService.ts` | Only init global DB at startup |
| `src/database/index.ts` | Export new functions |
| `src/database/helpers/ProjectDBManager.ts` | **NEW** — create/open/delete project DBs |
| `src/database/repositories/ProjectRepository.ts` | All queries now use `global_db.` prefix for global tables |
| `src/database/repositories/DistrictRepository.ts` | Queries `global_db.Districts` |
| `src/database/tables/divisions.table.ts` | `global_db.` prefix on CREATE TABLE |
| `src/database/tables/districts.table.ts` | `global_db.` prefix on CREATE TABLE + FK references |
| `src/database/tables/blocks.table.ts` | `global_db.` prefix on CREATE TABLE + FK references |
| `src/database/tables/projects.table.ts` | `global_db.` prefix on CREATE TABLE + FK references |
| `src/database/seeds/division.seed.ts` | `global_db.` prefix on table references |
| `src/models/Project.ts` | Replace `TemplateID` with `DBPath` |
| `src/context/InspectionContext.tsx` | Add `openProject()`, `closeProject()`, `removeProject()` |
| `src/components/inspection/PhotoSection.tsx` | Photos stored in project folder |
| `app/index.tsx` | Open project DB on "Open", delete folder on "Delete" |
| `app/projects/new.tsx` | Call `createProjectDb()` on create |
| `app/inspection/new.tsx` | Remove `templateId` fallback logic |
| `app/settings/sections.tsx` | Remove `TemplateSyncHelper` calls |
| `app/settings/fields.tsx` | Remove `TemplateSyncHelper` calls |
| `app/settings/options.tsx` | Remove `TemplateSyncHelper` import |
| `app/settings/device-types.tsx` | Remove `TemplateSyncHelper` calls + cloned template sync |
| `app/settings/device-options.tsx` | Remove `TemplateSyncHelper` calls + cloned template sync |
| `src/database/repositories/SmartCardGenerator.ts` | **NEW** — auto-creates Total + Today dashboard cards from inspection form field selection, classified into a `CardMode` (entitycount/dropdown/sum/fieldcount/datebreakdown) |
| `src/components/dashboard/DashboardCardManager.tsx` | **NEW** — Smart Add Card flow (picker-only; smart cards are non-editable) |
