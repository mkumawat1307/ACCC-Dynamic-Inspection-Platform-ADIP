# Design: Two-Group Default Dashboard Cards (Total / Today's)

## Purpose

Change the factory-default dashboard cards for **newly created projects** so the dashboard
shows two labeled sections — **Total** and **Today's** — each with three cards (per the
product requirements doc):

- **Inspection Done** — count of inspections with `Status = Completed`.
- **Pole Status** — a breakdown card showing `Yes = count` and `No = count` rows from the
  Pole Available Status field (`pole_avail`), reusing the existing breakdown engine.
- **Camera Count** — sum of the Camera Counting field (`camera_count`).

The **Today's** section shows the same three cards but only for inspections whose
`InspectionDate` equals the current date.

Existing projects keep their current cards. This rework also fixes the Manage Cards
Add/Edit dialog (scrollable form + Cancel buttons on every nested picker) and the
`createCard` INSERT column/placeholder mismatch found in the whole-branch review of the
dashboard-cards breakdown feature.

## Requirements (confirmed with user)

- **Structure:** 2 labeled sections ("Total", "Today's"), each with 3 cards.
- **Inspection Done:** count of inspections with `Status = Completed` (uses the existing
  entity-count path with `FilterJson = {"Status": "Completed"}`).
- **Pole Status:** a breakdown card (`BreakdownField = pole_avail`) rendering two rows —
  `Yes = count` and `No = count` — via the existing breakdown engine.
- **Camera Count:** SUM of `camera_count` numeric values (the only new engine capability).
- **Today's group:** same three cards, additionally filtered to `InspectionDate = today`
  (`CounterType = today`).
- **Scope:** new projects only (existing projects untouched); defaults only (no admin UI changes).
- The full universal dashboard builder (aggregations, filters, drag-drop, layouts, auto-refresh)
  is explicitly a follow-up feature; this spec ships only the sectioned defaults + Manage Cards
  dialog fix + `createCard` placeholder fix.

## Context (verified in code)

- Cards live per-project in `DashboardCards` (`src/database/tables/dashboard-cards.table.ts`),
  CRUD via `DashboardCardRepository`, ordered by `SortOrder ASC, CardID ASC`.
- `seedDashboardCards()` (`src/database/seeds/dashboard-cards.seed.ts`) seeds `DEFAULT_DASHBOARD_CARDS`
  at project creation (`ProjectDBManager.createProjectDb` → `seedDashboardCards()`), ProjectID hardcoded to 1.
- `migrateProjectSchema()` (`src/database/schema.ts`) runs on every project open and already contains
  an idempotent column-add pattern and calls `ensureDefaultCards(1)` + `migrateDefaultCards(1)`.
- `StatisticCountService` (`src/database/repositories/StatisticCountService.ts`) builds parameterized
  `SELECT COUNT(*)`/`COUNT(DISTINCT ...)` from `COUNT_ENTITIES` + `COUNTER_TYPES`
  (`today` → `AND i.InspectionDate = ?`). `breakdownCard` already joins
  `Inspections → InspectionValues → InspectionFields` for field-value grouping.
- `pole_avail` is a dropdown field (`FieldKey: "pole_avail"`, options `Yes`/`No`), stored in
  `InspectionValues.FieldValue` as the raw option value (`"Yes"`). `camera_count` is a number field
  (`FieldKey: "camera_count"`) in the `camera_information` section and is also the count field of the
  repeatable "Camera" group; its parent value is stored as a row in `InspectionValues`.
- `DashboardCardGrid.tsx` renders breakdown cards full-width and pairs normal cards 2-per-row; it has no
  section grouping today.
- Repository INSERT for `createCard` currently declares 14 columns but 15 `?` placeholders — real SQLite
  would reject it; the in-memory mock masks the mismatch. Must be corrected while adding new columns.

## Data Model

Add two nullable columns to `DashboardCards` (`dashboard-cards.table.ts` CREATE TABLE + idempotent
`ALTER TABLE` migration in `migrateProjectSchema`):

| Column | Type | Meaning |
|--------|------|---------|
| `SectionLabel` | TEXT | Section header ("Total" / "Today's"); `NULL` = no section (legacy/admin cards render as today) |
| `AggregateField` | TEXT | FieldKey to sum (`camera_count`); `NULL` = entity count or breakdown card |

Only `sum` aggregation is needed for Phase 1 (Pole Status is a breakdown card, not an aggregate);
no `AggregateMode`/`AggregateValue` columns — those belong to the follow-up universal builder.

Update `src/models/DashboardCard.ts`, `DashboardCardRepository` (`CARD_COLUMNS`, `mapRow`, `createCard`,
`updateCard`). While editing `createCard`, fix the column/placeholder count mismatch (14 cols / 15 `?` →
must match exactly).

**Important — `updateCard` must NOT write `SectionLabel`/`AggregateField`** (leave them out of the `SET`
clause and params). The admin "Manage Cards" screen has no UI for these columns in Phase 1; if `updateCard`
wrote them, editing a sectioned default card through the manager would null out its section/aggregate.
Only `createCard`/`mapRow`/`CARD_COLUMNS` handle them (admin-created cards default to `NULL`).

## Count Engine

New method `StatisticCountService.fieldCard(projectId, card): Promise<number>` — SUM of a numeric
field, used by the Camera Count card:

```sql
SELECT SUM(CAST(iv.FieldValue AS REAL)) AS total
FROM Inspections i
JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID
JOIN InspectionFields f ON f.FieldID = iv.FieldID
WHERE i.ProjectID = ?
  AND f.FieldKey = ?                 -- card.AggregateField
  AND f.IsActive = 1
  [AND i.InspectionDate = ?]         -- CounterType = today
```

- `sum` mode: `SUM(CAST(iv.FieldValue AS REAL))`; non-numeric cells are ignored by `CAST` semantics
  (verify with the in-memory mock; if needed, add `WHERE iv.FieldValue IS NOT NULL AND iv.FieldValue != ''`).
- `today` counter adds `AND i.InspectionDate = ?` with `getTodayDateString()` (reuse `COUNTER_TYPES`).
- Returns `0` on unknown FieldKey / errors (mirrors `countCard`).
- Only valid when `EntityType = "inspections"`.

`DashboardService.getEnabledCardsWithCounts`: if `card.AggregateField` → `fieldCard`; else if
`card.BreakdownField` → `breakdownCard`; else `countCard`.

## Seed

New `DEFAULT_SECTIONED_CARDS` (6 cards) in `dashboard-cards.seed.ts`; `DashboardCardSeed` gains
`SectionLabel`, `AggregateField`.

| # | CardKey | Title | Section | Type | AggregateField | Icon | Color |
|---|---------|-------|---------|------|----------------|------|-------|
| 0 | `total_inspection_done` | Inspection Done | Total | entity count + Status=Completed | – | clipboard-text | #0B5ED7 |
| 1 | `total_pole_status` | Pole Status | Total | breakdown (`pole_avail`) | – | transmission-tower | #198754 |
| 2 | `total_camera_count` | Camera Count | Total | sum (`camera_count`) | camera_count | cctv | #6F42C1 |
| 3 | `today_inspection_done` | Inspection Done | Today's | entity count + Status=Completed | – | clipboard-text | #0B5ED7 |
| 4 | `today_pole_status` | Pole Status | Today's | breakdown (`pole_avail`) | – | transmission-tower | #DC3545 |
| 5 | `today_camera_count` | Camera Count | Today's | sum (`camera_count`) | camera_count | cctv | #6F42C1 |

- EntityType `inspections`, CounterType `total` / `today` respectively, `IsDefault = 1`.
- Inspection Done cards carry `FilterJson = {"Status": "Completed"}` (existing entity-count path).
- Pole Status cards carry `BreakdownField = "pole_avail"` (existing breakdown engine).
- Camera Count cards carry `AggregateField = "camera_count"` (new `fieldCard` sum engine).

### New vs existing projects

The seed and the migration helpers must agree on the set **by what the project already contains**:

- `seedDashboardCards()` (new projects) seeds `DEFAULT_SECTIONED_CARDS`.
- `ensureDefaultCards(projectId)` / `migrateDefaultCards(projectId)` pick the set to reconcile based on
  the project's existing CardKeys: if the project already has any legacy keys (`total_inspections`,
  `today_inspections_done`, etc.) → reconcile against the legacy `DEFAULT_DASHBOARD_CARDS` (no new cards
  added, existing behavior preserved); otherwise reconcile against `DEFAULT_SECTIONED_CARDS`.
- `migrateDefaultCards` keeps its early-return guard semantics but keyed to the active set, so existing
  projects are untouched and new projects get the 6-card set without renumbering custom cards.

## Dashboard Render

`DashboardCardGrid.tsx` groups consecutive cards by `SectionLabel`:

- Emit a section header (e.g. `Text` "Total", "Today's") before the first card of each label when the
  label is non-null; cards with `NULL` `SectionLabel` render exactly as today (no header, paired/breakdown
  layout unchanged).
- Section header styling mirrors the existing `Card.Title` look; simplest is a `Text` style consistent with
  the dashboard (bold, muted color). Keep pairing logic intact within each section.

## Migration & Isolation

- Two `ADD COLUMN` migrations wired into `migrateProjectSchema()` (idempotent, existing pattern).
- The new default cards are seeded per-project (project DB only) — no `accc_global.db` changes, no
  cross-DB joins. Isolation regression test: project A has the two-group defaults; project B does not
  share them and (being new) seeds its own set; legacy project's set is unchanged.

## Error Handling

- `fieldCard` never throws to the UI (try/catch → 0, mirroring `countCard`).
- If `AggregateField` no longer exists in the form or has no values, the card shows 0.
- Migration column-add and card-seed failures are logged non-fatal (existing pattern).

## Out of Scope

- Admin "Manage Cards" screen is not extended with field-aggregation controls (defaults only).
- Existing projects keep their current cards (no migration of their card rows to the new set).
- No drill-down from the cards.

## Testing

- **Seed:** `DEFAULT_SECTIONED_CARDS` has exactly 6 cards with correct labels/sections/aggregates/sort
  order; new-project `seedDashboardCards()` writes them including the new columns.
- **Repository:** new columns round-trip through `createCard`/`mapRow`; `updateCard` does NOT write
  them (assert its SET clause omits `SectionLabel`/`AggregateField`); `createCard` INSERT placeholder
  count matches column count (regression for the 14/15 mismatch).
- **Schema:** two `ADD COLUMN` statements idempotent; columns present in fresh `CREATE TABLE`.
- **Engine:** `fieldCard` sum, `today` filter, unknown field → 0, non-numeric cells handled.
- **Service:** `getEnabledCardsWithCounts` dispatches `AggregateField` cards to `fieldCard`, `BreakdownField`
  to `breakdownCard`, entity-count to `countCard`.
- **Render:** `DashboardCardGrid` renders section headers for grouped defaults and no headers for
  legacy/admin cards.
- **Migration:** legacy project (has `total_inspections`) → untouched; new project → 6-card set.
- **Isolation:** two-group defaults live in project A only, not project B.
- **Manage Cards dialog:** Add/Edit form is scrollable; every nested picker has a Cancel button.
