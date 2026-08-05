# Implementation Plan — Pole ID → Site ID (full data-model rename)

- **Date:** 2026-08-05
- **Status:** Awaiting approval
- **Approved design:** `docs/superpowers/specs/2026-08-05-pole-id-to-site-id-design.md` (committed `35b9c12`)

## Goal

Replace the `Pole` terminology throughout the ADIP codebase and database with `Site` as a single consistent vocabulary — DB column, seed config keys, identifiers, UI strings, `PhotoType`, and the dead `DATABASE_NAME` constant — while migrating existing project DBs in place (idempotent) so no inspection data is lost on devices already using the `Pole` vocabulary.

## Architecture

- **Single vocabulary, no alias layer.** Every `Pole`/`pole` token becomes `Site`/`site`. Fresh project DBs create the `SiteID` column and `site_*` config directly via DDL/seeds.
- **In-place idempotent migration.** A new block at the top of `migrateProjectSchema(projectId)` runs `ALTER TABLE Inspections RENAME COLUMN PoleID TO SiteID` (guarded), then renames section/field/option/card config keys, then `Photos.PhotoType`. Every statement filters on the old value, so re-running is a no-op. Runs on the project-DB handle (no ATTACH) → ADR-014 safe.
- **Data preserved by construction.** `InspectionValues` stores `FieldID`; reads join to `InspectionFields` on `FieldID`, so field-key renames lose nothing. The column rename keeps every inspection's ID string. Card-key renames preserve card config in place.
- **Inspection-flow DB rule stays intact.** No `getGlobalDatabase()` anywhere in the migration path.

## Tech stack

React Native / Expo SDK 54, expo-sqlite v16 (sequential open/close, ADR-014), TypeScript strict, Jest (jest-expo preset) with the manual `__mocks__/expo-sqlite.ts` in-memory mock.

## Spec

See `docs/superpowers/specs/2026-08-05-pole-id-to-site-id-design.md`. Canonical rename map (abridged — the full table is in the spec §"Canonical Rename Map", which is the authoritative source for every token below):

| Old | New |
|---|---|
| `Inspections.PoleID` (column) | `Inspections.SiteID` |
| `pole_id` field key, "Pole ID"/"Enter Pole ID" | `site_id`, "Site ID"/"Enter Site ID" |
| section `pole_structure` / "Pole Structure Details" / "Pole structure" / "Pole categorization" | `site_structure` / "Site Structure Details" / "Site structure" / "Site categorization" |
| field keys `pole_avail`,`pole_si`,`pole_status`,`pole_category` + labels "Pole Availability","Pole SI","Pole Status","Pole Category" | `site_avail`,`site_si`,`site_status`,`site_category` + "Site …" labels |
| `FieldOptions.FieldKey` (4 keys) | `site_avail`,`site_si`,`site_status`,`site_category` |
| card keys `total_poles`,`today_poles`,`total_pole_status`,`today_pole_status` | `total_sites`,`today_sites`,`total_site_status`,`today_site_status` |
| card titles "Total Poles","Today's Poles","Pole Availability" | "Total Sites","Today's Sites","Site Availability" |
| `DistinctColumn 'i.PoleID'` | `'i.SiteID'` |
| `BreakdownField 'pole_avail'` | `'site_avail'` |
| smart card keys `smart_pole_status_total`, `smart_pole_status_today`, … | `smart_site_status_total`, `smart_site_status_today`, … (generated from `FieldKey`; migration uses `REPLACE`) |
| repo methods `updateInspectionPoleId`, `getInspectionByPoleId`, `getInspectionPoleId` | `updateInspectionSiteId`, `getInspectionBySiteId`, `getInspectionSiteId` |
| context `poleId`, `setPoleId`; locals `contextPoleId`,`checkingPoleId`,`poleCheckTimeout`,`getPoleId`,`poleIdLoaded` | `siteId`, `setSiteId`; `contextSiteId`,`checkingSiteId`,`siteCheckTimeout`,`getSiteId`,`siteIdLoaded` |
| `InspectionListItem.PoleID` | `InspectionListItem.SiteID` |
| `StatisticCountService` `distinctableColumns ["i.PoleID", …]` | `["i.SiteID", …]` |
| `PhotoType "Pole"` (capture flow) | `PhotoType "Site"` |
| `photoUtils.generateFileName` param `pole`, `cleanPole` | `site`, `cleanSite` |
| UI strings "Pole ID Required", "Please enter Pole ID first before filling the inspection details.", "Checking Pole ID…", "`Pole ID ${text} already exists.`", "Search Pole ID, Division, District, Block", "No Pole ID", "Start a new pole inspection" | "Site ID …" equivalents |
| settings key lists `"pole_id","pole_avail","pole_si","pole_status","pole_category"`; "(Pole, Earthing, Camera, etc.)" | `site_*` keys; "(Site, Earthing, Camera, etc.)" |
| `DATABASE_NAME = "accc_pole_inspection.db"` | `"accc_site_inspection.db"` |
| app.json "…the pole site", "…the pole and equipment" | "…the site", "…the site and equipment" |

Explicit non-renames: global DB file `accc_global.db`, per-project file `inspection.db`, and the app display name are unchanged. Historical changelog/ADR entries stay as-is; this feature adds new changelog + ADR entries.

## Global Constraints

- **Do NOT call `getGlobalDatabase()`** anywhere in the migration path. `migrateProjectSchema` already receives the active project handle via `getDatabase()` (`src/database/schema.ts:202`); the new migration block uses only that handle.
- Respect the sequential open/close model — one `SQLiteDatabase` handle at a time. `schema.ts` never opens a second handle.
- No compatibility/alias layer. Code, seeds, and migration must agree on ONE vocabulary (`site`).
- Every `UPDATE`/`ALTER` in the migration block filters on the **old** value so re-runs are no-ops; keep the ordering steps are listed in the design (§"In-place migration", steps 1–7).
- TypeScript strict; no `any`; no code comments unless the surrounding file already has them; PascalCase repos/interfaces, camelCase locals, UPPER_CASE constants.
- Tests must use the manual mocks (`__mocks__/expo-sqlite.ts`) with per-test `beforeEach` reset (`__resetDbState()`), path-aware distinct DB names, and no factory-mock overrides that bypass the manual mock for the code under test.
- Every token rename below is **mechanical**: apply the map, then grep-verify (`rg -n "pole|Pole|POLE" frontend/ --glob "!node_modules" --glob "!coverage"`) to confirm no stragglers remain in the files a task owns.
- Do not push/merge anything to origin/main (local diverges by design).

## The Tasks

### Task 1 — Extend the expo-sqlite mock: `ALTER TABLE … RENAME COLUMN`, `REPLACE()`, `LIKE`, `IN` + probe test

**Context**

The manual mock (`frontend/__mocks__/expo-sqlite.ts`) currently handles `INSERT`/`UPDATE`/`DELETE`/`SELECT` in `runAsync`/`getAllAsync`; `execAsync` is a no-op. `SQL_COMMANDS.ALTER_TABLE` exists but is unused. The migration block needs three capabilities the mock lacks:
1. `ALTER TABLE <t> RENAME COLUMN <old> TO <new>` → rename a key across every row of a table (data model lives as plain `Row` objects).
2. `UPDATE … SET col = REPLACE(col, 'old', 'new')` (smart-card keys) — current SET parser only matches `?` or `CURRENT_TIMESTAMP`.
3. `WHERE col LIKE 'x%'` and `WHERE col IN ('a','b')` (smart-card and card-title updates) — `parseWhere` only matches `col = value`.

Real SQLite behavior being mimicked: `RENAME COLUMN` preserves data; `LIKE` is case-insensitive; `REPLACE(x,a,b)` substitutes all occurrences; `IN` matches any listed literal. The probe test locks this behavior (pattern: `src/__tests__/mocks/expoFileSystemMock.test.ts`).

**Files**
- Modify: `__mocks__/expo-sqlite.ts`
- Test: `src/__tests__/mocks/expoSqliteMock.test.ts` (new)

**Steps**

- [ ] **Step 1: Write the failing probe test**

Create `src/__tests__/mocks/expoSqliteMock.test.ts`:

```ts
import { openDatabaseAsync, __resetDbState } from "expo-sqlite";

describe("expo-sqlite mock — migration SQL support", () => {
  beforeEach(() => __resetDbState());

  async function seed(db: any) {
    await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status)
       VALUES (1, 1, 'P-100', '2026-08-05', 'Draft')`
    );
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title)
       VALUES (1, 'smart_pole_status_total', 'Pole Status')`
    );
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title)
       VALUES (1, 'total_pole_status', 'Pole Availability')`
    );
  }

  it("ALTER TABLE RENAME COLUMN renames the key and keeps data", async () => {
    const db = await openDatabaseAsync("migration-probe");
    await seed(db);
    await db.runAsync(`ALTER TABLE Inspections RENAME COLUMN PoleID TO SiteID`);
    const row = await db.getFirstAsync<{ SiteID: string }>(
      `SELECT SiteID FROM Inspections WHERE InspectionID = 1`
    );
    expect(row?.SiteID).toBe("P-100");
  });

  it("UPDATE SET col = REPLACE(col, a, b) rewrites matching keys", async () => {
    const db = await openDatabaseAsync("migration-probe");
    await seed(db);
    await db.runAsync(
      `UPDATE DashboardCards SET CardKey = REPLACE(CardKey, '_pole_', '_site_')
       WHERE CardKey LIKE 'smart_pole_%'`
    );
    const rows = await db.getAllAsync<{ CardKey: string }>(`SELECT CardKey FROM DashboardCards`);
    expect(rows.map((r) => r.CardKey)).toContain("smart_site_status_total");
    expect(rows.map((r) => r.CardKey)).toContain("total_pole_status");
  });

  it("UPDATE with WHERE col IN ('a','b') matches both literals", async () => {
    const db = await openDatabaseAsync("migration-probe");
    await seed(db);
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title)
       VALUES (1, 'total_site_status', 'Old Title A')`
    );
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title)
       VALUES (1, 'today_site_status', 'Old Title B')`
    );
    await db.runAsync(
      `UPDATE DashboardCards SET Title = 'Site Availability'
       WHERE CardKey IN ('total_site_status','today_site_status')`
    );
    const rows = await db.getAllAsync<{ CardKey: string; Title: string }>(`SELECT CardKey, Title FROM DashboardCards`);
    expect(rows.find((r) => r.CardKey === "total_site_status")?.Title).toBe("Site Availability");
    expect(rows.find((r) => r.CardKey === "today_site_status")?.Title).toBe("Site Availability");
    expect(rows.find((r) => r.CardKey === "smart_pole_status_total")?.Title).toBe("Pole Status");
  });

  it("UPDATE with a quoted-literal SET value applies", async () => {
    const db = await openDatabaseAsync("migration-probe");
    await seed(db);
    await db.runAsync(
      `UPDATE InspectionFields SET FieldKey = 'site_id', FieldName = 'Site ID'
       WHERE FieldKey = 'pole_id'`
    );
    const row = await db.getFirstAsync<{ FieldKey: string; FieldName: string }>(
      `SELECT FieldKey, FieldName FROM InspectionFields WHERE FieldKey = 'site_id'`
    );
    expect(row?.FieldName).toBe("Site ID");
  });

  it("RENAME COLUMN of a missing column is a no-op (guarded path)", async () => {
    const db = await openDatabaseAsync("migration-probe");
    await seed(db);
    await db.runAsync(`ALTER TABLE Inspections RENAME COLUMN SiteID TO PoleID`);
    const row = await db.getFirstAsync<{ PoleID: string }>(
      `SELECT PoleID FROM Inspections WHERE InspectionID = 1`
    );
    expect(row?.PoleID).toBe("P-100");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/__tests__/mocks/expoSqliteMock.test.ts --silent`
Expected: FAIL — `SELECT SiteID …` returns `null` (key was never renamed), REPLACE/LIKE/IN don't execute.

- [ ] **Step 3: Implement mock support**

Modify `__mocks__/expo-sqlite.ts`:

1. Add to `SQL_COMMANDS` (next to `ALTER_TABLE`):
```ts
ALTER_RENAME_COLUMN: /^\s*ALTER\s+TABLE\s+(\w+)\s+RENAME\s+COLUMN\s+(\w+)\s+TO\s+(\w+)/i,
```
2. In `runAsync`, **before** the `INSERT` branch:
```ts
const alterMatch = sql.match(SQL_COMMANDS.ALTER_RENAME_COLUMN);
if (alterMatch) {
  const tableName = alterMatch[1];
  const oldCol = alterMatch[2];
  const newCol = alterMatch[3];
  const table = this.tables.get(tableName) ?? [];
  for (const row of table) {
    if (oldCol in row) {
      row[newCol] = row[oldCol];
      delete row[oldCol];
    }
  }
  return { lastInsertRowId: 0, changes: 0 };
}
```
3. Extend the SET parser in the `UPDATE` branch. Replace the `setMatch` regex line and its dispatch with support for a quoted-literal value (the migration's `SET FieldKey = 'site_id', FieldName = 'Site ID' …` form). Note the added group is `[5]`:
```ts
const setMatch = part.match(
  /(\w+)\s*=\s*(?:REPLACE\(\s*(\w+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)|\?|CURRENT_TIMESTAMP|'([^']*)')/
);
if (setMatch) {
  const col = setMatch[1];
  if (setMatch[2] !== undefined) {
    const replaceCol = setMatch[2];
    const from = setMatch[3];
    const to = setMatch[4];
    row[col] = String(row[replaceCol] ?? "").split(from).join(to);
  } else if (part.includes("CURRENT_TIMESTAMP")) {
    row[col] = new Date().toISOString();
  } else if (setMatch[5] !== undefined) {
    row[col] = setMatch[5];
  } else {
    row[col] = params[paramIdx++];
  }
}
```
`paramIdx` still advances only on the `?` branch, so mixed `SET col = ? , col2 = 'literal'` statements keep where-clause parameter slicing aligned.
4. Extend `parseWhere` so each condition can be `=`, `LIKE`, or `IN`. Replace the per-condition matcher with:
```ts
const match = cond.match(/(\w+)\s*=\s*(?:\?|'([^']*)'|(\d+))/);
const likeMatch = cond.match(/(\w+)\s+LIKE\s+'([^']*)'/i);
const inMatch = cond.match(/(\w+)\s+IN\s+\(([^)]+)\)/i);
```
and make the returned predicate handle all three (LIKE: pattern `%…`/`…%`/`%…%` → `startsWith`/`endsWith`/`includes`; `%` alone → always true; IN: split the quoted literal list, match any). `compiled.every(...)` stays the AND semantics.

**Validation**

```powershell
npx jest src/__tests__/mocks/expoSqliteMock.test.ts --silent
npx jest src/__tests__/database/isolation.test.ts --silent   # existing mock consumers stay green
npx tsc --noEmit
npx eslint __mocks__/expo-sqlite.ts src/__tests__/mocks/expoSqliteMock.test.ts
```

### Task 2 — Schema DDL + seeds + dead constant (fresh-install path)

**Context**

Fresh project DBs are created by `createProjectSchema` → table DDL modules + `seed.ts` orchestrator seeding sections/fields/options/cards. After this task a fresh DB is created entirely in the `site` vocabulary. This task renames DDL/seeds AND the seed tests that assert them.

**Files**
- Modify: `src/database/tables/inspections.table.ts`
- Modify: `src/database/seeds/pole-inspection-data.ts`
- Modify: `src/database/seeds/inspection-sections.seed.ts`
- Modify: `src/database/seeds/field-options.data.ts`
- Modify: `src/database/seeds/dashboard-cards.seed.ts`
- Modify: `src/database/constants/database.ts`
- Modify (tests): `src/__tests__/database/dashboardCards.seed.test.ts`

**Steps**

- [ ] **Step 1: Write the failing test updates first** — update `dashboardCards.seed.test.ts` expectations to the new vocabulary (see Step 3 for the exact new values) and run; they fail against current seeds.

- [ ] **Step 2: Rename the DDL + constant**
1. `inspections.table.ts:12`: `PoleID TEXT NOT NULL,` → `SiteID TEXT NOT NULL,`.
2. `src/database/constants/database.ts:2`: `export const DATABASE_NAME = "accc_site_inspection.db";` (comment on the file is unchanged; `DATABASE_VERSION` unchanged).

- [ ] **Step 3: Rename the seeds**

`src/database/seeds/pole-inspection-data.ts`:
- Line 10: `FieldName: "Pole ID", FieldKey: "pole_id", … Placeholder: "Enter Pole ID"` → `"Site ID"`, `"site_id"`, `"Enter Site ID"`.
- Line 14 comment `// II. Pole Structure` → `// II. Site Structure`.
- Line 15: `fieldKey/DataSource "foundation_cond"` unchanged; label unchanged.
- Line 16: `"Pole Availability"`→`"Site Availability"`, `FieldKey: "pole_avail"`→`"site_avail"`, `DataSource: "pole_avail"`→`"site_avail"`, placeholder `"Select Pole Availability"`→`"Select Site Availability"`.
- Line 17: `"Pole SI"`→`"Site SI"`, key/datasource `pole_si`→`site_si`, placeholder `"Select Pole SI"`→`"Select Site SI"`.
- Line 18: `"Pole Status"`→`"Site Status"`, key/datasource `pole_status`→`site_status`, placeholder `"Select Pole Status"`→`"Select Site Status"`.
- Line 48: `"Pole Category"`→`"Site Category"`, key/datasource `pole_category`→`site_category`, placeholder `"Select Pole Category"`→`"Select Site Category"`.
- No other field rows change.

`src/database/seeds/inspection-sections.seed.ts`:
- Line 43-44: `key: "pole_structure"`, `name: "Pole Structure Details"`, `description: "Pole structure"` → `key: "site_structure"`, `name: "Site Structure Details"`, `description: "Site structure"`.
- Line 94: `description: "Pole categorization"` → `"Site categorization"`.

`src/database/seeds/field-options.data.ts`: every `FieldKey: "pole_avail"|"pole_si"|"pole_status"|"pole_category"` → its `site_*` counterpart; update the 4 section header comments (`// Pole Availability (pole_avail)` → `// Site Availability (site_avail)`, etc. — grep `pole_` in this file). Option labels/values are untouched (they are data values, not keys — e.g. "Yes"/"No").

`src/database/seeds/dashboard-cards.seed.ts`:
- Line 28: `CardKey: "total_poles"`, `Title: "Total Poles"`, `DistinctColumn: "i.PoleID"` → `"total_sites"`, `"Total Sites"`, `"i.SiteID"`.
- Line 31: `CardKey: "today_poles"`, `Title: "Today's Poles"`, `DistinctColumn: "i.PoleID"` → `"today_sites"`, `"Today's Sites"`, `"i.SiteID"`.
- Line 37: `CardKey: "total_pole_status"`, `Title: "Pole Availability"`, `BreakdownField: "pole_avail"` → `"total_site_status"`, `"Site Availability"`, `"site_avail"`.
- Line 40: `CardKey: "today_pole_status"`, `Title: "Pole Availability"`, `BreakdownField: "pole_avail"` → `"today_site_status"`, `"Site Availability"`, `"site_avail"`.
- Icons/colors/counters/sort orders unchanged.

- [ ] **Step 4: Update `dashboardCards.seed.test.ts`**
- Line 59 key list → `["total_inspection_done", "total_site_status", "total_camera_count", "today_inspection_done", "today_site_status", "today_camera_count"].sort()`.
- Line 127 test name → "seeds the Camera Count SUM and Site Availability breakdown defaults"; line 145-151 query `WHERE CardKey = 'total_site_status'`, assert `Title` `"Site Availability"`, `BreakdownField` `"site_avail"`, `CardMode` `"dropdown"`.
- Lines 167/170: `byKey["total_site_status"]` / `byKey["today_site_status"]` → `"dropdown"`.

- [ ] **Step 5: Run seed + DDL tests to verify**

```powershell
npx jest src/__tests__/database/dashboardCards.seed.test.ts --silent
npx tsc --noEmit
npx eslint src/database/tables/inspections.table.ts src/database/seeds/ src/database/constants/database.ts
```

### Task 3 — Migration block in `migrateProjectSchema` + `migrateDeviceCards` + migration regression test

**Context**

The migration block is the heart of the feature. It must be added at the very top of `migrateProjectSchema` (`src/database/schema.ts:199`, immediately after `const db = await getDatabase();` at line 202), before the remarks-section block, so existing DBs are upgraded before any card seeding/normalization runs. `DashboardCardRepository.migrateDeviceCards` (`DashboardCardRepository.ts:352-428`) must target the new keys/title so it still normalizes legacy rows. The regression test builds an OLD-shape DB manually (the mock has no schema enforcement — rows are plain objects) and asserts the post-migration `site` vocabulary with data intact.

**Files**
- Modify: `src/database/schema.ts`
- Modify: `src/database/repositories/DashboardCardRepository.ts`
- Modify (test): `src/__tests__/database/siteNamingMigration.test.ts` (new)
- Modify (test): `src/__tests__/repositories/DashboardCardRepository.test.ts` (old-behavior assertions)

**Steps**

- [ ] **Step 1: Write the failing migration regression test**

Create `src/__tests__/database/siteNamingMigration.test.ts`. Follow the `folderIsolation.test.ts`/`captureIsolation.test.ts` pattern: `jest.mock("expo-sqlite")` (uses manual mock), `jest.resetModules()` in `beforeEach`, dynamic `require("@/src/database/db")` for `setActiveProject`/`getDatabase`, distinct DB path `"siteNamingMigration"`.

```ts
jest.mock("expo-sqlite");
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("siteNamingMigration", () => {
  let db: any;
  let setActiveProject: (p: string) => void;
  let migrateProjectSchema: (id: number) => Promise<void>;

  beforeEach(() => {
    jest.resetModules();
    const dbModule = require("@/src/database/db");
    setActiveProject = dbModule.setActiveProject;
    setActiveProject("siteNamingMigration");
    db = dbModule.getDatabase();
    migrateProjectSchema = require("@/src/database/schema").migrateProjectSchema;
  });

  async function seedOldShape() {
    await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status)
       VALUES (1, 1, 'P-100', '2026-08-05', 'Draft')`
    );
    await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, DisplayOrder)
       VALUES (1, 'Pole Structure Details', 'pole_structure', 'Pole structure', 2)`
    );
    await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, DisplayOrder)
       VALUES (1, 'Remarks', 'remarks', 'Remarks', 9)`
    );
    await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, Placeholder, IsRequired)
       VALUES (1, 'Pole ID', 'pole_id', 'Enter Pole ID', 1)`
    );
    await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, Placeholder, IsRequired)
       VALUES (1, 'Pole Availability', 'pole_avail', 'Select Pole Availability', 1)`
    );
    await db.runAsync(
      `INSERT INTO FieldOptions (FieldKey, OptionLabel, OptionValue, DisplayOrder)
       VALUES ('pole_avail', 'Yes', 'Yes', 1)`
    );
    await db.runAsync(
      `INSERT INTO FieldOptions (FieldKey, OptionLabel, OptionValue, DisplayOrder)
       VALUES ('pole_si', 'Single', 'Single', 1)`
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (1, 1, 'P-100')`
    );
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title, DistinctColumn, BreakdownField, CardMode)
       VALUES (1, 'total_poles', 'Total Poles', 'i.PoleID', NULL, 'entitycount')`
    );
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title, DistinctColumn, BreakdownField, CardMode)
       VALUES (1, 'total_pole_status', 'Pole Availability', NULL, 'pole_avail', 'dropdown')`
    );
    await db.runAsync(
      `INSERT INTO DashboardCards (ProjectID, CardKey, Title, DistinctColumn, BreakdownField, CardMode)
       VALUES (1, 'smart_pole_status_total', 'Pole Status', NULL, 'pole_status', 'dropdown')`
    );
    await db.runAsync(
      `INSERT INTO Photos (InspectionID, FilePath, PhotoType) VALUES (1, 'content://x/a.jpg', 'Pole')`
    );
  }

  it("migrates old-shape project DB to the site vocabulary, keeping data", async () => {
    await seedOldShape();
    await migrateProjectSchema(1);

    const insp = await db.getFirstAsync<{ SiteID: string }>(
      `SELECT SiteID FROM Inspections WHERE InspectionID = 1`
    );
    expect(insp?.SiteID).toBe("P-100");

    const section = await db.getFirstAsync<{ SectionKey: string; SectionName: string }>(
      `SELECT SectionKey, SectionName FROM InspectionSections WHERE SectionKey = 'site_structure'`
    );
    expect(section?.SectionName).toBe("Site Structure Details");

    const field = await db.getFirstAsync<{ FieldKey: string; FieldName: string; Placeholder: string }>(
      `SELECT FieldKey, FieldName, Placeholder FROM InspectionFields WHERE FieldKey = 'site_id'`
    );
    expect(field?.FieldName).toBe("Site ID");
    expect(field?.Placeholder).toBe("Enter Site ID");

    const options = await db.getAllAsync<{ FieldKey: string }>(
      `SELECT FieldKey FROM FieldOptions WHERE FieldKey = 'site_avail'`
    );
    expect(options.length).toBeGreaterThan(0);

    const value = await db.getFirstAsync<{ FieldValue: string }>(
      `SELECT v.FieldValue FROM InspectionValues v
       JOIN InspectionFields f ON v.FieldID = f.FieldID
       WHERE f.FieldKey = 'site_id'`
    );
    expect(value?.FieldValue).toBe("P-100");

    const cards = await db.getAllAsync<{ CardKey: string; Title: string; DistinctColumn: string | null; BreakdownField: string | null }>(
      `SELECT CardKey, Title, DistinctColumn, BreakdownField FROM DashboardCards`
    );
    const byKey = Object.fromEntries(cards.map((c) => [c.CardKey, c]));
    expect(byKey["total_sites"].Title).toBe("Total Sites");
    expect(byKey["total_sites"].DistinctColumn).toBe("i.SiteID");
    expect(byKey["total_site_status"].Title).toBe("Site Availability");
    expect(byKey["total_site_status"].BreakdownField).toBe("site_avail");
    expect(byKey["smart_site_status_total"]).toBeDefined();

    const photo = await db.getFirstAsync<{ PhotoType: string }>(
      `SELECT PhotoType FROM Photos WHERE PhotoID = 1`
    );
    expect(photo?.PhotoType).toBe("Site");
  });

  it("is idempotent — second run is a no-op and preserves state", async () => {
    await seedOldShape();
    await migrateProjectSchema(1);
    await migrateProjectSchema(1);
    const insp = await db.getFirstAsync<{ SiteID: string }>(
      `SELECT SiteID FROM Inspections WHERE InspectionID = 1`
    );
    expect(insp?.SiteID).toBe("P-100");
    const cards = await db.getAllAsync<{ CardKey: string }>(`SELECT CardKey FROM DashboardCards`);
    expect(cards.map((c) => c.CardKey)).toContain("total_sites");
    expect(cards.map((c) => c.CardKey)).not.toContain("total_poles");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/__tests__/database/siteNamingMigration.test.ts --silent`
Expected: FAIL — `SiteID` is `null`, sections/fields/cards still `pole_*`, `PhotoType` still `"Pole"` (migration doesn't exist yet).

- [ ] **Step 3: Implement the migration block**

In `src/database/schema.ts`, add a module-level helper and call it at the top of `migrateProjectSchema`:

```ts
export async function migratePoleToSiteNaming(db: SQLiteDatabase): Promise<void> {
  try {
    await db.runAsync(`ALTER TABLE Inspections RENAME COLUMN PoleID TO SiteID`);
  } catch {
    logger.info("[schema] Migration: PoleID already renamed to SiteID (ok)");
  }

  await db.runAsync(
    `UPDATE InspectionSections SET SectionKey = 'site_structure', SectionName = 'Site Structure Details', Description = 'Site structure'
     WHERE SectionKey = 'pole_structure'`
  );

  await db.runAsync(
    `UPDATE InspectionFields SET FieldKey = 'site_id', FieldName = 'Site ID', Placeholder = 'Enter Site ID'
     WHERE FieldKey = 'pole_id'`
  );
  await db.runAsync(
    `UPDATE InspectionFields SET FieldName = 'Site Availability', Placeholder = 'Select Site Availability'
     WHERE FieldKey = 'pole_avail'`
  );
  await db.runAsync(
    `UPDATE InspectionFields SET FieldKey = 'site_avail' WHERE FieldKey = 'pole_avail'`
  );
  await db.runAsync(
    `UPDATE InspectionFields SET FieldKey = 'site_si', FieldName = 'Site SI', Placeholder = 'Select Site SI'
     WHERE FieldKey = 'pole_si'`
  );
  await db.runAsync(
    `UPDATE InspectionFields SET FieldKey = 'site_status', FieldName = 'Site Status', Placeholder = 'Select Site Status'
     WHERE FieldKey = 'pole_status'`
  );
  await db.runAsync(
    `UPDATE InspectionFields SET FieldKey = 'site_category', FieldName = 'Site Category', Placeholder = 'Select Site Category'
     WHERE FieldKey = 'pole_category'`
  );

  for (const key of ["site_avail", "site_si", "site_status", "site_category"]) {
    const old = key.replace("site_", "pole_");
    await db.runAsync(`UPDATE FieldOptions SET FieldKey = ? WHERE FieldKey = ?`, [key, old]);
  }

  await db.runAsync(`UPDATE DashboardCards SET CardKey = 'total_sites' WHERE CardKey = 'total_poles'`);
  await db.runAsync(`UPDATE DashboardCards SET CardKey = 'today_sites' WHERE CardKey = 'today_poles'`);
  await db.runAsync(`UPDATE DashboardCards SET CardKey = 'total_site_status' WHERE CardKey = 'total_pole_status'`);
  await db.runAsync(`UPDATE DashboardCards SET CardKey = 'today_site_status' WHERE CardKey = 'today_pole_status'`);

  await db.runAsync(
    `UPDATE DashboardCards SET Title = 'Total Sites' WHERE CardKey = 'total_sites' AND Title = 'Total Poles'`
  );
  await db.runAsync(
    `UPDATE DashboardCards SET Title = 'Today''s Sites' WHERE CardKey = 'today_sites' AND Title = 'Today''s Poles'`
  );
  await db.runAsync(
    `UPDATE DashboardCards SET Title = 'Site Availability'
     WHERE CardKey IN ('total_site_status','today_site_status')`
  );

  await db.runAsync(`UPDATE DashboardCards SET DistinctColumn = 'i.SiteID' WHERE DistinctColumn = 'i.PoleID'`);
  await db.runAsync(`UPDATE DashboardCards SET BreakdownField = 'site_avail' WHERE BreakdownField = 'pole_avail'`);

  await db.runAsync(
    `UPDATE DashboardCards SET CardKey = REPLACE(CardKey, '_pole_', '_site_') WHERE CardKey LIKE 'smart_pole_%'`
  );

  await db.runAsync(`UPDATE Photos SET PhotoType = 'Site' WHERE PhotoType = 'Pole'`);
}
```

Add `import type { SQLiteDatabase } from "expo-sqlite";` (type-only — `schema.ts` has no runtime expo-sqlite import; the manual mock exports `MockDatabase as SQLiteDatabase` so tests resolve it) and wire the call at the top of `migrateProjectSchema`:
```ts
try {
  await migratePoleToSiteNaming(db);
} catch (e) {
  logger.info("[schema] migrateProjectSchema — pole-to-site naming migration failed (non-fatal):", e);
}
```
Use the same `db.runAsync` style as the rest of the file. Keep every statement filtering on old values (idempotent). Do **not** wrap each statement individually beyond the ALTER guard and the outer try/catch.

- [ ] **Step 4: Update `DashboardCardRepository.migrateDeviceCards`**

`src/database/repositories/DashboardCardRepository.ts`:
- Line 365: `const poleKeys = new Set(["total_pole_status", "today_pole_status"]);` → `new Set(["total_site_status", "today_site_status"])`.
- Line 415: `["Pole Availability", row.CardID, projectId]` → `["Site Availability", row.CardID, projectId]`.
- Update the accompanying `DashboardCardRepository.test.ts` assertions (lines ~195-252): expected keys list, `total_pole_status`/`today_pole_status` fixtures → `total_site_status`/`today_site_status`, and the `migrateDeviceCards` case asserting `"Pole Availability"` → `"Site Availability"`. Rename `poleCards`/`poleKeys` local identifiers to `siteCards`/`siteKeys` to match the file's style.

- [ ] **Step 5: Run the tests to verify they pass**

```powershell
npx jest src/__tests__/database/siteNamingMigration.test.ts --silent
npx jest src/__tests__/repositories/DashboardCardRepository.test.ts --silent
npx tsc --noEmit
npx eslint src/database/schema.ts src/database/repositories/DashboardCardRepository.ts
```

### Task 4 — Data repositories (`InspectionRepository`, `InspectionListRepository`, `StatisticCountService`)

**Context**

Pure code-level renames in the data layer. After this task the repositories read/write `SiteID`/`site_*` only. Update each repository's own test suite inline so the task is independently green.

**Files**
- Modify: `src/database/repositories/InspectionRepository.ts`
- Modify: `src/database/repositories/InspectionListRepository.ts`
- Modify: `src/database/repositories/StatisticCountService.ts`
- Modify (tests): `src/__tests__/repositories/InspectionRepository.test.ts`, `src/__tests__/repositories/StatisticCountService.test.ts`, `src/__tests__/database/isolation.test.ts`, `src/__tests__/repositories/DashboardService.test.ts`

**Steps**

- [ ] **Step 1: Update `InspectionRepository.ts`**
- `createInspection` (lines 117-127): column `PoleID,` → `SiteID,`.
- `updateInspectionPoleId` → `updateInspectionSiteId` (signature `(inspectionId: number, siteId: string)`), SQL `SET PoleID = ?` → `SET SiteID = ?`, param `[siteId, inspectionId]`.
- `getInspectionByPoleId` → `getInspectionBySiteId` (param `siteId`), SELECT returns `SiteID`, WHERE `LOWER(TRIM(PoleID)) = LOWER(TRIM(?))` → `SiteID`.
- `getInspectionPoleId` → `getInspectionSiteId`, `SELECT PoleID` → `SELECT SiteID`, `row?.PoleID` → `row?.SiteID`.
- Grep-verify: `rg -n "Pole" src/database/repositories/InspectionRepository.ts` → no matches.

- [ ] **Step 2: Update `InspectionListRepository.ts`**
- Interface (line 7): `PoleID: string;` → `SiteID: string;`.
- SQL (line 27): `i.PoleID,` → `i.SiteID,`.
- `filterByQuery` (line 66): `item.PoleID.toLowerCase()` → `item.SiteID.toLowerCase()`.

- [ ] **Step 3: Update `StatisticCountService.ts`**
- Line 22: `distinctableColumns: ["i.PoleID", "i.InspectionID"],` → `["i.SiteID", "i.InspectionID"],`.

- [ ] **Step 4: Update the four test suites**

`InspectionRepository.test.ts`:
- Line 54 test name → `updateInspectionSiteId emits with the resolved projectId`; line 56 → `InspectionRepository.updateInspectionSiteId(2, "P-100")`.
- Any other `Pole`/`PoleID`/`pole_id` in the file → site equivalents (grep the file).

`StatisticCountService.test.ts`:
- Line 151 → `cardOf({ CountMode: "distinct", DistinctColumn: "i.SiteID" })`; line 155 → `expect(sql).toContain("COUNT(DISTINCT i.SiteID) AS count")`.

`isolation.test.ts`:
- Line 219 raw INSERT `(ProjectID, DistrictID, PoleID, InspectionDate, Status)` → `SiteID`. (Mock stores rows as objects; the test must write `SiteID` so reads through the renamed repositories work.)

`DashboardService.test.ts`:
- Line 16-17 fixture `CardKey: "total_poles"`, `Title: "Total Poles"` → `"total_sites"`/`"Total Sites"`; line 163 `cardOf({ CardID: 1, CardKey: "total_poles", … })` → `"total_sites"`.
- Grep the file for any other `pole`/`Pole` tokens and apply the map.

- [ ] **Step 5: Verify**

```powershell
npx jest src/__tests__/repositories/InspectionRepository.test.ts src/__tests__/repositories/StatisticCountService.test.ts src/__tests__/database/isolation.test.ts src/__tests__/repositories/DashboardService.test.ts --silent
npx tsc --noEmit
npx eslint src/database/repositories/InspectionRepository.ts src/database/repositories/InspectionListRepository.ts src/database/repositories/StatisticCountService.ts
```

### Task 5 — Context + app screens (`InspectionContext`, inspection flow screens, dashboard, settings)

**Context**

UI-layer renames: shared context state, the inspection list/new/capture screens, the project dashboard subtitle, and the settings key lists. Test fixtures for context + capture/folder isolation move to the `site` vocabulary inline.

**Files**
- Modify: `src/context/InspectionContext.tsx`
- Modify: `app/inspection/index.tsx`, `app/inspection/new.tsx`, `app/inspection/capture.tsx`, `app/projects/dashboard.tsx`, `app/settings/index.tsx`
- Modify (tests): `src/__tests__/context/InspectionContext.test.tsx`, `src/__tests__/database/captureIsolation.test.ts`, `src/__tests__/database/folderIsolation.test.ts`

**Steps**

- [ ] **Step 1: Rename context state (`InspectionContext.tsx`)**
- Line 29-30 interface: `poleId: string;` / `setPoleId: (poleId: string) => void;` → `siteId: string;` / `setSiteId: (siteId: string) => void;`.
- Line 49: `const [poleId, setPoleId] = useState("");` → `const [siteId, setSiteId] = useState("");`.
- Line 66 (closeProject reset): `setPoleId("");` → `setSiteId("");`.
- Lines 94-95, 100: `poleId, setPoleId` → `siteId, setSiteId` (value object + memo deps).

- [ ] **Step 2: Update the inspection-flow screens**

`app/inspection/new.tsx`:
- Line 56 destructure `setPoleId,` → `setSiteId,`; line 186 `setPoleId("");` → `setSiteId("");`.

`app/inspection/index.tsx`:
- Line 267 placeholder → `"Search Site ID, Division, District, Block"`.
- Line 352 `{item.PoleID || "No Pole ID"}` → `{item.SiteID || "No Site ID"}`.

`app/inspection/capture.tsx`:
- Line 32: `poleId: contextPoleId` → `siteId: contextSiteId`.
- Lines 38-39: local state type `{ pole_id: string; block: string }` and init → `{ site_id: string; block: string }` / `site_id: contextSiteId || ""`.
- Line 77: `pole_id: v.pole_id || contextPoleId || ""` → `site_id: v.site_id || contextSiteId || ""`.
- Line 82: dep `contextPoleId` → `contextSiteId`.
- Line 183: `const poleId = values.pole_id || "NA";` → `const siteId = values.site_id || "NA";`.
- Lines 188, 206: `poleId,` → `siteId,` (watermark block args).
- Line 194: `PhotoType: "Pole",` → `PhotoType: "Site",`.
- Line 290: `poleId={values.pole_id || "NA"}` → `siteId={values.site_id || "NA"}`.

`app/projects/dashboard.tsx`:
- Line 147: `subtitle="Start a new pole inspection"` → `subtitle="Start a new site inspection"`.

`app/settings/index.tsx`:
- Lines 57-58, 64: system-field key lists → `"site_id"`, `"site_avail"`, `"site_si"`, `"site_status"`, `"site_category"`.
- Line 168: `description="Manage inspection sections (Pole, Earthing, Camera, etc.)"` → `"(Site, Earthing, Camera, etc.)"`.

- [ ] **Step 3: Update the test fixtures**

`InspectionContext.test.tsx`:
- Lines 67, 123: `result.current.poleId` → `siteId`; line 169 test name → "sets site ID"; lines 172/174 `setPoleId("P001")`/`poleId` → `setSiteId("P001")`/`siteId`.

`captureIsolation.test.ts` and `folderIsolation.test.ts`:
- Line 34 / line 37: `PhotoType: "Pole",` → `PhotoType: "Site",`.

- [ ] **Step 4: Verify**

```powershell
npx jest src/__tests__/context/InspectionContext.test.tsx src/__tests__/database/captureIsolation.test.ts src/__tests__/database/folderIsolation.test.ts --silent
npx tsc --noEmit
npx eslint src/context/InspectionContext.tsx app/inspection app/projects/dashboard.tsx app/settings/index.tsx
```

### Task 6 — Components + camera + `photoUtils` + `app.json`

**Context**

Remaining UI components, the camera watermark overlay, the photo filename util, and the app-store permission strings. Component test fixtures update inline. Also update every caller of the renamed repository methods and `generateFileName`/`WatermarkOverlay` props found by grep.

**Files**
- Modify: `src/components/inspection/GeneralInformation.tsx`, `SectionRenderer.tsx`, `PhotoSection.tsx`, `DeviceSection.tsx`, `FieldRenderer.tsx`, `PhotoPreviewModal.tsx`
- Modify: `src/components/camera/WatermarkOverlay.tsx`, `src/components/inspection/photoUtils.ts`
- Modify: `app.json`
- Modify (tests): `src/__tests__/components/camera/WatermarkOverlay.test.tsx`, `src/__tests__/components/inspection/photoUtils.test.ts`, `src/__tests__/components/inspection/useWatermarkProcessor.test.tsx`, and any report-preview/export test referencing the strings

**Steps**

- [ ] **Step 1: Rename `photoUtils.ts`**
- `generateFileName(district, blockName, pole, timestamp)` → param `site`; `const cleanPole = (pole || "NA")` → `const cleanSite = (site || "NA")`; return uses `cleanSite`.
- Grep callers and update them: `rg -n "generateFileName|cleanPole" src app` → `capture.tsx` (Task 5 already passes `siteId`), `useWatermarkProcessor.ts` (import + arg) if present, and the photo utils test.

- [ ] **Step 2: Rename `WatermarkOverlay.tsx`**
- Line 30 prop `poleId: string;` → `siteId: string;`; line 39 destructure `poleId,` → `siteId,`; line 45 `const lines = [poleId, …]` → `[siteId, …]`.
- Update `WatermarkOverlay.test.tsx` (line 65) `poleId="P-101"` → `siteId="P-101"`.

- [ ] **Step 3: Rename `GeneralInformation.tsx`** (the heaviest component)
- Line 22 `setPoleId,` → `setSiteId,`.
- Line 29 `checkingPoleId` → `checkingSiteId`; line 31 `poleCheckTimeout` → `siteCheckTimeout` (all occurrences).
- Lines 79/82 `savedValues.pole_id` → `savedValues.site_id`; `setPoleId(...)` → `setSiteId(...)`.
- Lines 193-194 `getPoleId()` → `getSiteId()`; `values.pole_id` → `values.site_id`.
- Lines 207, 216, 232, 311: `field.FieldKey === "pole_id"` → `"site_id"`.
- Lines 234-241: `setPoleId(text)` → `setSiteId(text)`; `poleCheckTimeout.current` → `siteCheckTimeout.current`.
- Lines 246, 250: `InspectionRepository.getInspectionByPoleId` → `getInspectionBySiteId`; `setCheckingPoleId` → `setCheckingSiteId`.
- Line 258: `` `Pole ID ${text} already exists.` `` → `` `Site ID ${text} already exists.` ``.
- Line 287: `setCheckingPoleId(false)` → `setCheckingSiteId(false)`.
- Line 312: `InspectionRepository.updateInspectionPoleId` → `updateInspectionSiteId`.
- Lines 320, 332: `checkingPoleId` → `checkingSiteId`; `Checking Pole ID...` → `Checking Site ID...`.

- [ ] **Step 4: Rename the remaining components**
- `SectionRenderer.tsx`: line 41 `poleId: contextPoleId` → `siteId: contextSiteId`; lines 48/95 `poleIdLoaded` → `siteIdLoaded`; line 125 `!contextPoleId.trim()` → `!contextSiteId.trim()`; lines 182/190 `field.FieldKey === "pole_id"` → `"site_id"`.
- `PhotoSection.tsx`: line 36 `poleId: contextPoleId` → `siteId: contextSiteId`; lines 88-89 `"Pole ID Required"`/`"Please enter Pole ID first…"` → `"Site ID Required"`/`"Please enter Site ID first…"`; line 157 `contextPoleId={contextPoleId}` → `contextSiteId={contextSiteId}`.
- `DeviceSection.tsx` (lines 196-197) and `FieldRenderer.tsx` (lines 175-176): `"Pole ID Required"` → `"Site ID Required"`, `"Please enter Pole ID first before filling the inspection details."` → `"Please enter Site ID first before filling the inspection details."`.
- `PhotoPreviewModal.tsx`: line 12 prop `contextPoleId: string | undefined;` → `contextSiteId: string | undefined;` (and the destructure/usage in the same file — grep `contextPoleId`).

- [ ] **Step 5: Update `app.json`**
- Lines 14/52: `"Capture GPS coordinates of the pole site"` → `"Capture GPS coordinates of the site"`.
- Lines 15/58: `"Take photos of the pole and equipment"` → `"Take photos of the site and equipment"`.

- [ ] **Step 6: Update component test fixtures**
- `useWatermarkProcessor.test.tsx`: update any assertion referencing the pole vocabulary (grep the file); only the vocabulary in fixture strings changes — behavior is identical.
- Grep the whole test tree for the exact strings renamed above (`rg -n "Pole ID Required|enter Pole ID|contextPoleId|checkingPoleId|getPoleId|Pole ID" src/__tests__`) and update fixtures/expectations to the `site` equivalents (report preview / export / GeneralInformation component tests if present).

- [ ] **Step 7: Verify**

```powershell
npx jest src/__tests__/components src/__tests__/utils src/__tests__/hooks --silent
npx tsc --noEmit
npx eslint src/components/inspection src/components/camera app.json
```

### Task 7 — Remaining test-suite sweep + full gates

**Context**

The remaining `Pole`-vocabulary fixtures live in dashboard component tests (`StatCard`, `StatBreakdownCard`, `DashboardCardGrid`, `DashboardCardManager`), `SmartCardGenerator.test.ts`, and `exportData.test.ts`. `SmartCardGenerator` derives keys from `FieldKey`, so its fixtures flip to `site_status`/`site_avail` and expected keys become `smart_site_status_total` etc. This task is a mechanical sweep; run it after Tasks 2–6 so the whole repo is green together.

**Files**
- Modify (tests): `src/__tests__/repositories/SmartCardGenerator.test.ts`, `src/__tests__/repositories/DashboardCardRepository.test.ts` (any leftovers), `src/__tests__/repositories/DashboardService.test.ts` (leftovers), `src/__tests__/components/dashboard/StatCard.test.tsx`, `StatBreakdownCard.test.tsx`, `DashboardCardGrid.test.tsx`, `DashboardCardManager.test.tsx`, `src/__tests__/utils/exportData.test.ts`

**Steps**

- [ ] **Step 1: `SmartCardGenerator.test.ts`**
- Line 104 field fixture `FieldKey: "pole_status", FieldName: "Pole Status"` → `"site_status"`/`"Site Status"`.
- Lines 110-126: expected `smart_pole_status_total` → `smart_site_status_total`, title `"Pole Status"` → `"Site Status"`, `BreakdownField` `"pole_status"` → `"site_status"`.
- Lines 325/336: fixture field `pole_status` → `site_status`; expectations `fields[0].FieldKey` → `site_status`.
- Lines 471/476: `cardRow({ … BreakdownField: "pole_avail" })` → `"site_avail"`; field `FieldKey: "pole_avail", FieldName: "Pole Availability"` → `"site_avail"`/`"Site Availability"`.
- Lines 492/522: `keys.not.toContain("pole_avail")` → `"site_avail"`; `keys.toContain("pole_avail")` → `"site_avail"`.

- [ ] **Step 2: Dashboard component tests**
- `StatCard.test.tsx` (lines 30, 34, 52): `title="Total Poles"` / `"Total Poles"` → `"Total Sites"`.
- `StatBreakdownCard.test.tsx` (lines 82, 110, 125, 143): `title="Pole Availability"` → `"Site Availability"`.
- `DashboardCardGrid.test.tsx`: fixtures `CardKey: "total_poles"` → `"total_sites"`, `Title: "Total Poles"` → `"Total Sites"` (lines 54-55, 124, 134, 178, 187, 302, 437, 447, 461); `CardKey: "today_poles"`/`"Today's Poles"` → `"today_sites"`/`"Today's Sites"` (line 126, 136).
- `DashboardCardManager.test.tsx`: field fixture `FieldKey: "pole_status", FieldName: "Pole Status"` → `"site_status"`/`"Site Status"` (line 42); card fixture `CardKey: "total_poles"`/`"Total Poles"` → `"total_sites"`/`"Total Sites"` (lines 52-53); expectations `"Total Poles"` (160), `"Pole Status"` (307), press `"Pole Status"` (344), `addSmartCardsForField(1, "pole_status")` (345) → `"Total Sites"`, `"Site Status"`, `(1, "site_status")`.

- [ ] **Step 3: `exportData.test.ts`**
- Every `FieldKey: "pole_id"` → `"site_id"`, `FieldName: "Pole ID"` → `"Site ID"`; `SectionKey: "pole_structure"`, `SectionName: "Pole Structure Details"` → `"site_structure"`/`"Site Structure Details"` (lines 272, and any others — grep); `FieldKey: "pole_category"`, `FieldName: "Pole Category"` → `"site_category"`/`"Site Category"` (line 273).
- All header assertions `["Pole ID", …]` → `["Site ID", …]` (lines 85, 228, 260, 317, 398, 427, 458, 494, 508, and any `expect(...).toContain("Pole ID")`).
- `{ key: "pole_id", label: "Pole ID", … }` → `{ key: "site_id", label: "Site ID", … }` (line 485).
- Grep the file for any remaining `Pole`/`pole` token and apply the map.

- [ ] **Step 4: Repo-wide straggler sweep**

```powershell
rg -n "pole|Pole|POLE" app src __mocks__ --glob "!*.test.ts*"
```
Every hit must be gone or explicitly justified (e.g. none expected after Tasks 2-6; if any remain, apply the canonical map from the spec and rerun).

- [ ] **Step 5: Full gates**

```powershell
npx jest src/__tests__/repositories/SmartCardGenerator.test.ts src/__tests__/components/dashboard src/__tests__/utils/exportData.test.ts --silent
npx tsc --noEmit
npx eslint app src __mocks__
npx jest --silent
```

### Task 8 — Docs + Changelog + ADR

**Context**

Current-state docs describe the `Pole` vocabulary. Update them to `Site`; leave historical changelog/ADR entries as-is; add a new changelog entry and a new ADR documenting the rename + migration.

**Files**
- Modify: `docs/07-Changelog.md`, `docs/09-Decisions.md`, `docs/01-PRD.md`, `docs/02-Architecture.md`, `docs/03-Rules.md`, `docs/04-Phases.md`, `docs/05-Design.md`, `docs/06-Memory.md`, `docs/08-README.md`, `docs/10-DATABASE_ARCHITECTURE.md`, `README.md`

**Steps**

- [ ] **Step 1: Sweep the docs for the vocabulary**

```powershell
rg -n "Pole|pole" docs README.md
```
For each current-state (non-historical) reference, apply the canonical map: "Pole ID"/"pole_id"/"PoleID" → "Site ID"/"site_id"/"SiteID", "Pole Structure" → "Site Structure", "pole_structure" → "site_structure", "Pole Availability" → "Site Availability", "total_poles" → "total_sites", `accc_pole_inspection.db` → `accc_site_inspection.db`, "Pole" (as product vocabulary, e.g. PRD/README feature descriptions) → "Site". Do NOT rewrite anything that is explicitly labeled as historical (existing changelog entries, ADR history, "Pole" in a date-stamped past entry).

- [ ] **Step 2: Changelog + ADR**
- `docs/07-Changelog.md`: under `[Unreleased]`, add a `Changed` bullet: renamed the Pole vocabulary to Site throughout (DB column `Inspections.SiteID`, field/section/card keys `site_*`, `PhotoType "Site"`, `accc_site_inspection.db` constant) with an idempotent in-place migration of existing project DBs (see ADR).
- `docs/09-Decisions.md`: add a new ADR (next number after the latest) titled "Pole → Site terminology rename", Status: Accepted, Context: `Pole` was the inspection vocabulary but `Site` is the operational term; decision = full data-model rename with idempotent in-place migration (no alias layer, no data loss); consequences: `SiteID` column, `site_*` keys, old project DBs upgraded on open via `migratePoleToSiteNaming`; historical entries unchanged.

- [ ] **Step 3: Verify no current-state docs remain on the old vocabulary**

```powershell
rg -n "Pole|pole" docs README.md
```
Remaining hits may only be inside explicitly-historical entries (changelog history / ADR history) — confirm each with a quick read.

**Validation**

```powershell
npx tsc --noEmit
```

## Task Dependencies

```
Task 1 (mock: ALTER/REPLACE/LIKE/IN)  ──────────┐
Task 2 (DDL + seeds + constant)                 │
Task 3 (migration block + migrateDeviceCards +   │   <- depends on 1
        migration regression test)              ┘
Task 4 (data repositories + their tests)        (parallel with 2, 3)
Task 5 (context + app screens + their tests)    (parallel with 4)
Task 6 (components + camera + photoUtils + app.json + their tests)   (parallel with 5)
Tasks 2-6 ──► Task 7 (test-suite sweep + full gates)
Tasks 1-7 ──► Task 8 (docs + changelog + ADR)
```

- **Parallelizable:** Tasks 4, 5, 6 together (disjoint file sets). Task 2 alongside 1/3.
- **Sequential:** 3 needs 1; 7 needs 2-6 (whole repo must be green together); 8 needs everything stable.
- Within a task, update its own tests inline (grep the task's file set, apply the canonical map) so each task is independently green before the next starts.

## Risk & Mitigations

| Risk | Mitigation |
|------|-----------|
| expo-sqlite mock can't execute `RENAME COLUMN` / `REPLACE()` / `LIKE` / `IN` | Task 1 extends the mock with lock-in probe tests; the migration regression test (Task 3) exercises every statement the block emits |
| A migration statement breaks idempotency (e.g. `Title` update matching a user-renamed title) | Every statement filters on the **old** value; title updates are additionally scoped to the post-rename card keys; second-run assertion in the regression test |
| `migrateDeviceCards` re-runs after the block and matches rows it should no longer touch | It targets `total_site_status`/`today_site_status` and writes the "Site Availability" title — identical behavior, new vocabulary; covered by `DashboardCardRepository.test.ts` |
| Renamed repo methods leave a caller behind (silent runtime bug) | Each task grep-verifies its own file set; Task 7's repo-wide `rg "pole|Pole"` sweep is a hard gate |
| Seed-vs-migration drift (fresh install writes `site_*`, migration writes `site_*`) | Both use the same canonical keys; the migration regression test seeds an old-shape DB, Task 2's seed test asserts the fresh shape |
| Docs sweep rewrites historical entries | Task 8 greps + reads each remaining hit; only current-state docs change, history (changelog/ADR) is append-only |

## Verification (Definition of Done)

Run all of the following from `frontend/`; every command must pass with no errors:

```powershell
npx tsc --noEmit
npx eslint app src __mocks__
npx jest --silent
```

Plus the feature-specific suites: `expoSqliteMock`, `dashboardCards.seed`, `siteNamingMigration`, `DashboardCardRepository`, `InspectionRepository`, `StatisticCountService`, `isolation`, `DashboardService`, `InspectionContext`, `captureIsolation`, `folderIsolation`, component/camera/photo-utils suites, `SmartCardGenerator`, `exportData`. Full suite must stay 593/593 (54 suites) + the new migration tests, and `rg -n "pole|Pole|POLE" app src __mocks__ --glob "!*.test.ts*"` must return nothing.

## Reporting

After each task: report files changed + test output. After all tasks: report the full-suite run and the diff summary for review.

## Execution Order

1. Get approval on this plan.
2. Create task briefs in `.superpowers/sdd/2026-08-05-pole-id-to-site-id/` (progress.md + one brief per task).
3. Dispatch `general` subagent per task in dependency order (T1 → T2 → T3; T4/T5/T6 parallelizable; then T7; then T8).
4. Self-review each subagent diff with empirical checks (run the listed commands); update progress.md.
5. Present final diff summary for user review.
