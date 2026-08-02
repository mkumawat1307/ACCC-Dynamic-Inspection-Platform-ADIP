# Dynamic Dashboard Statistic Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded dashboard stat cards (`app/projects/dashboard.tsx` lines 130-208: "Inspection Summary" + "Asset Summary" + "Today's Progress") with a configurable card engine. Admins can add / edit / delete / reorder / enable / disable cards from a new Dashboard Settings screen. Cards count entities generically (inspections, poles, cameras, switches, devices) with counter types (Total, Today's) and optional filters, using parameterized `SELECT COUNT(*)` only â€” no row loading, no stored totals. Four default cards are auto-created per project: **Total Poles, Total Cameras, Today's Poles, Today's Cameras** (CardKey-protected, auto-restored if deleted).

**Architecture:** One `dashboard_cards` table (per-project DB). `DashboardCardRepository` (CRUD) + `StatisticCountService` (generic count engine with an entity registry and a counter-type registry) + `DashboardService` (compose repository + counts). `DashboardCardGrid` renders the cards on `app/projects/dashboard.tsx`. `app/projects/dashboard-settings.tsx` manages them. Card config is fully data-driven â€” entity type + counter type + filter_json; no hardcoded entity names in the UI layer.

**Tech Stack:** React Native (Expo) + TypeScript strict; `expo-sqlite` (single sequential connection, ADR-014); react-native-paper; MaterialCommunityIcons. Jest + jest-expo (in-memory `expo-sqlite` mock).

## Global Constraints

- All code lives in `frontend/`. All commands run from `frontend/`.
- TypeScript strict mode; avoid `any`. No comments unless requested.
- `@/*` aliases to `frontend/*`.
- **No `yarn` on PATH** â€” use `npx jest <file>`, `npx tsc --noEmit`, `npx eslint <files>`. `npx jest` = 24 suites / 234 tests baseline (all pass).
- **ADR-014 (critical):** never call `getGlobalDatabase()` inside the project/inspection flow. `dashboard_cards` lives in the project DB only. All reads/writes go through `getDatabase()` (single sequential handle). Never open two handles.
- **Isolation (mandatory):** per-project data in project DB only. `dashboard_cards` is per-project â€” never in `accc_global.db`. Each new feature must ship an isolation regression test (mirror `src/__tests__/database/isolation.test.ts`): create cards in Project A, open Project B, assert not present.
- **Mocks stay path-aware:** new test fixtures use distinct DB paths/names; never share a single mock handle across projects.
- **Migration requirement:** schema additions must include a migration for existing project DBs. `migrateProjectSchema()` (wired into `ProjectDBManager.openProjectDb`) must create `dashboard_cards` and seed defaults for pre-existing projects. New projects get the table via `createProjectSchema()` and defaults via seeding in `createProjectDb`.
- **Count semantics (user-confirmed):**
  - *Poles* = `COUNT(DISTINCT PoleID)` on `Inspections` (a pole inspected multiple times counts once).
  - *Today's boundary* = `Inspections.InspectionDate` in `DD-Mon-YYYY` format (same format as `getCurrentInspectionDate()` / the auto-filled date field) â€” NOT `CreatedAt` UTC.
  - *Entities* = registry (inspections, cameras, switches, devices) + `filter_json` for admin-built filtered cards (e.g. "Total Offline Cameras" = cameras + `{"CameraStatus":"Offline"}`, "Total PTZ Cameras" = cameras + `{"CameraType":"PTZ"}`).
- **Performance:** `SELECT COUNT(*)` (or `COUNT(DISTINCT col)`) only, all filters parameterized. Never `SELECT *` then count in JS. No stored calculated values.
- **Filter safety:** `filter_json` keys are validated against the entity registry's `filterableColumns` allowlist before being interpolated into SQL; values are always bound as parameters. Unknown entity/counter/filter â†’ count 0, never a thrown SQL error on the dashboard.
- **Defaults:** `CardKey` (`total_poles`, `total_cameras`, `today_poles`, `today_cameras`) is the stable identity. `ensureDefaultCards()` inserts only *missing* keys â€” it never re-enables a disabled default and never touches an edited default (only inserts when the key is absent). Defaults may be deleted/disabled by the user; if the user deletes a default, it is re-inserted on the next project open (documented behavior).
- **Clone:** `dashboard_cards` is added to `SETTINGS_TABLES` in `ProjectDBManager` so clones copy cards (plain copy, no remap needed).
- **Coverage:** `jest.config.js` per-file thresholds are 80% (branches 70) for `db.ts`, `schema.ts`, `ProjectDBManager.ts`, and each repository file. Add coverage thresholds for the new count engine + repository files in this plan. New code must not add new eslint errors (pre-existing warnings in the repo are tolerated).
- Verification: `npx tsc --noEmit` (clean), `npx eslint <changed files>` (no new errors), `npx jest` (all suites pass; coverage thresholds met).
- **Commit steps are OPTIONAL** â€” only commit when the user explicitly asks. Run the TDD + verification steps regardless.

---

### Task 1: Data model, table, schema registration, migration, default seeding  `[x] complete`

**Files:**
- Create: `src/database/tables/dashboard-cards.table.ts`
- Create: `src/database/seeds/dashboard-cards.seed.ts`
- Modify: `src/database/schema.ts`
- Modify: `src/database/helpers/ProjectDBManager.ts`
- Modify: `src/database/seed.ts` (only if it needs a call site â€” see note below)
- Modify: `src/__tests__/database/schema.test.ts` (existing schema suite) or a new `src/__tests__/database/dashboardCards.seed.test.ts`
- Modify: `jest.config.js` (add thresholds for new files as they land)

**Step 1 â€” Table DDL** (`src/database/tables/dashboard-cards.table.ts`), following the existing `*.table.ts` convention (plain exported const string, standalone per-file, no FK to global Projects table â€” mirror `Inspections.ProjectID` plain-column style):

```ts
// frontend/src/database/tables/dashboard-cards.table.ts

export const createDashboardCardsTable = `
CREATE TABLE IF NOT EXISTS DashboardCards (
    CardID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProjectID INTEGER NOT NULL,
    CardKey TEXT NOT NULL,
    Title TEXT NOT NULL,
    Icon TEXT NOT NULL DEFAULT 'chart-box-outline',
    Color TEXT NOT NULL DEFAULT '#0B5ED7',
    EntityType TEXT NOT NULL,
    CounterType TEXT NOT NULL DEFAULT 'total',
    FilterJson TEXT,
    CountMode TEXT NOT NULL DEFAULT 'count',
    DistinctColumn TEXT,
    SortOrder INTEGER NOT NULL DEFAULT 0,
    Enabled INTEGER NOT NULL DEFAULT 1,
    IsDefault INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ProjectID, CardKey)
);
`;
```

**Step 2 â€” Model** (`src/models/DashboardCard.ts`):

```ts
// frontend/src/models/DashboardCard.ts

export interface DashboardCard {
  CardID?: number;
  ProjectID: number;
  CardKey: string;
  Title: string;
  Icon: string;
  Color: string;
  EntityType: string;      // registry key: "inspections" | "cameras" | "switches" | "devices"
  CounterType: string;     // registry key: "total" | "today"
  FilterJson?: string | null;  // JSON string, e.g. {"DeviceType":"Switch"} or {"CameraType":"PTZ"}
  CountMode: "count" | "distinct";
  DistinctColumn?: string | null; // "PoleID" for inspections-distinct
  SortOrder: number;
  Enabled: number;         // 1 | 0
  IsDefault: number;       // 1 | 0
  CreatedAt?: string;
  UpdatedAt?: string;
}
```

**Step 3 â€” Schema registration** (`src/database/schema.ts`):
- Import `createDashboardCardsTable` and `seedDashboardCards` at the top.
- In `createProjectSchema()`, after the device-records/ProjectDeviceTypes block, add:
  ```ts
  logger.info("[schema] Creating DashboardCards table...");
  await db.execAsync(createDashboardCardsTable);
  ```
- In `migrateProjectSchema()`, after the remarks block, add a call to `ensureDashboardCards()` (Task 2's repository seeding) wrapped so a failure never blocks opening an existing project:
  ```ts
  try { await ensureDashboardCards(); }
  catch (e) { logger.info("[schema] ensureDashboardCards failed (non-fatal):", e); }
  ```
  > Ordering note: `migrateProjectSchema()` runs on every `openProjectDb`; `createProjectSchema()` runs on every `createProjectDb`/`cloneProjectDb`. The table gets created in both paths, so existing DBs get the table + defaults on first open after upgrade.

**Step 4 â€” Default seeding** (`src/database/seeds/dashboard-cards.seed.ts`):
- Define the four defaults as data constants:
  ```ts
  export const DEFAULT_DASHBOARD_CARDS = [
    { CardKey: "total_poles",    Title: "Total Poles",    Icon: "transmission-tower", Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "distinct", DistinctColumn: "PoleID", SortOrder: 0 },
    { CardKey: "total_cameras",  Title: "Total Cameras",  Icon: "cctv",               Color: "#198754", EntityType: "cameras",     CounterType: "total", CountMode: "count",   SortOrder: 1 },
    { CardKey: "today_poles",    Title: "Today's Poles",  Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "distinct", DistinctColumn: "PoleID", SortOrder: 2 },
    { CardKey: "today_cameras",  Title: "Today's Cameras",Icon: "cctv",               Color: "#6F42C1", EntityType: "cameras",     CounterType: "today", CountMode: "count",   SortOrder: 3 },
  ] as const;
  ```
  (`IsDefault` is set to 1 at insert time; `SortOrder` = index.)
- Export `seedDashboardCards(): Promise<void>`:
  - `const db = await getDatabase();`
  - `SELECT COUNT(*) AS count FROM DashboardCards` â†’ if `> 0`, log + return (idempotent at create time).
  - Else insert all 4 defaults in a `withTransactionAsync` loop (parameterized `INSERT INTO DashboardCards (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, SortOrder, Enabled, IsDefault) VALUES (?, ?, ...)` with `ProjectID = 1`, `Enabled = 1`, `IsDefault = 1`).
- Wire it into `ProjectDBManager.createProjectDb` right after `createProjectSchema()`:
  ```ts
  await seedDashboardCards();
  ```
- **Clone:** add `"DashboardCards"` to `SETTINGS_TABLES` (ProjectDBManager lines 22-32). The generic settings-copy loop handles it with no remap (CardKey copies fine; ProjectID is not FK'd).

**Step 5 â€” Tests (TDD):** add a new suite `src/__tests__/database/dashboardCards.seed.test.ts`:
- Mock `expo-sqlite` + `expo-file-system/legacy` (mirror `isolation.test.ts` mocks).
- Test 1: `createProjectSchema` creates the `DashboardCards` table (query `sqlite_master`).
- Test 2: `seedDashboardCards` is idempotent â€” calling twice inserts exactly 4 rows.
- Test 3: seeding skips when rows already exist (pre-populate 1 row, call seed, assert still 4 total incl. the custom one).
- Test 4: schema migration `migrateProjectSchema` runs `ensureDashboardCards` without throwing on a DB that already has the table + cards (guard against migration breaking `openProjectDb`).

**Step 6 â€” Verify:** `npx jest src/__tests__/database/dashboardCards.seed.test.ts`, then `npx tsc --noEmit`, then `npx eslint src/database/tables/dashboard-cards.table.ts src/database/seeds/dashboard-cards.seed.ts src/database/schema.ts src/database/helpers/ProjectDBManager.ts`.

**Step 7 â€” Optional commit:** `git add ...` / commit `feat(dashboard): add dashboard_cards table, defaults seed, and migration`.

---

### Task 2: DashboardCardRepository (CRUD + defaults guard)  `[x] complete`

**Files:**
- Create: `src/database/repositories/DashboardCardRepository.ts`
- Create: `src/__tests__/repositories/DashboardCardRepository.test.ts`
- Modify: `jest.config.js` (add `src/database/repositories/DashboardCardRepository.ts` threshold 80/70)

**Interfaces produced:**
```ts
export class DashboardCardRepository {
  static async getAllCards(projectId: number): Promise<DashboardCard[]>       // ORDER BY SortOrder, CardID
  static async getEnabledCards(projectId: number): Promise<DashboardCard[]>   // WHERE Enabled = 1
  static async getCardById(cardId: number): Promise<DashboardCard | null>
  static async createCard(card: DashboardCard): Promise<number>               // returns CardID
  static async updateCard(card: DashboardCard): Promise<void>
  static async deleteCard(cardId: number): Promise<void>
  static async setCardEnabled(cardId: number, enabled: boolean): Promise<void>
  static async reorderCards(projectId: number, orderedIds: number[]): Promise<void>  // assigns SortOrder 0..n in a transaction
  static async ensureDefaultCards(projectId: number): Promise<void>           // inserts ONLY missing CardKeys (defaults deleted â†’ re-seeded; disabled/edited defaults untouched)
}
```
> This is the same static-class pattern as `DashboardRepository` / `CameraRepository`. `FilterJson` round-trips as a string; parse in the UI layer.

- `createCard`: if the incoming `CardKey` is empty, generate one (`card_<timestamp>`), unless the caller supplies a stable key. `SortOrder` defaults to `MAX(SortOrder)+1` when omitted.
- `ensureDefaultCards`: `SELECT CardKey FROM DashboardCards WHERE ProjectID = ?` â†’ compare against `DEFAULT_DASHBOARD_CARDS` keys â†’ insert only missing ones (parameterized, `IsDefault = 1`).

**Tests (TDD)** in `src/__tests__/repositories/DashboardCardRepository.test.ts` (mock `getDatabase` â†’ `createMockDb`, mirror repository test conventions):
1. `createCard` returns a new `CardID` and `getCardById` returns it.
2. `updateCard` persists title/entity/filter changes; `UpdatedAt` is touched.
3. `deleteCard` removes the row.
4. `setCardEnabled(false)` hides the card from `getEnabledCards` but keeps it in `getAllCards`.
5. `reorderCards([3,1,2])` rewrites `SortOrder` 0,1,2 in one transaction.
6. `ensureDefaultCards` inserts all 4 defaults on an empty project.
7. `ensureDefaultCards` is idempotent â€” does not duplicate existing keys.
8. `ensureDefaultCards` does NOT re-enable a disabled default and does NOT overwrite an edited default (key exists â†’ skipped).
9. `ensureDefaultCards` re-inserts a default whose key was deleted.

**Isolation regression test** (append to `src/__tests__/database/isolation.test.ts`, mirroring the existing two-project pattern â€” Project A and Project B get distinct mock DB handles):
- Create a card in Project A via `DashboardCardRepository.createCard`. Open Project B (distinct path). Assert `getAllCards` in B is empty; in A the card still exists.

**Verify:** `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/isolation.test.ts`, then `npx tsc --noEmit`, then `npx eslint src/database/repositories/DashboardCardRepository.ts`.

**Optional commit:** `feat(dashboard): add DashboardCardRepository CRUD and defaults guard`.

---

### Task 3: StatisticCountService (generic count engine)  `[x] complete`

**Files:**
- Create: `src/database/repositories/StatisticCountService.ts`
- Create: `src/__tests__/repositories/StatisticCountService.test.ts`
- Modify: `jest.config.js` (add `src/database/repositories/StatisticCountService.ts` threshold 80/70)

**Design â€” entity registry (single source of truth, no hardcoded names in the UI):**
```ts
export interface CountEntityConfig {
  table: string;                          // SQL table name (from a fixed allowlist constant)
  alias: string;
  projectClause: string;                  // "i.ProjectID = ?"
  joins: string;                          // "" for inspections; "JOIN Inspections i ON c.InspectionID = i.InspectionID" for child tables
  filterableColumns: string[];            // columns admins may filter on (allowlist â†’ SQL-safe)
  distinctableColumns: string[];          // columns allowed for COUNT(DISTINCT ...)
}
export const COUNT_ENTITIES: Record<string, CountEntityConfig> = {
  inspections: { table: "Inspections", alias: "i", joins: "",                          projectClause: "i.ProjectID = ?", filterableColumns: ["Status"],        distinctableColumns: ["PoleID", "InspectionID"] },
  cameras:     { table: "Cameras",     alias: "c", joins: "JOIN Inspections i ON c.InspectionID = i.InspectionID", projectClause: "i.ProjectID = ?", filterableColumns: ["CameraType", "CameraStatus"], distinctableColumns: ["c.CameraID"] },
  switches:    { table: "Switches",    alias: "s", joins: "JOIN Inspections i ON s.InspectionID = i.InspectionID", projectClause: "i.ProjectID = ?", filterableColumns: ["SwitchType", "SwitchStatus"], distinctableColumns: ["s.SwitchID"] },
  devices:     { table: "DeviceRecords", alias: "r", joins: "JOIN Inspections i ON r.InspectionID = i.InspectionID", projectClause: "i.ProjectID = ?", filterableColumns: ["DeviceType", "DeviceLabel"], distinctableColumns: ["r.RecordID"] },
};
```
> `deviceType` is intentionally a *value* in `filter_json` (e.g. `{"DeviceType":"Switch"}`) â€” never an entity key. "Total Switches" = devices + DeviceType filter, or the `switches` entity directly. Both work; settings screen offers both.

**Design â€” counter-type registry (future Weekly/Monthly/Custom add one entry):**
```ts
export interface CounterTypeConfig {
  key: string;
  label: string;
  buildTimeClause: (alias: string) => { clause: string; params: (string | number)[] };
}
export const COUNTER_TYPES: Record<string, CounterTypeConfig> = {
  total: { key: "total", label: "Total", buildTimeClause: () => ({ clause: "", params: [] }) },
  today: {
    key: "today", label: "Today's",
    buildTimeClause: (alias) => ({ clause: `AND ${alias}.InspectionDate = ?`, params: [getTodayDateString()] }),
  },
};
```

**Date helper** â€” add to `src/utils/date.ts` (reuse the existing month list; keep `getCurrentInspectionDate` as a thin wrapper):
```ts
export function formatInspectionDate(date: Date): string;  // DD-Mon-YYYY (extracted from getCurrentInspectionDate)
export function getTodayDateString(): string;              // formatInspectionDate(new Date())
```
> All "today" counters compare against the `InspectionDate` column (the same string the form auto-fills), so device counts "today" count records whose *inspection* is dated today.

**Service API:**
```ts
export class StatisticCountService {
  // Core: build a parameterized COUNT query for a card config. Exported for testability.
  static buildCountSql(card: Pick<DashboardCard, "EntityType" | "CounterType" | "FilterJson" | "CountMode" | "DistinctColumn">): { sql: string; params: (string | number)[] } | null;
  // Compute a count against the active project DB (projectId used in params).
  static async countCard(projectId: number, card: DashboardCard): Promise<number>;
}
```
`buildCountSql`:
1. Look up `entity = COUNT_ENTITIES[card.EntityType]`; unknown â†’ `null` (â†’ `countCard` returns 0).
2. `SELECT COUNT(*) FROM {table} {alias} {joins} WHERE {projectClause}`.
3. Append `COUNT(DISTINCT {col})` when `CountMode === "distinct"` and `DistinctColumn` is in the entity's `distinctableColumns`; otherwise `COUNT(*)`; if `CountMode === "distinct"` but the column is not allowed â†’ fall back to `COUNT(*)` (never interpolate an unvalidated column).
4. Append counter time clause (`AND {alias}.InspectionDate = ?` for today).
5. Parse `FilterJson` (JSON string â†’ object). For each entry `[field, value]`: if `field` is in `entity.filterableColumns` â†’ append `AND {alias}.{field} = ?` and bind `value`; else skip the key. All values are bound parameters â€” never string-interpolated.
6. `countCard` runs `db.getFirstAsync<{ count: number }>(sql, params)` and returns `count ?? 0`. Wrap in try/catch â†’ 0 on any DB error (dashboard must never crash on a bad card config).

**Tests (TDD)** in `src/__tests__/repositories/StatisticCountService.test.ts`:
1. `buildCountSql` for `inspections/total` â†’ no time clause, params `[projectId]`.
2. `buildCountSql` for `cameras/today` â†’ contains `AND i.InspectionDate = ?`, params end with today's string.
3. `buildCountSql` for `devices` + `{"DeviceType":"Switch"}` â†’ contains `r.DeviceType = ?`, value bound.
4. `buildCountSql` for `cameras` + `{"CameraType":"PTZ"}` â†’ `c.CameraType = ?`.
5. `buildCountSql` unknown entity â†’ `null`.
6. `buildCountSql` distinct with an allowlisted column â†’ `COUNT(DISTINCT i.PoleID)`.
7. `buildCountSql` distinct with a non-allowlisted column â†’ falls back to `COUNT(*)`.
8. `buildCountSql` with a filter key NOT in `filterableColumns` â†’ key dropped, no SQL fragment.
9. `countCard` returns 0 when `getDatabase().getFirstAsync` throws or returns null (mock rejection).
10. `countCard` end-to-end: seed mock `Cameras` rows, run a `cameras/today` card, assert the number (mock `getTodayDateString` via `jest.spyOn` on `src/utils/date`).
11. SQL-injection guard: `FilterJson = '{"CameraType":"x\\" OR 1=1 --"}'` produces a bound parameter, not a raw fragment (assert the SQL string contains no injected text and the param value is exactly the payload).

**Verify:** `npx jest src/__tests__/repositories/StatisticCountService.test.ts`, `npx tsc --noEmit`, `npx eslint src/database/repositories/StatisticCountService.ts src/utils/date.ts`.

**Optional commit:** `feat(dashboard): add generic StatisticCountService count engine`.

---

### Task 4: DashboardService (compose) + dashboard UI  `[x] complete`

**Files:**
- Create: `src/database/repositories/DashboardService.ts`
- Modify: `src/components/StatCard.tsx`
- Create: `src/components/dashboard/DashboardCardGrid.tsx`
- Modify: `app/projects/dashboard.tsx`
- Create: `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`

**Interfaces produced:**
```ts
export interface CardWithCount extends DashboardCard { count: number }
export class DashboardService {
  static async getEnabledCardsWithCounts(projectId: number): Promise<CardWithCount[]>;
  // getEnabledCards â†’ for each card â†’ StatisticCountService.countCard â†’ merge
}
```
`getEnabledCardsWithCounts` runs the card query and the per-card counts sequentially (single `getDatabase()` handle). A failing card count is logged + treated as 0 (never throws the whole grid).

**`StatCard` upgrade** (`src/components/StatCard.tsx`): add optional `color?: string` prop â†’ applies to the icon container tint / a small accent. Keep `title`, `value`, `icon`. Backwards compatible (existing callers unaffected).

**`DashboardCardGrid`** (`src/components/dashboard/DashboardCardGrid.tsx`):
- Props: `projectId: number`.
- Loads `DashboardService.getEnabledCardsWithCounts(projectId)` on mount; `ActivityIndicator` while loading; renders a responsive `flexDirection: "row", flexWrap: "wrap"` grid (2 cards per row â€” reuse the existing `statRow` half-width styling) of `StatCard` with `title`, `value={count}`, `icon`, `color`.
- Graceful empty state: "No dashboard cards configured." + a "Manage Cards" hint.
- Refreshes on focus (navigation back from settings) â€” use `useFocusEffect` from `@react-navigation/native` (already a dependency via expo-router) or re-run the loader when the screen param changes. Keep it simple: `useFocusEffect(useCallback(() => { load(); }, [projectId]))`.

**`app/projects/dashboard.tsx` changes:**
- Replace the hardcoded "Inspection Summary" (lines 130-162), "Asset Summary" (163-181), and "Today's Progress" (182-208) cards with one card:
  ```tsx
  <Card style={styles.card}>
    <Card.Title title="Statistics" />
    <Card.Content>
      <DashboardCardGrid projectId={project.ProjectID} />
    </Card.Content>
  </Card>
  ```
- Add a **Manage Cards** affordance that navigates to the new settings screen (Task 5): a small `DashboardActionCard` or an appbar `icon="tune-variant"` action â†’ `router.push({ pathname: "/projects/dashboard-settings", params: { projectId: project.ProjectID.toString() } })`.
- Keep the Project Information card + the 4 action cards (New Inspection, Inspection List, Settings, Reports) unchanged.

**Tests (TDD)** `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`:
- Mock `DashboardService.getEnabledCardsWithCounts`; render with `react-native-testing-library` (check the repo for an existing component test to mirror â€” `src/__tests__/components/`).
- 1: renders a card's title and count when the service returns one card.
- 2: renders multiple cards in the grid.
- 3: shows the empty state when no cards.
- 4: shows `ActivityIndicator` while loading (pending promise).
- Mock failure of one card's count â†’ still renders the other cards (count 0 for the failed one) â€” asserts the never-throw contract.

**Verify:** `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`, `npx tsc --noEmit`, `npx eslint app/projects/dashboard.tsx src/components/StatCard.tsx src/components/dashboard/DashboardCardGrid.tsx src/database/repositories/DashboardService.ts`.

**Optional commit:** `feat(dashboard): render configurable statistic cards on the project dashboard`.

---

### Task 5: Dashboard Settings screen (add / edit / delete / reorder / enable-disable / reset)  `[x] complete`

**Files:**
- Create: `app/projects/dashboard-settings.tsx`
- Create: `src/__tests__/components/dashboard/DashboardCardSettings.test.tsx` (or screen test, matching repo conventions)

**Screen behavior** (`app/projects/dashboard-settings.tsx`):
- Loads via `useLocalSearchParams<{ projectId: string }>` â†’ parses int â†’ `DashboardCardRepository.getAllCards(projectId)`.
- List: each card row shows title, `Icon` (MaterialCommunityIcons), `Color` swatch, entity/counter summary (e.g. "Cameras Â· Today's"), `Enabled` switch (`setCardEnabled`), Edit + Delete buttons. Long-press or up/down buttons reorder (`reorderCards`).
- **Add / Edit modal** (react-native-paper `Dialog` + `TextInput` + `Menu`/dropdowns):
  - Title (text).
  - Icon (pick from a curated MaterialCommunityIcons list â€” the same list `StatCard`/`DashboardActionCard` use).
  - Color (preset swatches: `#0B5ED7`, `#198754`, `#DC3545`, `#6F42C1`, `#FD7E14`, `#20C997`, `#0D6EFD`, `#6C757D`).
  - Entity type (dropdown from `COUNT_ENTITIES` keys, labels mapped: Inspections / Cameras / Switches / Devices).
  - Counter type (dropdown from `COUNTER_TYPES`: Total / Today's).
  - Count mode (dropdown: Count / Distinct) + distinct column (shown only when Distinct, populated from the entity's `distinctableColumns`).
  - Filters (dynamic rows: column dropdown from the entity's `filterableColumns` + value input) â†’ serialized to `FilterJson`.
  - Save â†’ `createCard` or `updateCard`; validation: title non-empty, entity + counter must be in their registries (else block save with an inline error).
- **Default protection:** when deleting a default (`IsDefault === 1`), show a confirm dialog: "This is a default card. It will be re-added automatically if this project is opened again. Delete anyway?" Defaults can be deleted/disabled, but the user is warned.
- **Reset to defaults** (appbar action `icon="restore"`): calls `ensureDefaultCards(projectId)` then reloads â€” re-adds any *deleted* defaults without touching existing cards.
- Never calls `getGlobalDatabase()`; all access via `getDatabase()` through the repository (project-flow safe, ADR-014).
- Reload list after every mutation.

**Tests (TDD)** â€” focus on the interactive list + dialogs. Mirror the existing repo's component-test approach. If a full screen test is impractical with expo-router, extract a `DashboardCardManager` component (`src/components/dashboard/DashboardCardManager.tsx`) that takes `projectId` and renders the list + modals, and test that. Coverage targets:
- renders all cards with entity/counter summary;
- toggling `Enabled` calls `setCardEnabled` and reflects the switch;
- delete on a default card shows the warning dialog;
- reset calls `ensureDefaultCards` and reloads;
- add-form validation blocks save when entity/counter is unknown or title empty;
- edit form populates existing values and `updateCard` is called with merged data.

**Verify:** `npx jest <new test file>`, `npx tsc --noEmit`, `npx eslint app/projects/dashboard-settings.tsx <new components>`.

**Optional commit:** `feat(dashboard): add dashboard settings screen for card management`.

---

### Task 6: Full-suite verification + docs  `[x] complete`

**Files:**
- Modify: `docs/` (ADR or changelog note per repo convention â€” mirror how prior features logged changes; check `docs/` structure first)
- No code changes unless verification surfaces issues.

**Steps:**
1. `npx tsc --noEmit` â€” clean.
2. `npx eslint <all changed/new files>` â€” no new errors.
3. `npx jest` â€” all 24+ suites pass; per-file coverage thresholds hold (add missing thresholds to `jest.config.js` for any new repository/util file without one).
4. Run the isolation test explicitly: `npx jest src/__tests__/database/isolation.test.ts`.
5. Manual sanity checklist (documented for the human to run on device):
   - Fresh project â†’ 4 default cards appear with correct counts.
   - Create inspections today + add cameras â†’ Total/Today's counts move.
   - Add a card "Total Switches" (devices + `{"DeviceType":"Switch"}`) â†’ count matches switches.
   - Disable a card â†’ gone from dashboard, present in settings.
   - Delete a default â†’ warned; reopen project â†’ default re-appears.
   - Reorder cards â†’ order persists across navigation.
   - Existing project (pre-feature) â†’ dashboard_cards table + defaults appear on first open (migration path).
6. Update the plan file checkboxes to `[x]` as tasks complete; add a short `docs/` note (ADR-0xx or changelog) describing the feature + the two registry extension points.

---

## Future extension points (documented, not built now)

- **Weekly / Monthly / Custom Range:** add one `COUNTER_TYPES` entry with a `buildTimeClause` returning the appropriate date comparison (e.g. `AND i.InspectionDate >= ?`). No other code changes.
- **New entity** (e.g. Junction Boxes): add a `COUNT_ENTITIES` entry (`table`, `joins`, `projectClause`, `filterableColumns`, `distinctableColumns`). Settings screen picks it up automatically from the registry.
- **Charts / progress / percentage cards:** new card `variant` column + renderer in `DashboardCardGrid`; counts stay dynamic.
- **Filter comparisons beyond equality** (e.g. date ranges, `<`, `LIKE`): extend `filter_json` schema with an operator field, still allowlist-validated.
