# Reports & Export Design

Date: 2026-07-31

## Goal

Move the "Export Data as CSV" capability off the project dashboard into the Reports screen, and add Excel (`.xlsx`) and PDF export alongside CSV. All three formats export the same table: every field from every inspection-form section as a main column (in form order), one row per pole, empty cells where no value was saved.

## Background

- `app/reports/index.tsx` is currently a placeholder ("Reports" text) reached from the dashboard's "Generate inspection reports" card, which passes no route params.
- `src/utils/exportData.ts` implements `exportProjectData(projectId, projectName)` — queries the active project DB, builds a flat table (static columns + dynamic per-inspection field values), renders CSV, writes to `documentDirectory`, and shares via `expo-sharing`. Triggered by the dashboard's "Export inspection data as CSV" card. Current headers are derived from the first inspection's saved values, so empty/unfilled sections may be missing columns.
- `expo-print` (~15.0.8) is already installed → PDF generation is available. `expo-sharing` and `expo-file-system/legacy` are in use.
- No `xlsx` library is installed.

## Decisions

1. **Full form layout in all formats.** CSV, Excel, and PDF export the same table: **every field from every inspection-form section becomes a main column** (in form order), and **each pole/inspection is one row**. Cells are empty where no value was saved — columns exist regardless of which inspections have data. PDF renders that table as a styled HTML table → PDF.
2. **Columns = template fields, not saved values.** Headers come from the inspection template (`InspectionFields` joined to `InspectionSections`), not from the first row's data. This guarantees every form field always appears as a column, even if empty.
3. **Scope: non-repeatable sections only.** The flat per-pole layout only supports single-value fields. Repeatable sections (device / camera / switch inventories) are one-to-many per pole and are excluded from the flat export.
4. **True `.xlsx` via SheetJS.** Add the `xlsx` package (`corepack yarn add xlsx`). The preinstall guard (`scripts/cmd-guard.js`) permits this; it is not a blocked command. `.npmrc` sets `save-exact=true`.
5. **Single unified export service.** One query path and three pure per-format formatters, so the query/header/row logic is written once and unit-testable without a live DB.
6. **Exports live in Reports.** The dashboard "Export inspection data as CSV" card is removed. The dashboard's "Generate inspection reports" card now passes `projectId` and `projectName` to `/reports`.
7. **ADR-014 compliance.** The Reports screen stays inside the project flow (project DB active). `getDatabase()` continues to serve the project DB. No `getGlobalDatabase()` calls are introduced.

## Architecture

### `src/utils/exportData.ts` (refactor)

Rename the public entry point to:

```
exportInspections(
  projectId: number,
  projectName: string,
  format: "csv" | "excel" | "pdf"
): Promise<boolean>
```

Returns `false` when there are no inspections (caller shows "No data" alert); `true` after a successful share.

Internal structure:

- `buildInspectionTable(projectId): Promise<{ headers: string[]; rows: string[][] }>`
  - Queries the template once for the complete column set:
    `SELECT f.FieldID, f.FieldName FROM InspectionFields f JOIN InspectionSections s ON f.SectionID = s.SectionID WHERE f.IsActive = 1 AND f.IsVisible = 1 AND s.IsActive = 1 AND s.IsVisible = 1 AND s.IsRepeatable = 0 ORDER BY s.DisplayOrder, f.DisplayOrder`
  - `headers` = every template `FieldName` in section order, plus `Status` and `Remarks` (the only `Inspections` columns not represented in the form; `Pole ID`, `Date`, `Inspector Name`, `Lat/Long` already exist as general-information template fields, so no duplicated static columns).
  - `rows` = one row per inspection (from `SELECT ... FROM Inspections WHERE ProjectID = ?`). Per inspection, query saved values (`InspectionValues` joined to `InspectionFields`), build a `FieldID → value` map, and emit cells aligned to the template columns — `""` where no value was saved. Status/Remarks come from the `Inspections` row.
- `buildCsv(headers, rows): string` — existing CSV escaping (quote/commas/newlines; prefix `= + - @` / tab cells with `'`).
- `buildExcelBase64(headers, rows): string` — `XLSX.utils.aoa_to_sheet([headers, ...rows])` → workbook → `XLSX.write({ type: "base64", bookType: "xlsx" })`.
- `buildPdfHtml(headers, rows): string` — minimal inline-styled HTML `<table>` (borders, header background) with a title showing the project name.
- `writeAndShare(uri, mimeType, dialogTitle, uti)` — shared write + `Sharing.shareAsync` helper.

File naming (all formats): `safeName_inspections_YYYY-MM-DD.<ext>` where `safeName` = project name with non-alphanumeric chars replaced by `_` (existing logic).

### `app/reports/index.tsx`

- Reads `projectId` and `projectName` from `useLocalSearchParams`.
- Renders three export actions (CSV / Excel / PDF), each triggering `exportInspections(projectId, projectName, format)`.
- Busy state while exporting (disable buttons, show indicator).
- Success: share sheet opens (existing `expo-sharing` flow). Failure/empty: `Alert` messages (reuse the dashboard's existing copy: "No inspection data found to export for this project." / "Unable to export inspection data.").
- Falls back to a readable message if `projectId` is missing (screen reached without params).

### `app/projects/dashboard.tsx`

- Remove the "Export inspection data as CSV" card and its `handleExport` / `exportProjectData` wiring.
- "Generate inspection reports" card: add `params: { projectId: project.ProjectID.toString(), projectName: project.ProjectName }`.
- Remove the now-unused `exportProjectData` import and `setExporting` state.

## Dependencies

- Add `xlsx` (SheetJS). Uses `XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_new`, `XLSX.utils.book_append_sheet`, `XLSX.write`.

## Error Handling

- No inspections → `exportInspections` returns `false`; UI shows "No data" alert.
- Export/write/share failure → throw; UI catches and shows "Export Failed" alert.
- `Sharing.isAvailableAsync()` false → return `false` (existing behavior).

## Testing

- Extend `src/__tests__/utils/exportData.test.ts`:
  - `buildInspectionTable` against the in-memory DB mock (headers include every seeded template field in section order + Status + Remarks; each inspection row aligns values by field, empty `""` where missing; empty project → empty table; headers are identical regardless of which inspection has data).
  - `buildCsv` — existing escaping cases preserved.
  - `buildExcelBase64` — base64 decodes to a ZIP (PK) signature; workbook round-trips via `XLSX.read`.
  - `buildPdfHtml` — contains table markup, header cells, and a row value; title includes project name.
- No new component tests for the button wiring.
- Verification commands: `npx tsc --noEmit`, `corepack yarn lint` (0 errors), `corepack yarn test --watch=false`.

## Out of Scope

- Photos in PDF, per-inspection exports, per-pole report pages, print layout control beyond the styled HTML table.
- Repeatable-section data (device / camera / switch inventories) in the flat export — they are one-to-many per pole.
- Column grouping by section (multi-row/section header bands); sections are reflected by field order only.
