# Dashboard Card Defaults + Breakdown Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 default dashboard cards with a 6-card set (adds Total Inspections + Today's Inspections Done), and add a "Breakdown" card type that groups inspections by any active field of the default inspection form (e.g. Foundation Condition → `Good 42, Bad 7, Fair 3`), selectable from Add/Edit Card.

**Architecture:** The 6-card set lives in `DEFAULT_DASHBOARD_CARDS` (seed), now with a `FilterJson` field so "Today's Inspections Done" seeds `{"Status":"Completed"}`. A new `DashboardCards.BreakdownField TEXT` column marks a card as a breakdown card. `StatisticCountService.breakdownCard()` runs a parameterized `GROUP BY` over `InspectionValues`. `DashboardService` returns `count` for normal cards or `breakdown[]` for breakdown cards; `DashboardCardGrid` branches to a new `StatBreakdownCard`. `DashboardCardManager` gains a third mode that loads form fields from the DB. Both schema additions (column + default-card upgrade) are idempotent migrations inside `migrateProjectSchema()`.

**Tech Stack:** React Native (Expo) + TypeScript strict; `expo-sqlite` (single sequential connection, ADR-014); react-native-paper; MaterialCommunityIcons. Jest + jest-expo.

## Global Constraints

- All code lives in `frontend/`. All commands run from `frontend/`.
- TypeScript strict mode; avoid `any`. No comments unless requested.
- `@/*` aliases to `frontend/*`.
- **No `yarn` on PATH** — use `npx jest <file>`, `npx tsc --noEmit`, `npx eslint <files>`. `npx jest` = 31 suites / 317 tests baseline (all pass).
- **ADR-014 (critical):** never call `getGlobalDatabase()` in the project/inspection flow. `DashboardCards` lives in the project DB only. All reads/writes go through `getDatabase()` (single sequential handle). Never open two handles.
- **Isolation (mandatory):** breakdown cards are per-project rows in `DashboardCards`. Each new feature must ship an isolation regression test (mirror `src/__tests__/database/isolation.test.ts`): create a breakdown card in Project A, open Project B, assert not present.
- **Mocks stay path-aware:** new test fixtures use distinct DB paths/names; never share a single mock handle across projects.
- **Migration requirement:** `migrateProjectSchema()` must (a) idempotently add `DashboardCards.BreakdownField` (`try/catch ALTER TABLE`, existing pattern in `schema.ts:65-95`) and (b) idempotently upgrade existing projects to the 6-card set via `DashboardCardRepository.migrateDefaultCards()` — wrapped in its own `try/catch` (non-fatal, existing pattern at `schema.ts:236-246`).
- **Default-card semantics:** `CardKey` is the stable identity. `migrateDefaultCards()` is a **one-time upgrade**: if `total_inspections` AND `today_inspections_done` already exist → no-op. Otherwise insert missing defaults + renumber `SortOrder` of `IsDefault = 1` rows to canonical order + normalize `DistinctColumn` to `"i.PoleID"` on the poles cards. Never touches titles, `Enabled`, or custom `IsDefault = 0` cards.
- **DistinctColumn bug fix:** `buildCountSql` validates `DistinctColumn` against `distinctableColumns` = `["i.PoleID","i.InspectionID"]`. The old seed stored `"PoleID"` (no `i.` prefix) → silently fell back to `COUNT(*)`. New seed + migration store `"i.PoleID"`.
- **Breakdown scope:** breakdowns group **inspections** by **inspection-form** field values only (`EntityType` forced to `inspections`). Regular count cards keep their static `filterableColumns` allowlist. No drill-down navigation from a breakdown card.
- **Filter safety:** breakdown `FilterJson` keys are validated against the inspections `filterableColumns` allowlist (`["Status"]`); values bound as parameters. Unknown entity / missing `BreakdownField` / no rows → `[]`, never a thrown error.
- **Coverage:** `jest.config.js` per-file thresholds are 80% (branches 70) for each repository and the manager. New code must not add new eslint errors. New files that need thresholds: none beyond existing (service, engine, repo, manager already have thresholds; seed and `.table.ts` files are excluded from coverage).
- **Commit steps are OPTIONAL** — only commit when the user explicitly asks. Run the TDD + verification steps regardless.

---

### Task 1: `BreakdownField` data model + repository plumbing

**Files:**
- Modify: `src/database/tables/dashboard-cards.table.ts`
- Modify: `src/models/DashboardCard.ts`
- Modify: `src/database/repositories/DashboardCardRepository.ts`
- Modify: `src/__tests__/repositories/DashboardCardRepository.test.ts`

**Interfaces:**
- Consumes: existing `DashboardCard` model, existing `getDatabase()` mock (`createMockDb()` with `getAllAsync/getFirstAsync/runAsync/withTransactionAsync`).
- Produces: `DashboardCard.BreakdownField?: string | null`; `createCard`/`updateCard`/`mapRow`/`CARD_COLUMNS` all handle the new column. **Caution:** adding `BreakdownField` shifts `createCard` param indexes — the existing "SortOrder defaults" tests must move `params[10]` → `params[11]`.

- [ ] **Step 1: Add the column to the table DDL**

`src/database/tables/dashboard-cards.table.ts` — add `BreakdownField TEXT,` after the `DistinctColumn` line:

```ts
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
    BreakdownField TEXT,
    SortOrder INTEGER NOT NULL DEFAULT 0,
    Enabled INTEGER NOT NULL DEFAULT 1,
    IsDefault INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ProjectID, CardKey)
);
`;
```

- [ ] **Step 2: Add the field to the model**

`src/models/DashboardCard.ts` — add after `DistinctColumn`:

```ts
  DistinctColumn?: string | null;
  BreakdownField?: string | null;
```

- [ ] **Step 3: Write the failing repository tests**

Add these tests to `src/__tests__/repositories/DashboardCardRepository.test.ts`. First update the `rowOf` helper to include the new column:

```ts
function rowOf(card: DashboardCard): Record<string, unknown> {
  return {
    CardID: card.CardID ?? 1,
    ProjectID: card.ProjectID,
    CardKey: card.CardKey,
    Title: card.Title,
    Icon: card.Icon,
    Color: card.Color,
    EntityType: card.EntityType,
    CounterType: card.CounterType,
    FilterJson: card.FilterJson ?? null,
    CountMode: card.CountMode,
    DistinctColumn: card.DistinctColumn ?? null,
    BreakdownField: card.BreakdownField ?? null,
    SortOrder: card.SortOrder,
    Enabled: card.Enabled,
    IsDefault: card.IsDefault,
  };
}
```

Then add a new `describe("BreakdownField", ...)` block at the end of the suite:

```ts
describe("BreakdownField", () => {
  it("maps BreakdownField from a row", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      rowOf(baseCard({ CardID: 3, BreakdownField: "foundation_cond" })),
    ]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const cards = await DashboardCardRepository.getAllCards(1);
    expect(cards[0].BreakdownField).toBe("foundation_cond");
  });

  it("createCard persists BreakdownField", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.createCard(
      baseCard({ BreakdownField: "foundation_cond" })
    );
    const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(params[10]).toBe("foundation_cond");
    expect(params[11]).toBe(0);
  });

  it("updateCard persists BreakdownField", async () => {
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.updateCard(
      baseCard({ CardID: 5, BreakdownField: "pole_status" })
    );
    const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("BreakdownField = ?");
    expect(params).toContain("pole_status");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: FAIL — the 3 new tests fail (column not in SQL/params, undefined `BreakdownField`).

- [ ] **Step 5: Implement repository plumbing**

`src/database/repositories/DashboardCardRepository.ts`:

1. `CARD_COLUMNS` — add `BreakdownField` after `DistinctColumn`:

```ts
const CARD_COLUMNS = `
  CardID, ProjectID, CardKey, Title, Icon, Color,
  EntityType, CounterType, FilterJson, CountMode, DistinctColumn,
  BreakdownField, SortOrder, Enabled, IsDefault, CreatedAt, UpdatedAt
`;
```

2. `mapRow` — add after the `DistinctColumn` line:

```ts
    BreakdownField: (row.BreakdownField as string) ?? null,
```

3. `createCard` — add `BreakdownField` to the INSERT column list and params (right after `DistinctColumn`):

```ts
    const result = await db.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        sortOrder,
        card.Enabled,
        card.IsDefault,
      ]
    );
```

4. `updateCard` — add `BreakdownField = ?` to the SET list and its param:

```ts
    await db.runAsync(
      `UPDATE DashboardCards
       SET Title = ?, Icon = ?, Color = ?, EntityType = ?, CounterType = ?,
           FilterJson = ?, CountMode = ?, DistinctColumn = ?, BreakdownField = ?, SortOrder = ?,
           Enabled = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE CardID = ?`,
      [
        card.Title,
        card.Icon,
        card.Color,
        card.EntityType,
        card.CounterType,
        card.FilterJson ?? null,
        card.CountMode,
        card.DistinctColumn ?? null,
        card.BreakdownField ?? null,
        card.SortOrder,
        card.Enabled,
        card.CardID!,
      ]
    );
```

5. Fix the two existing "SortOrder defaults" tests — `params[10]` → `params[11]` in both `createCard defaults SortOrder to max+1 when omitted` and `createCard falls back to 0 when max SortOrder is null`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: PASS (all tests, including updated SortOrder index tests).

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/tables/dashboard-cards.table.ts src/models/DashboardCard.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 8: Commit (optional)**

```bash
git add src/database/tables/dashboard-cards.table.ts src/models/DashboardCard.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/repositories/DashboardCardRepository.test.ts
git commit -m "feat(dashboard): add BreakdownField column to dashboard cards"
```

---

### Task 2: New 6-card default set + `FilterJson` seed support + `migrateDefaultCards`

**Files:**
- Modify: `src/database/seeds/dashboard-cards.seed.ts`
- Modify: `src/database/repositories/DashboardCardRepository.ts` (`ensureDefaultCards` + new `migrateDefaultCards`)
- Modify: `src/__tests__/database/dashboardCards.seed.test.ts`
- Modify: `src/__tests__/repositories/DashboardCardRepository.test.ts`

**Interfaces:**
- Consumes: `DashboardCardSeed` interface; `seedDashboardCards()`; `ensureDefaultCards()`.
- Produces: `DEFAULT_DASHBOARD_CARDS` (6 cards, `FilterJson?` on seed); `DashboardCardRepository.migrateDefaultCards(projectId: number): Promise<void>`.
- **Interfaces note:** `seedDashboardCards` and `ensureDefaultCards` both have INSERT statements that currently hardcode `NULL` for FilterJson — both must switch to `card.FilterJson ?? null`. Their column/placeholder lists do NOT change in this task (BreakdownField is added by Task 1).

- [ ] **Step 1: Write the failing seed tests**

Update `src/__tests__/database/dashboardCards.seed.test.ts`:

Replace the `seeds exactly the four default cards` test with:

```ts
  it("seeds exactly the six default cards on an empty project", async () => {
    await openProject();
    const { seedDashboardCards, DEFAULT_DASHBOARD_CARDS } = require("@/src/database/seeds/dashboard-cards.seed");

    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string; Title: string }>(
      "SELECT CardKey, Title FROM DashboardCards"
    );

    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.CardKey).sort()).toEqual(
      ["total_inspections", "total_poles", "total_cameras", "today_inspections_done", "today_poles", "today_cameras"].sort()
    );
    expect(DEFAULT_DASHBOARD_CARDS).toHaveLength(6);
  });
```

Replace the `is idempotent — seeding twice leaves exactly 4 rows` test with:

```ts
  it("is idempotent — seeding twice leaves exactly 6 rows", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");

    await seedDashboardCards();
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );

    expect(cards).toHaveLength(6);
  });
```

Replace the `does not duplicate existing default cards when custom rows exist` test with:

```ts
  it("does not duplicate existing default cards when custom rows exist", async () => {
    await openProject();
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();

    await db.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, 1, 0)`,
      [1, "custom_switch_total", "Total Switches", "lan", "#111111", "devices", "total", "count", 99]
    );

    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const cards = await db.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );

    expect(cards).toHaveLength(7);
    const keys = cards.map((c) => c.CardKey);
    expect(keys.filter((k) => k === "total_poles")).toHaveLength(1);
    expect(keys).toContain("custom_switch_total");
  });
```

Add a new test verifying the completed-filter default:

```ts
  it("seeds today_inspections_done with a Completed status filter", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const row = await db.getFirstAsync<{ FilterJson: string; CounterType: string; SortOrder: number }>(
      "SELECT FilterJson, CounterType, SortOrder FROM DashboardCards WHERE CardKey = 'today_inspections_done'"
    );
    expect(row).not.toBeNull();
    expect(row!.FilterJson).toBe(JSON.stringify({ Status: "Completed" }));
    expect(row!.CounterType).toBe("today");
    expect(row!.SortOrder).toBe(3);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts`
Expected: FAIL — 4 seed tests fail (still 4 cards, no FilterJson).

- [ ] **Step 3: Update the seed list + interface**

`src/database/seeds/dashboard-cards.seed.ts`:

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
  SortOrder: number;
}

export const DEFAULT_DASHBOARD_CARDS: DashboardCardSeed[] = [
  { CardKey: "total_inspections",      Title: "Total Inspections",        Icon: "clipboard-text",     Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "count",   SortOrder: 0 },
  { CardKey: "total_poles",            Title: "Total Poles",              Icon: "transmission-tower", Color: "#0B5ED7", EntityType: "inspections", CounterType: "total", CountMode: "distinct", DistinctColumn: "i.PoleID", SortOrder: 1 },
  { CardKey: "total_cameras",          Title: "Total Cameras",            Icon: "cctv",               Color: "#198754", EntityType: "cameras",     CounterType: "total", CountMode: "count",   SortOrder: 2 },
  { CardKey: "today_inspections_done", Title: "Today's Inspections Done", Icon: "check-circle",       Color: "#198754", EntityType: "inspections", CounterType: "today", CountMode: "count",   FilterJson: JSON.stringify({ Status: "Completed" }), SortOrder: 3 },
  { CardKey: "today_poles",            Title: "Today's Poles",            Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "distinct", DistinctColumn: "i.PoleID", SortOrder: 4 },
  { CardKey: "today_cameras",          Title: "Today's Cameras",          Icon: "cctv",               Color: "#6F42C1", EntityType: "cameras",     CounterType: "today", CountMode: "count",   SortOrder: 5 },
];
```

In `seedDashboardCards()`, replace the hardcoded `NULL` FilterJson with the seed value:

```ts
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
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
          card.SortOrder,
        ]
      );
```

- [ ] **Step 4: Run seed tests to verify they pass**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Write the failing `migrateDefaultCards` + `ensureDefaultCards` tests**

Add to the `describe("ensureDefaultCards")` block in `src/__tests__/repositories/DashboardCardRepository.test.ts`:

Replace `inserts all four defaults when none exist` with:

```ts
    it("inserts all six defaults when none exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(6);
      const allParams = (mockDb.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
      const keys = allParams.map((p) => p[1]);
      expect(keys).toEqual(["total_inspections", "total_poles", "total_cameras", "today_inspections_done", "today_poles", "today_cameras"]);
    });
```

Replace the idempotency tests with 6-key lists:

```ts
    it("is idempotent when all defaults exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspections" },
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_inspections_done" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("does not re-enable or overwrite an existing default", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspections" },
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_inspections_done" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("re-inserts only the deleted default keys", async () => {
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
      const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[1]).toBe("total_cameras");
    });
```

Add a new top-level `describe("migrateDefaultCards", ...)` at the end of the suite:

```ts
describe("migrateDefaultCards", () => {
  it("inserts the two new defaults and renumbers the old four", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ])
      .mockResolvedValueOnce([
        { CardID: 1, CardKey: "total_poles" },
        { CardID: 2, CardKey: "total_cameras" },
        { CardID: 3, CardKey: "today_poles" },
        { CardID: 4, CardKey: "today_cameras" },
      ]);
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.migrateDefaultCards(1);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(6);
    const inserts = (mockDb.runAsync as jest.Mock).mock.calls.filter((c) => c[0].includes("INSERT INTO DashboardCards"));
    expect(inserts).toHaveLength(2);
    const insertParams = inserts.map((c) => c[1]);
    expect(insertParams.map((p) => p[1])).toEqual(["total_inspections", "today_inspections_done"]);
    expect(insertParams[1][7]).toBe(JSON.stringify({ Status: "Completed" }));

    const updates = (mockDb.runAsync as jest.Mock).mock.calls.filter((c) => c[0].includes("UPDATE DashboardCards"));
    expect(updates).toHaveLength(4);
    expect(updates[0][1]).toEqual([1, "i.PoleID", 1]);
    expect(updates[1][1]).toEqual([2, null, 2]);
    expect(updates[2][1]).toEqual([4, "i.PoleID", 3]);
    expect(updates[3][1]).toEqual([5, null, 4]);
    expect(updates[0][0]).not.toContain("SET Title");
  });

  it("is a no-op when both new defaults already exist", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { CardKey: "total_inspections" },
      { CardKey: "total_poles" },
      { CardKey: "total_cameras" },
      { CardKey: "today_inspections_done" },
      { CardKey: "today_poles" },
      { CardKey: "today_cameras" },
    ]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.migrateDefaultCards(1);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
    expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
  });

  it("preserves admin-edited titles and Enabled state on existing defaults", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ])
      .mockResolvedValueOnce([
        { CardID: 1, CardKey: "total_poles" },
        { CardID: 2, CardKey: "total_cameras" },
        { CardID: 3, CardKey: "today_poles" },
        { CardID: 4, CardKey: "today_cameras" },
      ]);
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.migrateDefaultCards(1);

    const updates = (mockDb.runAsync as jest.Mock).mock.calls.filter((c) => c[0].includes("UPDATE DashboardCards"));
    for (const [, params] of updates) {
      expect(params).toHaveLength(3);
    }
    expect(updates[0][0]).not.toContain("Enabled");
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: FAIL — `migrateDefaultCards` does not exist; `ensureDefaultCards` inserts 4 not 6.

- [ ] **Step 7: Implement `migrateDefaultCards` + update `ensureDefaultCards`**

`src/database/repositories/DashboardCardRepository.ts`:

1. Update `ensureDefaultCards` INSERT to use the seed's FilterJson (replace hardcoded `null`):

```ts
          card.FilterJson ?? null,
```

2. Add `migrateDefaultCards` after `ensureDefaultCards`:

```ts
  static async migrateDefaultCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardKey: string }>(
      `SELECT CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );
    const existingKeys = new Set(existing.map((r) => r.CardKey));

    if (existingKeys.has("total_inspections") && existingKeys.has("today_inspections_done")) {
      return;
    }

    const missing = DEFAULT_DASHBOARD_CARDS.filter((c) => !existingKeys.has(c.CardKey));

    await db.withTransactionAsync(async () => {
      for (const card of missing) {
        await db.runAsync(
          `INSERT INTO DashboardCards
           (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, SortOrder, Enabled, IsDefault)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
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

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/dashboardCards.seed.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/seeds/dashboard-cards.seed.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 10: Commit (optional)**

```bash
git add src/database/seeds/dashboard-cards.seed.ts src/database/repositories/DashboardCardRepository.ts src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/repositories/DashboardCardRepository.test.ts
git commit -m "feat(dashboard): six default cards, FilterJson seeding, migrateDefaultCards upgrade"
```

---

### Task 3: Schema migration — `BreakdownField` column + `migrateDefaultCards` wiring

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/__tests__/database/schema.test.ts`

**Interfaces:**
- Consumes: `createDashboardCardsTable`, `DashboardCardRepository.ensureDefaultCards`, new `DashboardCardRepository.migrateDefaultCards(projectId: number)`.
- Produces: `migrateProjectSchema()` idempotently adds `DashboardCards.BreakdownField` and calls `migrateDefaultCards(1)` (non-fatal).

- [ ] **Step 1: Write the failing schema tests**

In `src/__tests__/database/schema.test.ts`, update the `DashboardCardRepository` mock to include the new method:

```ts
jest.mock("@/src/database/repositories/DashboardCardRepository", () => ({
  DashboardCardRepository: {
    ensureDefaultCards: jest.fn().mockResolvedValue(undefined),
    migrateDefaultCards: jest.fn().mockResolvedValue(undefined),
  },
}));
```

Add two tests at the end of the suite:

```ts
  it("migrateProjectSchema adds the BreakdownField column idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema();

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT")
    );
    expect(DashboardCardRepository.migrateDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema does not throw when migrateDefaultCards fails", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    (DashboardCardRepository.migrateDefaultCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const { migrateProjectSchema } = require("@/src/database/schema");
    await expect(migrateProjectSchema()).resolves.toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/database/schema.test.ts`
Expected: FAIL — `migrateDefaultCards` not called, no ALTER executed.

- [ ] **Step 3: Implement the migration wiring**

`src/database/schema.ts` — in `migrateProjectSchema()`, after the existing `ensureDefaultCards` try/catch block (lines ~242-246), add:

```ts
    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT;`);
        logger.info("[schema] Migration: BreakdownField column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: BreakdownField column already exists in DashboardCards (ok)");
    }

    try {
        await DashboardCardRepository.migrateDefaultCards(1);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — migrateDefaultCards failed (non-fatal):", e);
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
git commit -m "feat(dashboard): migrate BreakdownField column and default card set on project open"
```

---

### Task 4: `StatisticCountService.breakdownCard` engine

**Files:**
- Modify: `src/database/repositories/StatisticCountService.ts`
- Modify: `src/__tests__/repositories/StatisticCountService.test.ts`

**Interfaces:**
- Consumes: `COUNT_ENTITIES`, `COUNTER_TYPES`, private `parseFilterJson`, `getDatabase()`, `getTodayDateString()`.
- Produces: `StatisticCountService.breakdownCard(projectId: number, card: DashboardCard): Promise<{ label: string; count: number }[]>`.
- **Interfaces note:** breakdown uses the **inspections** entity alias `i`; `today` counter emits `AND i.InspectionDate = ?`; `FilterJson` restricted to inspections `filterableColumns` (`["Status"]` → `AND i.Status = ?`).

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/repositories/StatisticCountService.test.ts`, a new `describe("breakdownCard", ...)` block:

```ts
  describe("breakdownCard", () => {
    const breakdownCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ ...overrides, EntityType: "inspections", BreakdownField: "foundation_cond" });

    it("groups inspections by field value", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: "Good", count: 42 },
        { label: "Bad", count: 7 },
        { label: "Fair", count: 3 },
      ]);
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([
        { label: "Good", count: 42 },
        { label: "Bad", count: 7 },
        { label: "Fair", count: 3 },
      ]);
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("FROM Inspections i");
      expect(normalizeSql(sql)).toContain("JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("JOIN InspectionFields f ON f.FieldID = iv.FieldID");
      expect(normalizeSql(sql)).toContain("GROUP BY iv.FieldValue");
      expect(params).toEqual([1, "foundation_cond"]);
    });

    it("adds the today date clause and param", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.breakdownCard(1, breakdownCard({ CounterType: "today" }));
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString(), "foundation_cond"]);
    });

    it("stacks a Status filter from FilterJson", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.breakdownCard(
        1,
        breakdownCard({ FilterJson: JSON.stringify({ Status: "Completed" }) })
      );
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.Status = ?");
      expect(params).toEqual([1, "Completed", "foundation_cond"]);
    });

    it("maps null FieldValue labels to (Not set)", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: null, count: 5 },
      ]);
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([{ label: "(Not set)", count: 5 }]);
    });

    it("returns [] for a non-inspections entity without touching the db", async () => {
      const result = await StatisticCountService.breakdownCard(1, breakdownCard({ EntityType: "cameras" }));
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when BreakdownField is missing", async () => {
      const result = await StatisticCountService.breakdownCard(1, cardOf());
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when the query rejects", async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([]);
    });

    it("returns [] when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/StatisticCountService.test.ts`
Expected: FAIL — `breakdownCard` does not exist.

- [ ] **Step 3: Implement `breakdownCard`**

`src/database/repositories/StatisticCountService.ts` — add a new method after `countCard`:

```ts
  static async breakdownCard(
    projectId: number,
    card: DashboardCard
  ): Promise<{ label: string; count: number }[]> {
    try {
      if (card.EntityType !== "inspections" || !card.BreakdownField) return [];

      const entity = COUNT_ENTITIES.inspections;
      const counter = COUNTER_TYPES[card.CounterType];
      if (!counter) return [];

      const params: (string | number)[] = [projectId];

      const time = counter.buildTimeClause(entity.alias);
      if (time.clause) params.push(...time.params);

      const filters = parseFilterJson(card.FilterJson);
      const filterFragments: string[] = [];
      for (const [field, value] of Object.entries(filters)) {
        if (!entity.filterableColumns.includes(field)) continue;
        filterFragments.push(`AND ${entity.alias}.${field} = ?`);
        params.push(String(value));
      }

      params.push(card.BreakdownField);

      const sql = `SELECT iv.FieldValue AS label, COUNT(DISTINCT iv.InspectionID) AS count
         FROM Inspections i
         JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
         JOIN InspectionFields f ON f.FieldID = iv.FieldID
         WHERE i.ProjectID = ?
         ${time.clause}
         ${filterFragments.join(" ")}
         AND f.FieldKey = ?
         AND f.IsActive = 1
         GROUP BY iv.FieldValue
         ORDER BY count DESC, label ASC`;

      const db = await getDatabase();
      const rows = await db.getAllAsync<{ label: string | null; count: number }>(sql, params);
      return rows.map((row) => ({ label: row.label ?? "(Not set)", count: row.count }));
    } catch {
      return [];
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
git commit -m "feat(dashboard): breakdownCard engine groups inspections by form field"
```

---

### Task 5: `DashboardService` returns count or breakdown

**Files:**
- Modify: `src/database/repositories/DashboardService.ts`
- Modify: `src/__tests__/repositories/DashboardService.test.ts`

**Interfaces:**
- Consumes: `DashboardCardRepository.getEnabledCards`, `StatisticCountService.countCard`, new `StatisticCountService.breakdownCard(projectId, card)`.
- Produces: `BreakdownRow = { label: string; count: number }`; `CardWithCount = DashboardCard & { count?: number; breakdown?: BreakdownRow[] }`; `getEnabledCardsWithCounts` branches on `card.BreakdownField`.

- [ ] **Step 1: Write the failing tests**

Update `src/__tests__/repositories/DashboardService.test.ts`. The existing `cardOf` helper needs `BreakdownField: null`. Add tests:

```ts
  it("returns breakdown rows for a breakdown card without calling countCard", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 9, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond" }),
    ]);
    countService.breakdownCard.mockResolvedValue([
      { label: "Good", count: 42 },
      { label: "Bad", count: 7 },
    ]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(countService.countCard).not.toHaveBeenCalled();
    expect(countService.breakdownCard).toHaveBeenCalledWith(1, expect.objectContaining({ BreakdownField: "foundation_cond" }));
    expect(result[0]).toEqual(expect.objectContaining({
      CardID: 9,
      count: undefined,
      breakdown: [
        { label: "Good", count: 42 },
        { label: "Bad", count: 7 },
      ],
    }));
  });

  it("mixes normal and breakdown cards", async () => {
    cardRepo.getEnabledCards.mockResolvedValue([
      cardOf({ CardID: 1, CardKey: "total_poles" }),
      cardOf({ CardID: 2, CardKey: "foundation_breakdown", BreakdownField: "foundation_cond" }),
    ]);
    countService.countCard.mockResolvedValue(12);
    countService.breakdownCard.mockResolvedValue([{ label: "Good", count: 42 }]);

    const result = await DashboardService.getEnabledCardsWithCounts(1);

    expect(result[0]).toEqual(expect.objectContaining({ count: 12, breakdown: undefined }));
    expect(result[1]).toEqual(expect.objectContaining({ count: undefined, breakdown: [{ label: "Good", count: 42 }] }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardService.test.ts`
Expected: FAIL — `countCard` is still called for every card; `breakdownCard` never called.

- [ ] **Step 3: Implement the branch**

`src/database/repositories/DashboardService.ts`:

```ts
import { DashboardCard } from "@/src/models/DashboardCard";
import { DashboardCardRepository } from "./DashboardCardRepository";
import { StatisticCountService } from "./StatisticCountService";

export interface BreakdownRow {
  label: string;
  count: number;
}

export interface CardWithCount extends DashboardCard {
  count?: number;
  breakdown?: BreakdownRow[];
}

export class DashboardService {
  static async getEnabledCardsWithCounts(projectId: number): Promise<CardWithCount[]> {
    const cards = await DashboardCardRepository.getEnabledCards(projectId);
    const result: CardWithCount[] = [];
    for (const card of cards) {
      if (card.BreakdownField) {
        const breakdown = await StatisticCountService.breakdownCard(projectId, card);
        result.push({ ...card, breakdown });
      } else {
        const count = await StatisticCountService.countCard(projectId, card);
        result.push({ ...card, count });
      }
    }
    return result;
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
git commit -m "feat(dashboard): service returns count or breakdown per card"
```

---

### Task 6: `StatBreakdownCard` + grid branching

**Files:**
- Create: `src/components/dashboard/StatBreakdownCard.tsx`
- Modify: `src/components/dashboard/DashboardCardGrid.tsx`
- Modify: `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`

**Interfaces:**
- Consumes: `CardWithCount` (with `breakdown?: BreakdownRow[]`), `StatCard`, `MaterialCommunityIcons` glyph map.
- Produces: `StatBreakdownCard({ title, icon, color, rows })` default export; `DashboardCardGrid` renders a breakdown card full-width and pairs normal cards two-per-row.

- [ ] **Step 1: Write the failing component tests**

Add to `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`. Update the `cardWithCount` helper to include `BreakdownField: null` and `breakdown: undefined`:

```ts
function cardWithCount(overrides: Partial<CardWithCount> = {}): CardWithCount {
  return {
    CardID: 1,
    ProjectID: 1,
    CardKey: "total_poles",
    Title: "Total Poles",
    Icon: "transmission-tower",
    Color: "#0B5ED7",
    EntityType: "inspections",
    CounterType: "total",
    FilterJson: null,
    CountMode: "count",
    DistinctColumn: null,
    BreakdownField: null,
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 1,
    count: 12,
    ...overrides,
  };
}
```

Add tests:

```ts
  it("renders a breakdown card's value rows", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({
        CardID: 9,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        BreakdownField: "foundation_cond",
        count: undefined,
        breakdown: [
          { label: "Good", count: 42 },
          { label: "Bad", count: 7 },
          { label: "Fair", count: 3 },
        ],
      }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Foundation Condition");
    expect(strings).toContain("Good");
    expect(strings).toContain("42");
    expect(strings).toContain("Bad");
    expect(strings).toContain("7");
    expect(strings).toContain("Fair");
    expect(strings).toContain("3");
  });

  it("renders (No data) for an empty breakdown", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({
        CardID: 9,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        BreakdownField: "foundation_cond",
        count: undefined,
        breakdown: [],
      }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("No data");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: FAIL — grid renders breakdown cards through `StatCard`, no rows/"No data".

- [ ] **Step 3: Create `StatBreakdownCard`**

Create `src/components/dashboard/StatBreakdownCard.tsx`:

```tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BreakdownRow } from "@/src/database/repositories/DashboardService";

interface StatBreakdownCardProps {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  rows: BreakdownRow[];
}

export default function StatBreakdownCard({
  title,
  icon,
  color = "#0B5ED7",
  rows,
}: StatBreakdownCardProps) {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
        </View>
        {rows.length === 0 ? (
          <Text variant="bodyMedium" style={styles.empty}>
            No data
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text variant="bodyMedium" style={styles.rowLabel}>
                {row.label}
              </Text>
              <Text variant="bodyMedium" style={[styles.rowCount, { color }]}>
                {row.count}
              </Text>
            </View>
          ))
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 6,
    borderRadius: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    marginLeft: 8,
    fontWeight: "bold",
    flex: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  rowLabel: {
    color: "#444",
  },
  rowCount: {
    fontWeight: "bold",
  },
  empty: {
    color: "#999",
    textAlign: "center",
    paddingVertical: 8,
  },
});
```

- [ ] **Step 4: Update the grid to branch**

`src/components/dashboard/DashboardCardGrid.tsx` — import `StatBreakdownCard`, then replace the row-building loop (lines ~45-67) with:

```tsx
  const rows = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

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
    if (next && !next.BreakdownField) {
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

  return <View>{rows}</View>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/components/dashboard/StatBreakdownCard.tsx src/components/dashboard/DashboardCardGrid.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 7: Commit (optional)**

```bash
git add src/components/dashboard/StatBreakdownCard.tsx src/components/dashboard/DashboardCardGrid.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx
git commit -m "feat(dashboard): render breakdown cards with per-value rows"
```

---

### Task 7: Add/Edit Card — Breakdown mode + DB-loaded field picker

**Files:**
- Modify: `src/database/repositories/InspectionFieldRepository.ts`
- Modify: `src/components/dashboard/DashboardCardManager.tsx`
- Modify: `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`

**Interfaces:**
- Consumes: `DashboardCard` (with `BreakdownField`), `COUNT_ENTITIES`, `COUNTER_TYPES`, `DashboardCardRepository.createCard/updateCard`.
- Produces: `InspectionFieldRepository.getActiveTemplateFields(): Promise<{ FieldKey: string; FieldName: string }[]>`; manager state `editorMode: "count" | "distinct" | "breakdown"`, `breakdownField: string`, `breakdownOptions`, `breakdownMenuVisible`.
- **Save semantics:** breakdown cards persist `CountMode = "count"`, `DistinctColumn = null`, `BreakdownField = <FieldKey>`, `EntityType = "inspections"`. When picking a field on a **new** card with an empty title, auto-fill the title with the field name.

- [ ] **Step 1: Add the picker query + repository test**

Add to `src/database/repositories/InspectionFieldRepository.ts`:

```ts
  static async getActiveTemplateFields(): Promise<{ FieldKey: string; FieldName: string }[]> {
    const db = await getDatabase();
    return await db.getAllAsync<{ FieldKey: string; FieldName: string }>(
      `SELECT f.FieldKey, f.FieldName
       FROM InspectionFields f
       INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
       INNER JOIN InspectionTemplates t ON s.TemplateID = t.TemplateID
       WHERE t.IsDefault = 1
         AND s.IsActive = 1
         AND f.IsActive = 1
       ORDER BY s.DisplayOrder ASC, f.DisplayOrder ASC;`,
      []
    );
  }
```

Add a repository test file `src/__tests__/repositories/InspectionFieldRepository.test.ts`:

```ts
jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn(),
    withTransactionAsync: jest.fn(),
  };
}

describe("InspectionFieldRepository.getActiveTemplateFields", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("loads active fields of the default template", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { FieldKey: "foundation_cond", FieldName: "Foundation Condition" },
      { FieldKey: "pole_status", FieldName: "Pole Status" },
    ]);
    const mod = require("@/src/database/repositories/InspectionFieldRepository");
    const rows = await mod.default.getActiveTemplateFields();
    expect(rows).toHaveLength(2);
    const [sql] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("t.IsDefault = 1");
    expect(sql).toContain("s.IsActive = 1");
    expect(sql).toContain("f.IsActive = 1");
  });
});
```

- [ ] **Step 2: Run the picker test to verify it passes**

Run: `npx jest src/__tests__/repositories/InspectionFieldRepository.test.ts`
Expected: PASS (the query is written to pass from the start; this locks the contract).

- [ ] **Step 3: Write the failing manager tests**

In `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`:

1. Mock the field repository. Add after the existing `jest.mock("@/src/database/repositories/DashboardCardRepository")`:

```ts
jest.mock("@/src/database/repositories/InspectionFieldRepository", () => ({
  __esModule: true,
  default: {
    getActiveTemplateFields: jest.fn(),
  },
}));

import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
const fieldRepo = InspectionFieldRepository as jest.Mocked<typeof InspectionFieldRepository>;
```

2. Update the `cardOf` helper to include `BreakdownField: null`.

3. In `beforeEach`, seed the field repo mock:

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    fieldRepo.getActiveTemplateFields.mockResolvedValue([
      { FieldKey: "foundation_cond", FieldName: "Foundation Condition" },
      { FieldKey: "pole_status", FieldName: "Pole Status" },
    ]);
  });
```

4. Add tests:

```ts
  it("creates a breakdown card by picking a form field", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Count");
    await pressButton(tree, "Breakdown");
    await pressButton(tree, "Foundation Condition");
    const titleInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    expect((titleInputs[0].props as { value?: string }).value).toBe("Foundation Condition");
    await pressButton(tree, "Save");
    expect(repo.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        Title: "Foundation Condition",
        EntityType: "inspections",
        CountMode: "count",
        DistinctColumn: null,
        BreakdownField: "foundation_cond",
      })
    );
  });

  it("requires a field before saving a breakdown card", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Count");
    await pressButton(tree, "Breakdown");
    await pressButton(tree, "Save");
    const strings = collectStrings(tree.toJSON());
    expect(strings.join(" ")).toContain("Select a field to group by.");
    expect(repo.createCard).not.toHaveBeenCalled();
  });

  it("edit loads an existing breakdown card's field into the picker", async () => {
    repo.updateCard.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf({
        CardID: 7,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        EntityType: "inspections",
        CountMode: "count",
        BreakdownField: "foundation_cond",
      }),
    ]);
    await pressButton(tree, "pencil");
    const strings = collectStrings(tree.toJSON());
    expect(strings).toContain("Foundation Condition");
    await pressButton(tree, "Save");
    expect(repo.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        CardID: 7,
        BreakdownField: "foundation_cond",
      })
    );
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx`
Expected: FAIL — "Breakdown" is not an option; no field picker.

- [ ] **Step 5: Implement the manager changes**

`src/components/dashboard/DashboardCardManager.tsx`:

1. Import the field repo (after the existing DashboardCardRepository import):

```ts
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
```

2. Replace the `countMode`/`distinctColumn` state block with:

```ts
  const [editorMode, setEditorMode] = useState<"count" | "distinct" | "breakdown">("count");
  const [distinctColumn, setDistinctColumn] = useState<string>("");
  const [breakdownField, setBreakdownField] = useState<string>("");
  const [breakdownOptions, setBreakdownOptions] = useState<{ FieldKey: string; FieldName: string }[]>([]);
```

3. Update `openAdd` (reset breakdown state):

```ts
  const openAdd = () => {
    setEditingCard(null);
    setTitle("");
    setIcon("chart-box-outline");
    setColor("#0B5ED7");
    setEntityType("inspections");
    setCounterType("total");
    setEditorMode("count");
    setDistinctColumn("");
    setBreakdownField("");
    setBreakdownOptions([]);
    setFilters([]);
    setValidationError("");
    setEditorVisible(true);
  };
```

4. Update `openEdit` (map existing card):

```ts
  const openEdit = (card: DashboardCard) => {
    setEditingCard(card);
    setTitle(card.Title);
    setIcon(card.Icon);
    setColor(card.Color);
    setEntityType(card.EntityType);
    setCounterType(card.CounterType);
    setEditorMode(card.BreakdownField ? "breakdown" : card.CountMode === "distinct" ? "distinct" : "count");
    setDistinctColumn(card.DistinctColumn ?? "");
    setBreakdownField(card.BreakdownField ?? "");
    setFilters(parseFilters(card.FilterJson));
    setValidationError("");
    setEditorVisible(true);
    if (card.BreakdownField) {
      InspectionFieldRepository.getActiveTemplateFields().then(setBreakdownOptions);
    }
  };
```

5. Update `handleSave` — insert the breakdown check **before** the existing title check (with an empty title + breakdown mode, the field error must surface first):

```ts
  const handleSave = async () => {
    if (editorMode === "breakdown" && !breakdownField) {
      setValidationError("Select a field to group by.");
      return;
    }
    if (!title.trim()) {
      setValidationError("Title is required.");
      return;
    }
```

And update the payload:

```ts
    const payload: DashboardCard = {
      ProjectID: projectId,
      CardKey: editingCard?.CardKey ?? `card_${Date.now()}`,
      Title: title.trim(),
      Icon: icon,
      Color: color,
      EntityType: entityType,
      CounterType: counterType,
      FilterJson: filtersToJson(filters),
      CountMode: editorMode === "distinct" ? "distinct" : "count",
      DistinctColumn: editorMode === "distinct" ? distinctColumn : null,
      BreakdownField: editorMode === "breakdown" ? breakdownField : null,
      SortOrder: editingCard?.SortOrder ?? 0,
      Enabled: editingCard?.Enabled ?? 1,
      IsDefault: editingCard?.IsDefault ?? 0,
    };
```

6. Add a `loadBreakdownOptions` helper and wire the "Breakdown" mode selection. Update the mode dialog (the `Select Count Mode` dialog content, lines ~404-421) to three options:

```tsx
            <Dialog.Title>Select Count Mode</Dialog.Title>
            <Dialog.Content>
              <List.Item
                title="Count"
                onPress={() => {
                  setEditorMode("count");
                  setBreakdownField("");
                  setModeMenuVisible(false);
                }}
              />
              <List.Item
                title="Distinct"
                onPress={() => {
                  setEditorMode("distinct");
                  setBreakdownField("");
                  setModeMenuVisible(false);
                }}
              />
              <List.Item
                title="Breakdown"
                onPress={() => {
                  setEditorMode("breakdown");
                  setDistinctColumn("");
                  setEntityType("inspections");
                  setBreakdownField("");
                  setFilters([]);
                  setModeMenuVisible(false);
                  InspectionFieldRepository.getActiveTemplateFields()
                    .then(setBreakdownOptions)
                    .then(() => setBreakdownMenuVisible(true));
                }}
              />
            </Dialog.Content>
```

7. Update the mode button label (`Select Count Mode` button):

```tsx
            {editorMode === "breakdown" ? "Breakdown" : editorMode === "distinct" ? "Distinct" : "Count"}
```

8. Change the distinct-column section condition from `countMode === "distinct"` to `editorMode === "distinct"`.

9. Add the breakdown field picker section + dialog after the distinct-column section. The button shows the field's **display name** (resolved from `breakdownOptions`) so edit mode surfaces the human-readable name, not the FieldKey:

```tsx
          {editorMode === "breakdown" ? (
            <>
              <Text style={styles.fieldLabel}>Group by field</Text>
              <Button
                mode="outlined"
                onPress={() => {
                  InspectionFieldRepository.getActiveTemplateFields()
                    .then(setBreakdownOptions)
                    .then(() => setBreakdownMenuVisible(true));
                }}
                style={styles.input}
              >
                {(breakdownOptions.find((o) => o.FieldKey === breakdownField)?.FieldName ?? breakdownField) || "Select field"}
              </Button>
            </>
          ) : null}
```

And add the options dialog (after the mode dialog's closing `</Dialog>`):

```tsx
          <Dialog
            visible={breakdownMenuVisible}
            onDismiss={() => setBreakdownMenuVisible(false)}
          >
            <Dialog.Title>Select Group-by Field</Dialog.Title>
            <Dialog.Content>
              {breakdownOptions.map((option) => (
                <List.Item
                  key={option.FieldKey}
                  title={option.FieldName}
                  onPress={() => {
                    setBreakdownField(option.FieldKey);
                    setTitle((prev) => (editingCard ? prev : prev.trim() ? prev : option.FieldName));
                    setBreakdownMenuVisible(false);
                  }}
                />
              ))}
            </Dialog.Content>
          </Dialog>
```

10. Update the entity menu (when an entity is chosen, leave breakdown mode if it isn't inspections). Keep entity forced to inspections while in breakdown mode — add to the entity `onPress` in the entity dialog:

```ts
                    setEntityType(key);
                    if (key !== "inspections") {
                      setEditorMode((prev) => (prev === "breakdown" ? "count" : prev));
                      setBreakdownField("");
                    }
                    setDistinctColumn("");
                    setFilters([]);
                    setEntityMenuVisible(false);
```

11. Add state for `breakdownMenuVisible`:

```ts
  const [breakdownMenuVisible, setBreakdownMenuVisible] = useState(false);
```

12. Add the breakdown option to `ENTITY_LABELS`? Not needed — breakdown is a mode, not an entity. The card list description stays `entity · counter`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx src/__tests__/repositories/InspectionFieldRepository.test.ts`
Expected: PASS (all manager tests, including the 3 new ones, and the picker test).

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit; npx eslint src/database/repositories/InspectionFieldRepository.ts src/components/dashboard/DashboardCardManager.tsx src/__tests__/components/dashboard/DashboardCardManager.test.tsx src/__tests__/repositories/InspectionFieldRepository.test.ts`
Expected: tsc clean; eslint no new errors.

- [ ] **Step 8: Commit (optional)**

```bash
git add src/database/repositories/InspectionFieldRepository.ts src/components/dashboard/DashboardCardManager.tsx src/__tests__/components/dashboard/DashboardCardManager.test.tsx src/__tests__/repositories/InspectionFieldRepository.test.ts
git commit -m "feat(dashboard): add breakdown card mode with DB-loaded field picker"
```

---

### Task 8: Isolation regression for breakdown cards

**Files:**
- Modify: `src/__tests__/database/isolation.test.ts`

**Interfaces:**
- Consumes: `createMockDb`-style in-memory mock, `DashboardCardRepository.createCard`, `setActiveProject`/`clearActiveProject`/`getDatabase` from `@/src/database/db`.

- [ ] **Step 1: Write the failing isolation test**

Add to `src/__tests__/database/isolation.test.ts`:

```ts
  it("does not leak a breakdown card created in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository") as typeof import("@/src/database/repositories/DashboardCardRepository");
    const cardId = await DashboardCardRepository.createCard({
      ProjectID: 1,
      CardKey: "leak_breakdown_card",
      Title: "Foundation Breakdown",
      Icon: "chart-pie",
      Color: "#111111",
      EntityType: "inspections",
      CounterType: "total",
      FilterJson: null,
      CountMode: "count",
      DistinctColumn: null,
      BreakdownField: "foundation_cond",
      SortOrder: 0,
      Enabled: 1,
      IsDefault: 0,
    });
    expect(cardId).toBeGreaterThan(0);

    const breakdownInA = await dbA.getAllAsync<{ BreakdownField: string }>(
      "SELECT BreakdownField FROM DashboardCards WHERE CardKey = 'leak_breakdown_card'"
    );
    expect(breakdownInA).toEqual([{ BreakdownField: "foundation_cond" }]);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);

    const cardsInB = await dbB.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );
    expect(cardsInB.some((c) => c.CardKey === "leak_breakdown_card")).toBe(false);

    const breakdownInAAfter = await dbA.getAllAsync<{ BreakdownField: string }>(
      "SELECT BreakdownField FROM DashboardCards WHERE CardKey = 'leak_breakdown_card'"
    );
    expect(breakdownInAAfter).toEqual([{ BreakdownField: "foundation_cond" }]);
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx jest src/__tests__/database/isolation.test.ts`
Expected: PASS. If it fails with a missing `BreakdownField` column in the in-memory mock, run `npx jest src/__tests__/database/isolation.test.ts --runInBand` once to confirm the mock applies Task 1's schema; the `createProjectSchema` mock runs the real `createDashboardCardsTable`, so the column exists.

- [ ] **Step 3: Full-suite verification**

Run: `npx jest` then `npx tsc --noEmit` then `npx eslint src/database src/components/dashboard src/__tests__/database src/__tests__/repositories src/__tests__/components/dashboard`
Expected: all 31 suites pass (now 31 suites / ~340 tests); tsc clean; eslint no new errors; all coverage thresholds met.

- [ ] **Step 4: Changelog**

Add an entry to `docs/07-Changelog.md` under Unreleased:

```markdown
### Added
- Dashboard cards: 6-card default set (Total Inspections, Today's Inspections Done added); Breakdown card type grouping inspections by any inspection-form field (Add/Edit Card → Breakdown → pick field), rendered as per-value rows.
- Existing projects auto-upgrade to the new defaults and gain the `BreakdownField` column on next open (idempotent migrations in `migrateProjectSchema`).
```

- [ ] **Step 5: Commit (optional)**

```bash
git add src/__tests__/database/isolation.test.ts docs/07-Changelog.md
git commit -m "test(dashboard): breakdown card isolation regression; changelog"
```
