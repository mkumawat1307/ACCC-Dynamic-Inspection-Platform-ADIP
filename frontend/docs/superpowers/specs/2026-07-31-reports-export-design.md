# Reports & Export Design (v2)

Date: 2026-07-31

## Goal

Deliver the Reports screen with project-level export (CSV, Excel `.xlsx`, PDF) plus an on-screen preview of the export table, and single-inspection export (PDF, Excel, CSV) from the Inspection List. All exports match the Inspection Form's section hierarchy, field order, and one-row-per-device layout. Supersedes the v1 flat-layout spec (repeatable sections excluded, no preview, no per-inspection export).

## Background

- `app/reports/index.tsx` is a placeholder; the dashboard's "Generate inspection reports" card passes no route params. The dashboard also has an "Export inspection data as CSV" card (`handleExport`) to be removed.
- `src/utils/exportData.ts` implements `exportProjectData(projectId, projectName)` — flat CSV, headers derived from the first inspection's saved values (unfilled sections can miss columns).
- `expo-print` (~15.0.8), `expo-sharing`, `expo-file-system/legacy` are installed. No `xlsx` yet.
- Inspection form is dynamic: sections (`IsRepeatable=1` for device inventories) → fields → saved `InspectionValues`; device detail columns come from `DeviceFieldDefinitions`; saved devices live in `DeviceRecords` (JSON `DeviceData`). Photos live in `Photos` (`FilePath`, `PhotoType`, `CapturedAt`, `Remarks`). `Inspections.Status` is a real column; `Latitude`/`Longitude` columns on `Inspections` are never written during inspection.

## Decisions

1. **Banded 2-row headers.** Section name band row spanning its fields, then a field-name row. CSV repeats the band cell on every column it covers; Excel merges band cells (plus autofilter + frozen top rows); PDF renders a `<thead>` with band cells `<th colspan=...>`. Section/field order = form order.
2. **Columns = template fields, live.** Headers come from the inspection template (active + visible sections/fields), never from saved data, so every form field appears even when empty. New sections/fields automatically appear in exports.
3. **Repeatable (device) sections are included.** A device section's columns = its `IsRepeatable=1` section's own form fields (e.g. `<type>_count`) + a **Device No** column + the section's `DeviceFieldDefinitions` columns (header = `Label`, ordered by definition `DisplayOrder`). Placement: immediately after the section's own count field.
4. **One row per device.** Base row per inspection (all single-value form fields + derived Lat/Long + Status + Photos). One **device row** per saved `DeviceRecords` entry (ordered by `DeviceNo`), repeating the pole-level columns: **Pole ID, District, Division, Inspection Date, Latitude, Longitude, Status**. All other cells empty.
5. **Latitude/Longitude are derived.** The form has one combined GPS field (`Lat/Long`, key `gps`). Split its value (e.g. `"12.9716, 77.5946"`) into two columns — **Latitude**, **Longitude** — placed immediately after the GPS column.
6. **Status and Photos are appended columns.** `Status` from `Inspections.Status` (repeated on device rows); **Photos** = comma-joined photo file names (flat tables never embed images — SheetJS cannot embed images in `.xlsx`).
7. **Single-inspection export.** From the Inspection List, a per-card export action → format chooser (PDF / Excel / CSV) → exports only that inspection.
   - **CSV/Excel:** the same banded flat table filtered to that inspection (1 base row + its device rows).
   - **PDF:** **form-like layout** — sections as headings with label/value rows in form order; devices rendered as cards under their device section (Device No + detail fields); **photos embedded as base64 images**; Remarks + Status; title = pole ID + inspection date.
8. **Single unified export service.** `buildReportTable(projectId, inspectionId?)` produces the flat table; pure formatters `buildCsv` / `buildExcelBase64` / `buildProjectPdfHtml` / `buildInspectionPdfHtml`; entry points `exportInspections(projectId, projectName, format)` and `exportInspection(projectId, projectName, inspectionId, poleId, format)`. All return `Promise<boolean>` (false = no data → "No data" alert).
9. **Exports live in Reports; dashboard cleaned up.** Remove the dashboard CSV card + `handleExport`; the Reports card passes `params: { projectId, projectName }`.
10. **ADR-014 compliance.** All reads via the project DB `getDatabase()`. No `getGlobalDatabase()` calls. Bulk queries (sections+fields, inspections+values, device records, device field definitions, photos) grouped in JS — no N+1.

## Architecture

### Report table builder (`src/utils/exportData.ts`)

```
interface ReportColumn { fieldKey: string; label: string }   // label = form field name, header text
interface ReportSection { name: string; columns: ReportColumn[] }
interface ReportRow { cells: string[]; isDeviceRow: boolean }
interface ReportTable {
  sections: ReportSection[];   // banded header structure
  headers: string[];           // flattened column labels (one per cell)
  rows: ReportRow[];
}
```

- `buildReportTable(projectId, inspectionId?): Promise<ReportTable>`
  - Sections/columns from `InspectionSections` + `InspectionFields` (active + visible, form order). Skip the `photos` section (no fields).
  - Device sections (SectionKey matching `IsRepeatable=1` + `<type>_information`, e.g. `camera_information`) get Device No + `DeviceFieldDefinitions` columns (by normalized `FieldName`, ordered by `DisplayOrder`) after their own fields.
  - Column metadata tracks a special key for derived/appended columns: `gps_lat`, `gps_lng` (derived), `status`, `photos`.
  - Rows: per inspection, bulk-load saved `InspectionValues` (FieldID → value) + device records (per `getByInspectionAll`, ordered by `DeviceNo`) + photos (InspectionID → file names). Base row fills all form fields + derived lat/lng + status + photos. Device rows fill the repeat set: `pole_id`, `district`, `division`, `date` (inspection date field), `gps_lat`, `gps_lng`, `status` — plus their device section's own columns (count + Device No + device detail values). `Date` = `getCurrentInspectionDate()` when the saved value is blank (DATE_AUTO).
  - `inspectionId` filters to one inspection (single-inspection CSV/Excel).
- `buildCsv(table): string` — existing escaping (quote/commas/newlines; prefix `= + - @` / tab cells with `'`). Band cells repeat per covered column.
- `buildExcelBase64(table): string` — SheetJS `aoa_to_sheet`, then `XLSX.utils.sheet_add_aoa` for the band row, `worksheet["!merges"]` for band cells, autofilter on the field-name row, freeze at the field-name row. Requires `src/types/xlsx.d.ts` (`declare module "xlsx"`) for the default import.
- `buildProjectPdfHtml(table, projectName): string` — styled HTML `<table>` with a two-row `<thead>` (band cells with `<th colspan>`), title = project name + date.
- `buildInspectionPdfHtml(formData, projectName): string` — form-like layout (below).
- `loadInspectionFormData(inspectionId): Promise<InspectionFormData>`:
  ```
  interface InspectionFormData {
    poleId: string;
    status: string;
    date: string;
    sections: {
      name: string;
      fields: { label: string; value: string }[];
      devices: { title: string; fields: { label: string; value: string }[] }[];
    }[];
    photos: { fileName: string; dataUri: string | null }[];
  }
  ```
  Sections in form order; device sections carry device cards (Device No title + detail fields). Photos loaded as base64 data URIs from `FilePath` (`FileSystem.readAsStringAsync(uri, { encoding: "base64" })`, MIME from extension); failures degrade to `null` (render file name as text).
- `exportInspections(projectId, projectName, format)` / `exportInspection(projectId, projectName, inspectionId, poleId, format)` — build table/formData → format → write file to `documentDirectory` → `writeAndShare` (existing helper). File names: `safeName_inspections_YYYY-MM-DD.<ext>` (project) and `safeName_<poleId>_inspection_YYYY-MM-DD.<ext>` (single). PDF via `Print.printToFileAsync({ html })` → copy to documentDirectory → share.

### `app/reports/index.tsx`

- Reads `projectId` / `projectName` from `useLocalSearchParams`; graceful message when missing.
- Top actions: Export CSV / Excel / PDF buttons (busy state while exporting; success → share sheet; empty → "No inspection data found to export for this project."; failure → "Unable to export inspection data.").
- **Preview**: loads `buildReportTable(projectId)` and renders `ReportTablePreview` — spreadsheet-style scrollable grid (fixed-width columns, horizontal scroll), banded section band row + field-name row, base rows normal, **device rows tinted** (light blue), summary line (inspections / base rows / device rows / columns), empty-state message when no data.

### `src/components/reports/ReportTablePreview.tsx` (new)

- Presentational: `ReportTable` → banded grid. Tints `isDeviceRow` rows. No DB access.

### `app/inspection/index.tsx`

- Per inspection card: add an export icon button (next to the pencil). Tap → format chooser (PDF / Excel / CSV, e.g. `Alert.alert` with three buttons) → `exportInspection(projectId, projectName, inspectionId, poleId, format)` → share sheet. Busy state per card; errors → alert.

### `app/projects/dashboard.tsx`

- Remove the "Export inspection data as CSV" card, `handleExport`, `setExporting`, and the `exportProjectData` import.
- "Generate inspection reports" card: add `params: { projectId: project.ProjectID.toString(), projectName: project.ProjectName }`.

## Dependencies

- Add `xlsx` (SheetJS): `corepack yarn add xlsx` (`.npmrc` is `save-exact=true`). Uses `aoa_to_sheet`, `sheet_add_aoa`, `book_new`, `book_append_sheet`, `write`. Add `src/types/xlsx.d.ts` (`declare module "xlsx"`).

## Error Handling

- No inspections → `false` + "No data" alert. Device-less inspections still export (base row only).
- Export/write/share failure → throw → caller alert ("Unable to export...").
- `Sharing.isAvailableAsync()` false → `false`.
- Photo base64 read failure → `dataUri: null`, file name shown instead — export still succeeds.

## Testing

- `src/__tests__/utils/exportData.test.ts`:
  - `buildReportTable`: every seeded active+visible field appears in section order; band structure matches sections; device sections add Device No + `DeviceFieldDefinitions` columns; Lat/Long derived after the GPS column; Status/Photos appended; one base row per inspection + one device row per saved device with the pole-level repeat set; `inspectionId` filter; empty project → empty table; headers identical regardless of which inspection has data.
  - `buildCsv`: escaping preserved; band cells repeated per covered column.
  - `buildExcelBase64`: decodes to ZIP (PK) signature; workbook round-trips via `XLSX.read`; `!merges` present for band cells; autofilter + freeze set.
  - `buildProjectPdfHtml`: `<table>` with banded `<thead>` (`colspan`), header + row values, project name title.
  - `buildInspectionPdfHtml`: sections with label/value rows, device cards under device sections, `<img>` for photos with data URIs, status + remarks present.
  - `loadInspectionFormData` against the DB mock: sections/fields/values/devices/photos shape.
  - `exportInspection` / `exportInspections`: return contract `Promise<boolean>` (false on empty; true on successful share) using the existing share mocks.
- Preview component: minimal render test if the existing component test harness allows.
- Verification: `npx tsc --noEmit`, `corepack yarn lint` (0 errors), `corepack yarn test --watch=false`.

## Out of Scope

- Per-pole report pages, print layout control beyond the styled HTML/PDF table, photos embedded in flat tables (Excel/CSV/project PDF), multi-section band grouping beyond one level, editing/export via the admin-only custom sections (`IsDefault=0`).
