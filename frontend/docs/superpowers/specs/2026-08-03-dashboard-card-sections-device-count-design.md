# Design: Dashboard Card Sections + Device Count Fix

## Purpose

Two related dashboard improvements that ship together because they touch the same files:

1. **Card sections behave as a first-class grouping.** Smart-added Total/Today's cards merge into the
   existing "Total"/"Today's" sections instead of forming duplicate headings. Section headings render bold,
   uppercase, with a divider line. Card reordering is locked *within* a section. "Reset Defaults" performs a
   true factory reset (delete all cards, recreate the canonical defaults).
1a. **Summary section rename + collapsible.** The two summary sections are renamed **"Total Summary"** and
   **"Today's Summary"**, and both become expandable/collapsible. Collapse state persists per project
   (AsyncStorage), default is **expanded**.
2. **Fix device-type counting.** Device-type cards (Camera Type, Camera Status, Switch Type, etc.) always
   show "No data" / 0 because they query the `Cameras`/`Switches` tables, which the app never writes to.
   The real device data lives in `DeviceRecords` as a JSON blob. Device counting must read from there.

## Requirements (confirmed with user)

- "Reset Defaults" = full factory reset: delete every card for the project, then recreate the canonical
  `DEFAULT_SECTIONED_CARDS` (Total + Today's × {Inspection Done, Pole Status, Camera Count}).
- Section headings are bold, uppercase, with a divider line.
- Reorder arrows (Manage Cards) are disabled / blocked at section boundaries — cards cannot move across sections.
- Smart-added cards (Smart Card Generator) land inside the canonical sections, not as new headings.
- Device-type cards must count real data from `DeviceRecords` (json_extract of `DeviceData`).
- Default "Camera Count" cards upgrade to count `DeviceRecords` rows with `DeviceType = 'Camera'`, so they
  work for every template (not just templates that expose the `camera_count` number field).
- The two summary section labels are renamed from "Total"/"Today's" to **"Total Summary"**/"**Today's
  Summary"** everywhere (seed, smart cards, `normalizeSections` rank map, grid headings).
- Both summary sections are **collapsible**: tapping the section header toggles its cards; collapse state
  persists **per project** via AsyncStorage; default state is **expanded** (existing behavior preserved until
  the user collapses).
- Per AGENTS.md: schema change ships with a migration; new project-scoped data ships with an isolation
  regression test.

## Context (verified in code)

- **Sections today.** `DashboardCardGrid.tsx` already groups cards by `SectionLabel` and renders a heading
  per section via `styles.sectionHeader` (fontWeight 700, fontSize 15 — not uppercase, no divider).
  `DashboardCardRepository` orders by `SortOrder ASC, CardID ASC`. There is no normalization of `SortOrder`
  across sections: smart-added cards get `MAX(SortOrder)+1` (`createCard`), so a smart-added "Total" card is
  appended *after* the "Today's" section and renders a second "Total" heading.
- **Label sources.** `SectionLabel` values live in two places: `DEFAULT_SECTIONED_CARDS`
  (`dashboard-cards.seed.ts`, lines 32–37) and `SmartCardGenerator.generateCardsForField` (lines 221/231).
  The grid renders the stored `SectionLabel` verbatim as the heading text. Existing project DBs already hold
  "Total"/"Today's" rows, so the rename needs a migration (`UPDATE DashboardCards SET SectionLabel = ...`).
- **Persistence primitive.** AsyncStorage is already used in the app (`src/utils/storageManager.ts`); a small
  dedicated hook (new `src/hooks/useSectionCollapse.ts`) will persist collapsed section labels keyed by
  `projectId`.
- **Reorder.** `DashboardCardManager.handleMove` (lines 86–94) swaps adjacent cards in the flat list and
  calls `reorderCards(projectId, ids)`. Nothing prevents crossing a section boundary. The up/down `IconButton`s
  are disabled only at the list extremes (`index === 0` / `index === cards.length - 1`).
- **Reset.** `DashboardCardManager.handleResetDefaults` calls `ensureDefaultCards(projectId)`, which is a
  no-op when all six defaults already exist — so "Reset Defaults" currently does nothing.
- **Device data storage (root cause).** The inspection form renders only `DeviceSection`
  (`src/components/inspection/SectionRenderer.tsx:197`), which writes `DeviceRecords`
  (`DeviceRecordsRepository.create`: `INSERT ... (InspectionID, DeviceType, DeviceLabel, DeviceNo, DeviceData, DisplayOrder)`).
  `DeviceData` is a JSON object keyed by `FieldName` (`DeviceSection.updateField`:
  `data[fieldName] = value; record.DeviceData = JSON.stringify(data)`). `FieldName` values come from
  `DeviceFieldDefinitions` (e.g. `CameraType`, `CameraStatus`, `SwitchType` — see `device-field-definitions.seed.ts`).
  **`CameraSection`/`SwitchSection` are defined but never rendered** (only self-references in the codebase),
  so the `Cameras`/`Switches` tables stay empty forever.
- **Device cards today.** `SmartCardGenerator.generateCardsForField` routes device fields to
  `EntityType = "cameras"` (or `"switches"` when `DeviceType === "Switch"`), and `deviceBreakdownCard`
  queries `Cameras`/`Switches`. Result: every smart-added device card returns `[]` → "No data".
  Additionally, `COUNT_ENTITIES.devices.deviceColumns = []` (StatisticCountService.ts:68), so the `devices`
  entity can never produce a breakdown.
- **Default camera cards.** `DEFAULT_SECTIONED_CARDS` use `CardMode: "sum"`, `AggregateField: "camera_count"`
  over `InspectionValues` — only meaningful for templates with the `camera_count` field.
- **Migration pattern.** `migrateProjectSchema()` (`schema.ts`) already adds columns with the
  `try { ALTER TABLE ... } catch { already exists }` pattern and calls
  `DashboardCardRepository.migrateDefaultCards(1)`. `ProjectDBManager.openProjectDb` runs `migrateProjectSchema()`.
- **Test harness.** Repository tests use the in-memory mock (`__mocks__/expo-sqlite.ts`). The mock has no
  JOIN / GROUP BY / `json_extract` support and its `INSERT` regex ignores literal VALUES (params array only),
  so integration tests against the mock cannot exercise device-count SQL. Established pattern is to unit-test
  with a mocked `getDatabase` and assert the built SQL + params (see `StatisticCountService.test.ts`).

## Architecture

### Section normalization + reset

```text
DashboardCardRepository.normalizeSections(projectId)
  → stable sort by (sectionRank, sectionLabel, current position)
      rank 0 = SECTION_LABEL_TOTAL ("Total Summary"), rank 1 = SECTION_LABEL_TODAY ("Today's Summary"),
      rank 2 = other non-null label, rank 3 = null
  → contiguous renumber SortOrder 0..n-1, in one transaction

DashboardCardRepository.resetDefaultCards(projectId)
  → DELETE all DashboardCards for project
  → re-insert DEFAULT_SECTIONED_CARDS
  → normalizeSections(projectId)
```

`SECTION_LABEL_TOTAL` / `SECTION_LABEL_TODAY` are exported constants ("Total Summary" / "Today's Summary")
from `src/database/seeds/dashboard-cards.seed.ts` — the single source of truth shared by the seed, the smart
card generator, `normalizeSections`, and the grid's collapsible matching.

### Device counting

```text
SmartCardGenerator (device field)  ──▶  Card: EntityType "devices", DeviceType, BreakdownField = FieldName
                                              │
                                              ▼
StatisticCountService.deviceBreakdownCard(projectId, card)
  → devices branch:
      SELECT json_extract(r.DeviceData, '$.<FieldName>') AS label, COUNT(*) AS count
      FROM DeviceRecords r JOIN Inspections i ON r.InspectionID = i.InspectionID
      WHERE i.ProjectID = ? AND r.DeviceType = ? AND r.IsActive = 1 [AND i.InspectionDate = ?]
        AND json_extract(r.DeviceData, '$.<FieldName>') IS NOT NULL
        AND json_extract(r.DeviceData, '$.<FieldName>') != ''
      GROUP BY label ORDER BY count DESC, label ASC

Default camera-count cards  ──▶  EntityType "devices", CountMode "count", FilterJson {"DeviceType":"Camera"}
  → reuse existing buildCountSql/countCard path (devices entity projectClause gains "AND r.IsActive = 1")
```

## New files

| File | Purpose |
|------|---------|
| `src/hooks/useSectionCollapse.ts` | Per-project collapsed-section state (AsyncStorage), default expanded |
| `src/__tests__/hooks/useSectionCollapse.test.ts` | Hook unit tests (default expanded, toggle persists, per-project key, error → expanded) |
| `src/__tests__/database/dashboardDeviceCount.isolation.test.ts` | Device data in Project A is not counted in Project B (mirrors `isolation.test.ts`) |

## Modified files

| File | Change |
|------|--------|
| `src/models/DashboardCard.ts` | Add `DeviceType?: string \| null` |
| `src/database/tables/dashboard-cards.table.ts` | Add `DeviceType TEXT` column to DDL |
| `src/database/schema.ts` | In `migrateProjectSchema()`: `ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT` (try/catch) + call `DashboardCardRepository.migrateDeviceCards(1)` |
| `src/database/repositories/DashboardCardRepository.ts` | `DeviceType` in `CARD_COLUMNS`/`mapRow`/all INSERTs; new `normalizeSections`, `resetDefaultCards`, `migrateDeviceCards` |
| `src/database/seeds/dashboard-cards.seed.ts` | `total_camera_count`/`today_camera_count` → `EntityType "devices"`, `CardMode "entitycount"`, `CountMode "count"`, `FilterJson {"DeviceType":"Camera"}`; export `SECTION_LABEL_TOTAL`/`SECTION_LABEL_TODAY`; use them in `DEFAULT_SECTIONED_CARDS` |
| `src/database/repositories/SmartCardGenerator.ts` | Device fields → `EntityType "devices"` + `DeviceType`; `SectionLabel` from the label constants; call `normalizeSections` after inserting Total+Today cards |
| `src/database/repositories/StatisticCountService.ts` | `devices` entity `projectClause` gains `AND r.IsActive = 1`; `deviceBreakdownCard` gains a `devices` branch with `json_extract` + `FieldName` allowlist |
| `src/components/dashboard/DashboardCardGrid.tsx` | Section heading style: uppercase + divider; collapsible summary-section headers (chevron toggle + hide/show cards) |
| `src/components/dashboard/DashboardCardManager.tsx` | Reorder arrows disabled at section boundaries; `handleResetDefaults` → `resetDefaultCards` |
| `docs/07-Changelog.md` | Entry |

## §1 — Repository layer

### `normalizeSections(projectId)`

- Load all cards for the project (`ORDER BY SortOrder ASC, CardID ASC`).
- Compute a stable sort key `(rank, label, index)` where `rank` comes from `label`:
  `SECTION_LABEL_TOTAL ("Total Summary") → 0`, `SECTION_LABEL_TODAY ("Today's Summary") → 1`,
  any other non-null label → 2, `null` → 3.
- Within `rank === 2`, order by label (deterministic alphabetical), then original index; this keeps cards of
  the same custom label contiguous.
- Renumber `SortOrder` to `0..n-1` in a single transaction (reuse the `reorderCards` loop shape but with
  computed values, so it is idempotent).

Effect: a smart-added "Total" card is pulled up into the canonical "Total" section; a smart-added "Today's"
card joins "Today's"; custom labels keep their own single section; unlabeled cards fall to the end.

### `resetDefaultCards(projectId)`

- `DELETE FROM DashboardCards WHERE ProjectID = ?` (transaction).
- Re-insert `DEFAULT_SECTIONED_CARDS` exactly as `ensureDefaultCards` does today.
- Call `normalizeSections(projectId)`.

This is the "factory reset". Existing smart/custom cards are intentionally removed (confirmed with user).

### `migrateDeviceCards(projectId)` (called from `migrateProjectSchema`)

1. Add `DeviceType` column (already handled by the schema `ALTER TABLE` step above).
2. Rewrite smart-added device cards:
   - `SELECT CardID, CardKey FROM DashboardCards WHERE CardKey LIKE 'smart_dev_%' AND EntityType IN ('cameras','switches')`
   - `CardKey` format is `smart_dev_<DeviceType>_<FieldName>` (DeviceType is `Camera`/`Switch`, no underscores):
     `DeviceType = parts[2]`, `FieldName = parts.slice(3).join('_')`.
   - `UPDATE DashboardCards SET EntityType = 'devices', DeviceType = <DeviceType> WHERE CardID = ?`.
3. Rewrite default camera cards:
   - `UPDATE DashboardCards SET EntityType = 'devices', CardMode = 'entitycount', CountMode = 'count',
      AggregateField = NULL, FilterJson = '{"DeviceType":"Camera"}'
      WHERE CardKey IN ('total_camera_count','today_camera_count')`.
4. Rename legacy summary section labels (existing DBs that were never factory-reset):
   - `UPDATE DashboardCards SET SectionLabel = 'Total Summary' WHERE SectionLabel = 'Total'`
   - `UPDATE DashboardCards SET SectionLabel = 'Today''s Summary' WHERE SectionLabel = 'Today''s'`
   (SQL apostrophe escaped for "Today's").
5. Non-fatal on error, matching the existing migration convention.

## §2 — Placement, headings, reorder, reset

- **Grid headings** (`DashboardCardGrid.tsx`): extend `sectionHeader` style with `textTransform: "uppercase"`,
  a `borderBottomWidth: 1` divider, and bottom padding. Heading text stays the `SectionLabel` value.
- **Label constants** (`dashboard-cards.seed.ts`): export `SECTION_LABEL_TOTAL = "Total Summary"` and
  `SECTION_LABEL_TODAY = "Today's Summary"`. `DEFAULT_SECTIONED_CARDS` and
  `SmartCardGenerator.generateCardsForField` use them for `SectionLabel`.
- **Reorder locked within section** (`DashboardCardManager.tsx`):
  - `handleMove(index, direction)`: return early if the target card's `SectionLabel` differs from the
    current card's `SectionLabel`.
  - Up button `disabled` when `index === 0` **or** the previous card's `SectionLabel` differs; down button
    disabled when `index === cards.length - 1` **or** the next card's `SectionLabel` differs.
  - After any successful reorder, call `normalizeSections(projectId)` (keeps sections contiguous).
- **Reset Defaults** (`DashboardCardManager.handleResetDefaults`): replace `ensureDefaultCards(projectId)`
  with `resetDefaultCards(projectId)`.
- **Smart-add placement** (`SmartCardGenerator.addSmartCardsForField`): after inserting the Total + Today's
  cards, call `DashboardCardRepository.normalizeSections(projectId)` so the new cards merge into the
  canonical sections.

## §3 — Device counting

- **Model**: `DashboardCard.DeviceType?: string | null`.
- **Smart cards**: in `SmartCardGenerator.generateCardsForField`, for `field.source === "device"`:
  `EntityType = "devices"`, `DeviceType = field.DeviceType`, `BreakdownField = field.DeviceColumn`
  (unchanged), `CardKey` unchanged (`smart_dev_<DeviceType>_<FieldName>`).
- **`deviceBreakdownCard`** gains a `devices` branch (existing `cameras`/`switches` path unchanged):
  - Guard: require `card.DeviceType` and a `BreakdownField` matching `/^[A-Za-z0-9_]+$/` (prevents
    JSON-path injection; `DeviceFieldDefinitions.FieldName` values always match).
  - Params: `[projectId, card.DeviceType]`, then the `CounterType` time-clause params (`today` →
    `[getTodayDateString()]`, appended after the DeviceType param to match SQL order).
  - SQL: `json_extract(r.DeviceData, '$.<FieldName>')` for the label and the non-null / non-empty guard;
    `GROUP BY label ORDER BY count DESC, label ASC`.
- **`devices` entity**: `projectClause` becomes `"i.ProjectID = ? AND r.IsActive = 1"` so soft-deleted
  records are excluded from every device count (matches repository read conventions). `deviceColumns` stays
  `[]` — the `devices` branch does not go through the `deviceColumns.includes` gate.
- **Default camera-count cards** (seed): `EntityType "devices"`, `CardMode "entitycount"`,
  `CountMode "count"`, `FilterJson '{"DeviceType":"Camera"}'`. `buildCountSql` already emits
  `AND r.DeviceType = ?` from the filter and `AND r.IsActive = 1` from the entity clause, and
  `DashboardService` routes `entitycount` through `countCard`. No new counting code needed for these.
- **Existing cards on upgraded DBs**: covered by `migrateDeviceCards` (rewrites smart `cameras`/`switches`
  cards and the default camera cards).

## §4 — Rename + collapsible summary sections

- **Rename**: `SectionLabel` values become "Total Summary" / "Today's Summary" in the seed, the smart card
  generator, and the `normalizeSections` rank map. The grid renders the stored label, so headings update
  automatically. Existing DBs are covered by `migrateDeviceCards(1)` step 4 (`UPDATE SectionLabel`).
- **Collapsible header** (`DashboardCardGrid.tsx`): for the two summary sections the section header becomes a
  `Pressable` row — the label plus a `chevron-up`/`chevron-down` icon — that toggles the cards beneath it.
  Only "Total Summary" and "Today's Summary" are collapsible (label match against the two constants);
  custom/admin sections keep a plain heading.
- **Collapse behavior**: a collapsed section hides its cards but keeps the header visible (accordion). Default
  is expanded; the user's per-section collapsed/expanded choice persists across navigation and app restarts,
  keyed by `projectId`.
- **Persistence** (new `src/hooks/useSectionCollapse.ts`):
  - `STORAGE_KEY = (projectId) => \`accc_dash_collapsed_\${projectId}\``; value is a JSON array of collapsed
    section labels (AsyncStorage).
  - Load on mount (`useEffect` on `projectId`); any read error → empty set (default expanded).
  - `isCollapsed(label)`, `toggle(label)`; `toggle` writes back fire-and-forget, errors swallowed (non-fatal).

## Edge Cases

- **Existing `smart_dev_*` cards with `cameras`/`switches` EntityType** are rewritten by the migration;
  the smart cards that run on already-seeded projects start counting immediately.
- **DeviceData null / invalid JSON / missing key**: `json_extract` returns `null`; the non-null guard drops
  the row; a `DeviceData` that is not valid JSON yields no matching rows (card shows "No data"), never throws.
- **Field name with spaces or dots**: rejected by the allowlist → `deviceBreakdownCard` returns `[]` (safe).
- **No `DeviceType` on a device card**: branch returns `[]` (card misconfiguration, never crashes).
- **Soft-deleted DeviceRecords** (`IsActive = 0`): excluded by the entity clause / breakdown WHERE.
- **Today's device cards**: reuse `COUNTER_TYPES.today` → `AND i.InspectionDate = ?` on the joined alias `i`.
- **Duplicate Total sections from previously smart-added cards**: `normalizeSections` merges them; the grid
  renders one heading per contiguous section.
- **Custom-label sections** (rank 2): grouped alphabetically and kept contiguous; reorder stays within the label.
- **Reset with custom cards present**: all custom cards are deleted (factory reset is intentional).
- **Collapse state missing/corrupt**: AsyncStorage read fails or has no key → empty set → both summary
  sections default to expanded; a bad write is swallowed and never crashes the dashboard.
- **Collapse state is per project**: switching projects loads that project's key; the same section label in a
  different project can have a different collapsed/expanded state.
- **Old "Total"/"Today's" labels on un-migrated DBs**: `migrateProjectSchema` runs at project open, so the
  rename always lands before the grid renders; the grid matches only the renamed constants.
- **Isolation**: all device counting scopes by `i.ProjectID = ?`; the regression test creates camera data in
  project A, opens project B, and asserts no leakage.

## Error Handling

- Repository methods run their multi-step work inside `withTransactionAsync` (normalize, reset, migrate rewrites).
- Schema migration steps keep the `try/catch` "already exists / non-fatal" convention.
- `deviceBreakdownCard` keeps its existing top-level `try/catch` returning `[]`.

## Out of Scope

- Rendering device dropdown cards' labels from `DeviceOptions` (the card shows the stored values directly).
- Universal aggregation engine, rich filters, drag-and-drop layout (existing dashboard roadmap).
- Wiring the classic `CameraSection`/`SwitchSection` components into the form.
- Making the smart-add picker list non-Camera/Switch device types (stays `DeviceType IN ('Camera','Switch')`).

## Testing

- **Repository** (`DashboardCardRepository` tests):
  - `normalizeSections`: smart-added "Total" card merges into the canonical Total section (contiguous, correct
    SortOrder); custom-label grouping; unlabeled to the end; idempotent on a second call.
  - `resetDefaultCards`: with custom cards present, exactly the 6 canonical cards remain, SortOrder renumbered.
  - `migrateDeviceCards`: `smart_dev_Camera_CameraType` (EntityType `cameras`) rewritten to `devices` +
    `DeviceType 'Camera'`; default camera cards rewritten; legacy `SectionLabel` "Total"/"Today's" renamed to
    the constants; non-device smart cards untouched.
- **SmartCardGenerator**: device field produces `EntityType "devices"`, `DeviceType`, `BreakdownField`;
  `normalizeSections` called after insert (assert via mock).
- **StatisticCountService** (`deviceBreakdownCard` devices branch, mocked `getDatabase`):
  - builds the `json_extract` SQL with correct params order (`[projectId, deviceType, todayDate]`);
  - rejects non-allowlist `BreakdownField` and missing `DeviceType`.
  - `buildCountSql` for the upgraded default card emits `r.DeviceType = ?` + `r.IsActive = 1`.
- **Seed** (`dashboardCards.seed.test.ts`): update expectations — camera cards now `EntityType "devices"`,
  `CardMode "entitycount"`, `FilterJson '{"DeviceType":"Camera"}'`; section labels equal
  `SECTION_LABEL_TOTAL`/`SECTION_LABEL_TODAY`; mode distribution becomes entitycount ×4, dropdown ×2.
- **Grid**: section heading style asserts (uppercase + divider); grouping behavior unchanged.
- **Collapsible** (new `useSectionCollapse` hook + `DashboardCardGrid`):
  - default expanded; `toggle` flips state and writes the JSON array to AsyncStorage (mock asserts write).
  - key is scoped by `projectId`; storage error → expanded, no throw.
  - grid: collapsed "Total Summary" renders its header but no cards; expanding restores them; custom sections
    always render cards (no chevron).
- **Manager**: up/down arrows disabled at section boundaries; `handleResetDefaults` calls `resetDefaultCards`;
  cross-section move is a no-op.
- **Isolation regression** (`dashboardDeviceCount.isolation.test.ts`): device records in project A are not
  counted by project B's device card.
- **Migration test** (`schema` suite): `ALTER TABLE ... ADD COLUMN DeviceType` runs; repeated open is a no-op.
- Full suite green; `npx tsc --noEmit` clean; eslint clean; coverage thresholds for touched files hold.
