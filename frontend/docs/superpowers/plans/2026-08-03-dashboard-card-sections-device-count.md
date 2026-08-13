# Dashboard Card Sections & Device Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make card sections a first-class dashboard grouping (smart-added cards merge into the canonical "Total Summary" / "Today's Summary" sections, bold/uppercase/divider headings, per-project collapsible sections that persist via AsyncStorage and default to expanded, reorder locked within a section, "Reset Defaults" = full factory reset), and repair device-type counting so device cards count real data from `DeviceRecords` (`json_extract` of the `DeviceData` JSON keyed by field name) instead of the dead `Cameras`/`Switches` tables.

**Architecture:** Rename the summary section labels via two exported constants (`SECTION_LABEL_TOTAL = "Total Summary"`, `SECTION_LABEL_TODAY = "Today's Summary"`) in `dashboard-cards.seed.ts`; the grid renders stored `SectionLabel` verbatim so existing DBs get a migration `UPDATE`. Add a `DeviceType` column to `DashboardCards` (model + DDL + repository + `migrateProjectSchema` ALTER). New repository methods `normalizeSections` (total → today → custom-alphabetical → uncategorized SortOrder pass), `resetDefaultCards` (delete-all + re-seed canonical `DEFAULT_SECTIONED_CARDS`), and `migrateDeviceCards(1)` (rewrite `smart_dev_*` cards to `devices` entity, repoint default camera cards to count `DeviceRecords` where `DeviceType='Camera'`, rename legacy labels). `SmartCardGenerator` routes device fields to `EntityType "devices"` + `DeviceType`, and calls `normalizeSections` after adding cards. `StatisticCountService.devices` gains `AND r.IsActive = 1`; `deviceBreakdownCard` gets a `devices` branch that `json_extract`s `r.DeviceData` with a `/^[A-Za-z0-9_]+$/` allowlist. New `useSectionCollapse(projectId)` hook persists a JSON array of collapsed section labels under `accc_dash_collapsed_<projectId>`; the grid renders collapsible `Pressable` headers (chevron-up/down) for the two summary sections only and hides a collapsed section's cards. Manager disables reorder arrows at section boundaries and routes "Reset Defaults" through `resetDefaultCards`.

**Tech Stack:** React Native, react-native-paper v5, expo-sqlite v16 (sequential open/close model), Jest (`jest-expo`, `react-test-renderer`), `@react-native-async-storage/async-storage` 2.2.0.

## Global Constraints

- **No yarn on PATH — use `npx`:** `npx jest <pattern>`, `npx tsc --noEmit`, `npx expo lint`. In PowerShell pipe jest output through `Out-String` when it is swallowed.
- **TypeScript strict; no `any`.** `MaterialCommunityIcons` `name` props are typed `keyof typeof MaterialCommunityIcons.glyphMap` — keep the existing `as` casts only where already present.
- **No code comments** unless the surrounding code already has them (preserve existing ones verbatim).
- **Sequential open/close model:** never open a second SQLite handle; all DB work routes through `getDatabase()` / repositories. No new tables in `accc_global.db`.
- **Migrations required, non-fatal:** every schema addition must ship an idempotent `migrateProjectSchema` step wrapped in try/catch (mirror the existing `ALTER TABLE ... ADD COLUMN` blocks and repo-call try/catches in `src/database/schema.ts`).
- **Mock limits (verified):** `__mocks__/expo-sqlite.ts` has no JOIN/GROUP BY/`json_extract` support and ignores INSERTs with literal VALUES; it auto-creates tables on placeholder-INSERT. Device-count SQL is therefore unit-tested by asserting the built SQL string + params against a mocked `getDatabase` (pattern in `StatisticCountService.test.ts`), never by integration-running the SQL.
- **AsyncStorage in tests:** `@react-native-async-storage/async-storage` has NO existing test mock in the repo and throws at import when the native module is absent. The hook test must `jest.mock` it; the grid test must mock `@/src/hooks/useSectionCollapse` (so AsyncStorage is never imported there).
- **Keep the tree green after every task:** each task ends with `npx tsc --noEmit` passing and the relevant Jest suites passing.
- **Do NOT commit pre-existing dirty/untracked files:** `docs/02-Architecture.md`, `docs/04-Phases.md`, `docs/06-Memory.md`, `docs/superpowers/specs/2026-08-03-dashboard-card-sections-device-count-design.md` (untracked). Only stage the exact files listed in each task plus `docs/07-Changelog.md` in Task 11.
- **Spec:** `docs/superpowers/specs/2026-08-03-dashboard-card-sections-device-count-design.md` (approved). All requirements below come from it.
- **Design-spec single source of truth:** `SECTION_LABEL_TOTAL` / `SECTION_LABEL_TODAY` are exported from `src/database/seeds/dashboard-cards.seed.ts` and imported by the seed data, `SmartCardGenerator`, the repository label-rename migration, and the grid — never re-declare the strings.
- **Isolation requirement (AGENTS.md):** a project-scoped isolation regression test ships with this feature (Task 10).

---

### Task 1: `DeviceType` column plumbing (model, DDL, repository, seed INSERT, schema ALTER)

**Files:**
- Modify: `src/models/DashboardCard.ts`
- Modify: `src/database/tables/dashboard-cards.table.ts`
- Modify: `src/database/repositories/DashboardCardRepository.ts`
- Modify: `src/database/seeds/dashboard-cards.seed.ts`
- Modify: `src/database/schema.ts`
- Test: `src/__tests__/repositories/DashboardCardRepository.test.ts`
- Test: `src/__tests__/database/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DashboardCard.DeviceType?: string | null`; `DashboardCards.DeviceType TEXT`; `DashboardCardSeed.DeviceType?: string`; `DeviceType` in `CARD_COLUMNS`, `mapRow`, the INSERT column lists of `createCard`/`ensureDefaultCards`/`migrateDefaultCards`/`seedDashboardCards`. **Append `DeviceType` as the LAST INSERT column** so all existing param-index assertions (`params[10]`=BreakdownField, `[11]`=SectionLabel, `[12]`=AggregateField, `[13]`=CardMode, `[14]`=SortOrder) stay valid.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/repositories/DashboardCardRepository.test.ts` (in the `SectionLabel & AggregateField` describe):

```ts
it("maps DeviceType from a row", async () => {
  mockDb.getAllAsync.mockResolvedValue([
    rowOf(baseCard({ CardID: 3, DeviceType: "Camera" })),
  ]);
  const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
  const cards = await DashboardCardRepository.getAllCards(1);
  expect(cards[0].DeviceType).toBe("Camera");
});

it("mapRow defaults a missing DeviceType to null", async () => {
  mockDb.getAllAsync.mockResolvedValue([rowOf(baseCard({ CardID: 3 }))]);
  const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
  const cards = await DashboardCardRepository.getAllCards(1);
  expect(cards[0].DeviceType).toBeNull();
});

it("createCard persists DeviceType", async () => {
  mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
  const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
  await DashboardCardRepository.createCard(baseCard({ DeviceType: "Switch" }));
  const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
  expect(params[15]).toBe("Switch");
});
```

Update the existing test "createCard INSERT columns, placeholders, and params all match": change `expect(columns.length).toBe(17)` → `toBe(18)`, `expect(placeholders).toBe(17)` → `toBe(18)`, `expect(params).toHaveLength(17)` → `toHaveLength(18)`.

Update the existing "re-inserts only the deleted legacy key when the project has legacy cards": change `expect(sql.match(/\?/g)).toHaveLength(15)` → `toHaveLength(16)`.

Add to `src/__tests__/database/schema.test.ts` (mirroring "adds the BreakdownField column idempotently"):

```ts
it("migrateProjectSchema adds the DeviceType column idempotently", async () => {
  mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

  const { migrateProjectSchema } = require("@/src/database/schema");
  await migrateProjectSchema();

  expect(mockExecAsync).toHaveBeenCalledWith(
    expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT")
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/schema.test.ts -v`
Expected: the new DeviceType tests FAIL (mapRow returns `undefined`, `params[15]` is `undefined`, column count is 17, no `DeviceType` ALTER); the two existing assertions that expect 17/15 also fail.

- [ ] **Step 3: Add `DeviceType` to the model**

In `src/models/DashboardCard.ts`, add `DeviceType?: string | null;` after the `AggregateField` field, keeping the `?`-optional style of the surrounding fields.

- [ ] **Step 4: Add `DeviceType` to the DDL**

In `src/database/tables/dashboard-cards.table.ts`, add `DeviceType TEXT,` immediately after the `AggregateField TEXT,` column line.

- [ ] **Step 5: Add `DeviceType` to the repository**

In `src/database/repositories/DashboardCardRepository.ts`:

1. Add `DeviceType` to the `CARD_COLUMNS` string (after `AggregateField`).
2. In `mapRow`, add `DeviceType: (row.DeviceType as string) ?? null,`.
3. In `createCard`: append `, DeviceType` to the INSERT column list, change `VALUES (?, ..., ?)` to have 18 placeholders, and append `card.DeviceType ?? null,` as the last param.
4. In `ensureDefaultCards`: append `, DeviceType` to the column list, `VALUES (?, ..., ?, 1, 1, ?)`, and `card.DeviceType ?? null,` as the last param.
5. In `migrateDefaultCards`: same as `ensureDefaultCards`.

- [ ] **Step 6: Add `DeviceType` to the seed**

In `src/database/seeds/dashboard-cards.seed.ts`:
1. Add `DeviceType?: string;` to the `DashboardCardSeed` interface (after `AggregateField?`).
2. In `seedDashboardCards`, append `, DeviceType` to the INSERT column list, `VALUES (?, ..., ?, 1, 1, ?)`, and `card.DeviceType ?? null,` as the last param.

- [ ] **Step 7: Add the `DeviceType` ALTER to `migrateProjectSchema`**

In `src/database/schema.ts`, add this block directly after the `AggregateField` ALTER try/catch:

```ts
try {
    await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT;`);
    logger.info("[schema] Migration: DeviceType column added to DashboardCards");
} catch {
    logger.info("[schema] Migration: DeviceType column already exists in DashboardCards (ok)");
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/schema.test.ts -v`
Expected: PASS. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/models/DashboardCard.ts src/database/tables/dashboard-cards.table.ts src/database/repositories/DashboardCardRepository.ts src/database/seeds/dashboard-cards.seed.ts src/database/schema.ts src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/schema.test.ts
git commit -m "feat(dashboard): add DeviceType column to dashboard cards"
```

---

### Task 2: Section constants + repoint default camera cards

**Files:**
- Modify: `src/database/seeds/dashboard-cards.seed.ts`
- Test: `src/__tests__/database/dashboardCards.seed.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const SECTION_LABEL_TOTAL = "Total Summary"` and `export const SECTION_LABEL_TODAY = "Today's Summary"`; `DEFAULT_SECTIONED_CARDS` uses the constants and repoints `total_camera_count` / `today_camera_count` to `EntityType "devices"`, `CardMode "entitycount"`, `FilterJson {"DeviceType":"Camera"}`, `DeviceType "Camera"`, `AggregateField` removed.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/database/dashboardCards.seed.test.ts`, update the affected assertions:

1. "seeds exactly the six sectioned default cards on an empty project":
```ts
expect(cards.filter((c) => c.SectionLabel === "Total Summary")).toHaveLength(3);
expect(cards.filter((c) => c.SectionLabel === "Today's Summary")).toHaveLength(3);
expect(cards.filter((c) => c.CardMode === "entitycount")).toHaveLength(4);
expect(cards.filter((c) => c.CardMode === "dropdown")).toHaveLength(2);
expect(cards.filter((c) => c.CardMode === "sum")).toHaveLength(0);
```
Also assert the constants themselves at the top of that test:
```ts
const { seedDashboardCards, DEFAULT_SECTIONED_CARDS, SECTION_LABEL_TOTAL, SECTION_LABEL_TODAY } = require("@/src/database/seeds/dashboard-cards.seed");
expect(SECTION_LABEL_TOTAL).toBe("Total Summary");
expect(SECTION_LABEL_TODAY).toBe("Today's Summary");
```
2. "seeds today_inspection_done with a Completed filter...": `expect(row!.SectionLabel).toBe("Today's Summary");`
3. "seeds the Camera Count SUM and Pole Status breakdown defaults": replace the `camera` block with:
```ts
const camera = await db.getFirstAsync<{ EntityType: string; FilterJson: string; CardMode: string; DeviceType: string; SectionLabel: string }>(
  "SELECT EntityType, FilterJson, CardMode, DeviceType, SectionLabel FROM DashboardCards WHERE CardKey = 'total_camera_count'"
);
expect(camera).not.toBeNull();
expect(camera!.EntityType).toBe("devices");
expect(camera!.FilterJson).toBe(JSON.stringify({ DeviceType: "Camera" }));
expect(camera!.CardMode).toBe("entitycount");
expect(camera!.DeviceType).toBe("Camera");
expect(camera!.SectionLabel).toBe("Total Summary");
```
4. "seeds every default card with an explicit CardMode": `expect(byKey["total_camera_count"]).toBe("entitycount");` and `expect(byKey["today_camera_count"]).toBe("entitycount");`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts -v`
Expected: FAIL — labels are still "Total"/"Today's", camera cards are still `sum`/`AggregateField camera_count`.

- [ ] **Step 3: Add the section constants and repoint the seed**

In `src/database/seeds/dashboard-cards.seed.ts`:

1. Add above `DEFAULT_DASHBOARD_CARDS`:
```ts
export const SECTION_LABEL_TOTAL = "Total Summary";
export const SECTION_LABEL_TODAY = "Today's Summary";
```
2. In `DEFAULT_SECTIONED_CARDS`, replace the literal `SectionLabel: "Total"` with `SectionLabel: SECTION_LABEL_TOTAL` and `SectionLabel: "Today's"` with `SectionLabel: SECTION_LABEL_TODAY`.
3. Replace the two camera rows:
```ts
{ CardKey: "total_camera_count",    Title: "Camera Count",     Icon: "cctv",               Color: "#6F42C1", EntityType: "devices",    CounterType: "total", CountMode: "count",   CardMode: "entitycount", FilterJson: JSON.stringify({ DeviceType: "Camera" }), DeviceType: "Camera", SectionLabel: SECTION_LABEL_TOTAL,   SortOrder: 2 },
{ CardKey: "today_camera_count",    Title: "Camera Count",     Icon: "cctv",               Color: "#6F42C1", EntityType: "devices",    CounterType: "today", CountMode: "count",   CardMode: "entitycount", FilterJson: JSON.stringify({ DeviceType: "Camera" }), DeviceType: "Camera", SectionLabel: SECTION_LABEL_TODAY,   SortOrder: 5 },
```
Leave `DEFAULT_DASHBOARD_CARDS` (the legacy set) unchanged — legacy DBs are handled by `migrateDeviceCards` (Task 3).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts -v`
Expected: PASS (7 tests). Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/database/seeds/dashboard-cards.seed.ts src/__tests__/database/dashboardCards.seed.test.ts
git commit -m "feat(dashboard): rename summary sections and count cameras from device records"
```

---

### Task 3: Repository — `normalizeSections`, `resetDefaultCards`, `migrateDeviceCards`

**Files:**
- Modify: `src/database/repositories/DashboardCardRepository.ts`
- Test: `src/__tests__/repositories/DashboardCardRepository.test.ts`

**Interfaces:**
- Consumes: `SECTION_LABEL_TOTAL`, `SECTION_LABEL_TODAY`, `DEFAULT_SECTIONED_CARDS` from the seed; `CardModeValue`, `DashboardCard` from the model.
- Produces:
  - `static async normalizeSections(projectId: number): Promise<void>` — renumbers `SortOrder` for ALL of a project's cards: rank 0 = `SECTION_LABEL_TOTAL` (stable by original order), rank 1 = `SECTION_LABEL_TODAY`, rank 2 = other labels grouped alphabetically then stable, rank 3 = `NULL` label; writes `SortOrder = i, UpdatedAt = CURRENT_TIMESTAMP` per card inside one `withTransactionAsync`.
  - `static async resetDefaultCards(projectId: number): Promise<void>` — in one transaction: `DELETE FROM DashboardCards WHERE ProjectID = ?`, re-insert every `DEFAULT_SECTIONED_CARDS` row (same INSERT shape as `ensureDefaultCards` incl. `DeviceType`), then `await this.normalizeSections(projectId)`.
  - `static async migrateDeviceCards(projectId: number): Promise<void>` — in one transaction: (a) for every card with `CardKey LIKE 'smart_dev_%'`, strip the `_total`/`_today` suffix, split on `_` (`parts[2]` = DeviceType, remainder = field name) and `UPDATE ... SET EntityType = 'devices', DeviceType = ?, BreakdownField = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE CardID = ? AND ProjectID = ?` (skip rows with an empty DeviceType/field name); (b) for every card whose `CardKey` is one of `total_cameras`, `today_cameras`, `total_camera_count`, `today_camera_count`, `UPDATE ... SET EntityType = 'devices', DeviceType = 'Camera', CardMode = 'entitycount', FilterJson = ?, AggregateField = NULL, UpdatedAt = CURRENT_TIMESTAMP WHERE CardID = ? AND ProjectID = ?` with `'{"DeviceType":"Camera"}'`; (c) rename legacy labels scoped by project: `UPDATE DashboardCards SET SectionLabel = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionLabel = ? AND ProjectID = ?` with `[SECTION_LABEL_TOTAL, "Total", projectId]` and `[SECTION_LABEL_TODAY, "Today's", projectId]`.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/repositories/DashboardCardRepository.test.ts` (import `SECTION_LABEL_TOTAL`/`SECTION_LABEL_TODAY` from the seed in these tests):

```ts
describe("normalizeSections", () => {
  it("renumbers into total, today, custom-alphabetical, then uncategorized order", async () => {
    const db = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    db.getAllAsync.mockResolvedValue([
      rowOf(baseCard({ CardID: 3, CardKey: "smart_x_today", SectionLabel: SECTION_LABEL_TODAY, SortOrder: 0 })),
      rowOf(baseCard({ CardID: 1, CardKey: "default_total", SectionLabel: SECTION_LABEL_TOTAL, SortOrder: 1 })),
      rowOf(baseCard({ CardID: 5, CardKey: "bare", SectionLabel: null, SortOrder: 2 })),
      rowOf(baseCard({ CardID: 2, CardKey: "smart_y_total", SectionLabel: SECTION_LABEL_TOTAL, SortOrder: 3 })),
      rowOf(baseCard({ CardID: 4, CardKey: "zzz_custom", SectionLabel: "ZZZ", SortOrder: 4 })),
      rowOf(baseCard({ CardID: 6, CardKey: "aaa_custom", SectionLabel: "AAA", SortOrder: 5 })),
    ]);
    db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await DashboardCardRepository.normalizeSections(1);

    expect(db.runAsync).toHaveBeenCalledTimes(6);
    const updates = (db.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
    expect(updates.map((p) => p[0])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(updates.map((p) => p[1])).toEqual([1, 2, 3, 4, 6, 5]);
    expect(updates[0][2]).toBe(1);
  });
});
```

```ts
describe("resetDefaultCards", () => {
  it("deletes all cards and re-inserts the canonical sectioned set, then normalizes", async () => {
    const db = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    const inserted: Record<string, unknown>[] = [];
    db.getAllAsync.mockResolvedValue(inserted);
    db.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
      if (String(sql).includes("DELETE FROM DashboardCards")) {
        return { lastInsertRowId: 0, changes: 1 };
      }
      if (String(sql).includes("INSERT INTO DashboardCards")) {
        inserted.push(rowOf(baseCard({ CardID: inserted.length + 1, CardKey: String(params[1]), SectionLabel: (params[11] as string) ?? null })));
      }
      return { lastInsertRowId: 42, changes: 1 };
    });
    db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const { DEFAULT_SECTIONED_CARDS } = require("@/src/database/seeds/dashboard-cards.seed");

    await DashboardCardRepository.resetDefaultCards(1);

    const calls = (db.runAsync as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.filter((s) => s.includes("DELETE FROM DashboardCards WHERE ProjectID = ?"))).toHaveLength(1);
    expect(calls.filter((s) => s.includes("INSERT INTO DashboardCards"))).toHaveLength(DEFAULT_SECTIONED_CARDS.length);
    expect(inserted).toHaveLength(DEFAULT_SECTIONED_CARDS.length);
    expect(db.getAllAsync).toHaveBeenCalledTimes(2); // SELECT CardKey + normalize getAllCards
  });
});
```

```ts
describe("migrateDeviceCards", () => {
  it("rewrites smart device cards, repoints camera cards, and renames legacy labels", async () => {
    const db = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    db.getAllAsync.mockResolvedValue([
      { CardID: 1, CardKey: "smart_dev_Camera_CameraStatus_total" },
      { CardID: 2, CardKey: "smart_dev_Switch_SwitchState_today" },
      { CardID: 3, CardKey: "total_camera_count" },
      { CardID: 4, CardKey: "today_cameras" },
      { CardID: 5, CardKey: "total_inspections" },
    ]);
    db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const { SECTION_LABEL_TOTAL, SECTION_LABEL_TODAY } = require("@/src/database/seeds/dashboard-cards.seed");

    await DashboardCardRepository.migrateDeviceCards(1);

    const calls = (db.runAsync as jest.Mock).mock.calls as Array<[string, unknown[]]>;
    const smart = calls.filter(([sql]) => sql.includes("EntityType = 'devices'"));
    expect(smart).toHaveLength(2);
    expect(smart[0][1]).toEqual(["Camera", "CameraStatus", 1, 1]);
    expect(smart[1][1]).toEqual(["Switch", "SwitchState", 2, 1]);

    const camera = calls.filter(([sql]) => sql.includes("FilterJson"));
    expect(camera).toHaveLength(2);
    expect(camera[0][1]).toEqual(['{"DeviceType":"Camera"}', 3, 1]);

    const renameTotal = calls.find(([sql, p]) => String(sql).includes("SectionLabel = ?") && p[0] === SECTION_LABEL_TOTAL);
    expect(renameTotal).toBeDefined();
    expect(renameTotal![1]).toEqual([SECTION_LABEL_TOTAL, "Total", 1]);
    const renameToday = calls.find(([sql, p]) => String(sql).includes("SectionLabel = ?") && p[0] === SECTION_LABEL_TODAY);
    expect(renameToday).toBeDefined();
    expect(renameToday![1]).toEqual([SECTION_LABEL_TODAY, "Today's", 1]);
  });

  it("is a no-op when no device cards or legacy labels exist", async () => {
    const db = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    db.getAllAsync.mockResolvedValue([{ CardID: 1, CardKey: "total_inspections" }]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await DashboardCardRepository.migrateDeviceCards(1);

    expect(db.runAsync).not.toHaveBeenCalled();
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
  });
});
```

Note: the reset test relies on `getAllAsync` returning the same `inserted` array reference after the transaction populated it (Jest stores the value reference; the mutation is visible on the later `normalizeSections` call).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts -v`
Expected: FAIL — the three methods do not exist yet (TypeError/undefined) and `resetDefaultCards` has no method.

- [ ] **Step 3: Implement `normalizeSections`**

Append to `DashboardCardRepository`:

```ts
static async normalizeSections(projectId: number): Promise<void> {
  const db = await getDatabase();
  const cards = await this.getAllCards(projectId);

  const rank = (label: string | null): number => {
    if (label === SECTION_LABEL_TOTAL) return 0;
    if (label === SECTION_LABEL_TODAY) return 1;
    if (label) return 2;
    return 3;
  };

  const sorted = cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const ra = rank(a.card.SectionLabel ?? null);
      const rb = rank(b.card.SectionLabel ?? null);
      if (ra !== rb) return ra - rb;
      if (ra === 2) {
        const la = a.card.SectionLabel ?? "";
        const lb = b.card.SectionLabel ?? "";
        const cmp = la.localeCompare(lb);
        if (cmp !== 0) return cmp;
      }
      return a.index - b.index;
    });

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < sorted.length; i++) {
      await db.runAsync(
        `UPDATE DashboardCards
         SET SortOrder = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE CardID = ? AND ProjectID = ?`,
        [i, sorted[i].card.CardID, projectId]
      );
    }
  });
}
```

- [ ] **Step 4: Implement `resetDefaultCards`**

Append to `DashboardCardRepository`:

```ts
static async resetDefaultCards(projectId: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM DashboardCards WHERE ProjectID = ?`, [projectId]);
    for (const card of DEFAULT_SECTIONED_CARDS) {
      await db.runAsync(
        `INSERT INTO DashboardCards
         (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, BreakdownField, SectionLabel, AggregateField, CardMode, SortOrder, Enabled, IsDefault, DeviceType)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
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
          card.CardMode,
          card.SortOrder,
          card.DeviceType ?? null,
        ]
      );
    }
  });
  await this.normalizeSections(projectId);
}
```

- [ ] **Step 5: Implement `migrateDeviceCards`**

Append to `DashboardCardRepository`:

```ts
static async migrateDeviceCards(projectId: number): Promise<void> {
  const db = await getDatabase();

  const existing = await db.getAllAsync<{ CardID: number; CardKey: string }>(
    `SELECT CardID, CardKey FROM DashboardCards WHERE ProjectID = ?`,
    [projectId]
  );

  const smartCards = existing.filter((row) => row.CardKey.startsWith("smart_dev_"));
  const cameraKeys = new Set(["total_cameras", "today_cameras", "total_camera_count", "today_camera_count"]);
  const cameraCards = existing.filter((row) => cameraKeys.has(row.CardKey));

  if (smartCards.length === 0 && cameraCards.length === 0) return;

  await db.withTransactionAsync(async () => {
    for (const row of smartCards) {
      const key = row.CardKey.replace(/_(total|today)$/, "");
      const parts = key.split("_");
      const deviceType = parts[2];
      const fieldName = parts.slice(3).join("_");
      if (!deviceType || !fieldName) continue;
      await db.runAsync(
        `UPDATE DashboardCards
         SET EntityType = 'devices', DeviceType = ?, BreakdownField = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE CardID = ? AND ProjectID = ?`,
        [deviceType, fieldName, row.CardID, projectId]
      );
    }

    for (const row of cameraCards) {
      await db.runAsync(
        `UPDATE DashboardCards
         SET EntityType = 'devices', DeviceType = 'Camera', CardMode = 'entitycount',
             FilterJson = ?, AggregateField = NULL, UpdatedAt = CURRENT_TIMESTAMP
         WHERE CardID = ? AND ProjectID = ?`,
        ['{"DeviceType":"Camera"}', row.CardID, projectId]
      );
    }

    await db.runAsync(
      `UPDATE DashboardCards SET SectionLabel = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionLabel = ? AND ProjectID = ?`,
      [SECTION_LABEL_TOTAL, "Total", projectId]
    );
    await db.runAsync(
      `UPDATE DashboardCards SET SectionLabel = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionLabel = ? AND ProjectID = ?`,
      [SECTION_LABEL_TODAY, "Today's", projectId]
    );
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts -v`
Expected: PASS. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/database/repositories/DashboardCardRepository.ts src/__tests__/repositories/DashboardCardRepository.test.ts
git commit -m "feat(dashboard): add section normalization, factory reset, and device-card migration"
```

---

### Task 4: `SmartCardGenerator` — route device cards to `devices` entity

**Files:**
- Modify: `src/database/repositories/SmartCardGenerator.ts`
- Test: `src/__tests__/repositories/SmartCardGenerator.test.ts`

**Interfaces:**
- Consumes: `SECTION_LABEL_TOTAL`, `SECTION_LABEL_TODAY` from the seed.
- Produces: device-field cards get `EntityType "devices"`, `DeviceType` set from `field.DeviceType`, `SectionLabel` constants; `addSmartCardsForField` calls `DashboardCardRepository.normalizeSections(projectId)` after inserting.

- [ ] **Step 1: Update the failing tests**

In `src/__tests__/repositories/SmartCardGenerator.test.ts`:

1. Replace every `expect(...SectionLabel).toBe("Total")` with `toBe("Total Summary")` (three occurrences) and every `.toBe("Today's")` with `.toBe("Today's Summary")` (six occurrences). If `SECTION_LABEL_TOTAL`/`SECTION_LABEL_TODAY` are imported, import them from the seed and compare against them instead of literals.
2. In "generates dropdown cards for a device field using the column as breakdown": replace `expect(cards[0].EntityType).toBe("cameras")` → `toBe("devices")` and `expect(cards[1].EntityType).toBe("cameras")` → `toBe("devices")`; add:
```ts
expect(cards[0].DeviceType).toBe("Camera");
expect(cards[1].DeviceType).toBe("Camera");
expect(cards[0].SectionLabel).toBe("Total Summary");
expect(cards[1].SectionLabel).toBe("Today's Summary");
```
3. In "uses switches entity type for a Switch device field": `expect(cards[0].EntityType).toBe("switches")` → `toBe("devices")`; add `expect(cards[0].DeviceType).toBe("Switch");`
4. In the `addSmartCardsForField` describe, add one more `mockResolvedValueOnce` to every `getAllAsync` chain (the `normalizeSections` `getAllCards` pass) — e.g. for "creates both cards when none exist":
```ts
mockDb.getAllAsync
  .mockResolvedValueOnce([{ FieldID: 1, FieldKey: "test_field", FieldName: "Test Field", FieldType: "text" }])
  .mockResolvedValueOnce([])
  .mockResolvedValueOnce([])
  .mockResolvedValueOnce([])
  .mockResolvedValueOnce([
    { CardKey: "smart_test_field_total", SortOrder: 0 },
    { CardKey: "smart_test_field_today", SortOrder: 1 },
  ]);
```
   (same extra resolve for "skips an existing partial card..." and "returns no new cards..." — reuse the existing-keys arrays for the final normalize pass). Add to "creates both cards":
```ts
const normalizeUpdates = mockDb.runAsync.mock.calls.filter((call) =>
  String(call[0]).includes("UPDATE DashboardCards") && String(call[0]).includes("SortOrder = ?")
);
expect(normalizeUpdates).toHaveLength(2);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/SmartCardGenerator.test.ts -v`
Expected: FAIL — device cards still say `cameras`/`switches`, SectionLabels still "Total"/"Today's", no normalize pass runs (update-count assertion fails).

- [ ] **Step 3: Add the constants import**

In `src/database/repositories/SmartCardGenerator.ts`, add:
```ts
import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "../seeds/dashboard-cards.seed";
```

- [ ] **Step 4: Route device cards to the `devices` entity**

In `generateCardsForField`, replace the entity selection and the two SectionLabels:

```ts
const isSum = kind === "sum";
const isDevice = field.source === "device";
const entityType = isDevice ? "devices" : "inspections";
const targetField = isDevice ? field.DeviceColumn! : field.FieldKey;
```

In the `totalCard` object: replace `EntityType: entityType,` stays; add `DeviceType: isDevice ? field.DeviceType : null,` after it; replace `SectionLabel: "Total",` → `SectionLabel: SECTION_LABEL_TOTAL,`. In the `todayCard` object: replace `SectionLabel: "Today's",` → `SectionLabel: SECTION_LABEL_TODAY,`.

- [ ] **Step 5: Normalize after adding cards**

In `addSmartCardsForField`, after the insert loop and before `return createdIds;`:
```ts
await DashboardCardRepository.normalizeSections(projectId);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/SmartCardGenerator.test.ts -v`
Expected: PASS. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/database/repositories/SmartCardGenerator.ts src/__tests__/repositories/SmartCardGenerator.test.ts
git commit -m "feat(dashboard): generate device-type cards against device records"
```

---

### Task 5: `StatisticCountService` — devices `IsActive` + `json_extract` breakdown

**Files:**
- Modify: `src/database/repositories/StatisticCountService.ts`
- Test: `src/__tests__/repositories/StatisticCountService.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `COUNT_ENTITIES.devices.projectClause` becomes `"i.ProjectID = ? AND r.IsActive = 1"`; `deviceBreakdownCard` gains a `devices` branch that builds a `json_extract(r.DeviceData, '$.<fieldName>')` query with `r.DeviceType = ?` (param = `card.DeviceType`) and an allowlist `/^[A-Za-z0-9_]+$/` on `BreakdownField` (return `[]` without querying otherwise).

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/repositories/StatisticCountService.test.ts` (use the existing `cardOf` and `normalizeSql` helpers):

```ts
it("scopes devices counts to active records and device type", () => {
  const card = cardOf({
    EntityType: "devices",
    CounterType: "total",
    FilterJson: JSON.stringify({ DeviceType: "Camera" }),
    CountMode: "count",
  });
  const built = StatisticCountService.buildCountSql(card)!;
  const sql = normalizeSql(built.sql);
  expect(sql).toContain("FROM DeviceRecords r");
  expect(sql).toContain("WHERE i.ProjectID = ? AND r.IsActive = 1");
  expect(sql).toContain("AND r.DeviceType = ?");
  expect(built.params).toEqual(["Camera"]);
});

it("deviceBreakdownCard json_extracts DeviceData for device-type cards", async () => {
  const mockDb = createMockDb();
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  mockDb.getAllAsync.mockResolvedValue([
    { label: "Operational", count: 8 },
    { label: "Fault", count: 2 },
  ]);

  const rows = await StatisticCountService.deviceBreakdownCard(
    1,
    cardOf({ EntityType: "devices", CounterType: "total", DeviceType: "Camera", BreakdownField: "CameraStatus" })
  );

  const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
  const normalized = normalizeSql(String(sql));
  expect(normalized).toContain("FROM DeviceRecords r");
  expect(normalized).toContain("json_extract(r.DeviceData, '$.CameraStatus') AS label");
  expect(normalized).toContain("AND r.DeviceType = ?");
  expect(normalized).toContain("WHERE i.ProjectID = ? AND r.IsActive = 1");
  expect(params).toEqual([1, "Camera"]);
  expect(rows).toEqual([
    { label: "Operational", count: 8 },
    { label: "Fault", count: 2 },
  ]);
});

it("deviceBreakdownCard rejects non-allowlisted field names without querying", async () => {
  const mockDb = createMockDb();
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);

  const rows = await StatisticCountService.deviceBreakdownCard(
    1,
    cardOf({ EntityType: "devices", CounterType: "total", DeviceType: "Camera", BreakdownField: "Bad Field; DROP TABLE" })
  );

  expect(rows).toEqual([]);
  expect(mockDb.getAllAsync).not.toHaveBeenCalled();
});
```

Note: `cardOf` may need a `DeviceType` field added to its base fixture (Task 1 added it to the model). Verify `cardOf` includes `DeviceType` or add `DeviceType: null` if the helper builds from the model fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/repositories/StatisticCountService.test.ts -v`
Expected: FAIL — the devices clause lacks `IsActive`, and `deviceBreakdownCard` returns `[]` for device-type cards (empty `deviceColumns` guard) and has no allowlist.

- [ ] **Step 3: Add `IsActive` to the devices entity**

In `COUNT_ENTITIES.devices`, change `projectClause: "i.ProjectID = ?"` → `projectClause: "i.ProjectID = ? AND r.IsActive = 1"`.

- [ ] **Step 4: Add the `devices` branch to `deviceBreakdownCard`**

Insert at the top of `deviceBreakdownCard` (after the `CounterType` guard, before the physical-columns branch):

```ts
if (card.EntityType === "devices") {
  const fieldName = card.BreakdownField;
  if (!card.DeviceType || !/^[A-Za-z0-9_]+$/.test(fieldName)) return [];

  const params: (string | number)[] = [projectId];
  const time = counter.buildTimeClause("r");
  if (time.clause) params.push(...time.params);

  const jsonExpr = `json_extract(r.DeviceData, '$.${fieldName}')`;
  const sql = `SELECT ${jsonExpr} AS label, COUNT(*) AS count
     FROM DeviceRecords r
     JOIN Inspections i ON r.InspectionID = i.InspectionID
     WHERE i.ProjectID = ? AND r.IsActive = 1
     ${time.clause}
     AND r.DeviceType = ?
     AND ${jsonExpr} IS NOT NULL AND ${jsonExpr} != ''
     GROUP BY ${jsonExpr}
     ORDER BY count DESC, label ASC`;

  params.push(card.DeviceType);

  const db = await getDatabase();
  const rows = await db.getAllAsync<{ label: string | null; count: number }>(sql, params);
  return rows.map((row) => ({ label: row.label ?? "(Not set)", count: row.count }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/repositories/StatisticCountService.test.ts -v`
Expected: PASS — existing suite plus the three new tests. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/database/repositories/StatisticCountService.ts src/__tests__/repositories/StatisticCountService.test.ts
git commit -m "feat(dashboard): count and break down device-type data from DeviceRecords"
```

---

### Task 6: Wire `migrateDeviceCards` into `migrateProjectSchema`

**Files:**
- Modify: `src/database/schema.ts`
- Test: `src/__tests__/database/schema.test.ts`

**Interfaces:**
- Consumes: `DashboardCardRepository.migrateDeviceCards` (Task 3).
- Produces: `migrateProjectSchema` calls `migrateDeviceCards(1)` in a try/catch directly after the `migrateDefaultCards(1)` block.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/database/schema.test.ts`:

1. Add `migrateDeviceCards: jest.fn().mockResolvedValue(undefined),` to the `DashboardCardRepository` mock (next to `migrateDefaultCards`).
2. Update the "adds the BreakdownField column idempotently" test (and any other test that references the repo mock after `migrateProjectSchema` runs) to also assert:
```ts
expect(DashboardCardRepository.migrateDeviceCards).toHaveBeenCalledWith(1);
```
3. Add:
```ts
it("migrateProjectSchema does not throw when migrateDeviceCards fails", async () => {
  mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

  const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
  (DashboardCardRepository.migrateDeviceCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

  const { migrateProjectSchema } = require("@/src/database/schema");
  await expect(migrateProjectSchema()).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/database/schema.test.ts -v`
Expected: FAIL — `migrateDeviceCards` is not called (and is not mocked yet).

- [ ] **Step 3: Add the call**

In `src/database/schema.ts`, directly after the `migrateDefaultCards` try/catch block (before the final END log):

```ts
try {
    await DashboardCardRepository.migrateDeviceCards(1);
} catch (e) {
    logger.info("[schema] migrateProjectSchema — migrateDeviceCards failed (non-fatal):", e);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/database/schema.test.ts -v`
Expected: PASS. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts src/__tests__/database/schema.test.ts
git commit -m "feat(dashboard): migrate existing dashboard cards to device-type counting"
```

---

### Task 7: `useSectionCollapse` hook (per-project persisted collapse state)

**Files:**
- Create: `src/hooks/useSectionCollapse.ts`
- Create: `src/__tests__/hooks/useSectionCollapse.test.tsx`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage`.
- Produces: `export default function useSectionCollapse(projectId: number): { isCollapsed(label: string): boolean; toggle(label: string): void }`. Storage key `accc_dash_collapsed_${projectId}`; stored value is a JSON array of collapsed labels; read once on mount/`projectId` change (read error → empty set → all sections expanded, the default); `toggle` updates state and fire-and-forgets `setItem` (write errors swallowed).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/hooks/useSectionCollapse.test.tsx` (mirrors the `react-test-renderer` Probe pattern from `useDashboardAutoRefresh.test.tsx`):

```tsx
import React from "react";
import { Pressable, Text } from "react-native";
import TestRenderer from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useSectionCollapse from "@/src/hooks/useSectionCollapse";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

const LABEL = "Total Summary";

function Probe({ projectId }: { projectId: number }) {
  const { isCollapsed, toggle } = useSectionCollapse(projectId);
  return (
    <>
      <Text>{String(isCollapsed(LABEL))}</Text>
      <Pressable onPress={() => toggle(LABEL)} />
    </>
  );
}

async function renderProbe(projectId: number) {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<Probe projectId={projectId} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

function collapsedText(tree: ReturnType<typeof TestRenderer.create>): string {
  const text = tree.root.findByType(Text as never);
  return String((text as unknown as { props: { children: string } }).props.children);
}

describe("useSectionCollapse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockResolvedValue(null);
    mockedSetItem.mockResolvedValue(undefined);
  });

  it("defaults to expanded when nothing is stored", async () => {
    const tree = await renderProbe(1);
    expect(collapsedText(tree)).toBe("false");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("reads collapsed labels from storage", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([LABEL]));
    const tree = await renderProbe(1);
    expect(collapsedText(tree)).toBe("true");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("treats corrupt storage as expanded", async () => {
    mockedGetItem.mockResolvedValue("{not json");
    const tree = await renderProbe(1);
    expect(collapsedText(tree)).toBe("false");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("uses a project-scoped storage key", async () => {
    await renderProbe(7);
    expect(mockedGetItem).toHaveBeenCalledWith("accc_dash_collapsed_7");
  });

  it("re-reads storage when projectId changes", async () => {
    const tree = await renderProbe(1);
    await TestRenderer.act(async () => {
      mockedGetItem.mockResolvedValue(JSON.stringify([LABEL]));
      tree.update(<Probe projectId={2} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedGetItem).toHaveBeenCalledWith("accc_dash_collapsed_2");
    expect(collapsedText(tree)).toBe("true");
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("toggle collapses then expands and persists", async () => {
    const tree = await renderProbe(1);
    const pressable = tree.root.findByType(Pressable as never);

    await TestRenderer.act(async () => {
      pressable.props.onPress();
    });
    expect(collapsedText(tree)).toBe("true");
    expect(mockedSetItem).toHaveBeenCalledWith("accc_dash_collapsed_1", JSON.stringify([LABEL]));

    await TestRenderer.act(async () => {
      pressable.props.onPress();
    });
    expect(collapsedText(tree)).toBe("false");
    expect(mockedSetItem).toHaveBeenLastCalledWith("accc_dash_collapsed_1", JSON.stringify([]));
    await TestRenderer.act(async () => { tree.unmount(); });
  });

  it("swallows storage write errors", async () => {
    mockedSetItem.mockRejectedValueOnce(new Error("boom"));
    const tree = await renderProbe(1);
    const pressable = tree.root.findByType(Pressable as never);
    await expect(
      TestRenderer.act(async () => {
        pressable.props.onPress();
      })
    ).resolves.toBeUndefined();
    await TestRenderer.act(async () => { tree.unmount(); });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/hooks/useSectionCollapse.test.tsx -v`
Expected: FAIL — module `@/src/hooks/useSectionCollapse` not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useSectionCollapse.ts`:

```ts
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = (projectId: number) => `accc_dash_collapsed_${projectId}`;

function readCollapsed(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

export default function useSectionCollapse(projectId: number) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY(projectId))
      .then((raw) => {
        if (!cancelled) setCollapsed(readCollapsed(raw));
      })
      .catch(() => {
        if (!cancelled) setCollapsed(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const isCollapsed = (label: string) => collapsed.has(label);

  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      AsyncStorage.setItem(STORAGE_KEY(projectId), JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  return { isCollapsed, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/hooks/useSectionCollapse.test.tsx -v`
Expected: PASS (7 tests). Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSectionCollapse.ts src/__tests__/hooks/useSectionCollapse.test.tsx
git commit -m "feat(dashboard): persist per-project collapsed card sections"
```

---

### Task 8: `DashboardCardGrid` — collapsible summary sections + uppercase/divider headings

**Files:**
- Modify: `src/components/dashboard/DashboardCardGrid.tsx`
- Test: `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`

**Interfaces:**
- Consumes: `SECTION_LABEL_TOTAL`, `SECTION_LABEL_TODAY` from the seed; `useSectionCollapse(projectId)`.
- Produces: `DashboardCardGrid` props unchanged. The two summary section headers render as a `Pressable` row (label + `chevron-up`/`chevron-down` icon) with an `uppercase` bold label and a divider underneath; tapping toggles collapse and hides that section's cards. Custom/admin sections render the plain heading without a toggle.

- [ ] **Step 1: Update the failing tests**

In `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`:

1. Add the hook mock next to the existing mocks and wire it:
```tsx
jest.mock("@/src/hooks/useSectionCollapse", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import useSectionCollapse from "@/src/hooks/useSectionCollapse";
import { Pressable } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SECTION_LABEL_TOTAL, SECTION_LABEL_TODAY } from "@/src/database/seeds/dashboard-cards.seed";

const mockedCollapse = useSectionCollapse as jest.MockedFunction<typeof useSectionCollapse>;
```
2. In `beforeEach`, set the collapse mock default:
```tsx
mockedCollapse.mockReturnValue({
  isCollapsed: jest.fn().mockReturnValue(false),
  toggle: jest.fn(),
});
```
3. Update the three grouping tests to use the new labels: replace `SectionLabel: "Total"` → `SectionLabel: SECTION_LABEL_TOTAL`, `SectionLabel: "Today's"` → `SectionLabel: SECTION_LABEL_TODAY`, and the assertions `expect(strings).toContain("Total")` → `toContain(SECTION_LABEL_TOTAL)` (and `"Today's"` → `SECTION_LABEL_TODAY`); the `indexOf` comparisons likewise use the constants.
4. "renders no section headers for cards with null SectionLabel": change the two `not.toContain` assertions to `not.toContain(SECTION_LABEL_TOTAL)` / `not.toContain(SECTION_LABEL_TODAY)`.

Add new tests (after the grouping tests):

```tsx
it("renders a collapsible chevron header for a summary section", async () => {
  mockedService.getEnabledCardsWithCounts.mockResolvedValue([
    cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
  ]);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
    await flushPromises();
  });
  const strings = collectStrings(tree!.toJSON());
  expect(strings).toContain(SECTION_LABEL_TOTAL);
  const chevrons = tree!.root.findAll((node) => {
    const type = (node as unknown as { type?: unknown }).type;
    return typeof type === "function" && type === MaterialCommunityIcons;
  }).filter((node) => {
    const name = (node.props as { name?: string }).name ?? "";
    return name === "chevron-up" || name === "chevron-down";
  });
  expect(chevrons).toHaveLength(1);
  expect(chevrons[0].props.name).toBe("chevron-up");
});

it("hides a collapsed summary section's cards but keeps the header", async () => {
  mockedCollapse.mockReturnValue({
    isCollapsed: jest.fn().mockReturnValue(true),
    toggle: jest.fn(),
  });
  mockedService.getEnabledCardsWithCounts.mockResolvedValue([
    cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
    cardWithCount({ CardID: 2, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TODAY, count: 2 }),
  ]);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
    await flushPromises();
  });
  const strings = collectStrings(tree!.toJSON());
  expect(strings).toContain(SECTION_LABEL_TOTAL);
  expect(strings).toContain(SECTION_LABEL_TODAY);
  expect(strings.filter((s) => s === "Inspection Done")).toHaveLength(1);
  expect(strings.filter((s) => s === "8")).toHaveLength(0);
  expect(strings.filter((s) => s === "2")).toHaveLength(1);
});

it("toggles a summary section on header tap", async () => {
  const toggle = jest.fn();
  mockedCollapse.mockReturnValue({
    isCollapsed: jest.fn().mockReturnValue(false),
    toggle,
  });
  mockedService.getEnabledCardsWithCounts.mockResolvedValue([
    cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
  ]);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
    await flushPromises();
  });
  const pressable = tree!.root.findAllByType(Pressable as never)[0];
  await TestRenderer.act(async () => {
    (pressable.props as { onPress: () => void }).onPress();
  });
  expect(toggle).toHaveBeenCalledWith(SECTION_LABEL_TOTAL);
});

it("renders custom sections as plain headers without a chevron", async () => {
  mockedService.getEnabledCardsWithCounts.mockResolvedValue([
    cardWithCount({ CardID: 1, CardKey: "custom_card", Title: "Custom Card", SectionLabel: "My Section", count: 8 }),
  ]);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
    await flushPromises();
  });
  const strings = collectStrings(tree!.toJSON());
  expect(strings).toContain("My Section");
  const chevrons = tree!.root.findAll((node) => {
    const type = (node as unknown as { type?: unknown }).type;
    return typeof type === "function" && type === MaterialCommunityIcons;
  }).filter((node) => {
    const name = (node.props as { name?: string }).name ?? "";
    return name === "chevron-up" || name === "chevron-down";
  });
  expect(chevrons).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx -v`
Expected: FAIL — no chevron headers, collapsed cards not hidden, no Pressable, grouping tests fail on old labels.

- [ ] **Step 3: Implement the collapsible grid**

In `src/components/dashboard/DashboardCardGrid.tsx`:

1. Imports: add `Pressable` to the `react-native` import; add `useSectionCollapse`; add `import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "@/src/database/seeds/dashboard-cards.seed";`.
2. Inside the component, after `const autoKey = ...`:
```tsx
const { isCollapsed, toggle } = useSectionCollapse(projectId);
```
3. Replace the section-header block in the render loop:
```tsx
if (section !== currentSection) {
  currentSection = section;
  if (section) {
    const collapsible = section === SECTION_LABEL_TOTAL || section === SECTION_LABEL_TODAY;
    const collapsed = collapsible && isCollapsed(section);
    rows.push(
      <View key={`section-${section}-${i}`} style={styles.sectionBlock}>
        <Pressable
          style={styles.sectionHeaderButton}
          onPress={() => toggle(section)}
          disabled={!collapsible}
        >
          <Text style={styles.sectionHeader}>{section}</Text>
          {collapsible ? (
            <MaterialCommunityIcons
              name={collapsed ? "chevron-down" : "chevron-up"}
              size={20}
              color={COLORS.textSecondary}
            />
          ) : null}
        </Pressable>
        <View style={styles.sectionDivider} />
      </View>
    );
    if (collapsed) {
      while (i + 1 < cards.length && (cards[i + 1].SectionLabel ?? null) === section) {
        i++;
      }
      continue;
    }
  }
}
```
4. Replace the styles block for the section headers:
```tsx
  sectionBlock: {
    marginTop: SPACING.lg,
  },

  sectionHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },

  sectionHeader: {
    fontWeight: "700",
    fontSize: 15,
    color: COLORS.textPrimary,
    textTransform: "uppercase",
  },

  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.sm,
  },
```
(Remove the old `sectionHeader` margins.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx -v`
Expected: PASS — existing 12 tests (labels updated) plus the 4 new tests. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardCardGrid.tsx src/__tests__/components/dashboard/DashboardCardGrid.test.tsx
git commit -m "feat(dashboard): collapsible summary card sections"
```

---

### Task 9: `DashboardCardManager` — boundary-locked reorder + factory reset

**Files:**
- Modify: `src/components/dashboard/DashboardCardManager.tsx`
- Test: `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`

**Interfaces:**
- Consumes: `DashboardCardRepository.normalizeSections`, `DashboardCardRepository.resetDefaultCards` (Task 3).
- Produces: `handleMove` refuses moves across a section boundary and calls `normalizeSections` after `reorderCards`; up/down arrows are `disabled` at section boundaries; "Reset Defaults" calls `resetDefaultCards` (full factory reset).

- [ ] **Step 1: Update the failing tests**

In `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`:

1. Add to the repository mock: `normalizeSections: jest.fn().mockResolvedValue(undefined)` and `resetDefaultCards: jest.fn().mockResolvedValue(undefined)` (it currently mocks `ensureDefaultCards`).
2. Update the "Reset Defaults" test to assert `repo.resetDefaultCards` is called with `1` (the current test asserts `ensureDefaultCards`). Keep the `ensureDefaultCards` mock in place so the field-picker/load flows still resolve.
3. Add new tests:
```tsx
it("disables the reorder arrows at section boundaries", async () => {
  repo.getAllCards.mockResolvedValue([
    baseCard({ CardID: 1, CardKey: "total_a", Title: "Total A", SectionLabel: "Total Summary" }),
    baseCard({ CardID: 2, CardKey: "today_a", Title: "Today A", SectionLabel: "Today's Summary" }),
  ]);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardManager projectId={1} />);
    await flushPromises();
  });
  const buttons = tree!.root.findAllByType(IconButton as never);
  const upButtons = buttons.filter((b) => b.props.icon === "arrow-up");
  const downButtons = buttons.filter((b) => b.props.icon === "arrow-down");
  expect(upButtons[1].props.disabled).toBe(true);   // second card cannot move up across sections
  expect(downButtons[0].props.disabled).toBe(true); // first card cannot move down across sections
  await TestRenderer.act(async () => { tree.unmount(); });
});

it("does not move a card across a section boundary", async () => {
  repo.getAllCards.mockResolvedValue([
    baseCard({ CardID: 1, CardKey: "total_a", Title: "Total A", SectionLabel: "Total Summary" }),
    baseCard({ CardID: 2, CardKey: "today_a", Title: "Today A", SectionLabel: "Today's Summary" }),
  ]);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardManager projectId={1} />);
    await flushPromises();
  });
  const buttons = tree!.root.findAllByType(IconButton as never);
  const downButtons = buttons.filter((b) => b.props.icon === "arrow-down");
  await TestRenderer.act(async () => {
    downButtons[0].props.onPress();
  });
  expect(repo.reorderCards).not.toHaveBeenCalled();
  await TestRenderer.act(async () => { tree.unmount(); });
});
```
(Use the test file's existing `baseCard`, `flushPromises`, and `IconButton` import/mocks.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx -v`
Expected: FAIL — cross-section moves are not blocked, arrows only disabled at list ends, and the reset flow uses `ensureDefaultCards`.

- [ ] **Step 3: Update `handleMove`**

In `src/components/dashboard/DashboardCardManager.tsx`:

```tsx
const handleMove = async (index: number, direction: -1 | 1) => {
  const target = index + direction;
  if (target < 0 || target >= cards.length) return;
  const current = cards[index];
  const neighbor = cards[target];
  if ((current.SectionLabel ?? null) !== (neighbor.SectionLabel ?? null)) return;
  const next = [...cards];
  [next[index], next[target]] = [next[target], next[index]];
  const ids = next.map((c) => c.CardID as number);
  await DashboardCardRepository.reorderCards(projectId, ids);
  await DashboardCardRepository.normalizeSections(projectId);
  load();
};
```

- [ ] **Step 4: Disable arrows at boundaries**

Replace the two `IconButton` arrows:
```tsx
<IconButton
  icon="arrow-up"
  disabled={index === 0 || (cards[index - 1]?.SectionLabel ?? null) !== (card.SectionLabel ?? null)}
  onPress={() => handleMove(index, -1)}
/>
<IconButton
  icon="arrow-down"
  disabled={index === cards.length - 1 || (cards[index + 1]?.SectionLabel ?? null) !== (card.SectionLabel ?? null)}
  onPress={() => handleMove(index, 1)}
/>
```

- [ ] **Step 5: Route "Reset Defaults" through the factory reset**

```tsx
const handleResetDefaults = async () => {
  await DashboardCardRepository.resetDefaultCards(projectId);
  load();
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx -v`
Expected: PASS — existing suite plus the two new tests. Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/DashboardCardManager.tsx src/__tests__/components/dashboard/DashboardCardManager.test.tsx
git commit -m "feat(dashboard): lock reorder within sections and factory-reset defaults"
```

---

### Task 10: Project-scoped isolation regression test

**Files:**
- Create: `src/__tests__/database/dashboardDeviceCount.isolation.test.ts`

**Interfaces:**
- Consumes: `expo-sqlite` mock, `expo-file-system/legacy` mock, `db.setActiveProject`/`clearActiveProject`/`getDatabase`, `DashboardCardRepository.createCard` (with `DeviceType`).
- Produces: an isolation suite proving `DeviceRecords` and device-count cards written in Project A never appear in Project B (mirrors `src/__tests__/database/isolation.test.ts`).

- [ ] **Step 1: Write the test**

Create `src/__tests__/database/dashboardDeviceCount.isolation.test.ts` (copy the mock setup and `openProject` helper from `isolation.test.ts`):

```ts
jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT_A = "/mock/documents/Projects/DeviceProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/DeviceProjectBeta/inspection.db";

describe("Device-count data isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault) VALUES (?, ?, ?)`,
      ["Template", "desc", 1]
    );
    return db;
  }

  it("does not leak DeviceRecords written in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const dbA = await openProject(PROJECT_A);

    await dbA.runAsync(
      `INSERT INTO DeviceRecords (RecordID, InspectionID, DeviceType, DeviceLabel, DeviceData, IsActive)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, 100, "Camera", "CAM-LEAK", JSON.stringify({ CameraStatus: "Operational" }), 1]
    );

    const rowsInA = await dbA.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE DeviceType = 'Camera'"
    );
    expect(rowsInA).toHaveLength(1);

    await dbModule.clearActiveProject();
    const dbB = await openProject(PROJECT_B);

    const rowsInB = await dbB.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE DeviceType = 'Camera'"
    );
    expect(rowsInB).toEqual([]);

    const rowsInAAfter = await dbA.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE DeviceType = 'Camera'"
    );
    expect(rowsInAAfter).toHaveLength(1);
  });

  it("does not leak a device-count card created in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const dbA = await openProject(PROJECT_A);

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository") as typeof import("@/src/database/repositories/DashboardCardRepository");
    const cardId = await DashboardCardRepository.createCard({
      ProjectID: 1,
      CardKey: "leak_device_count_card",
      Title: "Camera Status",
      Icon: "cctv",
      Color: "#111111",
      EntityType: "devices",
      CounterType: "total",
      FilterJson: null,
      CountMode: "count",
      CardMode: "dropdown",
      DistinctColumn: null,
      DeviceType: "Camera",
      BreakdownField: "CameraStatus",
      SortOrder: 0,
      Enabled: 1,
      IsDefault: 0,
    });
    expect(cardId).toBeGreaterThan(0);

    const cardsInA = await dbA.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DashboardCards WHERE CardKey = 'leak_device_count_card'"
    );
    expect(cardsInA).toEqual([{ DeviceType: "Camera" }]);

    await dbModule.clearActiveProject();
    const dbB = await openProject(PROJECT_B);

    const cardsInB = await dbB.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards WHERE CardKey = 'leak_device_count_card'"
    );
    expect(cardsInB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest src/__tests__/database/dashboardDeviceCount.isolation.test.ts -v`
Expected: PASS (2 tests). Then `npx tsc --noEmit` — exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/database/dashboardDeviceCount.isolation.test.ts
git commit -m "test(dashboard): assert device-count data stays project-scoped"
```

---

### Task 11: Whole-branch verification and changelog

**Files:**
- Modify: `docs/07-Changelog.md`

- [ ] **Step 1: Add the changelog entry**

In `docs/07-Changelog.md`, under `[Unreleased]` → `### Added` / `### Changed` (place under the section that matches the existing Smart Dashboard CardMode entries), add bullets:

```markdown
- Dashboard card sections are now a first-class grouping: summary sections are renamed to "Total Summary" / "Today's Summary", rendered bold/uppercase with a divider, and collapse per-project (state persisted in AsyncStorage, default expanded). Smart-added cards merge into the canonical sections; reorder arrows are locked at section boundaries; "Reset Defaults" now performs a full factory reset of the project's cards.
- Device-type cards now count real data from `DeviceRecords` (`json_extract` of the `DeviceData` JSON), including the default camera cards and any migrated `smart_dev_*` cards, instead of the unused `Cameras`/`Switches` tables.
```

- [ ] **Step 2: Run the full verification**

Run: `npx jest`
Expected: PASS — all suites (23 suites, 224+ tests), including the new `useSectionCollapse.test.tsx` and `dashboardDeviceCount.isolation.test.ts`, and the updated seed/repo/generator/service/schema/grid/manager suites.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx expo lint`
Expected: 0 errors (pre-existing warnings acceptable).

- [ ] **Step 3: Commit**

```bash
git add docs/07-Changelog.md
git commit -m "docs: changelog for dashboard card sections and device counting"
```

---

## Self-Review

**Spec coverage:**
- `DeviceType` column (model + DDL + repository + `migrateProjectSchema` ALTER) → Task 1.
- Section rename via exported constants; default camera cards repointed to `devices`/`DeviceType Camera` (spec §1c) → Task 2.
- `normalizeSections`, `resetDefaultCards` (full factory reset), `migrateDeviceCards` (smart cards + camera cards + legacy label rename, scoped by project) → Task 3.
- Smart device cards → `EntityType "devices"` + `DeviceType` + `BreakdownField`, `normalizeSections` on smart-add (spec §3) → Task 4.
- `devices` `IsActive` clause + `json_extract` `deviceBreakdownCard` with allowlist (spec §2, §3) → Task 5.
- Migration wiring into `migrateProjectSchema`, non-fatal (spec migration step 4) → Task 6.
- Per-project persisted collapse (AsyncStorage, default expanded) → Task 7.
- Grid: uppercase + divider headings, collapsible summary headers with chevron, hide-on-collapse (spec collapsible grid header) → Task 8.
- Manager: boundary-locked reorder + "Reset Defaults" = factory reset → Task 9.
- Project-scoped isolation regression test (AGENTS.md) → Task 10.
- Full verification + changelog → Task 11.

**Placeholder scan:** every step contains concrete code or an exact command; no TBD/TODO.

**Type consistency:** `DeviceType` is threaded model → DDL → `CARD_COLUMNS`/`mapRow` → all INSERT paths (appended last so existing param indices stay valid). `SECTION_LABEL_TOTAL`/`SECTION_LABEL_TODAY` are exported once in the seed and imported by seed data, generator, repository migration, and grid. The grid collapses only the two summary labels (raw `SectionLabel` values), so stored labels and matching keys are identical.

**Test-affected surfaces verified this session:** `DashboardCardRepository.test.ts` (column-count 17→18, placeholder 15→16), `dashboardCards.seed.test.ts` (labels, Camera Count SUM→entitycount), `SmartCardGenerator.test.ts` (SectionLabels, device EntityType, +1 `getAllAsync` per `addSmartCardsForField` normalize pass), `schema.test.ts` (repo mock + `migrateDeviceCards(1)` + DeviceType ALTER), `DashboardCardGrid.test.tsx` (labels + hook mock + 4 new tests), `DashboardCardManager.test.tsx` (repo mock + reset + 2 new tests).
