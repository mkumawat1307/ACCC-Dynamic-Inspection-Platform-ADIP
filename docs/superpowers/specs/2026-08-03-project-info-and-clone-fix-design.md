# Design — Project Information field + bold titles + Clone Project fix

Date: 2026-08-03

## Overview

Two independent changes on the dashboard/home screens:

1. **Project Information card** (`app/projects/dashboard.tsx`): add a "Project" field showing the project name, and make the card title bold.
2. **Clone Project fix** (`src/database/helpers/ProjectDBManager.ts` + `app/index.tsx`): the clone flow crashes with `UNIQUE constraint failed: DashboardCards.ProjectID, DashboardCards.CardKey`, leaving orphaned projects.

## 1. Project Information card (UI only)

### Current state

`app/projects/dashboard.tsx` (lines 91-112) renders a `Card` titled "Project Information" (`titleVariant="titleMedium"`, medium weight) containing a 2-column grid:

- Division, District, Inspector, Client (`InfoField`, width 50%)
- Description (`InfoField`, `full`)

`InfoField` labels already use `fontWeight: "700"` (bold). There is no test file for this screen.

### Changes

1. Add `Project` as the first field in the grid:
   `<InfoField label="Project" value={project.ProjectName || "-"} />`
   Grid becomes: Project, Division, District, Inspector, Client. Description stays full-width below.
2. Make the "Project Information" card title bold by adding `titleStyle={{ fontWeight: "700" }}` to `Card.Title`.
3. Field labels are already bold (`fontWeight: "700"`) — no change.

### Non-goals

- No DB/schema/repository changes → no migration, no isolation regression test required (UI-only).
- Value text stays `fontWeight: "600"`.

## 2. Clone Project fix

### Root cause (confirmed from device log)

`handleClone` (`app/index.tsx:143-176`) inserts a global-DB project row via `ProjectRepository.cloneProject`, then calls `cloneProjectDb`. `cloneProjectDb` (`ProjectDBManager.ts:101-209`) copies every `SETTINGS_TABLES` row **verbatim**, including `DashboardCards.ProjectID` (the source project's ID).

`DashboardCards` has `UNIQUE (ProjectID, CardKey)` (`src/database/tables/dashboard-cards.table.ts:24`). When the target DB already contains rows with the same `(ProjectID, CardKey)` — leftover from a previous interrupted/failed clone of the same name (observed: "LSY (Copy)", "District LSY (Copy)") — the verbatim re-insert throws `UNIQUE constraint failed`, which surfaces as `Clone error: ... NativeStatement.finalizeAsync has been rejected` → "Unable to clone project."

Because the failure happens mid-copy, the target folder/DB keeps partial rows and `clearActiveProject()` is skipped (the exception bypasses it), leaving:

- an orphaned global-DB project row (whose folder never fully exists → "doesn't exist or isn't a directory" errors),
- the partial target DB still marked as the active project (connection-manager corruption per ADR-014),
- retries with the same name colliding again.

### Changes

#### A. `src/database/helpers/ProjectDBManager.ts` — `cloneProjectDb`

1. **Atomicity**: wrap the entire copy (settings + `Inspections` + `INSPECTION_DATA_TABLES`) in `db.withTransactionAsync(...)` so any failure rolls back — no partial target DB.
2. **Clean slate**: immediately after `createProjectSchema()`, run `DELETE FROM <table>` for every `SETTINGS_TABLES` table, plus `Inspections` and every `INSPECTION_DATA_TABLES` table. This makes a stale/partial target harmless (no-op on a fresh DB).
3. **DashboardCards binding + dedupe**: when copying `DashboardCards` rows, force `ProjectID = newProjectId` and de-duplicate by `CardKey`, keeping the row with the lowest `CardID` (sort source rows by `CardID ASC` before deduping so it is deterministic). The existing `UPDATE DashboardCards SET ProjectID = ?` line becomes a harmless no-op and can be kept or removed.
4. **Connection-manager integrity**: wrap `setActiveProject(...)` / `clearActiveProject()` sequencing in `try/finally` so `clearActiveProject()` always runs, even on failure (prevents the partial target from staying the active project).

#### B. `app/index.tsx` — `handleClone`

5. **Cleanup on failure**: in the `catch` block, best-effort `deleteProjectDb(projectDbPath)` (removes the partial folder) and `ProjectRepository.deleteProject(newId)` (removes the orphaned global-DB row) **before** re-throwing to show the alert. Retrying the same name then starts from a clean slate.

#### C. Tests (mirror `src/__tests__/database/helpers/cloneProjectDb.test.ts`)

Write failing tests first, then implement:

1. **Retry scenario**: pre-create a target DB that already contains a `DashboardCards` row with the same `CardKey` as the source (simulating a prior failed clone). Cloning must succeed (no UNIQUE error), produce exactly one row per `CardKey`, all bound to `newProjectId`.
2. **Source-duplicate scenario**: insert two `DashboardCards` rows with the same `CardKey` (same `ProjectID`) into the source. Cloning must succeed and produce one deduped row per `CardKey` in the target, bound to `newProjectId`.

Existing `cloneProjectDb` tests must keep passing.

### Isolation requirement check

The clone feature copies **per-project data between two project DBs** and never touches `accc_global.db` beyond the existing global row insert in `ProjectRepository.cloneProject`. No new tables, no new project-scoped data. No new isolation test required beyond the two regression tests above.

## Verification

```bash
cd frontend
npx tsc --noEmit
npx eslint app src
npx jest
```

## Out of scope

- The Expo Router warnings (`Route "./components/ProjectDialogs.tsx" is missing the required default export`, etc.) are benign dev warnings and are not addressed.
- Existing orphaned projects on the device ("LSY (Copy)", "District LSY (Copy)") can be removed via the existing Delete button; this fix prevents new orphans.
- The post-clone navigation to the Edit screen (`/projects/new?editProjectId=...`) is unchanged.
