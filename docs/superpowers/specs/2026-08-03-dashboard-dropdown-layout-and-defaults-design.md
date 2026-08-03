# Design: Dynamic Dropdown Card Layout + Default Card Binding Fix

Date: 2026-08-03
Status: Approved (awaiting implementation plan)

## Purpose

Two related dashboard-card changes on the ACCC Dynamic Inspection Platform:

1. **Dynamic dropdown card layout.** Dropdown statistic cards (`StatBreakdownCard`) render option rows as a vertical list today. When a dropdown has few options with short labels, a compact grid of "mini-cards" (label on top, count below) reads better. The card should auto-detect this case and switch layouts.

2. **Default card binding fix.** Two of the seeded default cards are wrong:
   - The "Pole Status" default card title should be **"Pole Availability"** (its `BreakdownField: "pole_avail"` binding is already correct — only the title is misleading, because the real "Pole Status" field is a different field, `pole_status`).
   - The "Camera Count" default cards were repointed to count Camera *device* records (commit `c624894`). They should count the **`camera_count` inspection field** again (`CardMode "sum"`, `AggregateField "camera_count"`).
   - The **Add Card** window should hide a field once *any* card for it exists (today it only hides fields that have a `smart_*` card; the default cards use `total_*`/`today_*` keys so Pole Availability and Camera Count keep appearing).

## Requirements (confirmed with user)

1. Adaptive dropdown layout:
   - Card (grid) layout when `1 <= rows.length <= 6` **and** every option label is `<= 15` chars.
   - Otherwise keep the existing vertical list layout.
   - Mini-card: label on top (secondary, single line, truncated), count below (headline, bold, colored by card color).
   - Layout decision is automatic — no user setting.

2. Default card bindings:
   - Rename default "Pole Status" card titles to "Pole Availability" (CardKey, `BreakdownField: "pole_avail"`, everything else unchanged).
   - Rebind default Camera Count cards to `CardMode "sum"` / `AggregateField "camera_count"` / `EntityType "inspections"` / `FilterJson` and `DeviceType` null.

3. Add Card window coverage:
   - A field is hidden from the Add Card window when any existing card (default or smart) covers it. Deleting the covering card exposes the field again.

## Context (verified in code)

- `StatBreakdownCard.tsx` renders rows from `DashboardService.getBreakdown` (`BreakdownRow { label, count }`). The dropdown is determined from the field's `options` at config-load time. Card already supports a card-style color and `COLORS` usage.
- `dashboard-cards.seed.ts` (lines 29–41):
  - `total_pole_status` / `today_pole_status` → Title "Pole Status", `CardMode "dropdown"`, `BreakdownField "pole_avail"`.
  - `total_camera_count` / `today_camera_count` → currently `EntityType "devices"`, `CardMode "entitycount"`, `FilterJson '{"DeviceType":"Camera"}'`, `DeviceType 'Camera'` (device-record counting).
  - Legacy `total_cameras` / `today_cameras` → "Total Cameras" device-count cards (kept).
  - `DEFAULT_SECTIONED_CARDS` holds the Total/Today sectioned set.
- `DashboardCardRepository.ts`:
  - `migrateDeviceCards` (~line 352) rewrites smart-device and camera cards on every project open; `cameraKeys = total_cameras, today_cameras, total_camera_count, today_camera_count` are all repointed to device counting.
  - `CARD_COLUMNS` / `mapRow` already carry `CardMode`, `BreakdownField`, `AggregateField`, `DeviceType`.
- `SmartCardGenerator.ts` `getAvailableFields` filters only on `smart_*` card keys today; it receives the project's existing cards via `getAllCards(projectId)`.
- `field-options.data.ts`: `pole_avail` options Yes/No; `pole_status` options VMS/Local/In Stock/etc.
- `DashboardService.ts` handles `CardMode "sum"` via `fieldCard` (SUM over `InspectionValues`) — the target code path for the rebound Camera Count cards.

## Architecture

No new tables. No new repositories. The dropdown detection is a pure function inside `StatBreakdownCard`. The default-card fixes are seed data + an idempotent per-open migration + a `SmartCardGenerator` filter change.

### §1 — Component: adaptive layout (`StatBreakdownCard.tsx`)

Module constants:

```ts
const MAX_OPTIONS = 6;
const MAX_LABEL_LENGTH = 15;
```

Layout selection:

```ts
const useCardLayout =
  rows.length > 0 &&
  rows.length <= MAX_OPTIONS &&
  rows.every((row) => row.label.length <= MAX_LABEL_LENGTH);
```

Card layout styles (cardGrid):
- `flexDirection: "row"`, `flexWrap: "wrap"`, gap `SPACING.md`.
- Each option = a `Card` (`RADIUS.md`, `COLORS.surface`), `flexBasis: "48%"`, `flexGrow: 1`, `maxWidth: "48%"`, centered content, `paddingVertical: SPACING.sm`.
- Label: `bodyMedium`, secondary color, `numberOfLines={1}`, on top.
- Count: `headlineMedium`, bold, card `color`, below the label.

List layout: unchanged (existing `StatCard`-less row list with label + count).

Empty rows: unchanged "No data" handling. No DB/service-layer changes.

### §2 — Default card bindings

**2a. Seed (`dashboard-cards.seed.ts`)** — `DEFAULT_SECTIONED_CARDS`:
- `total_pole_status` / `today_pole_status`: Title `"Pole Status"` → `"Pole Availability"`. CardKey and `BreakdownField: "pole_avail"` unchanged.
- `total_camera_count` / `today_camera_count`: → `EntityType "inspections"`, `CardMode "sum"`, `AggregateField "camera_count"`, `FilterJson: null`, `DeviceType: null`.
- `DEFAULT_DASHBOARD_CARDS` (legacy) untouched; `total_cameras`/`today_cameras` device-count cards untouched.

**2b. Migration (`DashboardCardRepository.migrateDeviceCards`)** — still runs on every project open, idempotent:
- Keep the smart-device rewrite (`smart_dev_*` → `EntityType 'devices'`, `DeviceType`, `BreakdownField`).
- Keep the legacy `total_cameras`/`today_cameras` device-count rewrite.
- **New**: rebind `total_camera_count` / `today_camera_count` back to the field:
  `UPDATE DashboardCards SET EntityType='inspections', CardMode='sum', AggregateField='camera_count', FilterJson=NULL, DeviceType=NULL, UpdatedAt=CURRENT_TIMESTAMP WHERE CardID=? AND ProjectID=?`
- **New**: rename pole titles:
  `UPDATE DashboardCards SET Title='Pole Availability', UpdatedAt=CURRENT_TIMESTAMP WHERE CardKey IN ('total_pole_status','today_pole_status') AND ProjectID=?`
- Early return changes: also bail out when neither smart, camera (legacy or field), nor pole cards exist:
  `if (smartCards.length === 0 && cameraCards.length === 0 && poleCards.length === 0) return;`

### §3 — Add Card window coverage (`SmartCardGenerator.getAvailableFields`)

Replace the `smart_*` key check with **field-based coverage**. A field is hidden when any existing card covers it:

- **inspection dropdown / switch / checkbox / text / multiline / date / date_auto** → card has `BreakdownField === field.Key`.
- **inspection number** → card has `CardMode === "sum" && AggregateField === field.Key`.
- **device** → card has `DeviceType === field.DeviceType && BreakdownField === field.DeviceColumn`.

Implementation: a `isFieldCovered(field, cards)` helper (pure) plus the existing `getAllCards(projectId)` call. The existing `smartCards`-only check is removed. `addSmartCardsForField` needs no change (the picker only offers uncovered fields). Scope remains per-project — no cross-DB reads, no new tables.

## Modified Files

| File | Change |
|------|--------|
| `src/components/dashboard/StatBreakdownCard.tsx` | Adaptive card/list layout |
| `src/components/dashboard/StatBreakdownCard.test.tsx` | Tests for both layouts, boundary cases |
| `src/database/seeds/dashboard-cards.seed.ts` | Pole title rename; camera_count sum rebind |
| `src/database/repositories/DashboardCardRepository.ts` | Migration additions + early-return |
| `src/database/repositories/SmartCardGenerator.ts` | Field-based coverage in `getAvailableFields` |
| `docs/07-Changelog.md` | Changelog entries |

## Edge Cases

- Dropdown with exactly 6 one-char labels → grid. 7 options → list.
- Label of exactly 15 chars → grid; 16 chars → list.
- Single option → single mini-card (grid).
- Zero rows → "No data", never grid.
- Long text wrapped: mini-card label truncates at 1 line; full label still visible in list layout for long-label fields.
- Existing DBs that already repointed `total_camera_count` to devices → migration rebinds back (idempotent).
- Old DBs whose pole cards still say "Pole Status" → migration renames.
- DBs that never had the sectioned defaults (no pole/camera/smart cards) → early return, no writes.
- Default card deleted by user → field reappears in Add Card window.

## Error Handling

- Migration statements are parameterized and run in the existing transaction; any failure leaves the prior state (existing pattern). No new error surfaces.

## Out of Scope

- No DB-layer changes for dropdown detection (no new columns/queries).
- No new admin UI or settings for layout choice.
- No changes to smart-card creation, sections, or the dashboard grid panel styling.
- No changes to the legacy `total_cameras` "Total Cameras" device-count cards.

## Testing

- `StatBreakdownCard.test.tsx`: grid for `1..6` short labels (assert mini-card testID/elements and order), list for 7+ rows or any long label, boundary at 6/15, truncation via `numberOfLines`, empty-rows fallback.
- `dashboardCards.seed.test.ts`: camera cards are `"sum"` / `AggregateField "camera_count"`; pole cards have Title "Pole Availability" + `BreakdownField "pole_avail"`.
- `DashboardCardRepository.test.ts` (`migrateDeviceCards`): camera `FilterJson` device-repoint now applies to legacy `total_cameras` only; `total_camera_count` is rebound to `sum`/`camera_count`; pole cards renamed; no-op when no relevant cards.
- `SmartCardGenerator.test.ts`: mock card rows include `CardMode`/`BreakdownField`/`AggregateField`/`DeviceType`; add cases proving a field covered by a **default** card (e.g. `BreakdownField "pole_avail"`, or `AggregateField "camera_count"`) is hidden, and shown again when that card is absent.
- `DashboardCardManager.test.tsx`: unaffected (module mocked).
- Full gate: `npx tsc --noEmit`, `npx eslint app src`, `npx jest` (expect 41 suites / 500+ tests).
