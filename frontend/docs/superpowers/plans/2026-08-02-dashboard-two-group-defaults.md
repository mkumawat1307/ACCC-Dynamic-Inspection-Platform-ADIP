# Two-Group Default Dashboard Cards (Total / Today's) + Manage Cards Dialog Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-card legacy default dashboard set with a new **sectioned** 6-card set for **newly created projects** — two labeled sections ("Total", "Today's"), each with three cards: **Inspection Done** (count of `Status = Completed`), **Pole Status** (breakdown of `pole_avail` → `Yes`/`No` rows), and **Camera Count** (SUM of `camera_count`). Existing projects keep their current cards. Also fix the Manage Cards Add/Edit dialog UX (scrollable form + Cancel buttons on every nested picker) and the `createCard` INSERT column/placeholder mismatch.

**Architecture:** Two new nullable columns on `DashboardCards`: `SectionLabel TEXT` (section header; `NULL` = no section, renders as today) and `AggregateField TEXT` (FieldKey to SUM, e.g. `camera_count`). A new `StatisticCountService.fieldCard()` runs a parameterized `SELECT SUM(CAST(iv.FieldValue AS REAL))` over `InspectionValues`. `DashboardService` dispatches `AggregateField` → `fieldCard`, `BreakdownField` → `breakdownCard`, else `countCard`. `DashboardCardGrid` groups consecutive cards by `SectionLabel` and emits section headers; pairing never crosses a section boundary. New projects seed `DEFAULT_SECTIONED_CARDS`; `ensureDefaultCards`/`migrateDefaultCards` select the reconciliation set by what the project already contains (any legacy key → legacy set; otherwise sectioned set), so existing projects are untouched. Both column additions are idempotent migrations inside `migrateProjectSchema()`.

**Tech Stack:** React Native (Expo) + TypeScript strict; `expo-sqlite` (single sequential connection, ADR-014); react-native-paper; MaterialCommunityIcons. Jest + jest-expo.

## Global Constraints

- All code lives in `frontend/`. All commands run from `frontend/`.
- TypeScript strict mode; avoid `any`. No comments unless requested.
- `@/*` aliases to `frontend/*`.
- **No `yarn` on PATH** — use `npx jest <file>`, `npx tsc --noEmit`, `npx eslint <files>`. Baseline: 31 suites / 343 tests pass, tsc clean (at `acaba9d`).
- **ADR-014 (critical):** never call `getGlobalDatabase()` in the project/inspection flow. `DashboardCards` lives in the project DB only. All reads/writes go through `getDatabase()` (single sequential handle). Never open two handles.
- **Isolation (mandatory):** the sectioned default cards + `SectionLabel`/`AggregateField` data are per-project rows in `DashboardCards`. This feature MUST ship an isolation regression test (mirror `src/__tests__/database/isolation.test.ts`): sectioned cards created in Project A must not appear in Project B.
- **Mocks stay path-aware:** new test fixtures use distinct DB paths/names; never share a single mock handle across projects.
- **Migration requirement:** `migrateProjectSchema()` must idempotently add `DashboardCards.SectionLabel` and `DashboardCards.AggregateField` (`try/catch ALTER TABLE`, existing pattern at `schema.ts:248-253`). Do NOT change the `BreakdownField` migration or the `migrateDefaultCards` legacy upgrade behavior for legacy projects.
- **Default-card semantics:** `CardKey` is the stable identity. `seedDashboardCards()` (new projects) seeds `DEFAULT_SECTIONED_CARDS`. `ensureDefaultCards(projectId)` and `migrateDefaultCards(projectId)` pick the set to reconcile **by the project's existing CardKeys**: if the project has ANY legacy key (`total_inspections`, `total_poles`, `total_cameras`, `today_inspections_done`, `today_poles`, `today_cameras`) → reconcile against legacy `DEFAULT_DASHBOARD_CARDS` (existing behavior preserved, NO sectioned cards injected); otherwise reconcile against `DEFAULT_SECTIONED_CARDS`. Never touches titles, `Enabled`, or custom `IsDefault = 0` cards.
- **`createCard` INSERT bug:** currently declares 14 columns but 15 `?` placeholders (real SQLite rejects; the in-memory mock masks it). Adding the two new columns turns it into 16 columns / 16 `?` / 16 params — must be balanced exactly. Add a regression assertion.
- **`updateCard` must NOT write `SectionLabel`/`AggregateField`** (leave them out of the `SET` clause and params). The Manage Cards screen has no UI for them in Phase 1; writing them would null out a sectioned default card's section on edit. Only `createCard`/`mapRow`/`CARD_COLUMNS` handle them.
- **Section scope:** sections group cards by `SectionLabel` for display only. No new DB relationships, no cross-DB joins. A card with `SectionLabel = NULL` (legacy/admin cards) renders exactly as today (no header, normal pairing).
- **Field-aggregation scope:** `AggregateField` is Phase-1 limited to SUM of a numeric inspection-form field (`camera_count`). Aggregation happens per `InspectionValues` row of the field's parent value. No `AggregateMode`/`AggregateValue` columns (follow-up universal builder).
- **Filter safety:** `fieldCard` ignores `FilterJson` (sum has no value filter). Time clause comes from `COUNTER_TYPES` (`today` → `AND i.InspectionDate = ?`). Unknown field / empty result / non-numeric `CAST` → `0`, never a thrown error.
- **Coverage:** `jest.config.js` per-file thresholds are 80% (branches 70) for each repository and the manager. New code must not add new eslint errors. Seed and `.table.ts` files are excluded from coverage.
- **Commit steps are OPTIONAL** — only commit when the user explicitly asks. Run the TDD + verification steps regardless.

---

### Task 1: `SectionLabel` + `AggregateField` data model + repository plumbing (incl. `createCard` fix)

**Files:**
- Modify: `src/database/tables/dashboard-cards.table.ts`
- Modify: `src/models/DashboardCard.ts`
- Modify: `src/database/repositories/DashboardCardRepository.ts`
- Modify: `src/__tests__/repositories/DashboardCardRepository.test.ts`

**Interfaces:**
- Consumes: existing `DashboardCard` model, existing `getDatabase()` mock (`createMockDb()` with `getAllAsync/getFirstAsync/runAsync/withTransactionAsync`).
- Produces: `DashboardCard.SectionLabel?: string | null`; `DashboardCard.AggregateField?: string | null`; `CARD_COLUMNS`/`mapRow`/`createCard` handle both. `createCard` INSERT becomes 16 columns / 16 `?` / 16 params (fixes the 14/15 mismatch). `updateCard` does NOT gain these columns.
- **Caution:** adding two columns shifts `createCard` param indexes — `params[11]` (SortOrder) moves to `params[13]`. Existing tests at `DashboardCardRepository.test.ts:120,128,255` must be updated.

- [ ] **Step 1: Add the columns to the table DDL**

`src/database/tables/dashboard-cards.table.ts` — add `SectionLabel` and `AggregateField` after the `BreakdownField` line:

```ts
    BreakdownField TEXT,
    SectionLabel TEXT,
    AggregateField TEXT,
```

- [ ] **Step 2: Add the fields to the model**

`src/models/DashboardCard.ts` — add after `BreakdownField`:

```ts
  SectionLabel?: string | null;
  AggregateField?: string | null;
```

- [ ] **Step 3: Write the failing repository tests**

In `src/__tests__/repositories/DashboardCardRepository.test.ts`:

1. Update `rowOf` to include the new columns (after `BreakdownField`):

```ts
    BreakdownField: card.BreakdownField ?? null,
    SectionLabel: card.SectionLabel ?? null,
    AggregateField: card.AggregateField ?? null,
```

2. Add a new `describe("SectionLabel & AggregateField", ...)` block at the end of the suite:

```ts
describe("SectionLabel & AggregateField", () => {
  it("maps SectionLabel and AggregateField from a row", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      rowOf(baseCard({ CardID: 3, SectionLabel: "Total", AggregateField: "camera_count" })),
    ]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const cards = await DashboardCardRepository.getAllCards(1);
    expect(cards[0].SectionLabel).toBe("Total");
    expect(cards[0].AggregateField).toBe("camera_count");
  });

  it("createCard persists SectionLabel and AggregateField", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.createCard(
      baseCard({ SectionLabel: "Today's", AggregateField: "camera_count" })
    );
    const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(params[11]).toBe("Today's");
    expect(params[12]).toBe("camera_count");
    expect(params[13]).toBe(0);
  });

  it("createCard INSERT columns, placeholders, and params all match", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.createCard(baseCard());
    const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    const columns = sql.match(/\(([^)]*)\)\s*VALUES/)![1].split(",").map((s) => s.trim());
    const placeholders = (sql.match(/\?/g) ?? []).length;
    expect(columns.length).toBe(16);
    expect(placeholders).toBe(16);
    expect(params).toHaveLength(16);
  });

  it("updateCard does NOT write SectionLabel or AggregateField", async () => {
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.updateCard(
      baseCard({ CardID: 5, SectionLabel: "Total", AggregateField: "camera_count" })
    );
    const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(sql).not.toContain("SectionLabel");
    expect(sql).not.toContain("AggregateField");
    expect(params).not.toContain("Total");
    expect(params).not.toContain("camera_count");
  });
});
```

- [ ] **Step 4: Update the existing SortOrder-index tests**

The two SortOrder tests currently assert `params[11]` — with the two new columns, SortOrder is now at index 13:

- `DashboardCardRepository.test.ts:120` (`createCard defaults SortOrder to max+1 when omitted`): `expect(params[11]).toBe(8)` → `expect(params[13]).toBe(8)`.
- `DashboardCardRepository.test.ts:128` (`createCard falls back to 0 when max SortOrder is null`): `expect(params[11]).toBe(0)` → `expect(params[13]).toBe(0)`.
- `DashboardCardRepository.test.ts:255` (in `BreakdownField` block, `createCard persists BreakdownField`): `expect(params[11]).toBe(0)` → `expect(params[13]).toBe(0)` (`params[10]` for `BreakdownField` stays unchanged).

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: FAIL — new tests fail (columns not in SQL/params, undefined `SectionLabel`/`AggregateField`, `updateCard` SET assertions, placeholder mismatch).

- [ ] **Step 6: Implement repository plumbing**

`src/database/repositories/DashboardCardRepository.ts`:

1. `CARD_COLUMNS` — add after `BreakdownField`:

```ts
const CARD_COLUMNS = `
  CardID, ProjectID, CardKey, Title, Icon, Color,
  EntityType, CounterType, FilterJson, CountMode, DistinctColumn,
  BreakdownField, SectionLabel, AggregateField, SortOrder, Enabled, IsDefault, CreatedAt, UpdatedAt
`;
```

2. `mapRow` — add after the `BreakdownField` line:

```ts
    SectionLabel: (row.SectionLabel as string) ?? null,
    AggregateField: (row.AggregateField as string) ?? null,
```

3. `createCard` — rewrite the INSERT to 16 columns / 16 `?` / 16 params (fixes the 14/15 mismatch):

```ts
    const result = await db.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.ProjectID,
        card.CardKey,
        card.Title,
        card.Icon,
        card.Color,
        card.EntityType,
        card.CounterType,
        card.FilterJson ?? null,
        card.CountMode,
        card.DistinctColumn ?? null,
        card.BreakdownField ?? null,
        card.SectionLabel ?? null,
        card.AggregateField ?? null,
        sortOrder,
        card.Enabled,
        card.IsDefault,
      ]
    );
```

4. `updateCard` — leave unchanged (must NOT write `SectionLabel`/`AggregateField`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: PASS (all tests, including updated SortOrder index tests and the new block).

- [ ] **Step 8: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/tables/dashboard-cards.table.ts src/models/DashboardCard.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 9: Commit (optional)**

```bash
git add src/database/tables/dashboard-cards.table.ts src/models/DashboardCard.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/repositories/DashboardCardRepository.test.ts
git commit -m "feat(dashboard): add SectionLabel and AggregateField columns to dashboard cards"
```

---

### Task 2: `DEFAULT_SECTIONED_CARDS` seed + set-aware default reconciliation

**Files:**
- Modify: `src/database/seeds/dashboard-cards.seed.ts`
- Modify: `src/database/repositories/DashboardCardRepository.ts` (`ensureDefaultCards` + `migrateDefaultCards` become set-aware; INSERTs gain the 3 new columns: `BreakdownField`, `SectionLabel`, `AggregateField`)
- Modify: `src/__tests__/database/dashboardCards.seed.test.ts`
- Modify: `src/__tests__/repositories/DashboardCardRepository.test.ts`

**Interfaces:**
- Consumes: `DashboardCardSeed` interface; `seedDashboardCards()`; `ensureDefaultCards()`; `migrateDefaultCards()`.
- Produces: `DashboardCardSeed` gains `BreakdownField?`, `SectionLabel?`, `AggregateField?`; `DEFAULT_SECTIONED_CARDS` (6 cards, exported); `seedDashboardCards()` seeds the sectioned set; `ensureDefaultCards`/`migrateDefaultCards` select the reconciliation set by existing keys.
- **Interfaces note:** the seed + `ensureDefaultCards` + `migrateDefaultCards` INSERTs all currently list 13 columns (`ProjectID..SortOrder, Enabled, IsDefault`). Each must gain `BreakdownField`, `SectionLabel`, `AggregateField` → 16 columns / 14 `?` + `1, 1` = 16 values / 14 params. `migrateDefaultCards`' renumber UPDATE (`SET SortOrder = ?, DistinctColumn = ?`) is unchanged.

- [ ] **Step 1: Write the failing seed tests**

Update `src/__tests__/database/dashboardCards.seed.test.ts`:

Replace the `seeds exactly the six default cards on an empty project` test with a sectioned expectation:

```ts
  it("seeds exactly the six sectioned default cards on an empty project", async () => {
    await openProject();
    const { seedDashboardCards, DEFAULT_SECTIONED_CARDS } = require("@/src/database/seeds/dashboard-cards.seed");

    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string; SectionLabel: string }>(
      "SELECT CardKey, SectionLabel FROM DashboardCards"
    );

    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.CardKey).sort()).toEqual(
      ["total_inspection_done", "total_pole_status", "total_camera_count", "today_inspection_done", "today_pole_status", "today_camera_count"].sort()
    );
    expect(cards.filter((c) => c.SectionLabel === "Total")).toHaveLength(3);
    expect(cards.filter((c) => c.SectionLabel === "Today's")).toHaveLength(3);
    expect(DEFAULT_SECTIONED_CARDS).toHaveLength(6);
  });
```

Replace the `seeds today_inspections_done with a Completed status filter` test:

```ts
  it("seeds today_inspection_done with a Completed filter, today counter, and Today's label", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const row = await db.getFirstAsync<{ FilterJson: string; CounterType: string; SortOrder: number; SectionLabel: string }>(
      "SELECT FilterJson, CounterType, SortOrder, SectionLabel FROM DashboardCards WHERE CardKey = 'today_inspection_done'"
    );
    expect(row).not.toBeNull();
    expect(row!.FilterJson).toBe(JSON.stringify({ Status: "Completed" }));
    expect(row!.CounterType).toBe("today");
    expect(row!.SortOrder).toBe(3);
    expect(row!.SectionLabel).toBe("Today's");
  });
```

Add a new test verifying the aggregate + breakdown defaults:

```ts
  it("seeds the Camera Count SUM and Pole Status breakdown defaults", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const camera = await db.getFirstAsync<{ AggregateField: string; SectionLabel: string }>(
      "SELECT AggregateField, SectionLabel FROM DashboardCards WHERE CardKey = 'total_camera_count'"
    );
    expect(camera).not.toBeNull();
    expect(camera!.AggregateField).toBe("camera_count");
    expect(camera!.SectionLabel).toBe("Total");

    const pole = await db.getFirstAsync<{ BreakdownField: string }>(
      "SELECT BreakdownField FROM DashboardCards WHERE CardKey = 'total_pole_status'"
    );
    expect(pole).not.toBeNull();
    expect(pole!.BreakdownField).toBe("pole_avail");
  });
```

- [ ] **Step 2: Run seed tests to verify they fail**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts`
Expected: FAIL — seed still inserts legacy cards; `DEFAULT_SECTIONED_CARDS` undefined; `SectionLabel`/`AggregateField` columns missing from INSERT.

- [ ] **Step 3: Update the seed interface + add `DEFAULT_SECTIONED_CARDS`**

`src/database/seeds/dashboard-cards.seed.ts`:

1. Extend the interface:

```ts
export interface DashboardCardSeed {
  CardKey: string;
  Title: string;
  Icon: string;
  Color: string;
  EntityType: string;
  CounterType: string;
  CountMode: "count" | "distinct";
  DistinctColumn?: string;
  FilterJson?: string;
  BreakdownField?: string;
  SectionLabel?: string;
  AggregateField?: string;
  SortOrder: number;
}
```

2. Add the sectioned set (keep `DEFAULT_DASHBOARD_CARDS` unchanged for legacy projects):

```ts
export const DEFAULT_SECTIONED_CARDS: DashboardCardSeed[] = [
  { CardKey: "total_inspection_done", Title: "Inspection Done", Icon: "clipboard-text",     Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "count",   FilterJson: JSON.stringify({ Status: "Completed" }), SectionLabel: "Total",   SortOrder: 0 },
  { CardKey: "total_pole_status",     Title: "Pole Status",     Icon: "transmission-tower", Color: "#198754", EntityType: "inspections", CounterType: "total", CountMode: "count",   BreakdownField: "pole_avail", SectionLabel: "Total",   SortOrder: 1 },
  { CardKey: "total_camera_count",    Title: "Camera Count",     Icon: "cctv",               Color: "#6F42C1", EntityType: "inspections", CounterType: "total", CountMode: "count",   AggregateField: "camera_count", SectionLabel: "Total",   SortOrder: 2 },
  { CardKey: "today_inspection_done", Title: "Inspection Done",  Icon: "clipboard-text",     Color: "#0B5ED7", EntityType: "inspections", CounterType: "today", CountMode: "count",   FilterJson: JSON.stringify({ Status: "Completed" }), SectionLabel: "Today's", SortOrder: 3 },
  { CardKey: "today_pole_status",     Title: "Pole Status",      Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "count",   BreakdownField: "pole_avail", SectionLabel: "Today's", SortOrder: 4 },
  { CardKey: "today_camera_count",    Title: "Camera Count",      Icon: "cctv",               Color: "#6F42C1", EntityType: "inspections", CounterType: "today", CountMode: "count",   AggregateField: "camera_count", SectionLabel: "Today's", SortOrder: 5 },
];
```

3. `seedDashboardCards()` — switch to `DEFAULT_SECTIONED_CARDS` and extend the INSERT to 16 columns:

```ts
export async function seedDashboardCards(): Promise<void> {
  const db = await getDatabase();

  const existing = await db.getAllAsync<{ CardKey: string }>(
    `SELECT CardKey FROM DashboardCards`
  );
  const existingKeys = new Set(existing.map((r) => r.CardKey));

  const missing = DEFAULT_SECTIONED_CARDS.filter((c) => !existingKeys.has(c.CardKey));
  if (missing.length === 0) {
    logger.info("✅ Dashboard cards already seeded.");
    return;
  }

  logger.info(`🌱 Seeding ${missing.length} default dashboard cards...`);

  await db.withTransactionAsync(async () => {
    for (const card of missing) {
      await db.runAsync(
        `INSERT INTO DashboardCards
         (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, SortOrder, Enabled, IsDefault)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [
          1,
          card.CardKey,
          card.Title,
          card.Icon,
          card.Color,
          card.EntityType,
          card.CounterType,
          card.FilterJson ?? null,
          card.CountMode,
          card.DistinctColumn ?? null,
          card.BreakdownField ?? null,
          card.SectionLabel ?? null,
          card.AggregateField ?? null,
          card.SortOrder,
        ]
      );
    }
  });

  logger.info("✅ Default dashboard cards seeded.");
}
```

- [ ] **Step 4: Run seed tests to verify they pass**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts`
Expected: PASS (all tests, including the idempotency + custom-row tests which still hold).

- [ ] **Step 5: Write the failing set-aware `ensureDefaultCards` + `migrateDefaultCards` tests**

In `src/__tests__/repositories/DashboardCardRepository.test.ts`:

Update the `ensureDefaultCards` `inserts all six defaults when none exist` test — empty project now inserts the **sectioned** set:

```ts
    it("inserts all six sectioned defaults when none exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(6);
      const allParams = (mockDb.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
      const keys = allParams.map((p) => p[1]);
      expect(keys).toEqual(["total_inspection_done", "total_pole_status", "total_camera_count", "today_inspection_done", "today_pole_status", "today_camera_count"]);
    });
```

Update the two idempotency tests — they now use the **sectioned** key list:

```ts
    it("is idempotent when all sectioned defaults exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("does not re-enable or overwrite an existing default", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
```

Update `re-inserts only the deleted default keys` — existing keys are legacy → legacy set, `total_cameras` re-inserted (assert the INSERT carries the new columns):

```ts
    it("re-inserts only the deleted legacy key when the project has legacy cards", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspections" },
        { CardKey: "total_poles" },
        { CardKey: "today_inspections_done" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[1]).toBe("total_cameras");
      expect(params[10]).toBeNull();   // BreakdownField
      expect(params[11]).toBeNull();   // SectionLabel
      expect(params[12]).toBeNull();   // AggregateField
      expect(sql.match(/\?/g)).toHaveLength(14);
    });
```

Add a new set-selection test: a project with ONLY sectioned keys stays sectioned (no legacy cards injected):

```ts
    it("does not inject legacy cards into a sectioned project", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
```

Add a new `migrateDefaultCards` test proving sectioned projects are NOT legacy-upgraded:

```ts
  it("migrateDefaultCards is a no-op for a sectioned project", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { CardKey: "total_inspection_done" },
      { CardKey: "total_pole_status" },
      { CardKey: "total_camera_count" },
      { CardKey: "today_inspection_done" },
      { CardKey: "today_pole_status" },
      { CardKey: "today_camera_count" },
    ]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.migrateDefaultCards(1);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
    expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: FAIL — `ensureDefaultCards`/`migrateDefaultCards` still use `DEFAULT_DASHBOARD_CARDS` unconditionally and INSERTs lack the new columns.

- [ ] **Step 7: Implement set-aware reconciliation + extend INSERTs**

`src/database/repositories/DashboardCardRepository.ts`:

1. Import the sectioned set:

```ts
import { DEFAULT_DASHBOARD_CARDS, DEFAULT_SECTIONED_CARDS } from "../seeds/dashboard-cards.seed";
```

2. Add a module-level helper after `mapRow`:

```ts
const LEGACY_DEFAULT_KEYS = DEFAULT_DASHBOARD_CARDS.map((c) => c.CardKey);

function selectDefaultSet(existingKeys: Set<string>): DashboardCardSeed[] {
  const isLegacy = LEGACY_DEFAULT_KEYS.some((key) => existingKeys.has(key));
  return isLegacy ? DEFAULT_DASHBOARD_CARDS : DEFAULT_SECTIONED_CARDS;
}
```

3. Update `ensureDefaultCards` to use the selected set and the 16-column INSERT:

```ts
  static async ensureDefaultCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardKey: string }>(
      `SELECT CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );
    const existingKeys = new Set(existing.map((r) => r.CardKey));

    const activeSet = selectDefaultSet(existingKeys);
    const missing = activeSet.filter((c) => !existingKeys.has(c.CardKey));
    if (missing.length === 0) return;

    await db.withTransactionAsync(async () => {
      for (const card of missing) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, SortOrder, Enabled, IsDefault)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            projectId,
            card.CardKey,
            card.Title,
            card.Icon,
            card.Color,
            card.EntityType,
            card.CounterType,
            card.FilterJson ?? null,
            card.CountMode,
            card.DistinctColumn ?? null,
            card.BreakdownField ?? null,
            card.SectionLabel ?? null,
            card.AggregateField ?? null,
            card.SortOrder,
          ]
        );
      }
    });
  }
```

4. Update `migrateDefaultCards` — keep legacy behavior for legacy projects, but no-op for sectioned projects, and use the 16-column INSERT:

```ts
  static async migrateDefaultCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardKey: string }>(
      `SELECT CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );
    const existingKeys = new Set(existing.map((r) => r.CardKey));

    if (!LEGACY_DEFAULT_KEYS.some((key) => existingKeys.has(key))) return;

    if (existingKeys.has("total_inspections") && existingKeys.has("today_inspections_done")) {
      return;
    }

    const missing = DEFAULT_DASHBOARD_CARDS.filter((c) => !existingKeys.has(c.CardKey));

    await db.withTransactionAsync(async () => {
      for (const card of missing) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, SortOrder, Enabled, IsDefault)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            projectId,
            card.CardKey,
            card.Title,
            card.Icon,
            card.Color,
            card.EntityType,
            card.CounterType,
            card.FilterJson ?? null,
            card.CountMode,
            card.DistinctColumn ?? null,
            card.BreakdownField ?? null,
            card.SectionLabel ?? null,
            card.AggregateField ?? null,
            card.SortOrder,
          ]
        );
      }

      const defaults = await db.getAllAsync<{ CardID: number; CardKey: string }>(
        `SELECT CardID, CardKey FROM DashboardCards WHERE ProjectID = ? AND IsDefault = 1`,
        [projectId]
      );
      const canonical = new Map(DEFAULT_DASHBOARD_CARDS.map((c) => [c.CardKey, c]));
      for (const row of defaults) {
        const config = canonical.get(row.CardKey);
        if (!config) continue;
        await db.runAsync(
          `UPDATE DashboardCards SET SortOrder = ?, DistinctColumn = ? WHERE CardID = ?`,
          [config.SortOrder, config.DistinctColumn ?? null, row.CardID]
        );
      }
    });
  }
```

Note: `DashboardCardSeed` type import may be needed in the repo file — import it alongside the seed constants if `selectDefaultSet`'s return type references it.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/dashboardCards.seed.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/seeds/dashboard-cards.seed.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 10: Commit (optional)**

```bash
git add src/database/seeds/dashboard-cards.seed.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/repositories/DashboardCardRepository.test.ts
git commit -m "feat(dashboard): sectioned default cards (Total/Today's) with set-aware reconciliation"
```

---

### Task 3: Schema migration — `SectionLabel` + `AggregateField` columns

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/__tests__/database/schema.test.ts`

**Interfaces:**
- Consumes: `createDashboardCardsTable`, `DashboardCardRepository.ensureDefaultCards`, `DashboardCardRepository.migrateDefaultCards`.
- Produces: `migrateProjectSchema()` idempotently adds `DashboardCards.SectionLabel` and `DashboardCards.AggregateField` (try/catch pattern), keeping the existing `BreakdownField` migration intact.

- [ ] **Step 1: Write the failing schema tests**

Add two tests at the end of `src/__tests__/database/schema.test.ts` (the `DashboardCardRepository` mock already includes both methods):

```ts
  it("migrateProjectSchema adds the SectionLabel and AggregateField columns idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");

    await migrateProjectSchema();

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT")
    );
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT")
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/database/schema.test.ts`
Expected: FAIL — the two ALTERs are not executed.

- [ ] **Step 3: Implement the migration wiring**

`src/database/schema.ts` — in `migrateProjectSchema()`, after the existing `BreakdownField` ALTER try/catch block (lines ~248-253), add:

```ts
    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT;`);
        logger.info("[schema] Migration: SectionLabel column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: SectionLabel column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT;`);
        logger.info("[schema] Migration: AggregateField column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: AggregateField column already exists in DashboardCards (ok)");
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/database/schema.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/schema.ts src/__tests__/database/schema.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/database/schema.ts src/__tests__/database/schema.test.ts
git commit -m "feat(dashboard): migrate SectionLabel and AggregateField columns on project open"
```

---

### Task 4: `StatisticCountService.fieldCard` sum engine

**Files:**
- Modify: `src/database/repositories/StatisticCountService.ts`
- Modify: `src/__tests__/repositories/StatisticCountService.test.ts`

**Interfaces:**
- Consumes: `COUNTER_TYPES`, `getDatabase()`, `getTodayDateString()`.
- Produces: `StatisticCountService.fieldCard(projectId: number, card: DashboardCard): Promise<number>` — SUM of a numeric inspection-form field.
- **Interfaces note:** param order mirrors `breakdownCard`: `[projectId, ...time.params, fieldKey]`. `FilterJson` is intentionally ignored (sum has no value filter). Entity must be `inspections`.

- [ ] **Step 1: Write the failing tests**

Add a `describe("fieldCard", ...)` block to `src/__tests__/repositories/StatisticCountService.test.ts`:

```ts
  describe("fieldCard", () => {
    const fieldCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ EntityType: "inspections", AggregateField: "camera_count", ...overrides });

    it("sums the numeric field values for a total card", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ total: 7 });
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(7);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("SUM(CAST(iv.FieldValue AS REAL))");
      expect(normalizeSql(sql)).toContain("FROM Inspections i");
      expect(normalizeSql(sql)).toContain("JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("JOIN InspectionFields f ON f.FieldID = iv.FieldID");
      expect(normalizeSql(sql)).toContain("AND f.FieldKey = ?");
      expect(normalizeSql(sql)).toContain("AND f.IsActive = 1");
      expect(params).toEqual([1, "camera_count"]);
    });

    it("adds the today date clause and param", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ total: 3 });
      const result = await StatisticCountService.fieldCard(1, fieldCard({ CounterType: "today" }));
      expect(result).toBe(3);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString(), "camera_count"]);
    });

    it("returns 0 when the sum is null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(0);
    });

    it("returns 0 for a non-inspections entity without touching the db", async () => {
      const result = await StatisticCountService.fieldCard(1, fieldCard({ EntityType: "cameras" }));
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 when AggregateField is missing", async () => {
      const result = await StatisticCountService.fieldCard(1, cardOf());
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 for an unknown counter type", async () => {
      const result = await StatisticCountService.fieldCard(1, fieldCard({ CounterType: "weekly" }));
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 when the query rejects", async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(0);
    });

    it("returns 0 when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/StatisticCountService.test.ts`
Expected: FAIL — `fieldCard` does not exist.

- [ ] **Step 3: Implement `fieldCard`**

`src/database/repositories/StatisticCountService.ts` — add a new method after `breakdownCard`:

```ts
  static async fieldCard(projectId: number, card: DashboardCard): Promise<number> {
    try {
      if (card.EntityType !== "inspections" || !card.AggregateField) return 0;

      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return 0;

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause("i");
      if (time.clause) params.push(...time.params);

      params.push(card.AggregateField);

      const sql = `SELECT SUM(CAST(iv.FieldValue AS REAL)) AS total
         FROM Inspections i
         JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
         JOIN InspectionFields f ON f.FieldID = iv.FieldID
         WHERE i.ProjectID = ?
         ${time.clause}
         AND f.FieldKey = ?
         AND f.IsActive = 1`;

      const db = await getDatabase();
      const row = await db.getFirstAsync<{ total: number | null }>(sql, params);
      return row?.total ?? 0;
    } catch {
      return 0;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/StatisticCountService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/repositories/StatisticCountService.ts src/__tests__/repositories/StatisticCountService.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/database/repositories/StatisticCountService.ts src/__tests__/repositories/StatisticCountService.test.ts
git commit -m "feat(dashboard): fieldCard sum engine for numeric form fields"
```

---

### Task 5: `DashboardService` dispatches `AggregateField` → `fieldCard`

**Files:**
- Modify: `src/database/repositories/DashboardService.ts`
- Modify: `src/__tests__/repositories/DashboardService.test.ts`

**Interfaces:**
- Consumes: `DashboardCardRepository.getEnabledCards`, `StatisticCountService.countCard`, `breakdownCard`, new `fieldCard(projectId, card)`.
- Produces: `CardWithCount` (unchanged shape); `getEnabledCardsWithCounts` dispatches: `AggregateField` → `fieldCard`; else `BreakdownField` → `breakdownCard`; else `countCard`.

- [ ] **Step 1: Write the failing tests**

Update `src/__tests__/repositories/DashboardService.test.ts`. The existing `cardOf` helper gains `SectionLabel: null` and `AggregateField: null`. Add tests:

```ts
  it("returns a summed value for an aggregate card without calling count/breakdown", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 5, CardKey: "total_camera_count", AggregateField: "camera_count" }),
    ]);
    countService.fieldCard.mockResolvedValue(17);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.countCard).not.toHaveBeenCalled();
    expect(countService.breakdownCard).not.toHaveBeenCalled();
    expect(countService.fieldCard).toHaveBeenCalledWith(1, expect.objectContaining({ AggregateField: "camera_count" }));
    expect(result[0]).toEqual(expect.objectContaining({ CardID: 5, count: 17 }));
  });

  it("mixes count, breakdown, and aggregate cards", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 1, CardKey: "total_poles" }),
      cardOf({ CardID: 2, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond" }),
      cardOf({ CardID: 3, CardKey: "total_camera_count", AggregateField: "camera_count" }),
    ]);
    countService.countCard.mockResolvedValue(12);
    countService.breakdownCard.mockResolvedValue([{ label: "Good", count: 42 }]);
    countService.fieldCard.mockResolvedValue(17);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result[0]).toEqual(expect.objectContaining({ count: 12, breakdown: undefined }));
    expect(result[1]).toEqual(expect.objectContaining({ count: undefined, breakdown: [{ label: "Good", count: 42 }] }));
    expect(result[2]).toEqual(expect.objectContaining({ count: 17, breakdown: undefined }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardService.test.ts`
Expected: FAIL — aggregate cards fall through to `countCard`.

- [ ] **Step 3: Implement the dispatch**

`src/database/repositories/DashboardService.ts`:

```ts
    for (const card of cards) {
      if (card.AggregateField) {
        const count = await StatisticCountService.fieldCard(projectId, card);
        result.push({ ...card, count, breakdown: undefined });
      } else if (card.BreakdownField) {
        const breakdown = await StatisticCountService.breakdownCard(projectId, card);
        result.push({ ...card, count: undefined, breakdown });
      } else {
        const count = await StatisticCountService.countCard(projectId, card);
        result.push({ ...card, count, breakdown: undefined });
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/repositories/DashboardService.ts src/__tests__/repositories/DashboardService.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/database/repositories/DashboardService.ts src/__tests__/repositories/DashboardService.test.ts
git commit -m "feat(dashboard): service dispatches aggregate cards to fieldCard sum"
```

---

### Task 6: `DashboardCardGrid` section headers + section-aware pairing

**Files:**
- Modify: `src/components/dashboard/DashboardCardGrid.tsx`
- Modify: `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`

**Interfaces:**
- Consumes: `CardWithCount` (with `SectionLabel?: string | null`), `StatCard`, `StatBreakdownCard`, `MaterialCommunityIcons` glyph map.
- Produces: `DashboardCardGrid` emits a section header `Text` before the first card of each non-null `SectionLabel`; pairing (2-per-row) never spans a section boundary.

- [ ] **Step 1: Write the failing component tests**

Update `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`. Add `SectionLabel: null` and `AggregateField: null` to the `cardWithCount` helper. Add tests:

```ts
  it("renders section headers for grouped default cards", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: "Total", count: 8 }),
      cardWithCount({ CardID: 2, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: "Total", count: 17 }),
      cardWithCount({ CardID: 3, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: "Today's", count: 2 }),
      cardWithCount({ CardID: 4, CardKey: "today_camera_count", Title: "Camera Count", SectionLabel: "Today's", count: 5 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total");
    expect(strings).toContain("Today's");
    expect(strings.indexOf("Total")).toBeLessThan(strings.indexOf("Inspection Done"));
    expect(strings.indexOf("Today's")).toBeGreaterThan(strings.indexOf("Inspection Done"));
  });

  it("renders no section headers for cards with null SectionLabel", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
      cardWithCount({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras", count: 40 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).not.toContain("Total");
    expect(strings).not.toContain("Today's");
  });

  it("does not pair the last card of one section with the first of the next", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: "Total", count: 17 }),
      cardWithCount({ CardID: 2, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: "Today's", count: 2 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total");
    expect(strings).toContain("Today's");
    expect(strings.indexOf("Today's")).toBeGreaterThan(strings.indexOf("Camera Count"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: FAIL — no headers rendered; cross-section pairing present.

- [ ] **Step 3: Implement section grouping**

`src/components/dashboard/DashboardCardGrid.tsx` — replace the row-building loop (lines 46-94) with section-aware logic:

```tsx
  const rows = [];
  let currentSection: string | null = null;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const section = card.SectionLabel ?? null;

    if (section !== currentSection) {
      currentSection = section;
      if (section) {
        rows.push(
          <Text key={`section-${section}-${i}`} style={styles.sectionHeader}>
            {section}
          </Text>
        );
      }
    }

    if (card.BreakdownField) {
      rows.push(
        <StatBreakdownCard
          key={card.CardID}
          title={card.Title}
          icon={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
          color={card.Color}
          rows={card.breakdown ?? []}
        />
      );
      continue;
    }

    const next = cards[i + 1];
    if (next && !next.BreakdownField && (next.SectionLabel ?? null) === section) {
      rows.push(
        <View key={`${card.CardID}-${next.CardID}`} style={styles.statRow}>
          <StatCard
            title={card.Title}
            value={card.count ?? 0}
            icon={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={card.Color}
          />
          <StatCard
            title={next.Title}
            value={next.count ?? 0}
            icon={next.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={next.Color}
          />
        </View>
      );
      i++;
    } else {
      rows.push(
        <View key={card.CardID} style={styles.statRow}>
          <StatCard
            title={card.Title}
            value={card.count ?? 0}
            icon={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
            color={card.Color}
          />
        </View>
      );
    }
  }
```

Add a style:

```ts
  sectionHeader: {
    fontWeight: "700",
    fontSize: 15,
    marginTop: 12,
    marginBottom: 6,
    color: "#333",
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: PASS (all tests, including the three new ones).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/components/dashboard/DashboardCardGrid.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/components/dashboard/DashboardCardGrid.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx
git commit -m "feat(dashboard): render section headers and section-aware pairing"
```

---

### Task 7: Manage Cards dialog UX fixes (scrollable form + Cancel buttons)

**Files:**
- Modify: `src/components/dashboard/DashboardCardManager.tsx`
- Modify: `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`

**Interfaces:**
- Consumes: existing manager state, `Dialog`/`Button` from react-native-paper.
- Produces: the Add/Edit card editor `Dialog.Content` becomes scrollable (`ScrollView`); every nested picker `Dialog` (Entity, Counter, Count Mode, Distinct, Group-by Field, Filter Column) gains a `Dialog.Actions` Cancel button. No repository/service changes.

- [ ] **Step 1: Write the failing component tests**

Add to `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`:

```tsx
  it("wraps the editor form in a scrollable container", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const scrollViews = tree.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && (type as { name?: string }).name === "ScrollView";
    });
    expect(scrollViews.length).toBeGreaterThan(0);
  });

  it("adds a Cancel button to the entity picker dialog", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Inspections");
    const cancelButtons = tree.root.findAll((node) => {
      const props = node.props as { children?: unknown; title?: unknown };
      return typeof props.children === "string" && props.children === "Cancel";
    });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("adds a Cancel button to the counter picker dialog", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Total");
    const cancelButtons = tree.root.findAll((node) => {
      const props = node.props as { children?: unknown; title?: unknown };
      return typeof props.children === "string" && props.children === "Cancel";
    });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("adds a Cancel button to the count mode picker dialog", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Count");
    const cancelButtons = tree.root.findAll((node) => {
      const props = node.props as { children?: unknown; title?: unknown };
      return typeof props.children === "string" && props.children === "Cancel";
    });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(2);
  });
```

**Caution:** `pressButton(tree, "Inspections")` targets the entity selector button (a `Button` whose label is the current entity). With the nested picker open, both the editor's Cancel and the picker's Cancel render → `>= 2`. Existing tests that press a picker option (e.g. `pressButton(tree, "Cameras")`) must still find the option first — ensure the picker's Cancel button has no conflicting `title`/`icon` and keep the option `List.Item` labels unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx`
Expected: FAIL — editor content is not in a `ScrollView`; nested pickers have no Cancel.

- [ ] **Step 3: Implement the fixes**

`src/components/dashboard/DashboardCardManager.tsx`:

1. The editor dialog's `Dialog.Content` (line 315) — wrap its children in a `ScrollView`:

```tsx
        <Dialog.Content>
          <ScrollView style={styles.editorScroll}>
            {/* existing inputs (Title, Icon, Color, Entity, Counter, Count Mode, breakdown, filters) */}
          </ScrollView>
        </Dialog.Content>
```

Add a style (and keep `ScrollView` imported — it already is, line 2):

```ts
  editorScroll: {
    maxHeight: 420,
  },
```

2. Add `Dialog.Actions` with a Cancel button to each nested picker dialog:

- Entity picker (lines ~359-382), after `</Dialog.Content>`:

```tsx
            <Dialog.Actions>
              <Button onPress={() => setEntityMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
```

- Counter picker (lines ~392-409):

```tsx
            <Dialog.Actions>
              <Button onPress={() => setCounterMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
```

- Count Mode picker (lines ~419-456):

```tsx
            <Dialog.Actions>
              <Button onPress={() => setModeMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
```

- Distinct Column picker (lines ~468-485):

```tsx
                <Dialog.Actions>
                  <Button onPress={() => setDistinctMenuVisible(false)}>Cancel</Button>
                </Dialog.Actions>
```

- Group-by Field picker (lines ~506-524):

```tsx
            <Dialog.Actions>
              <Button onPress={() => setBreakdownMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
```

- Filter Column picker (lines ~552-569):

```tsx
            <Dialog.Actions>
              <Button onPress={() => setFilterMenuIndex(null)}>Cancel</Button>
            </Dialog.Actions>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx`
Expected: PASS (all tests, including the new Cancel/scroll ones and the existing picker-flow tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/components/dashboard/DashboardCardManager.tsx src/__tests__/components/dashboard/DashboardCardManager.test.tsx`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/components/dashboard/DashboardCardManager.tsx src/__tests__/components/dashboard/DashboardCardManager.test.tsx
git commit -m "feat(dashboard): scrollable card editor with Cancel buttons on pickers"
```

---

### Task 8: Isolation regression + changelog

**Files:**
- Modify: `src/__tests__/database/isolation.test.ts`
- Modify: `docs/07-Changelog.md`

**Interfaces:**
- Consumes: `DashboardCardRepository.createCard`, existing A→B→A round-trip pattern.
- Produces: isolation regression proving sectioned default card data (`SectionLabel`/`AggregateField`) does not leak across projects.

- [ ] **Step 1: Write the failing isolation test**

Add to `describe("Cross-project data isolation")` in `src/__tests__/database/isolation.test.ts`:

```ts
  it("does not leak a sectioned default card created in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository") as typeof import("@/src/database/repositories/DashboardCardRepository");
    const cardId = await DashboardCardRepository.createCard({
      ProjectID: 1,
      CardKey: "leak_sectioned_card",
      Title: "Inspection Done",
      Icon: "clipboard-text",
      Color: "#0B5ED7",
      EntityType: "inspections",
      CounterType: "total",
      FilterJson: JSON.stringify({ Status: "Completed" }),
      CountMode: "count",
      DistinctColumn: null,
      SectionLabel: "Total",
      AggregateField: null,
      SortOrder: 0,
      Enabled: 1,
      IsDefault: 1,
    });
    expect(cardId).toBeGreaterThan(0);

    const sectionedInA = await dbA.getAllAsync<{ SectionLabel: string | null }>(
      "SELECT SectionLabel FROM DashboardCards WHERE CardKey = 'leak_sectioned_card'"
    );
    expect(sectionedInA).toEqual([{ SectionLabel: "Total" }]);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);

    const cardsInB = await dbB.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );
    expect(cardsInB.some((c) => c.CardKey === "leak_sectioned_card")).toBe(false);

    const sectionedInAAfter = await dbA.getAllAsync<{ SectionLabel: string | null }>(
      "SELECT SectionLabel FROM DashboardCards WHERE CardKey = 'leak_sectioned_card'"
    );
    expect(sectionedInAAfter).toEqual([{ SectionLabel: "Total" }]);
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest src/__tests__/database/isolation.test.ts`
Expected: PASS (isolation held; the new test passes because `createCard` persists `SectionLabel` per-project).

- [ ] **Step 3: Changelog**

Add entries under `### Added` in the `[Unreleased]` section of `docs/07-Changelog.md`:

```md
- Dashboard cards: new-project default set is now sectioned into "Total" and "Today's" groups — Inspection Done (Completed only), Pole Status (Yes/No breakdown), and Camera Count (sum of `camera_count`) per group. Existing projects keep their current cards (idempotent set-aware migrations add `SectionLabel`/`AggregateField` columns).
- Manage Cards dialog: the Add/Edit card form is now scrollable and every nested picker (entity, counter, count mode, distinct column, group-by field, filter column) has a Cancel button.
- Fixed `DashboardCardRepository.createCard` INSERT column/placeholder mismatch (14 columns / 15 placeholders) that real SQLite would reject.
```

- [ ] **Step 4: Full verification**

Run: `npx jest`; `npx tsc --noEmit`; `npx eslint src/components/dashboard src/database/repositories src/database/seeds src/database/schema.ts src/__tests__/repositories src/__tests__/components/dashboard src/__tests__/database`
Expected: full suite green, tsc clean, no new eslint errors.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/__tests__/database/isolation.test.ts docs/07-Changelog.md
git commit -m "test(dashboard): isolation regression for sectioned default cards; changelog"
```
