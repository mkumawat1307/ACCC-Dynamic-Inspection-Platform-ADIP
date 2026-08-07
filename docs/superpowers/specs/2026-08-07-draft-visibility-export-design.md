# Draft Inspection Visibility & Export Filtering

**Date:** 2026-08-07
**Status:** Approved design
**Scope:** `frontend/`

## Problem

Draft inspections (created on Back/Close without Save) currently appear everywhere:
- **Preview mode** (`app/reports/index.tsx` → `buildReportTable`)
- **Excel export** (project-wide and per-ID)
- **Final inspection list** (`app/inspection/index.tsx`, single mixed list)

Required: Drafts visible only on a "Drafts / Continue Editing" surface; Completed (and Submitted, if ever produced) visible in Preview, Excel, and the final list.

## Current Behavior (verified)

| Surface | Code | Filter today |
|---------|------|--------------|
| Inspection list | `InspectionListRepository.getByProject` | none — returns Draft + Completed together |
| Reports Preview | `buildReportTableInternal` (`src/utils/exportData.ts:258-263`) | none |
| Export (project-wide) | `buildReportTableInternal`, non-ID branch | none |
| Export (explicit IDs) | `buildReportTableInternal`, ID branch (`exportData.ts:260`) | none — a Draft ID passed explicitly still exports |
| Save / Complete | `new.tsx` → `InspectionRepository.updateInspectionStatus(id, "Completed")` | — |
| Dashboard counts | `dashboard-cards.seed.ts` cards | already `Status = "Completed"` (unchanged) |

Schema: `Inspections.Status TEXT NOT NULL DEFAULT 'Draft'` (`src/database/tables/inspections.table.ts`). Only `'Draft'` and `'Completed'` values are produced today; `'Submitted'` never occurs but is kept forward-compatible in the filter set.

## Decisions (user-confirmed)

1. **Tabs on `/inspection`** — one route, two tabs: *Drafts* (Status = `'Draft'`) and *Final* (Status IN `('Completed','Submitted')`). Default tab = **Final**.
2. **Block Draft export everywhere** — the export-by-ID query also gets the status filter (defense-in-depth), AND the Drafts tab exposes no export affordances (no per-row export icon, no bulk export).
3. **Keep the Back validation block** — no change to `validateBeforeExit` / the hardware-back handler in `new.tsx`. Drafts persist as they do today (rows are created as `'Draft'` on open and stay editable); this task only changes visibility/export filtering.

## Design

### Shared constant

Single source of truth for the "final/visible" status set, exported from `InspectionRepository`:

```ts
export const INSPECTION_FINAL_STATUSES = ["Completed", "Submitted"] as const;
```

Consumers build SQL placeholders from it. Draft is represented as `["Draft"]` at call sites; no separate constant needed.

### Surface 1 — Inspection list (`app/inspection/index.tsx` + `InspectionListRepository`)

`InspectionListRepository.getByProject(projectId, statuses: readonly string[])`:

- SQL gains `AND i.Status IN (${statuses.map(() => "?").join(",")})` with the statuses bound as params.
- Sorting unchanged (existing date sort).

Screen adds a tab control (two segments) above the search bar:
- **Final** (default) → `getByProject(id, INSPECTION_FINAL_STATUSES)`; per-row export icon + bulk "Export Selected" shown exactly as today.
- **Drafts** → `getByProject(id, ["Draft"])`; per-row export icon **hidden**; bulk export button **hidden** (Delete Selected remains — it is the Draft discard path). The tab label ("Drafts") and the existing per-row `Status : Draft` text communicate it is a draft — no new hint UI.

Selection behavior:
- `selectedIds`, `selectedDrafts`, `selectedCompleted` remain derived from the active tab's `inspections` array — no logic change, only the loaded data changes per tab.
- Switching tabs clears selection (`clearSelection()`).

### Surface 2 — Reports Preview (`src/utils/exportData.ts`)

`buildReportTableInternal` **project-wide** `Inspections` query (`:258-263`) gains `AND i.Status IN (${placeholders})` bound from `INSPECTION_FINAL_STATUSES`. This one query feeds both the Preview (`buildReportTable`) and the full-project export (`createExportFile` with `inspectionIds = null`).

### Surface 3 — Export by explicit ID (`src/utils/exportData.ts`)

The **ID branch** (`:260`) also gains `AND Status IN (${placeholders})` with the same status set. Rationale: "block Draft export everywhere" — an explicitly-passed Draft ID yields zero rows. Completed/Submitted IDs unaffected.

### Consistency notes

- `values` and `DeviceRecords` queries inside `buildReportTableInternal` are `JOIN`ed to `Inspections` and scoped to the same ID list / project; no orphan rows leak when the `Inspections` list is filtered. No changes needed there.
- Dashboard counts, photos, watermark, forms, project management, and DB schema are untouched (no DDL).

## Data Flow

```
Final tab / Preview / Export(project) / Export(ids)
        └── WHERE i.Status IN ('Completed','Submitted')     [shared constant]
Drafts tab
        └── WHERE i.Status = 'Draft'
```

## Error Handling

- Empty filtered result → existing empty states render unchanged ("No inspection data to preview.", empty list).
- Draft ID explicitly passed to export → query returns 0 rows → existing "No Data" alert / empty export. Acceptable per decision 2.

## Testing

1. **`InspectionListRepository`** — seed Draft + Completed + (optional) Submitted rows; assert:
   - `getByProject(id, INSPECTION_FINAL_STATUSES)` returns only Completed/Submitted.
   - `getByProject(id, ["Draft"])` returns only Draft.
   - SQL includes the `Status IN (...)` clause (query-string assertion where the mock supports it).
2. **`exportData`** — build with a mix of Draft + Completed rows:
   - project-wide build → table rows contain only Completed.
   - explicit `buildReportTable(id, [draftId])` → empty/zero rows.
   - explicit Completed ID → rows present (regression guard).
3. **Existing test suite** must keep passing — `exportData.test.ts` mocks return pre-filtered rows; add query-string assertions where the mock records SQL.

## Non-Goals

- Changing `validateBeforeExit` / Back-blocking behavior in `new.tsx`.
- Introducing a `'Submitted'` production path (kept only as a forward-compatible filter value).
- Any schema/migration change, dashboard, photos, watermark, or project management changes.
- Multi-screen Drafts route (tabs chosen instead).
