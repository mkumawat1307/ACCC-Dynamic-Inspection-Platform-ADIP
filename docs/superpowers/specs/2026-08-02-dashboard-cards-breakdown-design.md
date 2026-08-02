# Design: Default Dashboard Card Set + Breakdown Cards from Inspection-Form Fields

## Purpose

Two related capabilities for the Project Dashboard's configurable stat cards:

1. **New 6-card default set** — replace the current 4 default cards (Total Poles, Total Cameras, Today's Poles, Today's Cameras) with a 6-card set that also counts inspections and today's completed inspections.
2. **Breakdown cards from inspection-form fields** — in Add/Edit Card, allow the admin to select any field of the dynamic inspection form (e.g. *Foundation Condition*) and render a card that shows the count of inspections per value (`Good 42`, `Bad 7`, `Fair 3`). This is the "all columns in inspection form" capability so future form fields automatically become available for new dashboard cards.

## Context (verified in code)

- Cards are stored per-project in `DashboardCards` (`src/database/tables/dashboard-cards.table.ts`), CRUD via `DashboardCardRepository`, ordered by `SortOrder ASC, CardID ASC`.
- `StatisticCountService` (`src/database/repositories/StatisticCountService.ts`) builds parameterized `SELECT COUNT(*)` queries from `COUNT_ENTITIES` (entity → table/joins/projectClause/filterableColumns) and `COUNTER_TYPES` (`total`, `today` → `AND i.InspectionDate = <today>`). FilterJson is `{ field: value }`, validated against the entity's `filterableColumns`.
- The inspection form is dynamic: `InspectionTemplates → InspectionSections → InspectionFields` (per-project), values stored as rows in `InspectionValues` (`InspectionID`, `FieldID`, `FieldValue`). Fields carry `FieldKey`, `FieldName`, `FieldType`, and `FieldOptions` for select fields.
- `migrateProjectSchema()` (`src/database/schema.ts`) runs on every project open; it already has an idempotent column-add pattern ("Migration: ... already exists").
- Status values: `Draft` / `Completed` (the app's own `DashboardRepository` uses `Status='Completed'`).
- Repo test convention: `jest.mock("@/src/database/db")` + `createMockDb()` with `getAllAsync/getFirstAsync/runAsync/withTransactionAsync`. Isolation tests use the in-memory SQLite mock with distinct project paths.

## Part 1 — New Default Card Set

`DEFAULT_DASHBOARD_CARDS` (`src/database/seeds/dashboard-cards.seed.ts`) becomes 6 cards, ordered as below. CardKey is the stable identity; `ensureDefaultCards` still inserts only missing keys and never overwrites edits.

| # | CardKey | Title | EntityType | CounterType | CountMode | DistinctColumn | FilterJson | Icon | Color |
|---|---------|-------|-----------|-------------|-----------|----------------|------------|------|-------|
| 0 | `total_inspections` | Total Inspections | inspections | total | count | – | – | clipboard-text | #0B5ED7 |
| 1 | `total_poles` | Total Poles | inspections | total | distinct | i.PoleID | – | transmission-tower | #0B5ED7 |
| 2 | `total_cameras` | Total Cameras | cameras | total | count | – | – | cctv | #198754 |
| 3 | `today_inspections_done` | Today's Inspections Done | inspections | today | count | – | `{"Status":"Completed"}` | check-circle | #198754 |
| 4 | `today_poles` | Today's Poles | inspections | today | distinct | i.PoleID | – | transmission-tower | #DC3545 |
| 5 | `today_cameras` | Today's Cameras | cameras | today | count | – | – | cctv | #6F42C1 |

The retained keys (`total_poles`, `total_cameras`, `today_poles`, `today_cameras`) keep their title/icon/color/entity/counter/mode, with two corrections: `today_inspections_done` works through the existing engine — `today` counter → `AND i.InspectionDate = <today>`, FilterJson `{"Status":"Completed"}` → `AND i.Status = 'Completed'`.

### Bug fix while touching defaults: DistinctColumn normalization

`StatisticCountService.buildCountSql` only emits `COUNT(DISTINCT ...)` when `DistinctColumn` is in the entity's `distinctableColumns`, which for inspections is `["i.PoleID", "i.InspectionID"]`. The current seed stores `DistinctColumn: "PoleID"` (no `i.` prefix), so the seeded **Total Poles** and **Today's Poles** cards silently fall back to `COUNT(*)`. Fix the new seed list to store `"i.PoleID"` so these cards actually count distinct poles.

### FilterJson support in the seed

`DashboardCardSeed` (`dashboard-cards.seed.ts`) has no `FilterJson` field and both INSERTs hardcode `NULL`/`null` for it. To seed `today_inspections_done` with `{"Status":"Completed"}`:
- Add `FilterJson?: string` to the `DashboardCardSeed` interface.
- Update `seedDashboardCards()` and `DashboardCardRepository.ensureDefaultCards()` INSERTs to pass `card.FilterJson ?? null` instead of the hardcoded NULL.

### Application to new vs existing projects

- **New projects:** `seedDashboardCards()` uses the new 6-card list; requires the seed interface + INSERT changes above.
- **Existing projects:** a new idempotent migration step `migrateDefaultCards()` runs inside `migrateProjectSchema()` after the `DashboardCards` table creation (which the previous fix already moved to run unconditionally):
  1. If both new CardKeys (`total_inspections`, `today_inspections_done`) already exist → no-op (already upgraded).
  2. Otherwise insert the missing defaults (enabled, canonical config) and renumber `SortOrder` of every `IsDefault = 1` row to the canonical order above; also normalize `DistinctColumn` to `"i.PoleID"` on the `total_poles` / `today_poles` defaults to repair the COUNT(DISTINCT) bug.
  3. Does **not** touch titles/config of existing defaults, `Enabled` state, or custom `IsDefault = 0` cards. Admin edits made *after* the upgrade are preserved (migration only runs once per project).

## Part 2 — Breakdown Cards from Inspection-Form Fields

### Data model

Add a nullable `BreakdownField TEXT` column to `DashboardCards` (`dashboard-cards.table.ts` CREATE TABLE) and a matching migration in `migrateProjectSchema`:

```
ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT;
```

idempotent via the existing column-existence check pattern. When `BreakdownField` is set (non-empty FieldKey), the card is a breakdown card.

Update `src/models/DashboardCard.ts` (`BreakdownField: string | null`) and `DashboardCardRepository` (`CARD_COLUMNS`, `mapRow`, `createCard`, `updateCard` — keeping the INSERT/UPDATE column/placeholder counts consistent).

### Engine

New method `StatisticCountService.breakdownCard(projectId, card): Promise<{ label: string; count: number }[]>`:

```sql
SELECT iv.FieldValue AS label, COUNT(DISTINCT iv.InspectionID) AS count
FROM Inspections i
JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
JOIN InspectionFields f ON f.FieldID = iv.FieldID
WHERE i.ProjectID = ?
  [AND i.InspectionDate = ?]            -- CounterType = today
  [AND i.Status = ?]                    -- FilterJson (static columns only)
  AND f.FieldKey = ?                    -- card.BreakdownField
  AND f.IsActive = 1
GROUP BY iv.FieldValue
ORDER BY count DESC, label ASC
```

- Returns `[]` on no data, unknown FieldKey, or non-`inspections` entity.
- `label` maps `null`/empty `FieldValue` → `"(Not set)"`.
- Wrapped in try/catch returning `[]` (mirrors `countCard`).
- FilterJson on breakdown cards is restricted to the inspections entity's static `filterableColumns` (`Status`).

### Dashboard

- `DashboardService.getEnabledCardsWithCounts(projectId)` currently returns `CardWithCount[] = DashboardCard & { count: number }`. Extend it so each card carries either `count` (normal cards) or `breakdown: { label: string; count: number }[]` (cards with `BreakdownField`), e.g. `CardWithCount & { breakdown?: BreakdownRow[] }` — calling `countCard` for normal cards and `breakdownCard` for breakdown cards.
- New `StatBreakdownCard` component (alongside `StatCard` in `src/components/StatCard.tsx`): renders the card title + per-value rows (label on the left, count on the right), with a fallback "(No data)" when the breakdown is empty. Reuses card icon/color.
- `src/components/dashboard/DashboardCardGrid.tsx` branches: `card.BreakdownField` → `StatBreakdownCard`, else `StatCard`. (The grid, not `app/projects/dashboard.tsx`, owns the render branch.)

### Add/Edit Card UI (`DashboardCardManager`)

- Add a third mode option **Breakdown** alongside Count / Distinct in the count-mode selector.
- When **Breakdown** is selected, show a "Group by field" picker whose options are **loaded from the DB**: the active fields of the default inspection template (`InspectionFields` joined to `InspectionSections` where `IsActive = 1`), each shown by `FieldName`, stored by `FieldKey`. This is the "all columns in inspection form" behavior — fields added to the form in the future appear automatically.
- Picking a field sets `BreakdownField`; the card title auto-fills with the field name if the title is still empty/unchanged.
- Saving a breakdown card persists `CountMode = count`, `BreakdownField = <FieldKey>`, `EntityType = inspections`.
- Edit mode loads an existing breakdown card's field back into the picker.

## Migration & Isolation

- `BreakdownField` column migration and `migrateDefaultCards()` are wired into `migrateProjectSchema()` (runs on every open, both idempotent).
- Breakdown cards live in the per-project `DashboardCards` table only — no changes to `accc_global.db`, no cross-DB joins. Isolation is enforced by the existing per-project table; an isolation regression asserts a breakdown card created in project A does not appear in project B.

## Error Handling

- `breakdownCard` never throws to the UI (try/catch → `[]`, mirrored `countCard` behavior).
- If the configured `BreakdownField` no longer exists in the form, the card renders "(No data)" rather than crashing.
- Migration column-add and card reseed failures are logged non-fatal (existing pattern).

## Out of Scope (explicitly not in this change)

- Regular **count** cards keep their static filter columns (`Status`, `CameraType`, `CameraStatus`, `SwitchType`, `SwitchStatus`, `DeviceType`, `DeviceLabel`) — only **Breakdown** cards get dynamic form-field selection.
- No drill-down/tap-through from a breakdown card to the inspection list (user chose the grouped-breakdown option).
- No camera/switch/device-form breakdowns — breakdowns group inspections by inspection-form field values.

## Testing

- **Seed:** new list has exactly 6 defaults with correct config; `today_inspections_done` has `FilterJson = {"Status":"Completed"}`; correct `SortOrder`.
- **Migration:** old 4-card project → `migrateDefaultCards` inserts the 2 new cards and renumbers order; admin-edited title and `Enabled=0` state preserved; idempotent on second run.
- **Schema:** `ADD COLUMN BreakdownField` is idempotent (existing DBs) and present in fresh `CREATE TABLE`.
- **Repository:** `BreakdownField` round-trips through create/update/`mapRow`; existing INSERT/UPDATE tests updated for the new column.
- **Engine:** `breakdownCard` grouping, Today's filter, FilterJson stack, unknown field → `[]`, `(Not set)` for null values, no-data → `[]`.
- **Service:** `getEnabledCardsWithCounts` returns `breakdown` for breakdown cards and `count` for normal cards.
- **Manager:** Breakdown mode → field picker loaded from DB → save; edit loads field back.
- **Render:** `StatBreakdownCard` renders value→count rows; `DashboardCardGrid` branches correctly.
- **Isolation:** breakdown card created in project A does not appear in project B.
