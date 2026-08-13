# Project Information field + bold title + Clone Project fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Show the project name as the first field in the dashboard's "Project Information" card and make the card title bold. (2) Fix Clone Project so it no longer crashes with `UNIQUE constraint failed: DashboardCards.ProjectID, DashboardCards.CardKey` and never leaves orphaned projects behind.

**Architecture:** (1) UI-only change to `app/projects/dashboard.tsx` (new `Project` `InfoField` + `titleStyle` on `Card.Title`). (2) `cloneProjectDb` becomes atomic (`withTransactionAsync`), wipes the target tables before copying (clean slate for stale/partial targets), re-binds `DashboardCards` to the new project and de-dupes by `CardKey`, and always `clearActiveProject()` via `try/finally`. (3) `handleClone` cleans up the partial folder + orphaned global row on failure so retries with the same name succeed.

**Tech Stack:** React Native (Expo), TypeScript strict, Jest (expo-sqlite in-memory mock).

**Spec:** `docs/superpowers/specs/2026-08-03-project-info-and-clone-fix-design.md`

## Global Constraints

- Commits are **SKIPPED** — AGENTS.md forbids committing unless the user explicitly asks. Every task ends with a test run instead of a commit.
- Run from `frontend/`: verify with `npx tsc --noEmit`, `npx eslint app src`, `npx jest`.
- Path alias `@/*` → `frontend/*`. No comments in code unless requested. TypeScript strict — no `any`.
- ADR-014: never call `getGlobalDatabase()` during the inspection/dashboard flow; only `setActiveProject`/`clearActiveProject`/`getDatabase` (project handle). The clone code already uses this pattern — preserve it.
- No new tables/columns, no cross-DB joins, no global-DB writes beyond the existing `ProjectRepository.cloneProject` row insert. Per spec §"Isolation requirement check", no new isolation migration test is required (the two clone regression tests in Task 1 cover the new behavior).
- The mock SQLite (`__mocks__/expo-sqlite.ts`) does **not** enforce UNIQUE — regression tests must assert on row counts / values, not on thrown UNIQUE errors.
- Do **not** regress the existing 3 `cloneProjectDb` tests (settings copy, per-inspection data remap, repeatable remap) or any of the 224+ existing tests.

---

### Task 1: Write the failing clone regression tests

**Files:**
- Modify: `src/__tests__/database/helpers/cloneProjectDb.test.ts` (append 2 tests inside the `describe("cloneProjectDb", ...)` block, before its closing `});` at line 185)

**Interfaces:**
- Consumes: `cloneProjectDb(sourceDbPath, projectName, projectDbPath, newProjectId)` (existing signature), `createProjectSchema()` (existing), the mock DB handle.
- Produces: two tests that FAIL on the current implementation and PASS after Task 2: (a) target DB pre-populated with a same-`CardKey` `DashboardCards` row (simulated failed-clone retry), (b) source DB containing two `DashboardCards` rows with the same `CardKey`.

- [ ] **Step 1: Append the two regression tests**

Append to `src/__tests__/database/helpers/cloneProjectDb.test.ts` (inside the `describe` block):

```ts
  it("clones cleanly when the target DB already has DashboardCards rows with the same CardKeys (retry of a failed clone)", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const schemaModule = require("@/src/database/schema") as typeof import("@/src/database/schema");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);
    await dbA.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, CountMode, CardMode, SectionLabel, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [7, "total_pole_status", "Pole Availability", "transmission-tower", "#198754", "inspections", "total", "count", "dropdown", "Total Summary", 1, 1, 1]
    );
    await dbModule.clearActiveProject();

    await dbModule.setActiveProject(PROJECT_B);
    await schemaModule.createProjectSchema();
    const dbB = await dbModule.getDatabase();
    await dbB.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, CountMode, CardMode, SectionLabel, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [7, "total_pole_status", "Pole Availability", "transmission-tower", "#198754", "inspections", "total", "count", "dropdown", "Total Summary", 1, 1, 1]
    );
    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB2 = await dbModule.getDatabase();
    const cards = await dbB2.getAllAsync<{ ProjectID: number; CardKey: string }>(
      "SELECT ProjectID, CardKey FROM DashboardCards"
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].ProjectID).toBe(99);
    expect(cards[0].CardKey).toBe("total_pole_status");
    await dbModule.clearActiveProject();
  });

  it("dedupes DashboardCards with duplicate CardKeys in the source when cloning", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);
    for (let i = 0; i < 2; i++) {
      await dbA.runAsync(
        `INSERT INTO DashboardCards
         (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, CountMode, CardMode, SectionLabel, SortOrder, Enabled, IsDefault)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [7, "total_pole_status", "Pole Availability", "transmission-tower", "#198754", "inspections", "total", "count", "dropdown", "Total Summary", 1, 1, 1]
      );
    }
    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB = await dbModule.getDatabase();
    const cards = await dbB.getAllAsync<{ ProjectID: number; CardKey: string }>(
      "SELECT ProjectID, CardKey FROM DashboardCards"
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].ProjectID).toBe(99);
    expect(cards[0].CardKey).toBe("total_pole_status");
    await dbModule.clearActiveProject();
  });
```

Note: the mock auto-assigns `CardID` (1, 2, 3...) via `PRIMARY_KEYS.DashboardCards`, so the lowest-`CardID` wins assertion in Task 2 is exercised by the source-duplicate test.

- [ ] **Step 2: Verify the new tests fail (and existing 3 still pass)**

Run: `npx jest src/__tests__/database/helpers/cloneProjectDb.test.ts`
Expected: the two new tests FAIL (`expect(cards).toHaveLength(1)` sees 2 rows — the mock does not throw on the duplicate insert), the existing 3 tests PASS.

---

### Task 2: Make `cloneProjectDb` atomic, clean-slate, and DashboardCards-safe

**Files:**
- Modify: `src/database/helpers/ProjectDBManager.ts` (`cloneProjectDb`, lines 101-209)

**Interfaces:**
- Consumes: `SETTINGS_TABLES`, `INSPECTION_DATA_TABLES`, `DATA_TABLE_ID_COLUMNS` (all existing), `createProjectSchema`, `setActiveProject`/`clearActiveProject`/`getDatabase`.
- Produces: same public signature/behavior for the happy path; on any failure the target DB is rolled back and `clearActiveProject()` is guaranteed to run. `DashboardCards` rows are re-bound to `newProjectId` and de-duped by `CardKey` keeping the lowest `CardID`.

- [ ] **Step 1: Rewrite `cloneProjectDb`**

Replace the whole method (lines 101-209) with:

```ts
export async function cloneProjectDb(
  sourceDbPath: string,
  projectName: string,
  projectDbPath: string,
  newProjectId: number
): Promise<void> {
  logger.info("[ProjectDBManager] cloneProjectDb — START");

  const settings: Partial<
    Record<(typeof SETTINGS_TABLES)[number], SettingsRow[]>
  > = {};
  const inspectionData: Partial<
    Record<(typeof INSPECTION_DATA_TABLES)[number], SettingsRow[]>
  > = {};

  await setActiveProject(sourceDbPath);
  try {
    const sourceDb = await getDatabase();
    for (const table of SETTINGS_TABLES) {
      const rows = await sourceDb.getAllAsync<SettingsRow>(
        `SELECT * FROM ${table}`
      );
      settings[table] = rows;
    }

    const sourceInspections = await sourceDb.getAllAsync<SettingsRow>(
      `SELECT * FROM Inspections`
    );
    for (const table of INSPECTION_DATA_TABLES) {
      const rows = await sourceDb.getAllAsync<SettingsRow>(
        `SELECT * FROM ${table}`
      );
      inspectionData[table] = rows;
    }
  } finally {
    await clearActiveProject();
  }

  const folderPath = projectDbPath.replace(/inspection\.db$/, "");
  await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });

  await setActiveProject(projectDbPath);
  try {
    const newDb = await getDatabase();
    await newDb.withTransactionAsync(async () => {
      await createProjectSchema();

      for (const table of [
        ...SETTINGS_TABLES,
        "Inspections",
        ...INSPECTION_DATA_TABLES,
      ]) {
        await newDb.runAsync(`DELETE FROM ${table}`);
      }

      const dashboardCards = (settings.DashboardCards ?? [])
        .slice()
        .sort((a, b) => (a.CardID as number) - (b.CardID as number));
      const seenCardKeys = new Set<string>();
      const dedupedDashboardCards: SettingsRow[] = [];
      for (const row of dashboardCards) {
        const key = row.CardKey as string;
        if (seenCardKeys.has(key)) continue;
        seenCardKeys.add(key);
        dedupedDashboardCards.push(row);
      }

      for (const table of SETTINGS_TABLES) {
        const rows =
          table === "DashboardCards"
            ? dedupedDashboardCards
            : (settings[table] ?? []);
        if (rows.length === 0) continue;
        for (const row of rows) {
          const cols = Object.keys(row);
          const placeholders = cols.map(() => "?").join(", ");
          const values = cols.map((c) => row[c] as string | number | null);
          await newDb.runAsync(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
            values
          );
        }
      }

      await newDb.runAsync(`UPDATE DashboardCards SET ProjectID = ?`, [newProjectId]);

      const inspectionIdMap = new Map<number, number>();
      for (const row of sourceInspections) {
        const cols = Object.keys(row).filter(
          (c) => c !== "InspectionID" && c !== "ProjectID"
        );
        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map((c) => row[c] as string | number | null);
        const result = await newDb.runAsync(
          `INSERT INTO Inspections (${cols.join(", ")}, ProjectID) VALUES (${placeholders}, ?)`,
          [...values, newProjectId]
        );
        const oldId = row.InspectionID;
        if (typeof oldId === "number") {
          inspectionIdMap.set(oldId, result.lastInsertRowId as number);
        }
      }

      const recordIdMap = new Map<number, number>();
      for (const table of INSPECTION_DATA_TABLES) {
        const rows = inspectionData[table];
        if (!rows || rows.length === 0) continue;
        const idColumn = DATA_TABLE_ID_COLUMNS[table];
        const remap: Record<string, Map<number, number>> =
          table === "RepeatableValues"
            ? { RecordID: recordIdMap }
            : { InspectionID: inspectionIdMap };
        for (const row of rows) {
          const cols = Object.keys(row).filter((c) => c !== idColumn);
          const placeholders = cols.map(() => "?").join(", ");
          const values = cols.map((c) => {
            const value = row[c];
            const map = remap[c];
            if (map && typeof value === "number") {
              return map.get(value) ?? value;
            }
            return value as string | number | null;
          });
          const result = await newDb.runAsync(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
            values
          );
          const oldId = row[idColumn];
          if (table === "RepeatableRecords" && typeof oldId === "number") {
            recordIdMap.set(oldId, result.lastInsertRowId as number);
          }
        }
      }
    });
  } finally {
    await clearActiveProject();
  }

  logger.info(`✅ [ProjectDBManager] Project cloned: ${projectName}`);
}
```

Notes:
- The source-read phase and the target-write phase each get `try/finally` with `clearActiveProject()` — the active handle is always released, even on failure (prevents the partial target from staying active, ADR-014).
- The `DELETE FROM <table>` clean-slate loop runs **after** `createProjectSchema()`, so every table exists (no-op on a fresh DB) and a stale/partial target from a prior failed clone is harmless.
- `DashboardCards` rows are copied verbatim (still carrying the source `ProjectID`), de-duped by `CardKey` (sort `CardID ASC` first ⇒ lowest `CardID` wins deterministically), then the existing `UPDATE DashboardCards SET ProjectID = ?` re-binds them to `newProjectId` (now a guaranteed single-owner step).
- Keep `const sourceInspections` declared inside the read-phase `try` — it is captured and used by the write phase (declared with `const` at the same scope as before).

- [ ] **Step 2: Run the clone helper tests**

Run: `npx jest src/__tests__/database/helpers/cloneProjectDb.test.ts`
Expected: all 5 tests PASS (2 new + 3 existing).

- [ ] **Step 3: Run the helper + isolation suites**

Run: `npx jest src/__tests__/database/helpers/ src/__tests__/database/isolation.test.ts`
Expected: all PASS (isolation, project-DB-manager, and related suites unaffected).

---

### Task 3: Clean up partial artifacts when `handleClone` fails

**Files:**
- Modify: `app/index.tsx` (`handleClone`, lines 143-176)

**Interfaces:**
- Consumes: `ProjectRepository.cloneProject` / `ProjectRepository.deleteProject`, `cloneProjectDb` / `createProjectDb`, `deleteProjectDb`, `getProjectDbPath` (all already imported).
- Produces: on any clone failure, best-effort removal of the partial project folder (`deleteProjectDb`) and the orphaned global-DB row (`ProjectRepository.deleteProject`) **before** the user-facing alert, so retrying the same name starts from a clean slate.

- [ ] **Step 1: Rewrite `handleClone`**

Replace `handleClone` (lines 143-176) with:

```ts
  const handleClone = async () => {
    if (!selectedProject || !cloneName.trim()) return;
    const projectDbPath = getProjectDbPath(cloneName.trim());
    let newId: number | null = null;
    try {
      newId = await ProjectRepository.cloneProject(
        selectedProject.ProjectID,
        cloneName.trim()
      );
      if (newId) {
        if (selectedProject.DBPath) {
          await cloneProjectDb(
            selectedProject.DBPath,
            cloneName.trim(),
            projectDbPath,
            newId
          );
        } else {
          await createProjectDb(cloneName.trim(), projectDbPath, newId);
        }
      }
      setCloneDialogVisible(false);
      setSelectedProject(null);
      setCloneName("");
      loadProjects();
      if (newId) {
        router.push({
          pathname: "/projects/new",
          params: { editProjectId: newId.toString() },
        });
      }
    } catch (error) {
      logger.error("Clone error:", error);
      try {
        if (projectDbPath) await deleteProjectDb(projectDbPath);
        if (newId) await ProjectRepository.deleteProject(newId);
      } catch (cleanupError) {
        logger.error("Clone cleanup error:", cleanupError);
      }
      Alert.alert("Error", "Unable to clone project.");
    }
  };
```

Note: `deleteProjectDb` on a folder that was never created rejects (best-effort) — the inner `try/catch` logs and continues; the user-facing alert still fires. `newId` is hoisted so the `catch` can remove the global row inserted by `cloneProject` even if the DB copy failed.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npx eslint app/index.tsx`
Expected: 0 errors (pre-existing warnings only).

---

### Task 4: Add the Project field and bold the Project Information title

**Files:**
- Modify: `app/projects/dashboard.tsx` (lines 91-112)

**Interfaces:**
- Consumes: `Project.ProjectName` (existing model field), existing `InfoField` component, `COLORS` tokens.
- Produces: unchanged screen behavior; the "Project Information" card grid becomes Project / Division / District / Inspector / Client, the card title renders bold. No test file exists for this screen — verified via the full gate (Task 5).

- [ ] **Step 1: Add the Project field and bold the title**

In `app/projects/dashboard.tsx`:

1. Add `titleStyle={{ fontWeight: "700" }}` to `Card.Title` (lines 92-102):

```tsx
          <Card.Title
            title="Project Information"
            titleVariant="titleMedium"
            titleStyle={{ fontWeight: "700" }}
            left={() => (
              <MaterialCommunityIcons
                name="information-outline"
                size={22}
                color={COLORS.primary}
              />
            )}
          />
```

2. Insert the Project field as the first grid item (line 105):

```tsx
            <View style={styles.infoGrid}>
              <InfoField label="Project" value={project.ProjectName || "-"} />
              <InfoField label="Division" value={project.DivisionName || "-"} />
              <InfoField label="District" value={project.DistrictName || "-"} />
              <InfoField label="Inspector" value={project.InspectorName || "-"} />
              <InfoField label="Client" value={project.Client || "-"} />
            </View>
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npx eslint app/projects/dashboard.tsx`
Expected: 0 errors (pre-existing warnings only).

---

### Task 5: Changelog + full verification

**Files:**
- Modify: `docs/07-Changelog.md` ([Unreleased] → `### Changed` and `### Fixed`)

- [ ] **Step 1: Add changelog entries**

In `docs/07-Changelog.md`, under `## [Unreleased]` → `### Changed` (after line 59), append:

```markdown
- The project dashboard's "Project Information" card now shows the project name as its first field, and the card title renders bold.
```

Under `### Fixed` (the first one, after line 63), append:

```markdown
- Cloning a project no longer fails with `UNIQUE constraint failed: DashboardCards.ProjectID, DashboardCards.CardKey` and no longer leaves orphaned projects: the clone now runs in a transaction, wipes any stale/partial target DB before copying, re-binds `DashboardCards` to the cloned project (de-duplicated by `CardKey`), always releases the active project handle, and cleans up the partial folder + orphaned project row on failure so retrying the same name succeeds.
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npx eslint app src`
Expected: 0 errors (pre-existing warnings only).

Run: `npx jest`
Expected: all suites PASS (existing 41 suites / 500+ tests plus the 2 new clone tests).

---

## Self-Review

**Spec coverage:**
- §1 Project Information card → Task 4 (Project field first; bold title; labels already bold, untouched).
- §2 A.1 atomicity → Task 2 (`withTransactionAsync` around the whole target write).
- §2 A.2 clean slate → Task 2 (DELETE for all SETTINGS_TABLES + Inspections + INSPECTION_DATA_TABLES right after `createProjectSchema()`).
- §2 A.3 DashboardCards binding + dedupe → Task 2 (sort by `CardID ASC`, dedupe by `CardKey` keeping lowest `CardID`, verbatim copy then `UPDATE ... SET ProjectID = newProjectId`).
- §2 A.4 connection-manager integrity → Task 2 (`try/finally` around both read and write phases).
- §2 B handleClone cleanup → Task 3 (best-effort `deleteProjectDb` + `ProjectRepository.deleteProject(newId)` before alert).
- §2 C tests → Task 1 (retry scenario + source-duplicate scenario, failing first; mock has no UNIQUE enforcement so assertions are count/value-based).
- Existing 3 clone tests and isolation requirements → Task 2 Step 3; no new isolation migration test (per spec).

**Placeholder scan:** every step contains concrete code or an exact expectation; no TBD/TODO.

**Type consistency:** `dedupedDashboardCards` is `SettingsRow[]`; `seenCardKeys`/`dashboardCards` types line up with the `SETTINGS_TABLES` union; `newId` in Task 3 is `number | null` (hoisted so the catch can use it); `titleStyle` is a valid react-native-paper `Card.Title` prop.
