# Dashboard Dropdown Layout + Default Card Bindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give dropdown statistic cards an adaptive grid layout and fix the default Pole/Camera dashboard card bindings plus Add Card field coverage.

**Architecture:** (1) `StatBreakdownCard` picks a compact mini-card grid vs. the vertical list via a pure size/label-length rule. (2) Default seed data for `total_pole_status`/`today_pole_status`/`total_camera_count`/`today_camera_count` is corrected. (3) `DashboardCardRepository.migrateDeviceCards` migrates existing project DBs idempotently. (4) `SmartCardGenerator.getAvailableFields` switches from CardKey-based to field-based coverage so default cards hide their fields.

**Tech Stack:** React Native (Expo), TypeScript strict, Jest (react-test-renderer), expo-sqlite.

**Spec:** `docs/superpowers/specs/2026-08-03-dashboard-dropdown-layout-and-defaults-design.md`

## Global Constraints

- Commits are **SKIPPED** — AGENTS.md forbids committing unless the user explicitly asks. Every task ends with a test run instead of a commit.
- Run from `frontend/`: verify with `npx tsc --noEmit`, `npx eslint app src`, `npx jest`.
- Path alias `@/*` → `frontend/*`. No comments in code unless requested. TypeScript strict — no `any`.
- Reuse existing tokens from `src/constants/ui.ts`: `COLORS`, `RADIUS`, `SPACING`.
- Do **not** regress the section-border enhancement in `DashboardCardGrid.tsx` (summary panels).
- No new tables/columns. `migrateDeviceCards` stays idempotent and runs on every project open (`src/database/schema.ts` ~line 319). No cross-DB access; `getGlobalDatabase()` is never called during dashboard flow.
- Default-card keys stay the same: `total_pole_status`, `today_pole_status`, `total_camera_count`, `today_camera_count`. Only titles/bindings change.

---

### Task 1: Correct the default card seed data

**Files:**
- Modify: `src/database/seeds/dashboard-cards.seed.ts:35-42` (`DEFAULT_SECTIONED_CARDS`)
- Test: `src/__tests__/database/dashboardCards.seed.test.ts:63-66,127-150,164-169`
- Test: `src/__tests__/repositories/DashboardCardRepository.test.ts:494-501`

**Interfaces:**
- Consumes: `DashboardCardSeed` interface in `dashboard-cards.seed.ts` (unchanged — `FilterJson`/`DeviceType` are already optional).
- Produces: `DEFAULT_SECTIONED_CARDS` with Pole cards titled "Pole Availability" and Camera Count cards as `CardMode "sum"` / `AggregateField "camera_count"` / `EntityType "inspections"`. `ensureDefaultCards` and `resetDefaultCards` replay these values automatically (no code change — they read the seed array).

- [ ] **Step 1: Update `DEFAULT_SECTIONED_CARDS`**

Replace lines 37-38 and 40-41 in `src/database/seeds/dashboard-cards.seed.ts` so the four cards read:

```ts
  { CardKey: "total_pole_status",     Title: "Pole Availability", Icon: "transmission-tower", Color: "#198754", EntityType: "inspections", CounterType: "total", CountMode: "count",   CardMode: "dropdown",  BreakdownField: "pole_avail", SectionLabel: SECTION_LABEL_TOTAL,   SortOrder: 1 },
  { CardKey: "total_camera_count",    Title: "Camera Count",     Icon: "cctv",               Color: "#6F42C1", EntityType: "inspections", CounterType: "total", CountMode: "count",   CardMode: "sum", AggregateField: "camera_count", SectionLabel: SECTION_LABEL_TOTAL,   SortOrder: 2 },
```
```ts
  { CardKey: "today_pole_status",     Title: "Pole Availability", Icon: "transmission-tower", Color: "#DC3545", EntityType: "inspections", CounterType: "today", CountMode: "count",   CardMode: "dropdown",  BreakdownField: "pole_avail", SectionLabel: SECTION_LABEL_TODAY, SortOrder: 4 },
  { CardKey: "today_camera_count",    Title: "Camera Count",      Icon: "cctv",               Color: "#6F42C1", EntityType: "inspections", CounterType: "today", CountMode: "count",   CardMode: "sum", AggregateField: "camera_count", SectionLabel: SECTION_LABEL_TODAY, SortOrder: 5 },
```

Note: `FilterJson` and `DeviceType` are omitted (undefined) so `card.FilterJson ?? null` and `card.DeviceType ?? null` insert NULL. `total_inspection_done` and `today_inspection_done` are untouched.

- [ ] **Step 2: Update the seed test — CardMode distribution**

In `src/__tests__/database/dashboardCards.seed.test.ts`, change lines 63-65:

```ts
    expect(cards.filter((c) => c.CardMode === "entitycount")).toHaveLength(2);
    expect(cards.filter((c) => c.CardMode === "dropdown")).toHaveLength(2);
    expect(cards.filter((c) => c.CardMode === "sum")).toHaveLength(2);
```

- [ ] **Step 3: Update the seed test — camera + pole assertions**

In the same file, rename the test at line 127 to `"seeds the Camera Count SUM and Pole Availability breakdown defaults"` and replace its body (lines 134-150) with:

```ts
    const camera = await db.getFirstAsync<{ EntityType: string; FilterJson: string; CardMode: string; DeviceType: string; AggregateField: string; SectionLabel: string }>(
      "SELECT EntityType, FilterJson, CardMode, DeviceType, AggregateField, SectionLabel FROM DashboardCards WHERE CardKey = 'total_camera_count'"
    );
    expect(camera).not.toBeNull();
    expect(camera!.EntityType).toBe("inspections");
    expect(camera!.FilterJson).toBeNull();
    expect(camera!.CardMode).toBe("sum");
    expect(camera!.DeviceType).toBeNull();
    expect(camera!.AggregateField).toBe("camera_count");
    expect(camera!.SectionLabel).toBe("Total Summary");

    const pole = await db.getFirstAsync<{ Title: string; BreakdownField: string; CardMode: string }>(
      "SELECT Title, BreakdownField, CardMode FROM DashboardCards WHERE CardKey = 'total_pole_status'"
    );
    expect(pole).not.toBeNull();
    expect(pole!.Title).toBe("Pole Availability");
    expect(pole!.BreakdownField).toBe("pole_avail");
    expect(pole!.CardMode).toBe("dropdown");
```

- [ ] **Step 4: Update the seed test — explicit CardMode map**

In the same file, update lines 166 and 169:

```ts
    expect(byKey["total_camera_count"]).toBe("sum");
```
```ts
    expect(byKey["today_camera_count"]).toBe("sum");
```

- [ ] **Step 5: Update `ensureDefaultCards` CardMode assertion**

In `src/__tests__/repositories/DashboardCardRepository.test.ts` line 500, change to:

```ts
      expect(allParams.map((p) => p[13])).toEqual(["entitycount", "dropdown", "sum", "entitycount", "dropdown", "sum"]);
```

- [ ] **Step 6: Run the affected tests**

Run: `npx jest src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/repositories/DashboardCardRepository.test.ts`
Expected: all PASS.

---

### Task 2: Migrate existing project DBs (title rename + Camera Count rebind)

**Files:**
- Modify: `src/database/repositories/DashboardCardRepository.ts:352-400` (`migrateDeviceCards`)
- Test: `src/__tests__/repositories/DashboardCardRepository.test.ts:558-604` (`migrateDeviceCards` suite)

**Interfaces:**
- Consumes: existing card rows from `SELECT CardID, CardKey FROM DashboardCards WHERE ProjectID = ?`.
- Produces: on every project open, the migration (a) keeps smart-device rewrites, (b) repoints only legacy `total_cameras`/`today_cameras` to device counting, (c) rebinds `total_camera_count`/`today_camera_count` to `sum`/`camera_count`, (d) renames `total_pole_status`/`today_pole_status` titles to "Pole Availability", (e) keeps the legacy SectionLabel renames.

- [ ] **Step 1: Rewrite `migrateDeviceCards`**

Replace the whole method (lines 352-400) in `src/database/repositories/DashboardCardRepository.ts` with:

```ts
  static async migrateDeviceCards(projectId: number): Promise<void> {
    const db = await getDatabase();

    const existing = await db.getAllAsync<{ CardID: number; CardKey: string }>(
      `SELECT CardID, CardKey FROM DashboardCards WHERE ProjectID = ?`,
      [projectId]
    );

    const smartCards = existing.filter((row) => row.CardKey.startsWith("smart_dev_"));
    const legacyCameraKeys = new Set(["total_cameras", "today_cameras"]);
    const legacyCameraCards = existing.filter((row) => legacyCameraKeys.has(row.CardKey));
    const fieldCameraKeys = new Set(["total_camera_count", "today_camera_count"]);
    const fieldCameraCards = existing.filter((row) => fieldCameraKeys.has(row.CardKey));
    const poleKeys = new Set(["total_pole_status", "today_pole_status"]);
    const poleCards = existing.filter((row) => poleKeys.has(row.CardKey));

    if (
      smartCards.length === 0 &&
      legacyCameraCards.length === 0 &&
      fieldCameraCards.length === 0 &&
      poleCards.length === 0
    ) {
      return;
    }

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

      for (const row of legacyCameraCards) {
        await db.runAsync(
          `UPDATE DashboardCards
           SET EntityType = 'devices', DeviceType = 'Camera', CardMode = 'entitycount',
               FilterJson = ?, AggregateField = NULL, UpdatedAt = CURRENT_TIMESTAMP
           WHERE CardID = ? AND ProjectID = ?`,
          ['{"DeviceType":"Camera"}', row.CardID, projectId]
        );
      }

      for (const row of fieldCameraCards) {
        await db.runAsync(
          `UPDATE DashboardCards
           SET EntityType = 'inspections', CardMode = 'sum', AggregateField = 'camera_count',
               FilterJson = NULL, DeviceType = NULL, UpdatedAt = CURRENT_TIMESTAMP
           WHERE CardID = ? AND ProjectID = ?`,
          [row.CardID, projectId]
        );
      }

      for (const row of poleCards) {
        await db.runAsync(
          `UPDATE DashboardCards SET Title = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE CardID = ? AND ProjectID = ?`,
          ["Pole Availability", row.CardID, projectId]
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

- [ ] **Step 2: Rewrite the main `migrateDeviceCards` test**

In `src/__tests__/repositories/DashboardCardRepository.test.ts`, replace the `migrateDeviceCards` describe block (lines 558-604) with:

```ts
  describe("migrateDeviceCards", () => {
    it("rewrites smart cards, repoints legacy cameras, rebinds field cameras, renames pole cards, and renames legacy labels", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      db.getAllAsync.mockResolvedValue([
        { CardID: 1, CardKey: "smart_dev_Camera_CameraStatus_total" },
        { CardID: 2, CardKey: "smart_dev_Switch_SwitchState_today" },
        { CardID: 3, CardKey: "total_camera_count" },
        { CardID: 4, CardKey: "today_camera_count" },
        { CardID: 5, CardKey: "total_cameras" },
        { CardID: 6, CardKey: "today_cameras" },
        { CardID: 7, CardKey: "total_pole_status" },
        { CardID: 8, CardKey: "today_pole_status" },
        { CardID: 9, CardKey: "total_inspections" },
      ]);
      db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const { SECTION_LABEL_TOTAL, SECTION_LABEL_TODAY } = require("@/src/database/seeds/dashboard-cards.seed");

      await DashboardCardRepository.migrateDeviceCards(1);

      const calls = (db.runAsync as jest.Mock).mock.calls as Array<[string, unknown[]]>;
      const smart = calls.filter(([sql]) => sql.includes("EntityType = 'devices'") && !sql.includes("FilterJson"));
      expect(smart).toHaveLength(2);
      expect(smart[0][1]).toEqual(["Camera", "CameraStatus", 1, 1]);
      expect(smart[1][1]).toEqual(["Switch", "SwitchState", 2, 1]);

      const cameraRepoint = calls.filter(([sql]) => sql.includes("FilterJson"));
      expect(cameraRepoint).toHaveLength(2);
      expect(cameraRepoint.map(([, p]) => p[1])).toEqual([5, 6]);
      expect(cameraRepoint[0][1]).toEqual(['{"DeviceType":"Camera"}', 5, 1]);

      const sumRebind = calls.filter(([sql]) => sql.includes("CardMode = 'sum'"));
      expect(sumRebind).toHaveLength(2);
      expect(sumRebind[0][1]).toEqual(["inspections", "sum", "camera_count", 3, 1]);
      expect(sumRebind[1][1]).toEqual(["inspections", "sum", "camera_count", 4, 1]);

      const poleRename = calls.filter(([sql]) => sql.includes("SET Title = ?"));
      expect(poleRename).toHaveLength(2);
      expect(poleRename[0][1]).toEqual(["Pole Availability", 7, 1]);
      expect(poleRename[1][1]).toEqual(["Pole Availability", 8, 1]);

      const renameTotal = calls.find(([sql, p]) => String(sql).includes("SectionLabel = ?") && p[0] === SECTION_LABEL_TOTAL);
      expect(renameTotal).toBeDefined();
      expect(renameTotal![1]).toEqual([SECTION_LABEL_TOTAL, "Total", 1]);
      const renameToday = calls.find(([sql, p]) => String(sql).includes("SectionLabel = ?") && p[0] === SECTION_LABEL_TODAY);
      expect(renameToday).toBeDefined();
      expect(renameToday![1]).toEqual([SECTION_LABEL_TODAY, "Today's", 1]);
    });

    it("rebinds field camera cards and renames pole cards even without smart or legacy camera cards", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      db.getAllAsync.mockResolvedValue([
        { CardID: 3, CardKey: "total_camera_count" },
        { CardID: 4, CardKey: "today_camera_count" },
        { CardID: 7, CardKey: "total_pole_status" },
        { CardID: 8, CardKey: "today_pole_status" },
        { CardID: 9, CardKey: "total_inspections" },
      ]);
      db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

      await DashboardCardRepository.migrateDeviceCards(1);

      const calls = (db.runAsync as jest.Mock).mock.calls as Array<[string, unknown[]]>;
      const sumRebind = calls.filter(([sql]) => sql.includes("CardMode = 'sum'"));
      expect(sumRebind).toHaveLength(2);
      const poleRename = calls.filter(([sql]) => sql.includes("SET Title = ?"));
      expect(poleRename).toHaveLength(2);
      const smart = calls.filter(([sql]) => sql.includes("EntityType = 'devices'") && !sql.includes("FilterJson"));
      expect(smart).toHaveLength(0);
      const cameraRepoint = calls.filter(([sql]) => sql.includes("FilterJson"));
      expect(cameraRepoint).toHaveLength(0);
    });

    it("is a no-op when no device cards, camera cards, or pole cards exist", async () => {
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

- [ ] **Step 3: Run the repository tests**

Run: `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/schema.test.ts`
Expected: all PASS (`schema.test.ts` mocks `migrateDeviceCards`, so it only checks call wiring — unchanged).

---

### Task 3: Field-based Add Card coverage

**Files:**
- Modify: `src/database/repositories/SmartCardGenerator.ts:235-250` (`getAvailableFields`) — add a static helper
- Test: `src/__tests__/repositories/SmartCardGenerator.test.ts:436-531` (`getAvailableFields` suite)

**Interfaces:**
- Consumes: `SmartFormField` (existing), `DashboardCard` (existing), `DashboardCardRepository.getAllCards(projectId)` (existing).
- Produces: `SmartCardGenerator.isFieldCovered(field: SmartFormField, cards: DashboardCard[]): boolean` — returns `true` for `skip` kinds and when any card covers the field; used by `getAvailableFields` (public static) and potentially by the Add Card UI later. No signature change to `getAvailableFields`.

- [ ] **Step 1: Add `isFieldCovered` and rewrite `getAvailableFields`**

In `src/database/repositories/SmartCardGenerator.ts`, replace lines 235-250 with:

```ts
  static isFieldCovered(field: SmartFormField, cards: DashboardCard[]): boolean {
    const kind = this.getCardKind(field.FieldType);
    if (kind === "skip") return true;
    if (kind === "sum") {
      return cards.some(
        (card) => card.CardMode === "sum" && card.AggregateField === field.FieldKey
      );
    }
    if (field.source === "device") {
      return cards.some(
        (card) =>
          card.DeviceType === field.DeviceType &&
          card.BreakdownField === field.DeviceColumn
      );
    }
    return cards.some((card) => card.BreakdownField === field.FieldKey);
  }

  static async getAvailableFields(projectId: number): Promise<SmartFormField[]> {
    const allFields = await this.getAllFields();
    const existingCards = await DashboardCardRepository.getAllCards(projectId);

    return allFields.filter(
      (field) => !SmartCardGenerator.isFieldCovered(field, existingCards)
    );
  }
```

- [ ] **Step 2: Update existing `getAvailableFields` tests with full card rows**

In `src/__tests__/repositories/SmartCardGenerator.test.ts`, update the card-row mocks so they carry the mapped columns:

- Test `"offers only fields with neither smart card present"` (lines 454-457):
```ts
      .mockResolvedValueOnce([
        { CardKey: "smart_pole_status_total", SortOrder: 0, CardMode: "dropdown", BreakdownField: "pole_status" },
        { CardKey: "smart_pole_status_today", SortOrder: 1, CardMode: "dropdown", BreakdownField: "pole_status" },
      ]);
```
- Test `"does not offer a field when only one card of its pair remains"` (line 473):
```ts
      .mockResolvedValueOnce([{ CardKey: "smart_pole_status_total", SortOrder: 0, CardMode: "dropdown", BreakdownField: "pole_status" }]);
```
- Test `"combines inspection and device fields and dedups device cards by smart_dev keys"` (lines 518-521):
```ts
      .mockResolvedValueOnce([
        { CardKey: "smart_dev_Camera_CameraStatus_total", SortOrder: 0, CardMode: "dropdown", DeviceType: "Camera", BreakdownField: "CameraStatus" },
        { CardKey: "smart_dev_Camera_CameraStatus_today", SortOrder: 1, CardMode: "dropdown", DeviceType: "Camera", BreakdownField: "CameraStatus" },
      ]);
```

- [ ] **Step 3: Add new `getAvailableFields` tests**

Append these three tests inside the `"getAvailableFields"` describe block (before its closing `});` at line 531):

```ts
  it("hides a field covered only by a default card (BreakdownField match)", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "pole_avail", FieldName: "Pole Availability", FieldType: "dropdown" },
        { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { CardKey: "total_pole_status", SortOrder: 0, CardMode: "dropdown", BreakdownField: "pole_avail" },
      ]);

    const available = await SmartCardGenerator.getAvailableFields(1);
    expect(available).toHaveLength(1);
    expect(available[0].FieldKey).toBe("camera_count");
  });

  it("hides a number field covered only by a default SUM card", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "pole_status", FieldName: "Pole Status", FieldType: "dropdown" },
        { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { CardKey: "total_camera_count", SortOrder: 0, CardMode: "sum", AggregateField: "camera_count" },
      ]);

    const available = await SmartCardGenerator.getAvailableFields(1);
    expect(available).toHaveLength(1);
    expect(available[0].FieldKey).toBe("pole_status");
  });

  it("offers a field again once its covering default card is deleted", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldKey: "pole_avail", FieldName: "Pole Availability", FieldType: "dropdown" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const available = await SmartCardGenerator.getAvailableFields(1);
    expect(available).toHaveLength(1);
    expect(available[0].FieldKey).toBe("pole_avail");
  });
```

Note: each `getAvailableFields` call issues 5 `getAllAsync` calls (fields, per-field options, options, device fields, cards). `addSmartCardsForField` tests are untouched — they still work because generated cards keep `BreakdownField`/`AggregateField`/`DeviceType`/`CardMode`, and the existing card mocks there are only used for CardKey dedup inside `addSmartCardsForField`.

- [ ] **Step 4: Run the generator tests**

Run: `npx jest src/__tests__/repositories/SmartCardGenerator.test.ts`
Expected: all PASS.

---

### Task 4: Adaptive dropdown card layout

**Files:**
- Modify: `src/components/dashboard/StatBreakdownCard.tsx` (full file, 98 lines)
- Test: `src/__tests__/components/dashboard/StatBreakdownCard.test.tsx`

**Interfaces:**
- Consumes: `BreakdownRow` from `@/src/database/repositories/DashboardService` (unchanged); props `{ title, icon, color?, rows }` (unchanged).
- Produces: unchanged props/export. Adds `testID`s: `breakdown-card-grid` (grid container `View`), `breakdown-list` (list container `View`), `breakdown-option-<label>`, `breakdown-option-label-<label>`, `breakdown-option-count-<label>`.

- [ ] **Step 1: Write the failing component tests**

In `src/__tests__/components/dashboard/StatBreakdownCard.test.tsx`, add imports at the top:

```tsx
import { COLORS } from "@/src/constants/ui";
```

Append these tests inside the `describe("StatBreakdownCard", ...)` block (before its closing `});` at line 70):

```tsx
  it("renders a grid of mini-cards for up to 6 short labels", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={[
            { label: "Yes", count: 30 },
            { label: "No", count: 12 },
            { label: "N/A", count: 3 },
          ]}
        />
      );
    });
    const grid = tree!.root.findAll((node) => node.props?.testID === "breakdown-card-grid");
    expect(grid).toHaveLength(1);
    const labels = tree!.root.findAll((node) =>
      typeof node.props?.testID === "string" && node.props.testID.startsWith("breakdown-option-label-")
    );
    expect(labels).toHaveLength(3);
    expect(tree!.root.findAll((node) => node.props?.testID === "breakdown-list")).toHaveLength(0);
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("30");
    expect(strings).toContain("12");
    expect(strings).toContain("3");
  });

  it("falls back to the list layout for more than 6 options", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={["A", "B", "C", "D", "E", "F", "G"].map((label, index) => ({ label, count: index }))}
        />
      );
    });
    expect(tree!.root.findAll((node) => node.props?.testID === "breakdown-card-grid")).toHaveLength(0);
    expect(tree!.root.findAll((node) => node.props?.testID === "breakdown-list")).toHaveLength(1);
  });

  it("falls back to the list layout when any label is longer than 15 characters", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={[
            { label: "1234567890123456", count: 1 },
            { label: "B", count: 2 },
          ]}
        />
      );
    });
    expect(tree!.root.findAll((node) => node.props?.testID === "breakdown-card-grid")).toHaveLength(0);
    expect(tree!.root.findAll((node) => node.props?.testID === "breakdown-list")).toHaveLength(1);
  });

  it("keeps the grid layout for labels up to 15 characters", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={[
            { label: "123456789012345", count: 1 },
            { label: "B", count: 2 },
          ]}
        />
      );
    });
    expect(tree!.root.findAll((node) => node.props?.testID === "breakdown-card-grid")).toHaveLength(1);
  });

  it("truncates mini-card labels to one line and shows the count below in the card color", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Foundation Condition"
          icon="home"
          rows={[
            { label: "Good", count: 42 },
            { label: "Bad", count: 7 },
          ]}
        />
      );
    });
    const label = tree!.root.find((node) => node.props?.testID === "breakdown-option-label-Good");
    expect(label.props.numberOfLines).toBe(1);
    const count = tree!.root.find((node) => node.props?.testID === "breakdown-option-count-Good");
    const countStyle = StyleSheet.flatten(count.props.style as ViewStyle);
    expect(countStyle.fontWeight).toBe("bold");
    expect(countStyle.color).toBe(COLORS.primary);
  });
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npx jest src/__tests__/components/dashboard/StatBreakdownCard.test.tsx`
Expected: FAIL (no `breakdown-card-grid` testID exists yet).

- [ ] **Step 3: Implement the adaptive layout**

Replace the body of `StatBreakdownCard.tsx` (keep the existing `interface StatBreakdownCardProps`) with:

```tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BreakdownRow } from "@/src/database/repositories/DashboardService";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

const MAX_OPTIONS = 6;
const MAX_LABEL_LENGTH = 15;

interface StatBreakdownCardProps {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  rows: BreakdownRow[];
}

export default function StatBreakdownCard({
  title,
  icon,
  color = COLORS.primary,
  rows,
}: StatBreakdownCardProps) {
  const useCardLayout =
    rows.length > 0 &&
    rows.length <= MAX_OPTIONS &&
    rows.every((row) => row.label.length <= MAX_LABEL_LENGTH);

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
        </View>
        <View style={styles.divider} />
        {rows.length === 0 ? (
          <Text variant="bodyMedium" style={styles.empty}>
            No data
          </Text>
        ) : useCardLayout ? (
          <View style={styles.cardGrid} testID="breakdown-card-grid">
            {rows.map((row) => (
              <Card
                key={row.label}
                elevation={0}
                style={styles.optionCard}
                testID={`breakdown-option-${row.label}`}
              >
                <Card.Content style={styles.optionContent}>
                  <Text
                    variant="bodyMedium"
                    numberOfLines={1}
                    style={styles.optionLabel}
                    testID={`breakdown-option-label-${row.label}`}
                  >
                    {row.label}
                  </Text>
                  <Text
                    variant="headlineMedium"
                    style={[styles.optionCount, { color }]}
                    testID={`breakdown-option-count-${row.label}`}
                  >
                    {row.count}
                  </Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        ) : (
          <View testID="breakdown-list">
            {rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text variant="bodyMedium" style={styles.rowLabel}>
                  {row.label}
                </Text>
                <Text variant="bodyMedium" style={[styles.rowCount, { color }]}>
                  {row.count}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
  },

  content: {
    paddingVertical: SPACING.sm,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },

  title: {
    marginLeft: SPACING.sm,
    fontWeight: "bold",
    flex: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.xs,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
  },

  rowLabel: {
    color: COLORS.textSecondary,
  },

  rowCount: {
    fontWeight: "bold",
  },

  empty: {
    color: COLORS.textMuted,
    textAlign: "center",
    paddingVertical: SPACING.sm,
  },

  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },

  optionCard: {
    flexBasis: "48%",
    flexGrow: 1,
    maxWidth: "48%",
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0E0E0",
  },

  optionContent: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },

  optionLabel: {
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  optionCount: {
    fontWeight: "bold",
    marginTop: SPACING.xs,
  },
});
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `npx jest src/__tests__/components/dashboard/StatBreakdownCard.test.tsx`
Expected: all PASS (existing 3 tests plus 5 new).

- [ ] **Step 5: Run the grid test to confirm no regression**

Run: `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`
Expected: all PASS (`DashboardCardGrid.test.tsx` mocks `DashboardService` and only asserts component types + string presence).

---

### Task 5: Changelog + full verification

**Files:**
- Modify: `docs/07-Changelog.md` ([Unreleased] → `### Changed`)

- [ ] **Step 1: Add changelog entries**

In `docs/07-Changelog.md`, under `## [Unreleased]` → `### Changed`, append:

```markdown
- Default dashboard cards are corrected: the Pole Status breakdown cards are renamed "Pole Availability" (still grouped by the `pole_avail` field), and the Camera Count cards now SUM the `camera_count` inspection field again instead of counting Camera device records. Existing project DBs migrate on next open (`migrateDeviceCards`).
- Dropdown statistic cards render as a compact grid of option mini-cards (label above count) when the dropdown has at most 6 options with labels up to 15 characters, falling back to the vertical list layout otherwise.
- The Add Card field picker now hides any field that already has a dashboard card (default or smart) for it; deleting the covering card re-exposes the field.
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npx eslint app src`
Expected: 0 errors (pre-existing warnings only).

Run: `npx jest`
Expected: 41 suites, 500+ tests, all PASS.

---

## Self-Review

**Spec coverage:**
- §1 adaptive layout → Task 4 (grid rule, mini-card label-top/count-below, truncation, list fallback, empty state, boundary 6/15).
- §2a seed bindings → Task 1 (title rename, sum/`camera_count` rebind).
- §2b migration → Task 2 (idempotent rebind + rename + early return; legacy `total_cameras` device repoint preserved).
- §3 Add Card coverage → Task 3 (`isFieldCovered`; default-covered fields hidden; reappear on delete; per-project via `getAllCards(projectId)`).
- Testing matrix → Tasks 1-4 update the six impacted suites; Task 5 runs the full gate. `DashboardCardManager.test.tsx` and `DashboardService.test.ts` are confirmed unaffected (module mocked / already `sum`).

**Placeholder scan:** every step contains concrete code or an exact expectation; no TBD/TODO.

**Type consistency:** `isFieldCovered(field: SmartFormField, cards: DashboardCard[])` is defined in Task 3 and used only there; `MAX_OPTIONS`/`MAX_LABEL_LENGTH` and the `testID` names are consistent between Task 4 steps 1 and 3; seed/migration keys (`total_pole_status`, `today_pole_status`, `total_camera_count`, `today_camera_count`) match Task 1 and Task 2.
