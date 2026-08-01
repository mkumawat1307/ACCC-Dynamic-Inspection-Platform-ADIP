# Complete Reports Module

## Status

Approved design. Awaiting implementation.

## Problem

The current Reports screen (`app/reports/index.tsx`) only supports whole-project export: it is reached from a project dashboard with a `projectId` param, exports all inspections, and shows a single read-only table preview. It has no project selector, no inspection selector, no export scope, no preview modes, and no spreadsheet-style navigation (search/filter/sort/sticky headers). The spec requires a complete reports module with scoped exports (single/selected/all), three export formats sharing one report structure, live previews in four modes, and a fully interactive spreadsheet preview.

## Solution

Rebuild the Reports screen into a standalone module with in-screen project selection, inspection selection, export scopes, preview mode tabs (Table / PDF / Excel / CSV), and an interactive spreadsheet preview. Extend the export service to support scoped filtering (including multiple inspection IDs) and a per-row Project column. Wire "Export Selected" into the existing Inspection List multi-select UI.

## Decisions from brainstorming

- **Zone / Ward**: omitted. The data model has Division/District/Block only; device rows repeat the existing fields (Pole ID, District, Division, Project, Inspection Date, Latitude, Longitude, Status).
- **Preview modes**: Tabs — Table / PDF / Excel / CSV.
- **Entry point**: Both — Reports works standalone with an in-screen project selector AND accepts a `projectId`/`projectName` param to preselect when arriving from a dashboard.

## Architecture

### 1. Export service — `src/utils/exportData.ts`

Extend `buildReportTable` to support scoped filtering and a Project column:

```
buildReportTable(projectId: number, inspectionIds?: number | number[], projectName?: string): Promise<ReportTable>
```

- `inspectionIds` omitted → all inspections for the project (current behaviour).
- `inspectionIds` = single number → one inspection (current `inspectionId` behaviour, kept for backward compatibility).
- `inspectionIds` = number[] → only the selected inspections.
- The `Inspections`, `InspectionValues`, `DeviceRecords`, and `Photos` queries switch to an `IN (...)` clause when an array is passed (parameterized placeholders; never string-concatenated).
- New leading column `Project` (label `Project`) in the first section. Its value is `projectName` on every row (base and device rows). Add `project_name` to `REPEAT_ON_DEVICE_ROWS` so device rows carry it too.
- `projectName` defaults to `""` when omitted (keeps existing single-id/no-id callers and their tests valid without a name).

Export functions:

```
exportInspections(projectId: number, projectName: string, format: ExportFormat, inspectionIds?: number[]): Promise<boolean>
```

- Optional `inspectionIds` filter; omitted = all inspections (current behaviour).
- PDF, Excel, and CSV all derive from the same `ReportTable` (PDF via `buildProjectPdfHtml`), so all three formats share one report structure.
- Existing 3-arg callers (`exportInspections(projectId, projectName, format)`) unchanged.
- `exportInspection` (list-screen single export, form-style PDF) stays as-is. The Reports screen always uses the shared table-style structure (including the "Selected Inspection" scope); only the Inspection List single-export keeps the form-style PDF.
- Export returns `false` (→ "No Data" alert) when the filtered table has no base rows.

New preview helpers (pure, unit-testable):

```
buildPreviewHtml(table: ReportTable, projectName: string): string   // = buildProjectPdfHtml
buildCsv(table: ReportTable): string                                // already exists
```

### 2. Preview component — `src/components/reports/ReportTablePreview.tsx`

Upgrade to a spreadsheet-style grid inside a bounded, independently scrollable area:

- **Sticky top band + header rows** (stay visible when scrolling vertically) and **sticky first column** (Pole ID / Project) when scrolling horizontally. Implemented with synced `ScrollView`s: a frozen header `ScrollView` (horizontal) and a frozen first-column `ScrollView` (vertical), both synced to the main grid via `onScroll` + refs.
- **Vertical + horizontal scrolling** of the main grid.
- **Auto column width**: each column width derived from its longest content (min/max clamps).
- **Search**: text input filtering rows whose any cell matches.
- **Filter**: Status filter (All / Completed / Draft) applied to base rows.
- **Sort**: tap a column header to toggle ascending / descending.
- **Alternate row colours** on base rows; **device rows highlighted** (`#E3F2FD`); **section band row** retained.
- **Summary strip**: total inspections, total rows, total device rows, total columns.

### 3. Reports screen — `app/reports/index.tsx` (rebuilt)

- **Entry**: standalone (no param → project dropdown) and param-driven (preselect from dashboard, still switchable).
- **Project selector**: `react-native-paper-dropdown`, options from `ProjectRepository.getProjects()`.
- **Inspection selector**: loads `InspectionListRepository.getByProject(projectId)` as a searchable checklist.
- **Export scope**: segmented control — **All Inspections / Selected Inspection / Selected Inspections**.
- **Preview mode tabs**: **Table / PDF / Excel / CSV**:
  - Table → upgraded `ReportTablePreview` (same table as export).
  - CSV → raw `buildCsv(table)` in monospace vertical scroll.
  - Excel → the same banded table grid (Excel output is the banded grid).
  - PDF → `WebView` rendering `buildPreviewHtml(table, projectName)` (same HTML as PDF export).
- **Live preview**: the preview table is rebuilt via `buildReportTable` whenever the project, scope, or selection changes, and on focus. Preview and export always use the same table.
- **Export buttons**: PDF / Excel / CSV, all respect the current scope, all share one report structure.
- **Empty selection**: when scope is "Selected Inspection" or "Selected Inspections" and no inspections are selected, the preview is empty, export buttons are disabled, and the empty state shows.
- **Empty state**: shows exactly **"No inspection data found."** when the table has no base rows (also disables export).
- During the inspection flow the project DB handle is used via `getDatabase()` (never `getGlobalDatabase()`); `ProjectRepository.getProjects()` uses the global DB before/after, not mid-flow.

### 4. Inspection List — `app/inspection/index.tsx`

Add **"Export Selected"** to the existing selection-mode card. Tapping it shows the same format chooser (PDF / Excel / CSV) and calls `exportInspections(projectId, projectName, format, selectedIds)`. "No Data" / "Export Failed" alerts match existing copy.

## Error handling

| Failure | Behaviour |
|---|---|
| No base rows in scoped table | `exportInspections` returns `false`; screen alerts "No Data" with the copy `No inspection data found to export.` |
| Preview load fails | Log via `logger.error`; table stays `null`; empty state text shows |
| Export throws | `logger.error`; alert `Export Failed` / `Unable to export inspection data.` |
| WebView/HTML preview unavailable | PDF tab falls back to the raw HTML string in monospace scroll |

## Testing

- `src/__tests__/utils/exportData.test.ts`: multi-ID `buildReportTable` (IN-clause + Project column), backward-compatible single/no-id behaviour, Project column on base + device rows, `exportInspections` with `inspectionIds`, all-format shared structure.
- `src/__tests__/components/reports/ReportTablePreview.test.tsx`: rendered cells still correct; search filters rows; status filter; sort by column; summary counts; no duplicate-key warnings.
- New `src/__tests__/components/reports/ReportsScreen.test.tsx`: project list drives selector; scope changes reload table; tab switching; empty state shows "No inspection data found."; export respects scope.
- `src/__tests__/utils/exportPreview.test.ts`: `buildPreviewHtml` escapes and equals `buildProjectPdfHtml`; CSV preview uses `buildCsv`.
- Keep the existing Jest mock call-order fixtures (template → deviceDefs → inspections → values → records → photos) green or extend them; coverage thresholds per directory enforced.

## Files changed

| File | Action |
|---|---|
| `src/utils/exportData.ts` | MODIFY (scoped `buildReportTable`, Project column, `exportInspections` filter) |
| `src/components/reports/ReportTablePreview.tsx` | MODIFY (spreadsheet grid, sticky headers, search/filter/sort, auto width, summary) |
| `app/reports/index.tsx` | MODIFY (selectors, scope, tabs, live preview, empty state) |
| `app/inspection/index.tsx` | MODIFY (Export Selected in selection mode) |
| `src/__tests__/utils/exportData.test.ts` | MODIFY (scope + Project column cases) |
| `src/__tests__/components/reports/ReportTablePreview.test.tsx` | MODIFY (new interactions) |
| `src/__tests__/components/reports/ReportsScreen.test.tsx` | CREATE |
| `docs/07-Changelog.md` | MODIFY (v1.10.0 entry) |
| `docs/09-Decisions.md` | MODIFY (ADR-016) |
| `docs/06-Memory.md`, `docs/08-README.md`, `docs/04-Phases.md`, `docs/02-Architecture.md`, `docs/01-PRD.md` | MODIFY (v1.10.0) |

No new runtime dependencies. `react-native-webview` (already installed) is used only for the PDF preview tab.
