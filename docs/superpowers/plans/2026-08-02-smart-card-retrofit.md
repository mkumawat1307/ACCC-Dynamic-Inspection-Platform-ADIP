# Smart Dashboard Card Generator Retrofit (CardMode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit the already-committed smart field-picker (commits `2f3c3e8`, `8c62cc2`, `7f61b0d`) so the cards it generates match the user-approved design. Replace the ambiguous `AggregateField`/`BreakdownField` discrimination with a single explicit `CardMode` column, apply the approved field→mode mapping, exclude the Remarks field from the picker, add Camera/Switch device fields as a picker source (breakdown by column value), make smart cards non-editable (delete + re-add), and remove the manual "Custom Card" editor.

**Architecture:** Add `CardMode TEXT NOT NULL DEFAULT 'entitycount'` to the per-project `DashboardCards` table (fresh DDL + idempotent migration/backfill for existing project DBs). `SmartCardGenerator` emits `CardMode`-bearing cards using the approved mapping. `StatisticCountService` gains three engines (`fieldCountCard`, `dateBreakdownCard`, `deviceBreakdownCard`). `DashboardService` dispatches on `CardMode`. `DashboardCardManager` becomes picker-only (no manual editor, no editing smart cards). `DashboardCardGrid` decides breakdown-vs-stat rendering from `CardMode`.

**Tech Stack:** React Native (Expo) + TypeScript strict; `expo-sqlite` (single sequential connection, ADR-014); react-native-paper; MaterialCommunityIcons. Jest + jest-expo (in-memory `expo-sqlite` mock).

## Global Constraints

- All code lives in `frontend/`. All commands run from `frontend/`.
- TypeScript strict mode; avoid `any`. No comments unless requested.
- `@/*` aliases to `frontend/*`.
- **No `yarn` on PATH** — use `npx jest <file>`, `npx tsc --noEmit`, `npx eslint <files>`.
- **ADR-014 (critical):** never call `getGlobalDatabase()` inside the project/inspection flow. `dashboard_cards` lives in the project DB only. All reads/writes go through `getDatabase()` (single sequential handle). Never open two handles.
- **Isolation (mandatory):** per-project data in project DB only. `DashboardCards` and `CardMode` are per-project — never in `accc_global.db`. Existing isolation regression suite (`src/__tests__/database/isolation.test.ts`) must keep passing; new fixtures use distinct DB paths/names.
- **Migration requirement:** the `CardMode` column + backfill must run in `migrateProjectSchema()` (wired into `ProjectDBManager.openProjectDb`) so existing project DBs are upgraded on first open. New projects get it via `createProjectSchema()` DDL + seeding. A failure in the migration must be non-fatal (try/catch, log) exactly like the existing `BreakdownField`/`SectionLabel`/`AggregateField` migrations.
- **Count semantics (approved, from session Q&A):**
  - `CardMode` values: `"entitycount" | "dropdown" | "sum" | "fieldcount" | "datebreakdown"`.
  - Field→mode mapping: `dropdown`/`switch`/`checkbox` → `dropdown`; `number` → `sum`; `text`/`multiline` → `fieldcount`; `date`/`date_auto` → `datebreakdown`; `gps`/`device`/`camera`/`calculation` → skip.
  - **Remarks field excluded:** `InspectionFields.FieldKey = 'remarks'` is never offered by the picker (and never generates cards).
  - **Device fields (user-confirmed, "breakdown by column value"):** Camera/Switch fields from `DeviceFieldDefinitions` (rows with `DeviceType IN ('Camera','Switch')`, `FieldType IN ('dropdown','switch','checkbox')`, `IsActive = 1`) are offered by the picker. Picking one creates a `dropdown`-mode card that GROUPS the `Cameras`/`Switches` table by the matching column (`BreakdownField` = the `FieldName` column, e.g. `CameraStatus`). Entity `cameras` for `DeviceType='Camera'`, `switches` for `'Switch'`. Device text/number/date fields are not offered.
  - `fieldcount` counts inspections that have a non-empty value for a text field (`FieldValue IS NOT NULL AND FieldValue != ''`), `COUNT(DISTINCT InspectionID)`.
  - `datebreakdown` groups inspections by a date field's value (same shape as `dropdown` breakdown; count DESC, label ASC; null → `(Not set)`).
- **Dispatch:** `DashboardService.getEnabledCardsWithCounts` keys off `CardMode`, not `AggregateField`/`BreakdownField` presence. Legacy columns remain and are still populated by the generator (engines read them for the target key), but `CardMode` is the discriminator.
- **UI (approved):** the manual "Custom Card" editor is removed. No card is editable (no pencil) — cards are delete + re-add. Reorder, enable-toggle, delete, and "Reset Defaults" remain. "Add Card" opens the smart picker (inspection fields + device fields).
- **CardKey scheme (unchanged for inspection fields, new for device fields):**
  - Inspection: `smart_<FieldKey>_total` / `smart_<FieldKey>_today` (existing — preserves dedup + any existing cards).
  - Device: `smart_dev_<DeviceType>_<FieldName>_total` / `smart_dev_<DeviceType>_<FieldName>_today` (e.g. `smart_dev_Camera_CameraStatus_total`).
- **Backfill:** existing rows upgrade as — `AggregateField IS NOT NULL` → `sum`; `BreakdownField IS NOT NULL` → derive from the referenced `InspectionFields.FieldType` (`date`/`date_auto` → `datebreakdown`, `dropdown`/`switch`/`checkbox` → `dropdown`, `text`/`multiline` → `fieldcount`, else `entitycount`); everything else → `entitycount` (column default). Idempotent (only touches `CardMode = 'entitycount'` rows).
- **Coverage:** `jest.config.js` per-file thresholds are 80/80/80/70 (lines/statements/functions/branches) for `schema.ts`, `DashboardCardRepository.ts`, `StatisticCountService.ts`, `DashboardService.ts`, `DashboardCardManager.tsx`, `ProjectDBManager.ts`. New code must keep these green. `SmartCardGenerator.ts` has no threshold but must not regress its own tests. New code must not add new eslint errors (pre-existing warnings tolerated).
- **Every task must end with the affected Jest suites green** — implementation tasks carry the test updates for their unit (no red commits mid-sequence).
- **Docs dirt (do NOT commit as part of this retrofit):** pre-existing modified `docs/02-Architecture.md`, `docs/04-Phases.md`, `docs/06-Memory.md`, `docs/10-DATABASE_ARCHITECTURE.md`, the three spec files, and untracked `docs/superpowers/plans/2026-08-02-dashboard-auto-refresh.md`. Only retrofit-related files and a changelog entry are committed.
- Verification: `npx tsc --noEmit` (clean), `npx eslint <changed files>` (no new errors), `npx jest` (all suites pass; coverage thresholds met).

---

## Task Strategy

- Implement via superpowers:subagent-driven-development: one task per dispatch, fresh implementer subagent per task, dedicated task review (spec compliance + task quality) after each, scoped fix loops, commit per task on pass, and a broad whole-branch review at the end.
- **Stop after one task:** each task ends with a hard gate — the task review must pass (or every finding be fixed/parked) before the next task is dispatched. Do not batch-run tasks.
- Each task is self-contained and leaves the affected Jest suites green; test updates for a unit ship in the same task as that unit's implementation (Task Strategy constraint).
- Run `npx tsc --noEmit` plus the directly-affected Jest suites as the verification step of every task; run the full suite only in Task 8.
- Commit per task with a scoped message (`feat(dashboard): ...` / `test(dashboard): ...`). Task 8 also updates `docs/07-Changelog.md`.

---

## Interaction Graph

```
Task 1 (DDL)  ──▶ Task 2 (migration + schema test)
                    │
Task 3 (model + repo + seeds + tests) ◀──────────┘ (consumes CardMode end-to-end)
Task 4 (SmartCardGenerator rewrite + tests)
Task 5 (count engines + DashboardService dispatch + tests)
Task 6 (DashboardCardManager picker-only + tests)
Task 7 (DashboardCardGrid CardMode + tests)
Task 8 (whole-branch verification + broad review + changelog + commit)
```

Tasks 1–7 are implementation each with their unit's tests updated in the same task; 8 is whole-branch verification. No task dispatches a second implementer in parallel.

---

### Task 1: DDL — add `CardMode` column  `[ ] pending`

**File:** `src/database/tables/dashboard-cards.table.ts`

**Step 1 — Column:** add to the `CREATE TABLE DashboardCards` statement (place after `AggregateField TEXT,` on line 15):

```sql
CardMode TEXT NOT NULL DEFAULT 'entitycount',
```

**Step 2 — Verify:** `npx eslint src/database/tables/dashboard-cards.table.ts`; `npx jest src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/database/schema.test.ts` (should still pass — no behavior change yet).

**Step 3 — Commit (expected):** `feat(dashboard): add CardMode column to DashboardCards DDL`.

---

### Task 2: Migration + backfill in `migrateProjectSchema()` + schema test  `[ ] pending`

**Files:** `src/database/schema.ts`, `src/__tests__/database/schema.test.ts`

**Step 1 — Column migration:** in `migrateProjectSchema()`, after the `AggregateField` migration block (currently lines 262–267), add a try/catch block exactly mirroring the existing pattern:

```ts
try {
    await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN CardMode TEXT NOT NULL DEFAULT 'entitycount';`);
    logger.info("[schema] Migration: CardMode column added to DashboardCards");
} catch {
    logger.info("[schema] Migration: CardMode column already exists in DashboardCards (ok)");
}
```

**Step 2 — Backfill:** after the column migration, add a non-fatal backfill block that rewrites existing rows to their approved `CardMode`. Use parameterized/correlated SQL only; never `SELECT *` then count in JS. Recommended statements (order matters):

```sql
-- Number fields that were generated as SUM cards
UPDATE DashboardCards SET CardMode = 'sum'
WHERE CardMode = 'entitycount' AND AggregateField IS NOT NULL AND AggregateField != '';

-- Breakdown-style rows: derive CardMode from the referenced field type
UPDATE DashboardCards SET CardMode = (
    SELECT CASE
        WHEN LOWER(f.FieldType) IN ('date', 'date_auto') THEN 'datebreakdown'
        WHEN LOWER(f.FieldType) IN ('dropdown', 'switch', 'checkbox') THEN 'dropdown'
        WHEN LOWER(f.FieldType) IN ('text', 'multiline') THEN 'fieldcount'
        ELSE 'entitycount'
    END
    FROM InspectionFields f
    WHERE f.FieldKey = DashboardCards.BreakdownField
)
WHERE CardMode = 'entitycount' AND BreakdownField IS NOT NULL AND BreakdownField != '' AND AggregateField IS NULL;
```

Wrap both in a single try/catch that logs and never throws (e.g. `logger.info("[schema] migrateProjectSchema — CardMode backfill failed (non-fatal):", e)`). Backfill must be idempotent (re-running is a no-op because it only touches `CardMode = 'entitycount'` rows). Remarks smart-cards (`BreakdownField = 'remarks'`) map to `fieldcount` via the CASE — acceptable and documented.

**Step 3 — Tests (`schema.test.ts`):** add a migration test that simulates a legacy `DashboardCards` table WITHOUT `CardMode` (via `execAsync` DDL, mirroring existing migration tests), inserts rows exercising the backfill — one with `AggregateField` set (→ `sum`), one with `BreakdownField` → `text` field (→ `fieldcount`), one → `date_auto` field (→ `datebreakdown`), one → `dropdown` field (→ `dropdown`), and one plain row (stays `entitycount`). Run `migrateProjectSchema()` (or the migration path used by existing schema tests), then assert the column exists and each row's `CardMode` is backfilled. Add an idempotency assertion (running the migration a second time does not error and does not change values).

**Step 4 — Verify:** `npx tsc --noEmit`; `npx eslint src/database/schema.ts`; `npx jest src/__tests__/database/schema.test.ts` (all pass; this keeps the 80/80/80/70 schema.ts threshold green).

**Step 5 — Commit (expected):** `feat(dashboard): migrate and backfill DashboardCards.CardMode`.

---

### Task 3: Model + Repository + Seeds gain `CardMode` + tests  `[ ] pending`

**Files:** `src/models/DashboardCard.ts`, `src/database/repositories/DashboardCardRepository.ts`, `src/database/seeds/dashboard-cards.seed.ts`, `src/__tests__/repositories/DashboardCardRepository.test.ts`, `src/__tests__/database/dashboardCards.seed.test.ts`

**Step 1 — Model (`DashboardCard.ts`):** add and export a union type and a field:

```ts
export type CardModeValue = "entitycount" | "dropdown" | "sum" | "fieldcount" | "datebreakdown";
```

Add `CardMode: CardModeValue;` to the `DashboardCard` interface (required, alongside `CountMode`).

**Step 2 — Repository (`DashboardCardRepository.ts`):**
- Add `CardMode` to `CARD_COLUMNS` (lines 5–9), between `AggregateField` and `SortOrder`.
- `mapRow` (lines 11–33): add `CardMode: ((row.CardMode as string) || "entitycount") as CardModeValue,` — legacy rows missing the column default safely to `entitycount`.
- `createCard` INSERT (line 92): add `CardMode` to the column list and `card.CardMode` to the values.
- `updateCard` SET (lines 120–123): add `CardMode = ?,` and bind `card.CardMode`.
- `ensureDefaultCards` INSERT (lines 190–192) and `migrateDefaultCards` INSERT (lines 234–236): add `CardMode` to both column lists and bind `card.CardMode`.
- Import `CardModeValue` from the model.

**Step 3 — Seeds (`dashboard-cards.seed.ts`):**
- Add `CardMode: CardModeValue;` (required) to `DashboardCardSeed` (import `CardModeValue` from the model).
- Give every entry in `DEFAULT_DASHBOARD_CARDS` and `DEFAULT_SECTIONED_CARDS` an explicit `CardMode`: `entitycount` for plain entity counts (e.g. `total_inspections`, `total_cameras`, `today_cameras`, and the filtered `total_inspection_done` / `today_inspection_done` rows); `dropdown` for `BreakdownField` rows (`total_pole_status`, `today_pole_status`); `sum` for `AggregateField` rows (`total_camera_count`, `today_camera_count`). Distinct-count rows (`total_poles`, `today_poles` with `CountMode: "distinct"`) keep `entitycount` (entity counts with a distinct mode).
- Add `CardMode` to the `seedDashboardCards` INSERT column list (line 58) and bind `card.CardMode` in the values array.

**Step 4 — Repository tests (`DashboardCardRepository.test.ts`):** include `CardMode` in `rowOf` fixtures and asserts; add: `createCard` persists `CardMode` (round-trip via `getAllCards`); `mapRow` defaults a missing/empty `CardMode` to `"entitycount"`; `updateCard` writes `CardMode`; `ensureDefaultCards` inserts `CardMode` from the seed for missing defaults.

**Step 5 — Seed tests (`dashboardCards.seed.test.ts`):** extend existing tests to assert each seeded default row's `CardMode` (e.g. `total_inspections` → `entitycount`, `total_pole_status` → `dropdown`, `total_camera_count` → `sum`). Keep the idempotency + skip-if-present tests.

**Step 6 — Verify:** `npx tsc --noEmit`; `npx eslint src/database/repositories/DashboardCardRepository.ts src/models/DashboardCard.ts src/database/seeds/dashboard-cards.seed.ts`; `npx jest src/__tests__/repositories/DashboardCardRepository.test.ts src/__tests__/database/dashboardCards.seed.test.ts src/__tests__/database/isolation.test.ts` (all green).

**Step 7 — Commit (expected):** `feat(dashboard): add CardMode to DashboardCard model, repository, and seeds`.

---

### Task 4: Rewrite `SmartCardGenerator` + tests  `[ ] pending`

**Files:** `src/database/repositories/SmartCardGenerator.ts`, `src/__tests__/repositories/SmartCardGenerator.test.ts`

**Step 1 — Mapping table:** replace `BREAKDOWN_TYPES`/`AGGREGATE_TYPES`/`SKIP_TYPES` with a single normalized type→mode map:

```ts
const TYPE_TO_MODE: Record<string, CardModeValue | "skip"> = {
  dropdown: "dropdown",
  switch: "dropdown",
  checkbox: "dropdown",
  number: "sum",
  text: "fieldcount",
  multiline: "fieldcount",
  date: "datebreakdown",
  date_auto: "datebreakdown",
  gps: "skip",
  device: "skip",
  camera: "skip",
  calculation: "skip",
};
```

(`multiline` → `fieldcount` per the approved mapping; `time` has no mapping and therefore falls through to skip.)

**Step 2 — `SmartFormField`:** extend the interface (keep existing fields):

```ts
export interface SmartFormField {
  FieldID: number;
  FieldKey: string;
  FieldName: string;
  FieldType: string;
  Options: { label: string; value: string }[];
  source?: "inspection" | "device";
  DeviceType?: string;       // "Camera" | "Switch" for source === "device"
  DeviceColumn?: string;     // the Cameras/Switches column for source === "device"
}
```

**Step 3 — `getCardKind(fieldType)`:** return `"dropdown" | "sum" | "fieldcount" | "datebreakdown" | "skip"` derived from `TYPE_TO_MODE` (normalize lowercase; unknown → `"skip"`).

**Step 4 — `getSpec(field)`:** unchanged shape (`kind`, `fieldKey`, `fieldName`, `title`, `icon`, `color`); `kind` is now the CardMode or `"skip"`.

**Step 5 — `getFormFields()` (inspection fields):** add the Remarks exclusion to the SQL `WHERE` clause:

```sql
AND f.FieldKey != 'remarks'
```

Keep the rest of the query and options loading identical. Mark rows `source: "inspection"`.

**Step 6 — new `getDeviceFields()`:** query active Camera/Switch device fields:

```sql
SELECT FieldDefID, DeviceType, FieldName, Label, FieldType
FROM DeviceFieldDefinitions
WHERE DeviceType IN ('Camera', 'Switch')
  AND FieldType IN ('dropdown', 'switch', 'checkbox')
  AND IsActive = 1
ORDER BY DeviceType, DisplayOrder
```

Map each row to `SmartFormField` with:
- `FieldID: FieldDefID`
- `FieldKey: \`dev_${DeviceType}_${FieldName}\`` (e.g. `dev_Camera_CameraStatus`)
- `FieldName: Label` (e.g. `Camera Status`)
- `FieldType: normalizeType(FieldType)`
- `Options: []`
- `source: "device"`, `DeviceType`, `DeviceColumn: FieldName` (the actual column).

**Step 7 — `getAvailableFields(projectId)`:** combine `getFormFields()` + `getDeviceFields()`, then filter out fields whose smart cards already exist. Device cards are deduped by `smart_dev_<DeviceType>_<FieldName>_total` / `_today`. Skip `getCardKind(...) === "skip"` entries. Inspection and device entries share the same list (a `source` marker lets the UI label them).

**Step 8 — `generateCardsForField(field, projectId, baseSortOrder = 0)`:** return two cards (Total + Today's) per the approved mapping:

```ts
const kind = this.getCardKind(field.FieldType);
if (kind === "skip") return [];
const isSum = kind === "sum";
const isDevice = field.source === "device";
const entityType = isDevice
  ? (field.DeviceType === "Switch" ? "switches" : "cameras")
  : "inspections";
const targetField = isDevice ? field.DeviceColumn! : field.FieldKey;
const keyBase = isDevice ? `smart_dev_${field.DeviceType}_${field.DeviceColumn}` : `smart_${field.FieldKey}`;
```

Total card: `CardKey: \`${keyBase}_total\``, `Title: field.FieldName`, `EntityType: entityType`, `CardMode: kind`, `BreakdownField: isSum ? null : targetField`, `AggregateField: isSum ? targetField : null`, `SectionLabel: "Total"`, `SortOrder: baseSortOrder`, `Enabled: 1`, `IsDefault: 0`. Today card: `CardKey: \`${keyBase}_today\``, `CounterType: "today"`, `SectionLabel: "Today's"`, `SortOrder: baseSortOrder + 1`.

**Step 9 — Remarks guard:** a field whose `FieldKey === "remarks"` (inspection) is treated as skip. Device columns never collide with `remarks`.

**Step 10 — `addSmartCardsForField`, `getNextSortOrder`:** unchanged logic (both operate on the combined field list / `DashboardCards` table).

**Step 11 — Tests (`SmartCardGenerator.test.ts`):** update to the new behavior in this task (the suite must be green at commit):
- `getCardKind`: `dropdown`→`"dropdown"`, `switch`→`"dropdown"`, `checkbox`→`"dropdown"`, `number`→`"sum"`, `text`→`"fieldcount"`, `multiline`→`"fieldcount"`, `DATE_AUTO`→`"datebreakdown"`, `GPS`→`"skip"`, `device`→`"skip"`, `camera`→`"skip"`, `calculation`→`"skip"`.
- `generateCardsForField`: assert `CardMode` values and `BreakdownField`/`AggregateField` per the new logic. The Remarks field (`FieldKey: "remarks"`, multiline) now returns `[]` — replace the old multiline-breakdown test with an exclusion test. Keep CardKey/`SectionLabel`/`SortOrder`/`ProjectID`/icon/color assertions.
- `getFormFields`: assert the `FieldKey = 'remarks'` row is filtered out and rows carry `source: "inspection"`.
- New device-field tests: `getDeviceFields()` (query + mapping to `FieldKey: dev_*`, `DeviceColumn`, `source: "device"`); `getAvailableFields` including device fields + dedup by `smart_dev_*` keys; `generateCardsForField` for a device field (EntityType `cameras`, `CardMode` `dropdown`, `BreakdownField` = column, CardKey `smart_dev_Camera_CameraStatus_total/today`).

**Step 12 — Verify:** `npx tsc --noEmit`; `npx eslint src/database/repositories/SmartCardGenerator.ts`; `npx jest src/__tests__/repositories/SmartCardGenerator.test.ts` (all green).

**Step 13 — Commit (expected):** `feat(dashboard): emit CardMode cards from SmartCardGenerator with device-field source`.

---

### Task 5: Count engines + `DashboardService` dispatch + tests  `[ ] pending`

**Files:** `src/database/repositories/StatisticCountService.ts`, `src/database/repositories/DashboardService.ts`, `src/__tests__/repositories/StatisticCountService.test.ts`, `src/__tests__/repositories/DashboardService.test.ts`

**Step 1 — `CountEntityConfig`:** add `deviceColumns: string[]` to the interface and populate it for `cameras` (`["CameraType","CameraStatus","CameraMake","CameraModel","CameraIP","CameraSerialNumber","CameraSI","SDCardCapacity","SDCardStatus"]`) and `switches` (`["SwitchType","SwitchStatus","SwitchMake","SwitchModel","SwitchIP","SwitchSerialNumber","SwitchSI"]`). Leave it empty for `inspections`/`devices`.

**Step 2 — `fieldCountCard(projectId, card): Promise<number>`** (new): valid for `EntityType === "inspections"` with `BreakdownField`; counts inspections having a non-empty value:

```sql
SELECT COUNT(DISTINCT iv.InspectionID) AS count
FROM Inspections i
JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
JOIN InspectionFields f ON f.FieldID = iv.FieldID
WHERE i.ProjectID = ?
  <time clause>
  AND f.FieldKey = ?
  AND f.IsActive = 1
  AND iv.FieldValue IS NOT NULL AND iv.FieldValue != ''
```

Return `row?.count ?? 0`; any invalid card or thrown error → `0` (same defensive style as `fieldCard`).

**Step 3 — `dateBreakdownCard(projectId, card): Promise<{label: string; count: number}[]>`** (new): valid for `EntityType === "inspections"` with `BreakdownField`; same GROUP BY query shape as `breakdownCard` (join `InspectionValues` via `FieldKey`, apply the time clause + filter clauses), but ordered `ORDER BY count DESC, label ASC` and `label ?? "(Not set)"`. Invalid → `[]`.

**Step 4 — `deviceBreakdownCard(projectId, card): Promise<{label: string; count: number}[]>`** (new): valid for `EntityType` `cameras`/`switches` with `BreakdownField` in the entity's `deviceColumns` allowlist (reject anything else → `[]`). Groups by the column:

```sql
SELECT ${entity.alias}.${column} AS label, COUNT(*) AS count
FROM ${entity.table} ${entity.alias}
${entity.joins}
WHERE ${entity.projectClause}
  <time clause>
  AND ${entity.alias}.${column} IS NOT NULL AND ${entity.alias}.${column} != ''
GROUP BY ${entity.alias}.${column}
ORDER BY count DESC, label ASC
```

Apply the `COUNTER_TYPES` time clause (via `entity.alias`) exactly like `countCard`. `label ?? "(Not set)"`. The column identifier is validated against the allowlist before interpolation (never a raw identifier into SQL).

**Step 5 — `DashboardService.getEnabledCardsWithCounts`:** replace the `AggregateField`/`BreakdownField` dispatch (lines 19–29) with a `CardMode` switch:

```ts
switch (card.CardMode) {
  case "sum":
    result.push({ ...card, count: await StatisticCountService.fieldCard(projectId, card), breakdown: undefined });
    break;
  case "fieldcount":
    result.push({ ...card, count: await StatisticCountService.fieldCountCard(projectId, card), breakdown: undefined });
    break;
  case "datebreakdown":
    result.push({ ...card, count: undefined, breakdown: await StatisticCountService.dateBreakdownCard(projectId, card) });
    break;
  case "dropdown":
    if (card.EntityType === "inspections") {
      result.push({ ...card, count: undefined, breakdown: await StatisticCountService.breakdownCard(projectId, card) });
    } else {
      result.push({ ...card, count: undefined, breakdown: await StatisticCountService.deviceBreakdownCard(projectId, card) });
    }
    break;
  default: // entitycount (and any legacy row)
    result.push({ ...card, count: await StatisticCountService.countCard(projectId, card), breakdown: undefined });
}
```

**Step 6 — Tests:** extend `StatisticCountService.test.ts` — `fieldCountCard` (counts non-empty values, ignores empty values, returns 0 for invalid card), `dateBreakdownCard` (groups + ordering + `(Not set)`), `deviceBreakdownCard` (groups cameras by column, applies time clause, rejects non-allowlisted column, returns `[]` for invalid entity). Extend `DashboardService.test.ts` — dispatch matrix: `sum`→count field, `fieldcount`→count field, `dropdown`+inspections→breakdown, `dropdown`+cameras→device breakdown, `datebreakdown`→breakdown, `entitycount`→count.

**Step 7 — Verify:** `npx tsc --noEmit`; `npx eslint` on both changed source files; `npx jest src/__tests__/repositories/StatisticCountService.test.ts src/__tests__/repositories/DashboardService.test.ts` (all green). Coverage thresholds (80/80/80/70) on both files must hold.

**Step 8 — Commit (expected):** `feat(dashboard): add fieldcount/datebreakdown/device breakdown engines and CardMode dispatch`.

---

### Task 6: `DashboardCardManager` — picker-only + tests  `[ ] pending`

**Files:** `src/components/dashboard/DashboardCardManager.tsx`, `src/__tests__/components/dashboard/DashboardCardManager.test.tsx`

**Step 1 — Remove the manual editor:** delete the "Custom Card" toolbar button (`openAdd`), the entire editor dialog (`editorVisible`, `editingCard`, `title`, `icon`, `color`, `entityType`, `counterType`, `editorMode`, `distinctColumn`, `breakdownField`, `breakdownOptions`, `filters`, `validationError`, `handleSave`, entity/counter/mode/distinct/breakdown/filter dialogs, `ICON_CHOICES`/`COLOR_CHOICES` if unused elsewhere, and their styles). The manual editor no longer exists — there is no path to create an `entitycount` card manually (defaults + smart picker cover it).

**Step 2 — No editing:** remove the pencil `IconButton` in the card row (line 340). Cards are delete + re-add. Keep reorder (up/down), delete, and the enabled `Switch`.

**Step 3 — Picker:** "Add Card" keeps opening the smart picker. `getAvailableFields` now returns inspection + device fields; render device entries with a device-type subtitle (e.g. `Camera`/`Switch` via `f.DeviceType`). Keep `SmartCardGenerator.getSpec(f)` for icon/color.

**Step 4 — Cleanup:** remove now-unused imports (`COUNT_ENTITIES`/`COUNTER_TYPES` if only used by the editor, `InspectionFieldRepository` if only used by breakdown editing, `Dialog`/`TextInput`/`HelperText` if unused). Keep `SmartCardGenerator`, `DashboardCardRepository`, `List`, `Switch`, `IconButton`, `Button`, `Card`, `Text`, `ActivityIndicator`.

**Step 5 — Tests (`DashboardCardManager.test.tsx`):** rewrite in this task (the suite must be green at commit): remove editor-based tests (title/entity/counter/breakdown/filter dialogs no longer exist); keep/adapt renders-cards, reorder, enable-toggle, delete flow, Reset Defaults; add assertions that no "Custom Card" button and no pencil/edit affordance are rendered, that "Add Card" opens the picker, and that the picker lists device fields (from mocked `getAvailableFields`) with their device type.

**Step 6 — Verify:** `npx tsc --noEmit`; `npx eslint src/components/dashboard/DashboardCardManager.tsx`; `npx jest src/__tests__/components/dashboard/DashboardCardManager.test.tsx` (all green). Coverage threshold (80/80/80/70) on the manager must hold.

**Step 7 — Commit (expected):** `feat(dashboard): make card manager picker-only with non-editable smart cards`.

---

### Task 7: `DashboardCardGrid` — render by `CardMode` + tests  `[ ] pending`

**Files:** `src/components/dashboard/DashboardCardGrid.tsx`, `src/__tests__/components/dashboard/DashboardCardGrid.test.tsx`

**Step 1 — Breakdown predicate:** replace `card.BreakdownField` checks (lines 66 and 80) with:

```ts
const isBreakdown = (c: CardWithCount) =>
  c.CardMode === "dropdown" || c.CardMode === "datebreakdown";
```

Use it for the `StatBreakdownCard` branch and for the pairing condition (a stat card only pairs with a following non-breakdown card in the same section). `sum`/`fieldcount`/`entitycount` cards render via `StatCard` (values are plain numbers — `StatCard` already accepts `number`).

**Step 2 — Tests (`DashboardCardGrid.test.tsx`):** update fixtures to carry `CardMode`; assert `dropdown`/`datebreakdown` cards render `StatBreakdownCard`; `sum`/`fieldcount`/`entitycount` cards render `StatCard`. Update any fixture that relied on `BreakdownField` presence. Suite must be green at commit.

**Step 3 — Verify:** `npx tsc --noEmit`; `npx eslint src/components/dashboard/DashboardCardGrid.tsx`; `npx jest src/__tests__/components/dashboard/DashboardCardGrid.test.tsx` (all green).

**Step 4 — Commit (expected):** `feat(dashboard): render dashboard grid by CardMode`.

---

### Task 8: Whole-branch verification + broad review + changelog + commit  `[ ] pending`

**Step 1 — Full verification:** `npx jest` (all suites pass; coverage thresholds met), `npx tsc --noEmit` (clean), `npx eslint` on every file changed by Tasks 1–7 (no new errors).

**Step 2 — Broad review:** dispatch the final whole-branch code review (most capable model) over the full retrofit diff; fix findings via the standard SDD final-fix path.

**Step 3 — Changelog:** add a `docs/07-Changelog.md` entry describing the smart-card retrofit (CardMode column + migration, field mapping, Remarks exclusion, device-field picker source, non-editable smart cards, removed manual editor).

**Step 4 — Docs note:** fix any stale reference in retrofit-touched docs (e.g. any mention of `src/utils/SmartCardGenerator.ts` that should read `src/database/repositories/SmartCardGenerator.ts`) in a single docs commit. Do NOT commit the pre-existing dirty docs/auto-refresh files listed in Global Constraints.

**Step 5 — Commit (expected):** `feat(dashboard): finalize smart-card retrofit (CardMode)` then `docs: changelog and specs for smart-card retrofit`.

---

## Open Questions (resolved)

- **Device-field card mechanics** — RESOLVED by user: *Breakdown by column value* (Camera/Switch fields from `DeviceFieldDefinitions`; `dropdown`-mode cards grouping the `Cameras`/`Switches` table by column; text/number/date device fields skipped).
- **Remarks field** — RESOLVED (approved): excluded from the picker; existing `smart_remarks_*` cards backfill to `fieldcount`.
- **Multiline** — RESOLVED (approved): treated like `text` → `fieldcount`.
- **Manual editor** — RESOLVED (approved): removed entirely; no card is editable.
- **Task granularity** — RESOLVED (controller pre-flight): test updates for each unit ship in the same task as its implementation so every commit is green (was 15 tasks, now 8).
