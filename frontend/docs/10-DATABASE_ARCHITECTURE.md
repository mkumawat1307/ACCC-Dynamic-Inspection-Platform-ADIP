# Database Architecture

## Overview

The app uses a **per-project database isolation** model with a **sequential open/close** connection strategy. Each project gets its own SQLite database file. The global database stores the project list and reference data only. **22 tables total: 4 global + 18 per project.**

This architecture was chosen to avoid confirmed expo-sqlite v16 Android bugs:
1. Dual connections cause the second handle to point at the first file.
2. Close+reopen corrupts the native handle before the next open completes.
3. `ATTACH DATABASE` DDL fails with `near ".": syntax error` on Android.

This architecture was chosen to avoid confirmed expo-sqlite v16 Android bugs:
1. Dual connections cause the second handle to point at the first file.
2. Close+reopen corrupts the native handle before the next open completes.
3. `ATTACH DATABASE` DDL fails with `near ".": syntax error` on Android.

## Database Files

```
documentDirectory/
  accc_global.db              # Global DB: Projects, Divisions, Districts, Blocks
  Projects/
    <ProjectName>/
      inspection.db           # Project DB: template, sections, fields, inspections, photos, devices
```

Photos are stored separately via the Storage Access Framework under `DCIM/ACCC Inspection/<District>_<ProjectName>/` (see `src/utils/storageManager.ts`); the SAF tree URI is cached in AsyncStorage per device and the project folder is created on demand. Existing legacy photo folders (project-name-only or old alphanumeric-stripped labels) are migrated lazily to the canonical folder on project open (see `src/utils/folderManager.ts`).

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
- **InspectionSections** — section definitions (11 default sections, IsDefault=1)
- **InspectionFields** — field definitions within sections
- **FieldOptions** — dropdown options for fields
- **RepeatableGroups** — repeatable section groups (Camera, Switch)
- **RepeatableGroupFields** — fields within repeatable groups

### Inspection Data
- **Inspections** — inspection records (one per inspection/pole)
- **InspectionValues** — dynamic field values
- **RepeatableRecords** — repeatable group instances
- **RepeatableValues** — repeatable field values

### Device Data
- **DeviceFieldDefinitions** — custom device type field definitions
- **DeviceOptions** — dropdown options for device fields
- **DeviceRecords** — generic device instance data per inspection (JSON `DeviceData`)
- **ProjectDeviceTypes** — enabled device types for this project

### Media
- **Cameras** — camera device records
- **Switches** — switch device records
- **Photos** — inspection photos (watermarked, stored via SAF)

### Dashboard
- **DashboardCards** — configurable dashboard stat cards per project (`UNIQUE(ProjectID, CardKey)`)

## Connection Model

The app uses a **sequential open/close model** with a single `SQLiteDatabase` handle.

- **Single handle**: Only one `SQLiteDatabase` handle is ever open at a time. `currentDbTarget` tracks which DB file is currently open (`"accc_global.db"` or a project path).
- **Global-only state**: When `activeProjectPath` is null, `getDatabase()` returns the global DB (`accc_global.db`).
- **Project-active state** (`setActiveProject`): `activeProjectPath` is set. The current DB is closed and the project DB is opened. `getDatabase()` returns the project DB.
- **Switching**: `ensureGlobalDb()` and `ensureProjectDb()` only close+reopen when the requested DB differs from `currentDbTarget`. No redundant switches.
- **`cleanPath()`**: Strips `file://` URI prefix before path comparison to avoid mismatches between `activeProjectPath` (which may include `file://`) and `currentDbTarget` (which never does).
- Project DBs use WAL journal mode. The global DB uses DELETE journal mode.
- PRAGMA configuration failures are caught silently — the database remains usable with SQLite defaults.
- `getInfoAsync` from expo-file-system is **not used** for SQLite `.db` files — it returns false negatives on Android. Project DB validation uses `SELECT COUNT(*) FROM sqlite_master` instead.

### Why NOT ATTACH DATABASE

An earlier approach used `ATTACH DATABASE 'Projects/<Name>/inspection.db' AS p` with a single connection. This was **rejected** because expo-sqlite v16 on Android throws `near ".": syntax error` when executing DDL with dot-qualified table names like `CREATE TABLE p.InspectionSections(...)`. ATTACH works for DML (SELECT/INSERT) but not schema creation.

### Why NOT Dual Connections

Opening two `SQLiteDatabase` handles simultaneously causes the second handle to be backed by the first file's native connection, causing "no such table" errors on project queries.

### Why NOT Close+Reopen

`closeAsync()` does not fully release the native handle before `openDatabaseAsync()` reopens, causing the same file-mixing bug.

### `db.ts` API

```typescript
// Returns the single open connection (points to accc_global.db or active project DB)
getDatabase(): Promise<SQLiteDatabase>
getGlobalDatabase(): Promise<SQLiteDatabase>  // WARNING: closes project DB, opens global DB

// Project DB open/close (sequential, single handle)
setActiveProject(dbPath: string): Promise<void>    // close current, open project DB
clearActiveProject(): Promise<void>                // close project DB, open global DB
getActiveProjectPath(): string | null
```

**Critical Rule**: During the inspection flow, NEVER call `getGlobalDatabase()` — it closes the project DB and reopens the global DB, corrupting the native handle. Project data is passed via navigation params + context to avoid DB switching mid-flow.

### `ProjectDBManager.ts`

```typescript
// Create a new project (folder + DB + seed data)
createProjectDb(projectName: string, dbPath: string, projectId: number): Promise<void>

// Clone an existing project (settings + inspection data)
cloneProjectDb(sourceDbPath: string, projectName: string, projectDbPath: string, newProjectId: number): Promise<void>

// Open an existing project DB
openProjectDb(dbPath: string, projectId: number): Promise<void>

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

// Project schema — plain table names, no prefix
createProjectSchema(): Promise<void>

// Migration for existing project DBs
migrateProjectSchema(projectId: number): Promise<void>

// Backward-compatible: auto-detects global vs project DB
createSchema(): Promise<void>
```

### `seed.ts`

```typescript
// Seeds global DB (7 Divisions + 41 Districts only)
seedGlobalDatabase(): Promise<void>

// Seeds project DB (template, sections, fields, options, devices, dashboard cards)
seedProjectDatabase(): Promise<void>

// Backward-compatible: seeds whatever DB is currently active
seedDatabase(): Promise<void>
```

## Startup Flow

1. `_layout.tsx` calls `initializeDatabase()`
2. `initializeDatabase()` calls `createGlobalSchema()` + `seedGlobalDatabase()` + `getGlobalDatabase()` (fresh handle, initializes singleton)
3. App shows project list (from global DB)
4. User taps "Open" → `openProject(item)` calls `openProjectDb(item.DBPath, item.ProjectID)` which runs `setActiveProject()` → `ensureProjectDb()`
5. All project queries use the active project DB handle directly (no `p.` prefix)
6. All global queries call `ensureGlobalDb()` which switches away from the project DB
7. User taps "Back" → `clearActiveProject()` runs `ensureGlobalDb()` (switches back to global DB)

## Project Creation Flow

1. User fills in project details on `projects/new.tsx`
2. `createProjectDb(name, dbPath, projectId)` creates:
   - Project folder
   - New SQLite DB with full schema
   - Seeds all default data (template, sections, fields, options, device options, dashboard cards)
3. `ProjectRepository.createProject(...)` stores project record in global DB with `DBPath`

## Project Deletion Flow

1. User confirms deletion on home screen
2. `closeProject()` clears active project if this one is open
3. `deleteProjectDb(dbPath)` deletes the project folder + DB file
4. `ProjectRepository.deleteProject(projectId)` removes record from global DB

## Project Cloning Flow

1. User confirms clone on home screen
2. `ProjectRepository.cloneProject(sourceId, newName)` creates global project record, returns new ID
3. `cloneProjectDb(sourcePath, name, newPath, newId)`:
   - Opens source project DB
   - Reads all settings tables (templates, sections, fields, options, device data, dashboard cards)
   - Reads all inspection data
   - Creates new project DB with full schema
   - Re-inserts settings data **atomically inside `withTransactionAsync`** (de-duplicating dashboard cards by CardKey, keeping the lowest CardID)
   - Re-inserts inspection data with remapped IDs (InspectionID, RecordID)
   - Updates DashboardCards ProjectID to new ID
   - Cleans up (rolls back) on failure
4. Opens the cloned project for editing

## Isolation Model

- Each project DB is fully standalone — no cross-DB joins.
- Project data is passed via navigation params + React Context to avoid switching databases during the inspection flow.
- Every repository method that touches project data uses `getDatabase()` (which returns the active project DB when one is set).
- Global repositories (Project, District) use `getGlobalDatabase()` which is only called outside the inspection flow.
- Foreign key constraints are enabled (`PRAGMA foreign_keys = ON`) on both DBs.

## Files Modified

| File | Change |
|---|---|
| `src/database/db.ts` | Sequential open/close model — single handle, `currentDbTarget`, `cleanPath()` |
| `src/database/schema.ts` | `createGlobalSchema()` creates global tables; `createProjectSchema()` creates project tables with plain names; `migrateProjectSchema()` for existing DBs |
| `src/database/seed.ts` | Split into `seedGlobalDatabase()` + `seedProjectDatabase()` |
| `src/database/DatabaseService.ts` | Only init global DB at startup |
| `src/database/index.ts` | Export new functions |
| `src/database/helpers/ProjectDBManager.ts` | Create/open/delete/clone project DBs (atomic `cloneProjectDb`) |
| `src/database/repositories/ProjectRepository.ts` | All queries use `getGlobalDatabase()` |
| `src/database/repositories/DistrictRepository.ts` | Queries global DB |
| `src/context/InspectionContext.tsx` | `openProject()`, `closeProject()`, `removeProject()` |
| `app/index.tsx` | Open project DB on "Open", delete folder on "Delete", clone flow |
| `app/projects/new.tsx` | Call `createProjectDb()` on create |
| `app/inspection/new.tsx` | Read project from `projectData` navigation param, never call `getGlobalDatabase()` |
| `app/projects/dashboard.tsx` | Read project from `projectData` navigation param |
| `src/components/inspection/GeneralInformation.tsx` | Removed `getProjectById()` fallback |
| `src/components/inspection/PhotoSection.tsx` | Photos watermarked and stored via SAF (`storageManager.ts`) |
