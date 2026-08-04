# ADIP Database Layer — Complete Structured Report

Source root: `D:\AI\Projects\ACCC inspection\frontend` (React Native / Expo / expo-sqlite)
Scope: `src/database/`, `__mocks__/expo-sqlite.ts`, `__mocks__/expo-file-system.ts`
Research only — no project files modified.

## Table of Contents
1. Connection model (`src/database/db.ts`)
2. Schema (`src/database/schema.ts`) — complete DDL, global + project tables
3. Seed data (`src/database/seed.ts` + `seeds/`)
4. Repository inventory (`src/database/repositories/`)
5. Helpers (`src/database/helpers/ProjectDBManager.ts`)
6. Table definition files (`src/database/tables/`)
7. Test mocks (`__mocks__/expo-sqlite.ts`, `__mocks__/expo-file-system.ts`)

Supporting files:
- `src/database/index.ts` (5 lines) — re-exports `./db`, `./DatabaseService`, `./seed`, `./schema`.
- `src/database/constants/database.ts` (3 lines) — `DATABASE_NAME = "accc_pole_inspection.db"`, `DATABASE_VERSION = 1` (legacy constants; not used by `db.ts` connection manager).

---

## 1. Connection model (`src/database/db.ts`)

File: `frontend\src\database\db.ts` (119 lines). Imports `expo-sqlite` and `expo-file-system/legacy`.

### Design rationale (sequential open/close — Android expo-sqlite)
expo-sqlite v16 on Android cannot safely hold two `SQLiteDatabase` handles at once
(second handle silently points at the first file) and `closeAsync()` does not fully
release the native handle before a reopen. The app therefore keeps exactly ONE module-level
handle (`database`, line 9) plus a string identity of what it points to (`currentDbTarget`,
line 11). Any switch closes the old handle first (`closeCurrentDb`) then opens the new one.
This is the "only safe pattern" per AGENTS.md / ADR-014 (`docs/09-Decisions.md`).

### Module-level state
| Variable | Type | Line | Purpose |
|---|---|---|---|
| `GLOBAL_DATABASE_NAME` | `string` | 7 | `"accc_global.db"` |
| `database` | `SQLiteDatabase \| null` | 9 | the single active handle |
| `activeProjectPath` | `string \| null` | 10 | currently active project DB path |
| `currentDbTarget` | `string \| null` | 11 | identity of the DB currently open (global name or cleaned project path) |

### Type export
- `export type SqlValue = string | number | null | boolean;` (line 5)

### Internal (non-exported) helpers
- `cleanPath(dbPath: string): string` (lines 13–15) — `dbPath.replace(/^file:\/\//, "")`; strips a leading `file://` so the same physical file is always identified the same way.
- `closeCurrentDb(): Promise<void>` (lines 17–27) — if no handle, returns; snapshots `old`, nulls `database` and `currentDbTarget`, then awaits `old.closeAsync()` inside try/catch (close failure logged non-fatally).
- `ensureGlobalDb(): Promise<SQLite.SQLiteDatabase>` (lines 29–49) — short-circuits if `currentDbTarget === GLOBAL_DATABASE_NAME && database`; logs a WARN with stack when `activeProjectPath` is set (line 34); otherwise `closeCurrentDb()` then `SQLite.openDatabaseAsync(GLOBAL_DATABASE_NAME)`; sets `currentDbTarget`; applies `PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;` (failures non-fatal).
- `migrateLegacyProjectDb(dbPath: string): Promise<void>` (lines 51–71) — legacy one-time migration: computes the legacy directory under `SQLite.defaultDatabaseDirectory`, lists entries, moves any `inspection.db` / `inspection.db-*` file into the project folder; best-effort (errors logged, skipped).
- `ensureProjectDb(dbPath: string): Promise<SQLite.SQLiteDatabase>` (lines 73–90) — `cleanPath`; short-circuits if `currentDbTarget === cp && database`; otherwise `closeCurrentDb()`, `migrateLegacyProjectDb(cp)`, `SQLite.openDatabaseAsync(cp, undefined, "")`, sets `currentDbTarget`; PRAGMAs `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL` (failures non-fatal).

### Exported functions (complete)
| Function | Signature | Lines | Purpose |
|---|---|---|---|
| `getGlobalDatabase` | `(): Promise<SQLite.SQLiteDatabase>` | 92–95 | Opens/returns the global DB handle via `ensureGlobalDb()`; logs call stack. |
| `setActiveProject` | `(dbPath: string): Promise<void>` | 97–101 | Records `activeProjectPath` and opens the project DB. |
| `clearActiveProject` | `(): Promise<void>` | 103–107 | Clears `activeProjectPath` and re-opens the global DB. |
| `getActiveProjectPath` | `(): string \| null` | 109–111 | Returns the current active project path. |
| `getDatabase` | `(): Promise<SQLite.SQLiteDatabase>` | 113–118 | Returns the project handle if `activeProjectPath` is set, otherwise the global handle. |

### Handle lifecycle & warnings
- Never call `getGlobalDatabase()` during the inspection flow (AGENTS.md): it closes the project handle and reopens global, corrupting the native handle. `ensureGlobalDb()` logs a WARN (with stack) when asked to switch while `activeProjectPath` is set (line 34).
- Project data is passed via navigation params + `InspectionContext` to avoid mid-flow DB switching.

---

## 2. Schema (`src/database/schema.ts`)

File: `frontend\src\database\schema.ts` (347 lines). Imported table DDL lives in `src/database/tables/` (see §6); three tables (`Projects`, `DeviceOptions`, `DeviceFieldDefinitions`, `ProjectDeviceTypes`) are inlined here.

### Entry points
| Export | Signature | Lines | Behavior |
|---|---|---|---|
| `createGlobalSchema` | `async (): Promise<void>` | 28–98 | Uses `getGlobalDatabase()`; creates Divisions, Districts, Blocks, Projects + column migrations. |
| `createProjectSchema` | `async (): Promise<void>` | 100–197 | Uses `getDatabase()` (project handle); creates all project tables. |
| `migrateProjectSchema` | `async (projectId: number): Promise<void>` | 199–325 | Idempotent per-project migrations (remarks split, DashboardCards columns/backfill). |
| `createSchema` | `async (): Promise<void>` | 327–347 | Detector: queries `sqlite_master`; if `Divisions` exists → global schema, else project schema. |

### createGlobalSchema() — tables (complete)
Global DB: `accc_global.db`.

#### Divisions (from `tables/divisions.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| DivisionID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| DivisionName | TEXT | NOT NULL, UNIQUE |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### Districts (from `tables/districts.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| DistrictID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| DivisionID | INTEGER | NOT NULL, FK → Divisions(DivisionID) |
| DistrictName | TEXT | NOT NULL |
| DistrictCode | TEXT | — |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### Blocks (from `tables/blocks.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| BlockID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| DistrictID | INTEGER | NULL, FK → Districts(DistrictID) ON DELETE CASCADE ON UPDATE CASCADE |
| BlockName | TEXT | NOT NULL |
| BlockCode | TEXT | — |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### Projects (inline DDL, schema.ts lines 47–62)
| Column | Type | Constraints |
|---|---|---|
| ProjectID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ProjectName | TEXT | NOT NULL |
| DistrictID | INTEGER | NOT NULL, FK → Districts(DistrictID) |
| Block | TEXT | — |
| Client | TEXT | — |
| Description | TEXT | — |
| InspectorName | TEXT | — |
| DBPath | TEXT | (added by migration, lines 66–71) |
| SAFPath | TEXT | (added by migration, lines 74–79) |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

### Global-schema migrations (idempotent ALTER TABLE via try/catch)
- `ALTER TABLE Projects ADD COLUMN DBPath TEXT` (lines 66–71)
- `ALTER TABLE Projects ADD COLUMN SAFPath TEXT` (lines 74–79)
- `ALTER TABLE Divisions ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1` (lines 82–87)
- `ALTER TABLE Districts ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1` (lines 90–95)
### createProjectSchema() — tables (complete)
Project DB: `Projects/<Name>/inspection.db`. Tables created (in order, lines 106–194).

#### InspectionTemplates (from `tables/inspection-templates.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| TemplateID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| TemplateName | TEXT | NOT NULL, UNIQUE |
| Description | TEXT | — |
| Version | INTEGER | NOT NULL DEFAULT 1 |
| IsDefault | INTEGER | NOT NULL DEFAULT 0 |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### InspectionSections (from `tables/inspection-sections.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| SectionID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| TemplateID | INTEGER | NOT NULL, FK → InspectionTemplates(TemplateID) ON DELETE CASCADE ON UPDATE CASCADE |
| SectionName | TEXT | NOT NULL |
| SectionKey | TEXT | NOT NULL |
| Description | TEXT | — |
| Icon | TEXT | — |
| DisplayOrder | INTEGER | NOT NULL |
| IsRepeatable | INTEGER | NOT NULL DEFAULT 0 |
| IsVisible | INTEGER | NOT NULL DEFAULT 1 |
| IsDefault | INTEGER | NOT NULL DEFAULT 0 |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### InspectionFields (from `tables/inspection-fields.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| FieldID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| SectionID | INTEGER | NOT NULL, FK → InspectionSections(SectionID) ON DELETE CASCADE |
| FieldName | TEXT | NOT NULL |
| FieldKey | TEXT | NOT NULL |
| FieldType | TEXT | NOT NULL |
| Placeholder | TEXT | — |
| DefaultValue | TEXT | — |
| HelpText | TEXT | — |
| ValidationRule | TEXT | — |
| DisplayOrder | INTEGER | NOT NULL |
| IsRequired | INTEGER | NOT NULL DEFAULT 0 |
| IsVisible | INTEGER | NOT NULL DEFAULT 1 |
| IsReadOnly | INTEGER | NOT NULL DEFAULT 0 |
| IsSystemField | INTEGER | NOT NULL DEFAULT 0 |
| DataSourceType | TEXT | — |
| DataSource | TEXT | — |
| ParentFieldID | INTEGER | FK → InspectionFields(FieldID) ON DELETE SET NULL |
| Width | INTEGER | DEFAULT 12 |
| Icon | TEXT | — |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### FieldOptions (from `tables/field-options.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| OptionID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| FieldID | INTEGER | NOT NULL, FK → InspectionFields(FieldID) ON DELETE CASCADE |
| OptionLabel | TEXT | NOT NULL |
| OptionValue | TEXT | NOT NULL |
| DisplayOrder | INTEGER | NOT NULL DEFAULT 1 |
| IsDefault | INTEGER | NOT NULL DEFAULT 0 |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### RepeatableGroups (from `tables/repeatable-groups.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| GroupID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| TemplateID | INTEGER | NOT NULL, FK → InspectionTemplates(TemplateID) ON DELETE CASCADE |
| SectionID | INTEGER | NOT NULL, FK → InspectionSections(SectionID) ON DELETE CASCADE |
| GroupName | TEXT | NOT NULL |
| DisplayName | TEXT | NOT NULL |
| Description | TEXT | — |
| CountFieldKey | TEXT | NOT NULL |
| MinCount | INTEGER | NOT NULL DEFAULT 0 |
| MaxCount | INTEGER | — |
| DisplayOrder | INTEGER | NOT NULL DEFAULT 0 |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### RepeatableGroupFields (from `tables/repeatable-group-fields.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| GroupFieldID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| GroupID | INTEGER | NOT NULL, FK → RepeatableGroups(GroupID) ON DELETE CASCADE |
| FieldName | TEXT | NOT NULL |
| FieldKey | TEXT | NOT NULL |
| FieldType | TEXT | NOT NULL |
| Placeholder | TEXT | — |
| DefaultValue | TEXT | — |
| HelpText | TEXT | — |
| ValidationRule | TEXT | — |
| DisplayOrder | INTEGER | NOT NULL |
| IsRequired | INTEGER | NOT NULL DEFAULT 0 |
| IsVisible | INTEGER | NOT NULL DEFAULT 1 |
| IsReadOnly | INTEGER | NOT NULL DEFAULT 0 |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### Inspections (from `tables/inspections.table.ts`) — note: NO FK on ProjectID (per-project DB)
| Column | Type | Constraints |
|---|---|---|
| InspectionID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ProjectID | INTEGER | NOT NULL |
| DistrictID | INTEGER | — |
| PoleID | TEXT | NOT NULL |
| Latitude | REAL | — |
| Longitude | REAL | — |
| InspectionDate | TEXT | NOT NULL |
| Status | TEXT | NOT NULL DEFAULT 'Draft' |
| InspectorName | TEXT | — |
| Remarks | TEXT | — |
| SyncStatus | INTEGER | DEFAULT 0 |
| SectionsSnapshot | TEXT | — |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### InspectionValues (from `tables/inspection-values.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| ValueID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| InspectionID | INTEGER | NOT NULL, FK → Inspections(InspectionID) ON DELETE CASCADE |
| FieldID | INTEGER | NOT NULL, FK → InspectionFields(FieldID) ON DELETE CASCADE |
| FieldValue | TEXT | — |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### RepeatableRecords (from `tables/repeatable-records.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| RecordID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| InspectionID | INTEGER | NOT NULL, FK → Inspections(InspectionID) ON DELETE CASCADE |
| GroupID | INTEGER | NOT NULL, FK → RepeatableGroups(GroupID) ON DELETE CASCADE |
| RecordIndex | INTEGER | NOT NULL |
| RecordTitle | TEXT | — |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | (InspectionID, GroupID, RecordIndex) | table constraint |

#### RepeatableValues (from `tables/repeatable-values.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| ValueID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| RecordID | INTEGER | NOT NULL, FK → RepeatableRecords(RecordID) ON DELETE CASCADE |
| GroupFieldID | INTEGER | NOT NULL, FK → RepeatableGroupFields(GroupFieldID) ON DELETE CASCADE |
| FieldValue | TEXT | — |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | (RecordID, GroupFieldID) | table constraint |

#### Cameras (from `tables/cameras.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| CameraID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| InspectionID | INTEGER | NOT NULL, FK → Inspections(InspectionID) ON DELETE CASCADE |
| CameraNo | INTEGER | NOT NULL |
| CameraType | TEXT | — |
| CameraStatus | TEXT | — |
| CameraMake | TEXT | — |
| CameraModel | TEXT | — |
| CameraIP | TEXT | — |
| CameraSerialNumber | TEXT | — |
| CameraSI | TEXT | — |
| SDCardCapacity | TEXT | — |
| SDCardStatus | TEXT | — |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### Switches (from `tables/switches.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| SwitchID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| InspectionID | INTEGER | NOT NULL, FK → Inspections(InspectionID) ON DELETE CASCADE |
| SwitchNo | INTEGER | NOT NULL |
| SwitchType | TEXT | — |
| SwitchStatus | TEXT | — |
| SwitchMake | TEXT | — |
| SwitchModel | TEXT | — |
| SwitchIP | TEXT | — |
| SwitchSerialNumber | TEXT | — |
| SwitchSI | TEXT | — |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### Photos (from `tables/photos.table.ts`) — note: no UpdatedAt column
| Column | Type | Constraints |
|---|---|---|
| PhotoID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| InspectionID | INTEGER | NOT NULL, FK → Inspections(InspectionID) ON DELETE CASCADE |
| PhotoType | TEXT | — |
| FileName | TEXT | NOT NULL |
| FilePath | TEXT | NOT NULL |
| Latitude | REAL | — |
| Longitude | REAL | — |
| CapturedAt | TEXT | — |
| Remarks | TEXT | — |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### DeviceOptions (inline DDL, schema.ts lines 146–159)
| Column | Type | Constraints |
|---|---|---|
| OptionID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| TemplateID | INTEGER | NOT NULL DEFAULT 1 |
| DeviceType | TEXT | NOT NULL |
| FieldName | TEXT | NOT NULL |
| OptionLabel | TEXT | NOT NULL |
| OptionValue | TEXT | NOT NULL |
| DisplayOrder | INTEGER | NOT NULL DEFAULT 1 |
| IsActive | INTEGER | NOT NULL DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### DeviceFieldDefinitions (inline DDL, schema.ts lines 162–177)
| Column | Type | Constraints |
|---|---|---|
| FieldDefID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| TemplateID | INTEGER | NOT NULL DEFAULT 1 |
| DeviceType | TEXT | NOT NULL |
| FieldName | TEXT | NOT NULL |
| Label | TEXT | NOT NULL |
| FieldType | TEXT | NOT NULL DEFAULT 'text' |
| IsRequired | INTEGER | DEFAULT 0 |
| DisplayOrder | INTEGER | NOT NULL DEFAULT 0 |
| IsActive | INTEGER | DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | (TemplateID, DeviceType, FieldName) | table constraint |

#### DeviceRecords (from `tables/device-records.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| RecordID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| InspectionID | INTEGER | NOT NULL, FK → Inspections(InspectionID) ON DELETE CASCADE |
| DeviceType | TEXT | NOT NULL |
| DeviceLabel | TEXT | — |
| DeviceNo | INTEGER | NOT NULL DEFAULT 1 |
| DeviceData | TEXT | — |
| DisplayOrder | INTEGER | DEFAULT 0 |
| IsActive | INTEGER | DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |

#### ProjectDeviceTypes (inline DDL, schema.ts lines 183–191)
| Column | Type | Constraints |
|---|---|---|
| ID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| DeviceType | TEXT | NOT NULL |
| IsActive | INTEGER | DEFAULT 1 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | (DeviceType) | table constraint |

#### DashboardCards (from `tables/dashboard-cards.table.ts`)
| Column | Type | Constraints |
|---|---|---|
| CardID | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ProjectID | INTEGER | NOT NULL |
| CardKey | TEXT | NOT NULL |
| Title | TEXT | NOT NULL |
| Icon | TEXT | NOT NULL DEFAULT 'chart-box-outline' |
| Color | TEXT | NOT NULL DEFAULT '#0B5ED7' |
| EntityType | TEXT | NOT NULL |
| CounterType | TEXT | NOT NULL DEFAULT 'total' |
| FilterJson | TEXT | — |
| CountMode | TEXT | NOT NULL DEFAULT 'count' |
| DistinctColumn | TEXT | — |
| BreakdownField | TEXT | — |
| SectionLabel | TEXT | — |
| AggregateField | TEXT | — |
| DeviceType | TEXT | — |
| CardMode | TEXT | NOT NULL DEFAULT 'entitycount' |
| SortOrder | INTEGER | NOT NULL DEFAULT 0 |
| Enabled | INTEGER | NOT NULL DEFAULT 1 |
| IsDefault | INTEGER | NOT NULL DEFAULT 0 |
| CreatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UpdatedAt | TEXT | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | (ProjectID, CardKey) | table constraint |

### migrateProjectSchema(projectId: number) — steps (lines 199–325)
1. **Remarks section split**: if `SectionKey = 'remarks'` missing, clones a "Remarks" section (Icon `note-text`, DisplayOrder = categorization+1, IsDefault=1) and reassigns the `remarks` field from the `categorization` section to it; renames categorization section to "Categorization" (lines 204–234).
2. **Ensure DashboardCards table** exists (lines 236–240).
3. **Repair ProjectID**: `UPDATE DashboardCards SET ProjectID = ?` (lines 242–246).
4. **ensureDefaultCards(projectId)** (lines 248–252).
5. **Column migrations** (each ALTER TABLE in try/catch):
   - `ADD COLUMN BreakdownField TEXT` (255–259)
   - `ADD COLUMN SectionLabel TEXT` (261–266)
   - `ADD COLUMN AggregateField TEXT` (268–273)
   - `ADD COLUMN DeviceType TEXT` (275–280)
   - `ADD COLUMN CardMode TEXT NOT NULL DEFAULT 'entitycount'` (282–287)
6. **CardMode backfill** (lines 289–310): existing `entitycount` cards with an AggregateField become `sum`; cards with a BreakdownField get mode inferred from the field type (date/date_auto → `datebreakdown`, dropdown/switch/checkbox → `dropdown`, text/multiline → `fieldcount`, else `entitycount`).
7. **migrateDefaultCards(projectId)** (lines 312–316) and **migrateDeviceCards(projectId)** (lines 318–322) via DashboardCardRepository (see §4).
---

## 3. Seed data (`src/database/seed.ts` + `seeds/`)

### Orchestrator: `src/database/seed.ts` (53 lines)
| Export | Signature | Lines | What it seeds |
|---|---|---|---|
| `seedGlobalDatabase` | `async (): Promise<void>` | 16–26 | `getGlobalDatabase()` then `seedDivisions()` only. |
| `seedProjectDatabase` | `async (): Promise<void>` | 28–40 | `getDatabase()` then template, sections, fields, field options, repeatable groups, repeatable group fields, device options, device field definitions. |
| `seedDatabase` | `async (): Promise<void>` | 42–52 | Same 8 project modules as above (legacy entry point, no explicit DB switch). |

### `IsDefault` flag semantics
- `InspectionSections.IsDefault = 1` → sections that appear in inspection forms; `0` → admin-only custom sections.
- `InspectionTemplates.IsDefault = 1` → the default template used by all seeds (looked up via `WHERE IsDefault = 1`).
- `FieldOptions.IsDefault` → default-selected option for a field.
- `DashboardCards.IsDefault` → seeded default cards (vs. user-created smart cards which get `0`).

### Seed modules (in `src/database/seeds/`)
| File | Export | Produces |
|---|---|---|
| `division.seed.ts` | `seedDivisions()` | 7 Divisions + 41 Districts in the GLOBAL DB. Divisions: Ajmer (6), Bharatpur (5), Bikaner (4), Jaipur (7), Jodhpur (8), Kota (4), Udaipur (7). Skips if Divisions non-empty (lines 21–25). |
| `inspection-template.seed.ts` | `seedInspectionTemplate()` | 1 template: `"ACCC Dynamic Inspection Platform"`, IsDefault=1 (lines 23–41). Skips if any template exists. |
| `inspection-sections.seed.ts` | `seedInspectionSections()` | 11 sections on the default template: `general_information`, `pole_structure`, `junction_box`, `earthing`, `meter`, `connectivity`, `camera_information` (IsRepeatable=1), `switch_information` (IsRepeatable=1), `categorization`, `remarks`, `photos`. DisplayOrder 1..11, IsVisible/IsDefault/IsActive=1 (lines 34–149). |
| `pole-inspection-data.ts` | `poleInspectionFields` (const array) | 29 field descriptor objects (SectionKey, FieldName, FieldKey, FieldType, etc.). Types seen: `DATE_AUTO`, `text`, `dropdown`, `multiline`, `GPS`, `number`. |
| `inspection-fields.seed.ts` | `seedInspectionFields()` | Migrates `camera_count`/`switch_count` from `dropdown`→`number` (lines 13–16), then inserts the 29 fields from `pole-inspection-data.ts`, resolving SectionID via SectionKey. Skips if any field exists (lines 18–26). |
| `field-options.data.ts` | `fieldOptions: FieldOptionSeed[]` | 69 option rows across 17 FieldKeys: foundation_cond (4), pole_avail (2), pole_si (5), pole_status (6), jb_status (3), power_cable (3), cable_status (4), earthing_wire (6), earthing_chamber (5), earthing_cover (5), meter_box_status (3), meter_status (2), meter_power_status (2), connectivity_type (4), camera_count (6), switch_count (6), pole_category (3). |
| `field-options.seed.ts` | `seedFieldOptions()` | Resolves each FieldKey → FieldID and inserts into FieldOptions inside a transaction. Skips if FieldOptions non-empty (lines 12–20). |
| `repeatable-groups.seed.ts` | `seedRepeatableGroups()` | 2 groups: Camera (countFieldKey `camera_count`) and Switch (`switch_count`), linked to the camera/switch sections on the default template. Skips if non-empty. |
| `repeatable-group-fields.seed.ts` | `seedRepeatableGroupFields()` | 20 fields: Camera 11 (camera_make, camera_type, camera_model, camera_serial_number, camera_status, camera_live_status, camera_ip, camera_mac, camera_sd_card yesno, camera_sd_capacity, camera_remarks) + Switch 9 (switch_make, switch_model, switch_serial_number, switch_status, switch_ports, switch_ip, switch_mac, switch_power_status, switch_remarks). |
| `device-options.seed.ts` | `seedDeviceOptions()` | 43 rows for DeviceType Camera (26) and Switch (17): CameraType(3), CameraStatus(6), CameraMake(5), CameraSI(5), SDCardCapacity(4), SDCardStatus(3), SwitchType(2), SwitchStatus(6), SwitchMake(4), SwitchSI(5). Inserted in a transaction. |
| `device-field-definitions.seed.ts` | `seedDeviceFieldDefinitions()` | 16 rows: Camera 9 (CameraType, CameraStatus, CameraMake, CameraModel, CameraIP, CameraSerialNumber, CameraSI, SDCardCapacity, SDCardStatus) + Switch 7 (SwitchType, SwitchStatus, SwitchMake, SwitchModel, SwitchIP, SwitchSerialNumber, SwitchSI). |
| `dashboard-cards.seed.ts` | `seedDashboardCards(projectId: number)` | Seeds missing default cards per project. Exports `DEFAULT_DASHBOARD_CARDS` (6 legacy cards: total_inspections, total_poles, total_cameras, today_inspections_done, today_poles, today_cameras), `DEFAULT_SECTIONED_CARDS` (6 cards split into sections: total/today x inspection_done, pole_status (dropdown/BreakdownField pole_avail), camera_count (sum/AggregateField camera_count)), and constants `SECTION_LABEL_TOTAL = "Total Summary"`, `SECTION_LABEL_TODAY = "Today's Summary"`. |

### Dashboard card seed modes
- `CardModeValue` (from `src/models/DashboardCard.ts` line 1): `"entitycount" | "dropdown" | "sum" | "fieldcount" | "datebreakdown"`.
- `DEFAULT_SECTIONED_CARDS` use `entitycount` (filtered), `dropdown` (BreakdownField `pole_avail`) and `sum` (AggregateField `camera_count`).

---

## 5. Helpers (`src/database/helpers/ProjectDBManager.ts`)

File: `frontend\src\database\helpers\ProjectDBManager.ts` (301 lines). Constants:
- `PROJECTS_FOLDER = "Projects"` (line 21)
- `SETTINGS_TABLES` (lines 23–34): InspectionTemplates, InspectionSections, InspectionFields, FieldOptions, RepeatableGroups, RepeatableGroupFields, DeviceOptions, DeviceFieldDefinitions, ProjectDeviceTypes, DashboardCards
- `INSPECTION_DATA_TABLES` (lines 36–44): InspectionValues, RepeatableRecords, RepeatableValues, Cameras, Switches, Photos, DeviceRecords
- `DATA_TABLE_ID_COLUMNS` (lines 46–54): maps each data table to its PK column for ID remapping during clone.

| Function | Signature | Lines | Behavior |
|---|---|---|---|
| `getProjectDbPath` | `(projectName: string): string` | 62–65 | Sanitizes name (`replace(/[<>:"/\\|?*]/g, "_")`) → `documentDirectory + "Projects/<safeName>/inspection.db"`. |
| `getProjectFolderPath` | `(projectName: string): string` | 67–70 | Same sanitization → `Projects/<safeName>/`. |
| `createProjectDb` | `(projectName: string, projectDbPath: string, projectId: number): Promise<void>` | 72–99 | mkdir folder, `setActiveProject`, `createProjectSchema()`, then all seeds (template, sections, fields, field options, repeatable groups + group fields, device options, device field definitions) + `seedDashboardCards(projectId)`, then `clearActiveProject`. |
| `cloneProjectDb` | `(sourceDbPath: string, projectName: string, projectDbPath: string, newProjectId: number): Promise<void>` | 101–242 | **Atomic clone** inside `withTransactionAsync`. Phase 1 (source): `setActiveProject(sourceDbPath)`, SELECT * of all SETTINGS_TABLES, all Inspections, and all INSPECTION_DATA_TABLES; `clearActiveProject` in finally. Phase 2 (target): `setActiveProject(projectDbPath)`, create schema, DELETE all clone tables, dedupe DashboardCards by CardKey (keeps lowest CardID, lines 158–168), INSERT settings rows, `UPDATE DashboardCards SET ProjectID = newProjectId` (line 187), re-insert Inspections remapping old→new InspectionID (inspectionIdMap, lines 189–204), then each data table remapping InspectionID (and RecordID for RepeatableValues via recordIdMap) (lines 206–235). `clearActiveProject` in finally. |
| `openProjectDb` | `(dbPath: string, projectId: number): Promise<void>` | 244–262 | `setActiveProject`; validates that `InspectionTemplates` exists (else throws `"Project database is empty or missing schema: ..."`); then `migrateProjectSchema(projectId)`. |
| `deleteProjectDb` | `(dbPath: string): Promise<void>` | 264–271 | Deletes the project folder (`dbPath` minus `inspection.db`). |
| `deleteProjectFolder` | `(projectName: string): Promise<void>` | 273–278 | Deletes the whole project folder by name. |
| `listProjectFolders` | `(): Promise<string[]>` | 280–301 | Ensures Projects base dir, reads it, returns non-dot-prefixed folder names. |

Note: `cloneProject` in `ProjectRepository` (global DB) only inserts a new Projects row; the file-level clone must be performed by `cloneProjectDb`.

---

## 6. Table definition files (`src/database/tables/`) — key constraints

All 18 files export a single `const` DDL string (`CREATE TABLE IF NOT EXISTS ...`):

| File | Table | Key constraints |
|---|---|---|
| `divisions.table.ts` | Divisions | PK DivisionID; UNIQUE(DivisionName) |
| `districts.table.ts` | Districts | FK DivisionID → Divisions(DivisionID) |
| `blocks.table.ts` | Blocks | FK DistrictID → Districts(DistrictID) ON DELETE CASCADE ON UPDATE CASCADE |
| `inspection-templates.table.ts` | InspectionTemplates | UNIQUE(TemplateName) |
| `inspection-sections.table.ts` | InspectionSections | FK TemplateID → InspectionTemplates ON DELETE CASCADE ON UPDATE CASCADE |
| `inspection-fields.table.ts` | InspectionFields | FK SectionID → InspectionSections ON DELETE CASCADE; FK ParentFieldID → InspectionFields ON DELETE SET NULL |
| `field-options.table.ts` | FieldOptions | FK FieldID → InspectionFields ON DELETE CASCADE |
| `repeatable-groups.table.ts` | RepeatableGroups | FK TemplateID → InspectionTemplates ON DELETE CASCADE; FK SectionID → InspectionSections ON DELETE CASCADE |
| `repeatable-group-fields.table.ts` | RepeatableGroupFields | FK GroupID → RepeatableGroups ON DELETE CASCADE |
| `inspections.table.ts` | Inspections | no FK (ProjectID is plain INTEGER) |
| `inspection-values.table.ts` | InspectionValues | FK InspectionID → Inspections ON DELETE CASCADE; FK FieldID → InspectionFields ON DELETE CASCADE |
| `repeatable-records.table.ts` | RepeatableRecords | FK InspectionID → Inspections ON DELETE CASCADE; FK GroupID → RepeatableGroups ON DELETE CASCADE; UNIQUE(InspectionID, GroupID, RecordIndex) |
| `repeatable-values.table.ts` | RepeatableValues | FK RecordID → RepeatableRecords ON DELETE CASCADE; FK GroupFieldID → RepeatableGroupFields ON DELETE CASCADE; UNIQUE(RecordID, GroupFieldID) |
| `cameras.table.ts` | Cameras | FK InspectionID → Inspections ON DELETE CASCADE |
| `switches.table.ts` | Switches | FK InspectionID → Inspections ON DELETE CASCADE |
| `photos.table.ts` | Photos | FK InspectionID → Inspections ON DELETE CASCADE |
| `device-records.table.ts` | DeviceRecords | FK InspectionID → Inspections ON DELETE CASCADE |
| `dashboard-cards.table.ts` | DashboardCards | **UNIQUE(ProjectID, CardKey)** |

Plus three inline tables in `schema.ts`: Projects (FK DistrictID → Districts), DeviceOptions, DeviceFieldDefinitions (UNIQUE(TemplateID, DeviceType, FieldName)), ProjectDeviceTypes (UNIQUE(DeviceType)).

---

## 7. Test mocks

### `__mocks__/expo-sqlite.ts` (261 lines)
- **In-memory, path-aware store**: `const databases = new Map<string, MockDatabase>()` (line 4). Each distinct DB name/path string gets its own `MockDatabase` (created lazily in `openDatabaseAsync`, lines 248–255). This is what enforces isolation — Project A and Project B DBs never share tables.
- **PRIMARY_KEYS map** (lines 6–29): known PK column per table used to auto-assign `lastInsertRowId` on INSERT (e.g. Inspections→InspectionID, DashboardCards→CardID, Divisions→DivisionID).
- **SQL parser** (regexes, lines 35–44): INSERT, SELECT, UPDATE, DELETE, PRAGMA, CREATE TABLE, ALTER TABLE, sqlite_master. `parseWhere` (lines 46–69) supports `col = ?`, `col = 'literal'`, `col = N` joined with AND. `parseColumnList` handles `alias AS name` and `table.col`.
- **MockDatabase** class (lines 96–244):
  - `execAsync` — no-op (DDL/PRAGMA silently ignored)
  - `runAsync(sql, params)` — INSERT (assigns PK, returns `{lastInsertRowId, changes}`), UPDATE (matches WHERE, supports `CURRENT_TIMESTAMP`), DELETE
  - `getAllAsync<T>(sql, params)` — SELECT from single table; supports WHERE, ORDER BY (single column ASC/DESC), LIMIT; `SELECT name FROM sqlite_master` returns created table names; projected columns; **no JOIN / GROUP BY / aggregate support** (unmatched SQL returns `[]`)
  - `getFirstAsync<T>` — first row of getAllAsync
  - `closeAsync` — no-op
  - `withTransactionAsync<T>(fn)` — just runs `fn()` (no real transaction)
- **Exports**: `defaultDatabaseDirectory = "/mock/sqlite"` (line 246), `openDatabaseAsync`, type alias `MockDatabase as SQLiteDatabase`, `__resetDbState()` (clears all DBs, lines 259–261).
- Test code must call `__resetDbState()` between tests and use distinct DB paths/names to maintain isolation (per AGENTS.md).

### `__mocks__/expo-file-system.ts` (57 lines)
- In-memory `files: Map<string, string>` keyed by file URI (line 1).
- `documentDirectory = "file:///mock/documents/"`, `cacheDirectory = "file:///mock/cache/"` (lines 6–7).
- `writeAsStringAsync` / `readAsStringAsync` backed by the map (read throws `File not found: ...` if absent).
- `getInfoAsync` always returns `{ exists: true, isDirectory: false, size: 100 }` (lines 33–37).
- `makeDirectoryAsync`, `deleteAsync` — no-ops.
- `getContentUriAsync(fileUri)` returns `"content://mock/" + stripped path`.
- `__resetFsState()` clears the file map (lines 55–57).
- Note: `ProjectDBManager` file operations (mkdir, list, delete folders) rely on this mock in Jest.
---

## 4. Repository inventory (`src/database/repositories/`)

20 files. All DB access routes through `getDatabase()` / `getGlobalDatabase()` from `../db` (never direct SQLite from UI). Grouped by domain.

### 4.1 Global DB / reference domain
**ProjectRepository** — `repositories/ProjectRepository.ts` (216 lines), class `ProjectRepository`
| Method | Signature | Purpose |
|---|---|---|
| `getProjects` | `static async (): Promise<Project[]>` | All projects joined with Divisions/Districts names, ORDER BY CreatedAt DESC. |
| `getProjectById` | `static async (projectId: number): Promise<Project \| null>` | Single project with division/district names. |
| `createProject` | `static async (data: { projectName; districtId; dbPath; safPath; block?; client?; description?; inspectorName? }): Promise<number>` | INSERT into Projects; returns new ProjectID. |
| `updateProject` | `static async (projectId: number, data: { projectName; districtId; block?; client?; description?; inspectorName? }): Promise<void>` | Dynamic UPDATE of provided fields + UpdatedAt. |
| `cloneProject` | `static async (sourceProjectId: number, newName: string): Promise<number>` | Inserts a new Projects row (new DBPath via getProjectDbPath); does NOT copy project DB files — caller must call `ProjectDBManager.cloneProjectDb`. |
| `deleteProject` | `static async (projectId: number): Promise<void>` | Deletes the Projects row only. |

**DistrictRepository** — `repositories/DistrictRepository.ts` (35 lines), class `DistrictRepository`
| Method | Signature | Purpose |
|---|---|---|
| `getAll` | `static async (): Promise<District[]>` | All districts ordered by DistrictName. |

### 4.2 Form configuration domain (project DB — templates/sections/fields/options)
**SectionRepository** — `repositories/SectionRepository.ts` (174 lines), class `SectionRepository` + `Section` interface
| Method | Signature | Purpose |
|---|---|---|
| `getByTemplate` | `static async (templateId: number): Promise<Section[]>` | Active sections for a template, ordered by DisplayOrder. |
| `getById` | `static async (id: number): Promise<Section \| null>` | One section by SectionID. |
| `create` | `static async (data: { TemplateID; SectionName; SectionKey; Description?; Icon?; DisplayOrder?; IsRepeatable?; IsVisible? }): Promise<number>` | Insert (IsActive=1); DisplayOrder defaults to max+1. |
| `update` | `static async (id: number, data: {...partial fields...}): Promise<void>` | Dynamic partial UPDATE + UpdatedAt. |
| `delete` | `static async (id: number): Promise<void>` | Soft delete (IsActive=0). |
| `hardDelete` | `static async (id: number): Promise<void>` | Physical DELETE row. |
| `reorder` | `static async (sections: { SectionID; DisplayOrder }[]): Promise<void>` | Transactional DisplayOrder rewrite. |
| `getFieldCount` | `static async (sectionId: number): Promise<number>` | Number of fields in a section. |
| `hasInspectionValues` | `static async (sectionId: number): Promise<boolean>` | True if any InspectionValue references a field in the section. |

**FieldRepository** — `repositories/FieldRepository.ts` (211 lines), class `FieldRepository` + `Field` interface + `FIELD_TYPES` const (text/number/multiline/dropdown/date/date_auto/time/GPS/checkbox)
| Method | Signature | Purpose |
|---|---|---|
| `getBySection` | `static async (sectionId: number): Promise<Field[]>` | Active fields in section, ordered. |
| `getById` | `static async (id: number): Promise<Field \| null>` | One field. |
| `create` | `static async (data: {...SectionID, FieldName, FieldKey, FieldType, optional others...}): Promise<number>` | Insert (IsActive=1); DisplayOrder defaults max+1; Width defaults 12. |
| `update` | `static async (id: number, data: {...partial...}): Promise<void>` | Dynamic partial UPDATE + UpdatedAt. |
| `delete` | `static async (id: number): Promise<void>` | Soft delete. |
| `hardDelete` | `static async (id: number): Promise<void>` | Physical DELETE. |
| `reorder` | `static async (fields: { FieldID; DisplayOrder }[]): Promise<void>` | Transactional reorder. |
| `hasValues` | `static async (fieldId: number): Promise<boolean>` | True if any InspectionValue exists for the field. |
| `keyExists` | `static async (key: string, excludeId?: number): Promise<boolean>` | FieldKey uniqueness check. |

**FieldOptionRepository** — `repositories/FieldOptionRepository.ts` (136 lines), class `FieldOptionRepository` + `FieldOption` interface
| Method | Signature | Purpose |
|---|---|---|
| `getByField` | `static async (fieldId: number): Promise<FieldOption[]>` | Active options for a field. |
| `getById` | `static async (id: number): Promise<FieldOption \| null>` | One option. |
| `create` | `static async (data: { FieldID; OptionLabel; OptionValue; DisplayOrder?; IsDefault? }): Promise<number>` | Insert (IsActive=1); DisplayOrder defaults max+1. |
| `update` | `static async (id: number, data: { OptionLabel?; OptionValue?; DisplayOrder?; IsDefault? }): Promise<void>` | Dynamic partial UPDATE. |
| `delete` | `static async (id: number): Promise<void>` | Soft delete. |
| `hardDelete` | `static async (id: number): Promise<void>` | Physical DELETE. |
| `reorder` | `static async (options: { OptionID; DisplayOrder }[]): Promise<void>` | Transactional reorder. |
| `deleteByField` | `static async (fieldId: number): Promise<void>` | Soft-deletes all options of a field. |
| `getByFieldKey` | `static async (fieldKey: string): Promise<FieldOption[]>` | Options resolved via join to InspectionFields by FieldKey. |

**InspectionFieldRepository** — `repositories/InspectionFieldRepository.ts` (107 lines), `export default class InspectionFieldRepository`
| Method | Signature | Purpose |
|---|---|---|
| `getInspectionValues` | `static async (inspectionId: number): Promise<Record<string, string>>` | FieldKey → FieldValue map for an inspection. |
| `getFieldsBySection` | `static async (sectionId: number): Promise<InspectionField[]>` | Active+visible fields of a section. |
| `getFieldById` | `static async (fieldId: number): Promise<InspectionField \| null>` | One field. |
| `getFieldOptions` | `static async (fieldId: number): Promise<FieldOption[]>` | All options of a field (no IsActive filter). |
| `getActiveTemplateFields` | `static async (): Promise<{ FieldKey; FieldName }[]>` | Fields of the default template (active section + field), ordered. |

**InspectionValueRepository** — `repositories/InspectionValueRepository.ts` (175 lines), `export default class InspectionValueRepository`
| Method | Signature | Purpose |
|---|---|---|
| `saveValue` | `static async (inspectionId: number, fieldId: number, value: string \| null): Promise<void>` | Upsert one value (guards against missing parent inspection/field). |
| `saveValues` | `static async (inspectionId: number, values: { fieldId; value }[]): Promise<void>` | Batch saveValue loop. |
| `getValue` | `static async (inspectionId: number, fieldId: number): Promise<InspectionValue \| null>` | One value row. |
| `getValuesByInspection` | `static async (inspectionId: number): Promise<InspectionValue[]>` | All values of an inspection ordered by FieldID. |
| `deleteByInspection` | `static async (inspectionId: number): Promise<void>` | DELETE all values of an inspection. |

### 4.3 Inspections domain (project DB)
**InspectionRepository** — `repositories/InspectionRepository.ts` (421 lines), class `InspectionRepository` (uses `InspectionTypes.ts` interfaces, `inspectionDataHelper.ts`, and `InspectionDataBus` from `@/src/utils/InspectionDataBus`)
| Method | Signature | Purpose |
|---|---|---|
| `getSections` | `static async (templateId?: number): Promise<InspectionSection[]>` | Active sections; photos/remarks pushed to end; defaults to default template. |
| `getAllSections` | `static async (templateId?: number): Promise<InspectionSection[]>` | Same query shape (no IsActive filter on IsVisible). |
| `getFieldsBySection` | `static async (sectionId: number): Promise<InspectionField[]>` | Active+visible fields of a section. |
| `getFieldsByKey` | `static async (sectionKey: string, templateId?: number): Promise<InspectionField[]>` | Fields by section key. |
| `createInspection` | `static async (projectId: number, districtId: number \| null, inspectionDate: string): Promise<number>` | Insert Draft inspection; emits InspectionDataBus change. |
| `saveFieldValue` | `static async (inspectionId: number, fieldId: number, value: string): Promise<void>` | Upsert value; emits change. |
| `updateInspectionPoleId` | `static async (inspectionId: number, poleId: string): Promise<void>` | Sets PoleID; emits change. |
| `getInspectionValues` | `static async (inspectionId: number): Promise<Record<string, string>>` | FieldKey→value map. |
| `validateInspection` | `static async (inspectionId: number): Promise<{ valid: boolean; missingFields: string[] }>` | Checks required fields (skips auto-filled date/division/district). |
| `updateInspectionStatus` | `static async (inspectionId: number, status: string): Promise<void>` | Sets Status; emits change. |
| `getInspectionByPoleId` | `static async (poleId: string): Promise<{ InspectionID; PoleID; Status } \| null>` | Case/trim-insensitive lookup, latest first. |
| `getInspectionPoleId` | `static async (inspectionId: number): Promise<string>` | PoleID of an inspection. |
| `getInspectionProjectId` | `static async (inspectionId: number): Promise<number \| null>` | ProjectID of an inspection. |
| `deleteInspection` | `static async (inspectionId: number): Promise<void>` | Transactional delete of all child data + row; emits change. |
| `deleteMultipleInspections` | `static async (inspectionIds: number[]): Promise<void>` | Transactional multi-delete; emits change. |

**InspectionListRepository** — `repositories/InspectionListRepository.ts` (73 lines), class `InspectionListRepository`
| Method | Signature | Purpose |
|---|---|---|
| `getByProject` | `static async (projectId: number): Promise<InspectionListItem[]>` | Inspection rows with Division/District/Block pulled from InspectionValues subqueries; sorted by parsed date DESC. |
| `filterByQuery` | `static (items: InspectionListItem[], query: string): InspectionListItem[]` | Client-side filter on PoleID/Division/District/Block. |

**inspectionDataHelper.ts** (7 lines) — `export async function deleteInspectionData(db: any, inspectionId: number)`: deletes Photos, Cameras, Switches, InspectionValues, then Inspections (used inside transactions).

**InspectionTypes.ts** (29 lines) — type-only: `InspectionSection` (SectionID, SectionName, SectionKey, DisplayOrder) and `InspectionField` (subset).

### 4.4 Photos / Cameras / Devices domain (project DB)
**PhotoRepository** — `repositories/PhotoRepository.ts` (103 lines), `export default class PhotoRepository`
| Method | Signature | Purpose |
|---|---|---|
| `getByInspection` | `static async (inspectionId: number): Promise<Photo[]>` | Photos of an inspection. |
| `create` | `static async (photo: Photo): Promise<number>` | Insert photo row. |
| `updateFilePath` | `static async (photoId: number, filePath: string): Promise<void>` | Update FilePath only. |
| `delete` | `static async (photoId: number): Promise<void>` | Delete one photo row. |
| `deleteByInspection` | `static async (inspectionId: number): Promise<void>` | Delete all photos of an inspection. |

**CameraRepository** — `repositories/CameraRepository.ts` (235 lines), `export default class CameraRepository`
| Method | Signature | Purpose |
|---|---|---|
| `getByInspection` | `static async (inspectionId: number): Promise<Camera[]>` | Cameras ordered by CameraNo. |
| `create` | `static async (camera: Camera): Promise<number>` | Insert camera. |
| `update` | `static async (camera: Camera): Promise<void>` | Update camera fields by CameraID. |
| `save` | `static async (camera: Camera): Promise<number>` | Update if CameraID present else create. |
| `delete` | `static async (cameraId: number): Promise<void>` | Delete one camera. |
| `deleteByInspection` | `static async (inspectionId: number): Promise<void>` | Delete all cameras of an inspection. |
| `saveMultiple` | `static async (inspectionId: number, cameras: Camera[]): Promise<void>` | Transactional replace-all (delete + insert with CameraNo 1..n). |

**DeviceRecordsRepository** — `repositories/DeviceRecordsRepository.ts` (111 lines), `export default new DeviceRecordsRepository()` — **instance methods on a singleton**, not static
| Method | Signature | Purpose |
|---|---|---|
| `getByInspection` | `async (inspectionId: number, deviceType: string): Promise<DeviceRecord[]>` | Active records of one type. |
| `getByInspectionAll` | `async (inspectionId: number): Promise<DeviceRecord[]>` | All active records of an inspection. |
| `create` | `async (record: DeviceRecord): Promise<number>` | Insert DeviceRecord. |
| `update` | `async (record: DeviceRecord): Promise<void>` | Update label/data. |
| `save` | `async (record: DeviceRecord): Promise<number>` | Update if RecordID else create. |
| `delete` | `async (id: number): Promise<void>` | Soft delete (IsActive=0). |
| `deleteByInspection` | `async (inspectionId: number, deviceType: string): Promise<void>` | Physical delete by inspection+type. |
| `saveMultiple` | `async (inspectionId: number, deviceType: string, records: DeviceRecord[]): Promise<void>` | Transactional replace-all for a device type. |

**DeviceOptionsRepository** — `repositories/DeviceOptionsRepository.ts` (185 lines), `export default new DeviceOptionsRepository()` — instance methods + `DEVICE_FIELDS` label map
| Method | Signature | Purpose |
|---|---|---|
| `getAll` | `async (deviceType: string, templateId?: number): Promise<DeviceOption[]>` | Options for a device type (optionally scoped to template). |
| `getByField` | `async (deviceType: string, fieldName: string, templateId?: number): Promise<DeviceOption[]>` | Options for one field. |
| `getDropdownData` | `async (deviceType: string, fieldName: string, templateId?: number): Promise<{ label; value }[]>` | Dropdown-ready array. |
| `add` | `async (option: DeviceOption, templateId?: number): Promise<number>` | Insert (TemplateID defaults to 1). |
| `update` | `async (option: DeviceOption): Promise<void>` | Update label/value/order. |
| `delete` | `async (id: number): Promise<void>` | Soft delete. |
| `moveUp` | `async (id: number): Promise<void>` | Swap DisplayOrder with previous active sibling. |
| `moveDown` | `async (id: number): Promise<void>` | Swap DisplayOrder with next active sibling. |
| `cloneAll` | `async (sourceTemplateId: number, targetTemplateId: number): Promise<void>` | Copy active options to another template. |

**DeviceFieldDefinitionsRepository** — `repositories/DeviceFieldDefinitionsRepository.ts` (175 lines), `export default new DeviceFieldDefinitionsRepository()` — instance methods
| Method | Signature | Purpose |
|---|---|---|
| `getByDeviceType` | `async (deviceType: string, templateId?: number): Promise<DeviceFieldDefinition[]>` | Field definitions for a device type. |
| `getAll` | `async (templateId?: number): Promise<DeviceFieldDefinition[]>` | All active definitions. |
| `getDeviceTypes` | `async (templateId?: number): Promise<string[]>` | Distinct active device types. |
| `add` | `async (field: DeviceFieldDefinition, templateId?: number): Promise<number>` | Insert (TemplateID defaults 1). |
| `update` | `async (field: DeviceFieldDefinition): Promise<void>` | Update label/type/required/order. |
| `delete` | `async (id: number): Promise<void>` | Soft delete. |
| `moveUp` | `async (id: number): Promise<void>` | Swap with previous sibling. |
| `moveDown` | `async (id: number): Promise<void>` | Swap with next sibling. |
| `cloneAll` | `async (sourceTemplateId: number, targetTemplateId: number): Promise<void>` | Copy active definitions to another template. |

### 4.5 Dashboard / statistics domain (project DB)
**DashboardCardRepository** — `repositories/DashboardCardRepository.ts` (429 lines), class `DashboardCardRepository` (uses `@/src/models/DashboardCard` `CardModeValue`)
| Method | Signature | Purpose |
|---|---|---|
| `getAllCards` | `static async (projectId: number): Promise<DashboardCard[]>` | All cards for a project, ordered SortOrder/CardID. |
| `getEnabledCards` | `static async (projectId: number): Promise<DashboardCard[]>` | Cards where Enabled=1. |
| `getCardById` | `static async (cardId: number): Promise<DashboardCard \| null>` | One card. |
| `createCard` | `static async (card: DashboardCard): Promise<number>` | Insert; auto SortOrder = max+1 when missing. |
| `updateCard` | `static async (card: DashboardCard): Promise<void>` | Update display/config fields. |
| `deleteCard` | `static async (cardId: number): Promise<void>` | Physical delete. |
| `setCardEnabled` | `static async (cardId: number, enabled: boolean): Promise<void>` | Toggle Enabled. |
| `reorderCards` | `static async (projectId: number, orderedIds: number[]): Promise<void>` | Transactional SortOrder rewrite. |
| `ensureDefaultCards` | `static async (projectId: number): Promise<void>` | Insert missing cards; picks legacy vs sectioned set by detecting legacy keys. |
| `migrateDefaultCards` | `static async (projectId: number): Promise<void>` | Backfills missing legacy default cards + normalizes their SortOrder/DistinctColumn. |
| `normalizeSections` | `static async (projectId: number): Promise<void>` | Re-ranks SortOrder so Total Summary → Today's → custom sections → null. |
| `resetDefaultCards` | `static async (projectId: number): Promise<void>` | Deletes all project cards and re-seeds DEFAULT_SECTIONED_CARDS, then normalizes. |
| `migrateDeviceCards` | `static async (projectId: number): Promise<void>` | Converts smart_dev_* keys → EntityType devices + DeviceType/BreakdownField; converts legacy camera cards; retitles Pole Availability; renames section labels Total→Total Summary and Today's→Today's Summary. |

**DashboardService** — `repositories/DashboardService.ts` (43 lines), class `DashboardService`
| Method | Signature | Purpose |
|---|---|---|
| `getEnabledCardsWithCounts` | `static async (projectId: number): Promise<CardWithCount[]>` | Enriched enabled cards: dispatches by CardMode to StatisticCountService (`sum`→fieldCard, `fieldcount`→fieldCountCard, `datebreakdown`→dateBreakdownCard, `dropdown`→breakdownCard or deviceBreakdownCard, default→countCard). |

**StatisticCountService** — `repositories/StatisticCountService.ts` (375 lines), class `StatisticCountService` + `COUNT_ENTITIES` and `COUNTER_TYPES` configs
| Method | Signature | Purpose |
|---|---|---|
| `buildCountSql` | `static (card: Pick<DashboardCard, "EntityType"\|"CounterType"\|"FilterJson"\|"CountMode"\|"DistinctColumn">): { sql; params } \| null` | Builds parameterized COUNT SQL from the card config. |
| `countCard` | `static async (projectId: number, card: DashboardCard): Promise<number>` | Simple entity count (count/distinct). |
| `breakdownCard` | `static async (projectId: number, card: DashboardCard): Promise<{ label; count }[]>` | Inspection-field dropdown breakdown (FieldValue grouping). |
| `fieldCard` | `static async (projectId: number, card: DashboardCard): Promise<number>` | SUM of a numeric InspectionField value. |
| `fieldCountCard` | `static async (projectId: number, card: DashboardCard): Promise<number>` | COUNT of inspections having a non-empty field value. |
| `dateBreakdownCard` | `static async (projectId: number, card: DashboardCard): Promise<{ label; count }[]>` | Date-field breakdown (same query shape as breakdownCard). |
| `deviceBreakdownCard` | `static async (projectId: number, card: DashboardCard): Promise<{ label; count }[]>` | Breakdown over DeviceRecords.DeviceData JSON (`json_extract`) for EntityType devices, or over Cameras/Switches device columns. |

Config constants: `COUNT_ENTITIES` = { inspections, cameras, switches, devices } with table/alias/joins/projectClause/filterableColumns/distinctableColumns/deviceColumns (lines 15–70). `COUNTER_TYPES` = { total (no clause), today (AND i.InspectionDate = today) } (lines 78–92).

**SmartCardGenerator** — `repositories/SmartCardGenerator.ts` (289 lines), class `SmartCardGenerator` + `SmartFormField` / `SmartCardSpec` types
| Method | Signature | Purpose |
|---|---|---|
| `getFormFields` | `static async (): Promise<SmartFormField[]>` | Default-template InspectionFields (active/visible, excluding remarks) with their FieldOptions. |
| `getDeviceFields` | `static async (): Promise<SmartFormField[]>` | DeviceFieldDefinitions of dropdown/switch/checkbox type, keyed `dev_<DeviceType>_<FieldName>`. |
| `getCardKind` | `static (fieldType: string): SmartCardKind` | Maps field type → CardMode via `TYPE_TO_MODE` (dropdown/switch/checkbox→dropdown, number→sum, text/multiline→fieldcount, date/date_auto→datebreakdown; gps/device/camera/calculation→skip). |
| `getSpec` | `static (field: SmartFormField): SmartCardSpec` | kind + icon + color + title for a field. |
| `generateCardsForField` | `static (field: SmartFormField, projectId: number, baseSortOrder?: number): DashboardCard[]` | Produces total + today smart cards (CardKey `smart_<field>_total/_today` or `smart_dev_<type>_<field>_...`; IsDefault=0). |
| `isFieldCovered` | `static (field: SmartFormField, cards: DashboardCard[]): boolean` | True if an existing card already aggregates/breaks down this field. |
| `getAvailableFields` | `static async (projectId: number): Promise<SmartFormField[]>` | Fields not yet covered by cards. |
| `getNextSortOrder` | `static async (projectId: number): Promise<number>` | MAX(SortOrder)+1 for a project. |
| `addSmartCardsForField` | `static async (projectId: number, fieldKey: string): Promise<number[]>` | Generates cards, skips existing keys, inserts via DashboardCardRepository, then normalizes sections; returns created CardIDs. |