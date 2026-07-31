# Reports & Export Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Reports screen (CSV / Excel / PDF project export + on-screen table preview) and single-inspection export (PDF / Excel / CSV from the Inspection List). All exports follow the Inspection Form's section hierarchy, field order, and one-row-per-device layout. Supersedes the v1 plan (flat layout, repeatable sections excluded).

**Architecture:** One query layer (`buildReportTable(projectId, inspectionId?)`) produces a banded `ReportTable` (sections → columns, base rows + device rows). Four pure formatters (`buildCsv`, `buildExcelBase64`, `buildProjectPdfHtml`, `buildInspectionPdfHtml`) feed two entry points — `exportInspections(projectId, projectName, format)` (project-wide) and `exportInspection(projectId, projectName, inspectionId, poleId, format)` (single). `loadInspectionFormData(inspectionId)` produces the form-like data for the single-inspection PDF (devices under their section, embedded photos). The Reports screen renders a live preview from the same `buildReportTable`.

**Tech Stack:** React Native (Expo) + TypeScript strict; `expo-sqlite` (single sequential connection, ADR-014); `expo-file-system/legacy`, `expo-sharing`, `expo-print` (already installed); SheetJS `xlsx` (to be added); react-native-paper.

## Global Constraints

- All code lives in `frontend/`. All commands run from `frontend/`.
- TypeScript strict mode; avoid `any`. No comments unless requested.
- `@/*` aliases to `frontend/*`.
- Yarn 1.22 via `corepack yarn` (bare `yarn` is not on PATH). `corepack yarn lint` prints npm `Unknown env config` warnings to stderr — ignore them; only the listed problems are results.
- `.npmrc` sets `save-exact=true` — `xlsx` installs pinned.
- ADR-014: never call `getGlobalDatabase()` inside the inspection/project flow. Reports stays in the project flow; `getDatabase()` serves the project DB. All data reads go through `getDatabase()`.
- **Device sections** = `IsRepeatable=1` sections whose `SectionKey` ends with `_information` (seeded: `camera_information`, `switch_information`). Device type ↔ section key mapping: `deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information" === SectionKey` (matches `DeviceSection.tsx:161`).
- **Device detail columns** come from `DeviceFieldDefinitions` (`DeviceType`, `FieldName`, `Label`, `DisplayOrder`, active). Saved device values live in `DeviceRecords.DeviceData` (JSON keyed by device `FieldName`, e.g. `CameraType`). `Device No` column = `DeviceNo`.
- **Derived columns:** split the combined `Lat/Long` field (FieldKey `gps`, value like `"12.9716, 77.5946"`) into `Latitude`/`Longitude` placed right after it. `Status` (from `Inspections.Status`) and `Photos` (comma-joined `FileName`s) are appended columns in a synthetic final section named `Summary`.
- **Repeat-on-device-row keys:** `pole_id`, `district`, `division`, `date`, `gps`, `gps_lat`, `gps_lng`, `status`. Device rows fill those plus their own device section's columns; all other cells empty.
- **DATE_AUTO fallback:** when the `date` field has no saved value, use `getCurrentInspectionDate()` from `./date`.
- **Banded headers:** section-name band row spans the section's columns — repeated per column in CSV, merged in Excel, `<th colspan>` in PDF.
- File names: `<safeName>_inspections_YYYY-MM-DD.<ext>` (project) and `<safeName>_<safePoleId>_inspection_YYYY-MM-DD.<ext>` (single); `safeName`/`safePoleId` = non-alphanumerics → `_`.
- UI copy (reused from dashboard): "No inspection data found to export for this project." and "Unable to export inspection data."
- Verification: `npx tsc --noEmit` (clean), `corepack yarn lint` (0 errors; warnings OK), `corepack yarn test --watch=false` (all suites pass). Per-file: `corepack yarn jest <file>`.
- The committed Task 1 `buildInspectionTable` (flat) is superseded and removed by Task 1 below.

---

### Task 1: `buildReportTable` banded query layer

**Files:**
- Modify: `src/utils/exportData.ts` (replace `buildInspectionTable`/`InspectionTable`; keep `exportProjectData` untouched)
- Modify: `src/__tests__/utils/exportData.test.ts`

**Interfaces produced:**
```ts
export type ExportFormat = "csv" | "excel" | "pdf";

export interface ReportColumn {
  key: string;               // FieldKey for form fields; "gps_lat" | "gps_lng" | "status" | "photos" | "device_no"; "device:<type>:<FieldName>" for device detail columns
  label: string;             // header text
  fieldId?: number;          // InspectionFields.FieldID (form fields only)
  deviceFieldName?: string;  // DeviceFieldDefinitions.FieldName (device detail columns only)
  isDeviceColumn: boolean;
  sectionIndex: number;
}
export interface ReportSection {
  index: number;
  name: string;
  sectionKey: string;
  deviceType?: string;
  columns: ReportColumn[];
}
export interface ReportRow {
  cells: string[];
  isDeviceRow: boolean;
}
export interface ReportTable {
  sections: ReportSection[];
  headers: string[];
  rows: ReportRow[];
}
export async function buildReportTable(projectId: number, inspectionId?: number): Promise<ReportTable>
export function splitLatLong(value: string): [string, string]
```

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe("buildInspectionTable", ...)` block in `src/__tests__/utils/exportData.test.ts` with:

```ts
describe("buildReportTable", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  const templateRows = [
    { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
    { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 2, FieldKey: "gps", FieldName: "Lat/Long", FieldDisplayOrder: 2 },
    { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, SectionDisplayOrder: 2, FieldID: 3, FieldKey: "camera_count", FieldName: "Camera Count", FieldDisplayOrder: 1 },
  ];

  const deviceDefs = [
    { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", DisplayOrder: 1 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("builds banded sections and full headers in form order", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([])   // inspections
      .mockResolvedValueOnce([])   // values
      .mockResolvedValueOnce([])   // device records
      .mockResolvedValueOnce([]);  // photos

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.sections.map((s) => s.name)).toEqual([
      "General Information",
      "Camera Information",
      "Summary",
    ]);
    expect(table.headers).toEqual([
      "Pole ID", "Lat/Long", "Latitude", "Longitude",
      "Camera Count", "Device No", "Camera Type",
      "Status", "Photos",
    ]);
    expect(table.rows).toEqual([]);
  });

  it("fills one base row per inspection and derives Latitude/Longitude and Status/Photos", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([
        { InspectionID: 1, Status: "Completed" },
        { InspectionID: 2, Status: "Draft" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
        { InspectionID: 2, FieldID: 1, FieldValue: "P002" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { InspectionID: 1, FileName: "p1.jpg" },
        { InspectionID: 1, FileName: "p2.jpg" },
      ]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "", "", "", "Completed", "p1.jpg, p2.jpg"], isDeviceRow: false },
      { cells: ["P002", "", "", "", "", "", "", "Draft", ""], isDeviceRow: false },
    ]);
  });

  it("emits one device row per saved device repeating pole-level columns", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
        { InspectionID: 1, FieldID: 3, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: JSON.stringify({ CameraType: "PTZ" }) },
      ])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "2", "", "", "Completed", ""], isDeviceRow: false },
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "2", "1", "IP", "Completed", ""], isDeviceRow: true },
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "2", "2", "PTZ", "Completed", ""], isDeviceRow: true },
    ]);
  });

  it("keeps headers stable regardless of which inspection has data", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 2, Status: "Draft" }])
      .mockResolvedValueOnce([{ InspectionID: 2, FieldID: 1, FieldValue: "P002" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.headers).toEqual([
      "Pole ID", "Lat/Long", "Latitude", "Longitude",
      "Camera Count", "Device No", "Camera Type",
      "Status", "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P002", "", "", "", "", "", "", "Draft", ""], isDeviceRow: false },
    ]);
  });

  it("filters to a single inspection when inspectionId is given", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, 1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "", "", "", "Completed", ""], isDeviceRow: false },
    ]);
  });
});

describe("splitLatLong", () => {
  it("splits a combined GPS value into latitude and longitude", () => {
    const { splitLatLong } = require("@/src/utils/exportData");
    expect(splitLatLong("12.9716, 77.5946")).toEqual(["12.9716", "77.5946"]);
    expect(splitLatLong("12.9716")).toEqual(["12.9716", ""]);
    expect(splitLatLong("")).toEqual(["", ""]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: FAIL — `buildReportTable is not a function` / `splitLatLong is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/utils/exportData.ts`:
- Delete the `InspectionTable` interface and the whole `buildInspectionTable` function (lines 5-66 of the current file).
- Add the imports at the top:

```ts
import { getCurrentInspectionDate } from "./date";
```

- Add the types, helpers, and builder:

```ts
export type ExportFormat = "csv" | "excel" | "pdf";

export interface ReportColumn {
  key: string;
  label: string;
  fieldId?: number;
  deviceFieldName?: string;
  isDeviceColumn: boolean;
  sectionIndex: number;
}

export interface ReportSection {
  index: number;
  name: string;
  sectionKey: string;
  deviceType?: string;
  columns: ReportColumn[];
}

export interface ReportRow {
  cells: string[];
  isDeviceRow: boolean;
}

export interface ReportTable {
  sections: ReportSection[];
  headers: string[];
  rows: ReportRow[];
}

const REPEAT_ON_DEVICE_ROWS = new Set([
  "pole_id",
  "district",
  "division",
  "date",
  "gps",
  "gps_lat",
  "gps_lng",
  "status",
]);

function normalizeDeviceType(deviceType: string): string {
  return deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information";
}

export function splitLatLong(value: string): [string, string] {
  if (!value) return ["", ""];
  const comma = value.indexOf(",");
  if (comma === -1) return [value.trim(), ""];
  return [value.slice(0, comma).trim(), value.slice(comma + 1).trim()];
}

export async function buildReportTable(projectId: number, inspectionId?: number): Promise<ReportTable> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    SectionID: number;
    SectionKey: string;
    SectionName: string;
    IsRepeatable: number;
    FieldID: number;
    FieldKey: string;
    FieldName: string;
  }>(
    `SELECT s.SectionID, s.SectionKey, s.SectionName, s.IsRepeatable,
            f.FieldID, f.FieldKey, f.FieldName
     FROM InspectionFields f
     JOIN InspectionSections s ON f.SectionID = s.SectionID
     WHERE f.IsActive = 1 AND f.IsVisible = 1
       AND s.IsActive = 1 AND s.IsVisible = 1
       AND s.SectionKey != 'photos'
     ORDER BY s.DisplayOrder, f.DisplayOrder`
  );

  const deviceDefs = await db.getAllAsync<{
    DeviceType: string;
    FieldName: string;
    Label: string;
  }>(
    `SELECT DeviceType, FieldName, Label
     FROM DeviceFieldDefinitions
     WHERE IsActive = 1
     ORDER BY DeviceType, DisplayOrder`
  );

  const defsByType = new Map<string, { FieldName: string; Label: string }[]>();
  for (const d of deviceDefs) {
    if (!defsByType.has(d.DeviceType)) defsByType.set(d.DeviceType, []);
    defsByType.get(d.DeviceType)!.push({ FieldName: d.FieldName, Label: d.Label });
  }

  const deviceTypes = [...defsByType.keys()];
  const gpsFieldId = rows.find((r) => r.FieldKey === "gps")?.FieldID;

  const sections: ReportSection[] = [];
  const sectionsById = new Map<number, ReportSection>();
  for (const r of rows) {
    let section = sectionsById.get(r.SectionID);
    if (!section) {
      section = { index: sections.length, name: r.SectionName, sectionKey: r.SectionKey, columns: [] };
      sectionsById.set(r.SectionID, section);
      sections.push(section);
    }
    section.columns.push({
      key: r.FieldKey,
      label: r.FieldName,
      fieldId: r.FieldID,
      isDeviceColumn: false,
      sectionIndex: section.index,
    });
    if (r.FieldKey === "gps") {
      section.columns.push(
        { key: "gps_lat", label: "Latitude", isDeviceColumn: false, sectionIndex: section.index },
        { key: "gps_lng", label: "Longitude", isDeviceColumn: false, sectionIndex: section.index }
      );
    }
  }

  // Attach device detail columns to repeatable <type>_information sections.
  for (const section of sections) {
    if (!section.sectionKey.endsWith("_information")) continue;
    const deviceType = deviceTypes.find((t) => normalizeDeviceType(t) === section.sectionKey);
    if (!deviceType) continue;
    section.deviceType = deviceType;
    section.columns.push({ key: "device_no", label: "Device No", isDeviceColumn: true, sectionIndex: section.index });
    for (const def of defsByType.get(deviceType) ?? []) {
      section.columns.push({
        key: `device:${deviceType}:${def.FieldName}`,
        label: def.Label,
        deviceFieldName: def.FieldName,
        isDeviceColumn: true,
        sectionIndex: section.index,
      });
    }
  }

  const summary: ReportSection = {
    index: sections.length,
    name: "Summary",
    columns: [
      { key: "status", label: "Status", isDeviceColumn: false, sectionIndex: sections.length },
      { key: "photos", label: "Photos", isDeviceColumn: false, sectionIndex: sections.length },
    ],
  };
  sections.push(summary);

  const allColumns: ReportColumn[] = [];
  for (const s of sections) allColumns.push(...s.columns);

  const headers = allColumns.map((c) => c.label);

  const inspections = await db.getAllAsync<{ InspectionID: number; Status: string }>(
    inspectionId
      ? `SELECT InspectionID, Status FROM Inspections WHERE InspectionID = ?`
      : `SELECT InspectionID, Status FROM Inspections WHERE ProjectID = ? ORDER BY InspectionID`,
    [inspectionId ?? projectId]
  );

  const values = await db.getAllAsync<{ InspectionID: number; FieldID: number; FieldValue: string | null }>(
    inspectionId
      ? `SELECT InspectionID, FieldID, FieldValue FROM InspectionValues WHERE InspectionID = ?`
      : `SELECT v.InspectionID, v.FieldID, v.FieldValue FROM InspectionValues v JOIN Inspections i ON v.InspectionID = i.InspectionID WHERE i.ProjectID = ?`,
    [inspectionId ?? projectId]
  );

  const records = await db.getAllAsync<{ InspectionID: number; DeviceType: string; DeviceNo: number; DeviceData: string | null }>(
    inspectionId
      ? `SELECT InspectionID, DeviceType, DeviceNo, DeviceData FROM DeviceRecords WHERE InspectionID = ? AND IsActive = 1 ORDER BY DeviceType, DeviceNo`
      : `SELECT r.InspectionID, r.DeviceType, r.DeviceNo, r.DeviceData FROM DeviceRecords r JOIN Inspections i ON r.InspectionID = i.InspectionID WHERE i.ProjectID = ? AND r.IsActive = 1 ORDER BY r.DeviceType, r.DeviceNo`,
    [inspectionId ?? projectId]
  );

  const photos = await db.getAllAsync<{ InspectionID: number; FileName: string }>(
    inspectionId
      ? `SELECT InspectionID, FileName FROM Photos WHERE InspectionID = ? ORDER BY PhotoID`
      : `SELECT p.InspectionID, p.FileName FROM Photos p JOIN Inspections i ON p.InspectionID = i.InspectionID WHERE i.ProjectID = ? ORDER BY p.PhotoID`,
    [inspectionId ?? projectId]
  );

  const valueMapByInspection = new Map<number, Map<number, string>>();
  for (const v of values) {
    if (!valueMapByInspection.has(v.InspectionID)) valueMapByInspection.set(v.InspectionID, new Map());
    valueMapByInspection.get(v.InspectionID)!.set(v.FieldID, v.FieldValue ?? "");
  }

  const recordsByInspection = new Map<number, typeof records>();
  for (const r of records) {
    if (!recordsByInspection.has(r.InspectionID)) recordsByInspection.set(r.InspectionID, []);
    recordsByInspection.get(r.InspectionID)!.push(r);
  }

  const photosByInspection = new Map<number, string[]>();
  for (const p of photos) {
    if (!photosByInspection.has(p.InspectionID)) photosByInspection.set(p.InspectionID, []);
    photosByInspection.get(p.InspectionID)!.push(p.FileName);
  }

  const dateFallback = getCurrentInspectionDate();

  const rowsOut: ReportRow[] = [];

  for (const insp of inspections) {
    const valueMap = valueMapByInspection.get(insp.InspectionID) ?? new Map<number, string>();
    const gpsValue = valueMap.get(gpsFieldId ?? -1) ?? "";
    const [lat, lng] = splitLatLong(gpsValue);
    const photoList = photosByInspection.get(insp.InspectionID) ?? [];

    const baseRow: string[] = allColumns.map((c) => {
      if (c.isDeviceColumn) return "";
      if (c.key === "status") return insp.Status;
      if (c.key === "photos") return photoList.join(", ");
      if (c.key === "gps") return gpsValue;
      if (c.key === "gps_lat") return lat;
      if (c.key === "gps_lng") return lng;
      if (c.key === "date") return valueMap.get(c.fieldId ?? -1) || dateFallback;
      return valueMap.get(c.fieldId ?? -1) ?? "";
    });
    rowsOut.push({ cells: baseRow, isDeviceRow: false });

    const inspRecords = recordsByInspection.get(insp.InspectionID) ?? [];
    const recordsByType = new Map<string, typeof inspRecords>();
    for (const rec of inspRecords) {
      if (!recordsByType.has(rec.DeviceType)) recordsByType.set(rec.DeviceType, []);
      recordsByType.get(rec.DeviceType)!.push(rec);
    }

    for (const section of sections) {
      if (!section.deviceType) continue;
      const sectionRecords = recordsByType.get(section.deviceType) ?? [];
      for (const rec of sectionRecords) {
        const data = parseDeviceData(rec.DeviceData);
        const cells: string[] = allColumns.map((c) => {
          if (c.sectionIndex === section.index) {
            if (c.key === "device_no") return String(rec.DeviceNo);
            if (c.isDeviceColumn) return data[c.deviceFieldName ?? ""] ?? "";
            return valueMap.get(c.fieldId ?? -1) ?? "";
          }
          if (REPEAT_ON_DEVICE_ROWS.has(c.key)) {
            if (c.key === "status") return insp.Status;
            if (c.key === "gps") return gpsValue;
            if (c.key === "gps_lat") return lat;
            if (c.key === "gps_lng") return lng;
            if (c.key === "date") return valueMap.get(c.fieldId ?? -1) || dateFallback;
            return valueMap.get(c.fieldId ?? -1) ?? "";
          }
          return "";
        });
        rowsOut.push({ cells, isDeviceRow: true });
      }
    }
  }

  return { sections, headers, rows: rowsOut };
}
```

Add this helper at the bottom of `src/utils/exportData.ts` (above `exportProjectData`):

```ts
function parseDeviceData(data: string | null): Record<string, string> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: PASS (all existing `exportProjectData` tests still pass too).

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exportData.ts src/__tests__/utils/exportData.test.ts
git commit -m "feat: add banded buildReportTable with device rows and derived columns"
```

---

### Task 2: CSV + Excel builders and `exportInspections` (project-wide)

**Files:**
- Create: `src/types/xlsx.d.ts`
- Modify: `src/utils/exportData.ts`
- Modify: `src/__tests__/utils/exportData.test.ts`
- Modify: `package.json` / `yarn.lock` (xlsx)

**Interfaces produced:**
```ts
export function buildCsv(table: ReportTable): string
export function buildExcelBase64(table: ReportTable): string
export async function exportInspections(projectId: number, projectName: string, format: ExportFormat): Promise<boolean>
```
Internal: `buildFileName(projectName, poleId, ext)`, `writeAndShare(...)`, `shareTableFile(...)`. `exportProjectData` stays (removed in Task 7).

- [ ] **Step 1: Install SheetJS and add a type declaration**

Run: `corepack yarn add xlsx`
Expected: pinned version added to `package.json` (`.npmrc` `save-exact=true`).

Create `src/types/xlsx.d.ts`:

```ts
declare module "xlsx" {
  export interface CellAddress {
    r: number;
    c: number;
  }
  export interface Range {
    s: CellAddress;
    e: CellAddress;
  }
  export interface WorkSheet {
    [key: string]: unknown;
  }
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }
  export const utils: {
    aoa_to_sheet(data: (string | number)[][]): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name: string): void;
    sheet_to_json<T = Record<string, unknown>>(ws: WorkSheet, opts?: unknown): T[];
    encode_range(range: Range): string;
  };
  export function write(wb: WorkBook, opts: { type: "base64"; bookType: "xlsx" }): string;
  export function read(data: unknown, opts: { type: "buffer" }): WorkBook;
}
```

- [ ] **Step 2: Write the failing tests**

First add to `src/__tests__/utils/exportData.test.ts` (top, after existing mocks):
```ts
jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: "file:///mock/cache/print.pdf" }),
}));
import * as XLSX from "xlsx";
import * as Print from "expo-print";
```
Also add `copyAsync: jest.fn().mockResolvedValue(undefined),` to the `jest.mock("expo-file-system/legacy", ...)` object.

Append:

```ts
function sampleTable(): ReportTableLike {
  return {
    sections: [
      { index: 0, name: "General Information", sectionKey: "general_information", columns: [
        { key: "pole_id", label: "Pole ID", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps", label: "Lat/Long", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps_lat", label: "Latitude", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps_lng", label: "Longitude", isDeviceColumn: false, sectionIndex: 0 },
      ]},
      { index: 1, name: "Camera Information", sectionKey: "camera_information", deviceType: "Camera", columns: [
        { key: "camera_count", label: "Camera Count", isDeviceColumn: false, sectionIndex: 1 },
        { key: "device_no", label: "Device No", isDeviceColumn: true, sectionIndex: 1 },
        { key: "device:Camera:CameraType", label: "Camera Type", deviceFieldName: "CameraType", isDeviceColumn: true, sectionIndex: 1 },
      ]},
      { index: 2, name: "Summary", sectionKey: "summary", columns: [
        { key: "status", label: "Status", isDeviceColumn: false, sectionIndex: 2 },
        { key: "photos", label: "Photos", isDeviceColumn: false, sectionIndex: 2 },
      ]},
    ],
    headers: ["Pole ID", "Lat/Long", "Latitude", "Longitude", "Camera Count", "Device No", "Camera Type", "Status", "Photos"],
    rows: [
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "", "", "Completed", "p1.jpg"], isDeviceRow: false },
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "1", "IP", "Completed", ""], isDeviceRow: true },
    ],
  };
}

describe("buildCsv", () => {
  it("emits a band row, a header row, and data rows with CSV escaping", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const csv = buildCsv(sampleTable());
    const lines = csv.split("\n");
    expect(lines[0]).toContain("General Information");
    expect(lines[1].split(",")).toEqual([
      "Pole ID", "Lat/Long", "Latitude", "Longitude",
      "Camera Count", "Device No", "Camera Type", "Status", "Photos",
    ]);
    expect(lines[2]).toContain("P001");
  });

  it("escapes commas, quotes, and newlines", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["1,2", 'say "hi"', "line1\nline2", "", "", "", "", "", ""], isDeviceRow: false }] };
    const csv = buildCsv(table);
    expect(csv).toContain('"1,2"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("prefixes formula injection cells with a single quote", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["=SUM(1,2)", "", "", "", "", "", "", "", ""], isDeviceRow: false }] };
    const csv = buildCsv(table);
    expect(csv).toContain("'=SUM(1,2)");
  });
});

describe("buildExcelBase64", () => {
  it("produces a valid xlsx with band merges that round-trips", () => {
    const { buildExcelBase64 } = require("@/src/utils/exportData");
    const base64 = buildExcelBase64(sampleTable());

    const buf = Buffer.from(base64, "base64");
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K

    const workbook = XLSX.read(buf, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });
    expect(json[0]).toEqual(["General Information", "General Information", "General Information", "General Information", "Camera Information", "Camera Information", "Camera Information", "Summary", "Summary"]);
    expect(json[1]).toEqual(sampleTable().headers);
    expect(json[2]).toEqual(["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "", "", "Completed", "p1.jpg"]);
    expect(json[3]).toEqual(["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "1", "IP", "Completed", ""]);
    expect(Array.isArray(sheet["!merges"]) && sheet["!merges"].length).toBeGreaterThan(0);
  });
});
```

Append a new `describe("exportInspections")` block (there is no v1 `exportInspections` block in the current test file — only `exportProjectData` and `buildInspectionTable`):

```ts
describe("exportInspections", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("exports CSV with a band row and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([]) // sections+fields (empty template -> Summary only)
      .mockResolvedValueOnce([]) // device defs
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([]) // values
      .mockResolvedValueOnce([]) // records
      .mockResolvedValueOnce([]); // photos

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "csv");

    expect(result).toBe(true);
    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(writeCall[1]).toContain("Summary");
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("returns false when no inspections exist", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(999, "EmptyProject", "csv");

    expect(result).toBe(false);
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("exports Excel as base64 with Base64 encoding and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "excel");

    expect(result).toBe(true);
    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(writeCall[2].encoding).toBe(FileSystem.EncodingType.Base64);
    expect(writeCall[1]).toMatch(/^UEsDB/);
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("returns false when sharing is unavailable", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    setSharingAvailable(false);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "csv");

    expect(result).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
```

> Note: the `sampleTable()` / `buildExcelBase64` tests use a local `ReportTableLike` type. Add to the test file:

```ts
interface ReportTableLike {
  sections: { index: number; name: string; sectionKey: string; deviceType?: string; columns: { key: string; label: string; fieldId?: number; deviceFieldName?: string; isDeviceColumn: boolean; sectionIndex: number }[] }[];
  headers: string[];
  rows: { cells: string[]; isDeviceRow: boolean }[];
}
```

`sampleTable()` and the new `describe("exportInspections")` block reference this type; `buildReportTable`'s return type is structurally compatible with it.

- [ ] **Step 3: Run test to verify it fails**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: FAIL — `buildCsv is not a function` / `buildExcelBase64 is not a function` / `exportInspections is not a function`.

- [ ] **Step 4: Write the implementation**

Add to `src/utils/exportData.ts` (top): `import * as XLSX from "xlsx";`

Add after `splitLatLong`:

```ts
function escapeCell(cell: string): string {
  const escaped = cell.replace(/"/g, '""');
  const safe = /^[=+\-@\t]/.test(escaped) ? "'" + escaped : escaped;
  return safe.includes(",") || safe.includes('"') || safe.includes("\n") ? `"${safe}"` : safe;
}

function bandRowOf(table: ReportTable): string[] {
  return table.sections.flatMap((s) => s.columns.map(() => s.name));
}

export function buildCsv(table: ReportTable): string {
  const lines = [bandRowOf(table), table.headers, ...table.rows.map((r) => r.cells)];
  return lines.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function buildExcelBase64(table: ReportTable): string {
  const aoa: (string | number)[][] = [bandRowOf(table), table.headers, ...table.rows.map((r) => r.cells)];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let col = 0;
  for (const s of table.sections) {
    if (s.columns.length > 1) {
      merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + s.columns.length - 1 } });
    }
    col += s.columns.length;
  }
  if (merges.length > 0) worksheet["!merges"] = merges;

  const lastRow = aoa.length - 1;
  const lastCol = aoa[0].length - 1;
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } }) };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 2 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inspections");
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
}
```

Add at the bottom of the file (before `exportProjectData`):

```ts
function buildFileName(projectName: string, poleId: string | null, ext: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  if (poleId) {
    const safePoleId = poleId.replace(/[^a-zA-Z0-9]/g, "_");
    return `${safeName}_${safePoleId}_inspection_${date}.${ext}`;
  }
  return `${safeName}_inspections_${date}.${ext}`;
}

async function writeAndShare(fileUri: string, mimeType: string, dialogTitle: string, uti: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle, UTI: uti });
  return true;
}

async function shareTableFile(table: ReportTable, projectName: string, poleId: string | null, format: "csv" | "excel"): Promise<boolean> {
  const ext = format === "csv" ? "csv" : "xlsx";
  const fileUri = FileSystem.documentDirectory + buildFileName(projectName, poleId, ext);
  const dialogTitle = poleId ? `Export ${poleId} Inspection` : `Export ${projectName} Inspection Data`;
  if (format === "csv") {
    await FileSystem.writeAsStringAsync(fileUri, buildCsv(table), { encoding: FileSystem.EncodingType.UTF8 });
    return writeAndShare(fileUri, "text/csv", dialogTitle, "public.comma-separated-values-text");
  }
  await FileSystem.writeAsStringAsync(fileUri, buildExcelBase64(table), { encoding: FileSystem.EncodingType.Base64 });
  return writeAndShare(
    fileUri,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle,
    "org.openxmlformats.spreadsheetml.sheet"
  );
}

export async function exportInspections(projectId: number, projectName: string, format: ExportFormat): Promise<boolean> {
  const table = await buildReportTable(projectId);
  if (!table.rows.some((r) => !r.isDeviceRow)) return false;
  if (format === "pdf") {
    return sharePdfFile(buildProjectPdfHtml(table, projectName), projectName, null);
  }
  return shareTableFile(table, projectName, null, format);
}
```

> **Note:** `sharePdfFile` and `buildProjectPdfHtml` are added in Task 3. Until then `exportInspections("pdf")` will not compile. To keep Task 2 green, implement `sharePdfFile`/`buildProjectPdfHtml` stubs now (throw or return false) OR defer the `pdf` branch; simplest: in Task 2, have the `pdf` branch call a not-yet-existing function — so instead, add the full PDF implementation in Task 2's commit as a stub:

```ts
async function sharePdfFile(_html: string, _projectName: string, _poleId: string | null): Promise<boolean> {
  return false;
}
```

and remove it once Task 3 lands. (The Task 2 tests never invoke the `pdf` branch.)

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify types and lint**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/xlsx.d.ts src/utils/exportData.ts src/__tests__/utils/exportData.test.ts package.json yarn.lock
git commit -m "feat: add banded CSV and Excel xlsx export via SheetJS"
```

---

### Task 3: Project-wide PDF export

**Files:**
- Modify: `src/utils/exportData.ts`
- Modify: `src/__tests__/utils/exportData.test.ts`

**Interfaces produced:**
```ts
export function buildProjectPdfHtml(table: ReportTable, projectName: string): string
```
Internal `sharePdfFile(html, projectName, poleId)`. Replace the stub from Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/utils/exportData.test.ts`:

```ts
describe("buildProjectPdfHtml", () => {
  it("renders banded thead, a row value, and the project title", () => {
    const { buildProjectPdfHtml } = require("@/src/utils/exportData");
    const html = buildProjectPdfHtml(sampleTable(), "North Grid");
    expect(html).toContain("<table>");
    expect(html).toContain('<th colspan="4">General Information</th>');
    expect(html).toContain("<th>Pole ID</th>");
    expect(html).toContain("<td>P001</td>");
    expect(html).toContain("North Grid");
  });

  it("escapes HTML in headers and cells", () => {
    const { buildProjectPdfHtml } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["<script>alert(1)</script>", "", "", "", "", "", "", "", ""], isDeviceRow: false }] };
    const html = buildProjectPdfHtml(table, "North");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

Inside the `describe("exportInspections")` block add:

```ts
  it("exports PDF by printing HTML then copying and sharing", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "pdf");

    expect(result).toBe(true);
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(FileSystem.copyAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: FAIL — `buildProjectPdfHtml is not a function` and/or the PDF branch returns `false`.

- [ ] **Step 3: Write the implementation**

Add to `src/utils/exportData.ts` (top): `import * as Print from "expo-print";`

Add:

```ts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildProjectPdfHtml(table: ReportTable, projectName: string): string {
  const bandRow = table.sections
    .map((s) => `<th colspan="${s.columns.length}">${escapeHtml(s.name)}</th>`)
    .join("");
  const headerRow = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = table.rows
    .map((r) => `<tr>${r.cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: sans-serif; }
    h1 { font-size: 18px; }
    table { border-collapse: collapse; width: 100%; font-size: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px; text-align: left; }
    th { background: #eee; }
  </style>
</head>
<body>
  <h1>${escapeHtml(projectName)} - Inspection Report</h1>
  <table>
    <thead><tr>${bandRow}</tr><tr>${headerRow}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}
```

Replace the Task 2 stub with the real one:

```ts
async function sharePdfFile(html: string, projectName: string, poleId: string | null): Promise<boolean> {
  const fileUri = FileSystem.documentDirectory + buildFileName(projectName, poleId, "pdf");
  const dialogTitle = poleId ? `Export ${poleId} Inspection` : `Export ${projectName} Inspection Data`;
  const { uri } = await Print.printToFileAsync({ html });
  await FileSystem.copyAsync({ from: uri, to: fileUri });
  return writeAndShare(fileUri, "application/pdf", dialogTitle, "com.adobe.pdf");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exportData.ts src/__tests__/utils/exportData.test.ts
git commit -m "feat: add project-wide PDF report export"
```

---

### Task 4: Single-inspection export (form-like PDF, filtered CSV/Excel)

**Files:**
- Modify: `src/utils/exportData.ts`
- Modify: `src/__tests__/utils/exportData.test.ts`

**Interfaces produced:**
```ts
export interface InspectionFormField { label: string; value: string }
export interface InspectionFormDevice { title: string; fields: InspectionFormField[] }
export interface InspectionFormSection {
  name: string;
  sectionKey: string;
  deviceType?: string;
  fields: InspectionFormField[];
  devices: InspectionFormDevice[];
}
export interface InspectionFormData {
  poleId: string;
  status: string;
  date: string;
  sections: InspectionFormSection[];
  photos: { fileName: string; dataUri: string | null }[];
}
export async function loadInspectionFormData(inspectionId: number): Promise<InspectionFormData>
export function buildInspectionPdfHtml(formData: InspectionFormData, projectName: string): string
export async function exportInspection(
  projectId: number,
  projectName: string,
  inspectionId: number,
  poleId: string,
  format: ExportFormat
): Promise<boolean>
```

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/utils/exportData.test.ts`:

```ts
describe("loadInspectionFormData", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("loads sections, values, devices, and photos in form order", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID" },
        { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count" },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldValue: "P001" },
        { FieldID: 2, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type" },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
      ])
      .mockResolvedValueOnce([
        { FileName: "p1.jpg", FilePath: "file:///photos/p1.jpg" },
      ]);
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    const { loadInspectionFormData } = require("@/src/utils/exportData");
    const form = await loadInspectionFormData(1);

    expect(form.poleId).toBe("P001");
    expect(form.status).toBe("Completed");
    expect(form.sections[0].fields).toEqual([{ label: "Pole ID", value: "P001" }]);
    expect(form.sections[1].deviceType).toBe("Camera");
    expect(form.sections[1].devices).toEqual([
      { title: "Camera 1", fields: [
        { label: "Device No", value: "1" },
        { label: "Camera Type", value: "IP" },
      ] },
    ]);
    expect(form.photos.length).toBe(1);
    expect(form.photos[0].fileName).toBe("p1.jpg");
    expect(form.photos[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("degrades to null dataUri when a photo cannot be read", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { FileName: "missing.jpg", FilePath: "file:///photos/missing.jpg" },
      ]);
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error("not found"));

    const { loadInspectionFormData } = require("@/src/utils/exportData");
    const form = await loadInspectionFormData(1);

    expect(form.photos[0].dataUri).toBeNull();
  });
});

describe("buildInspectionPdfHtml", () => {
  it("renders meta, sections with device cards, and embedded photos", () => {
    const { buildInspectionPdfHtml } = require("@/src/utils/exportData");
    const form: InspectionFormDataLike = {
      poleId: "P001",
      status: "Completed",
      date: "31-Jul-2026",
      sections: [
        {
          name: "General Information",
          sectionKey: "general_information",
          fields: [{ label: "Pole ID", value: "P001" }],
          devices: [],
        },
        {
          name: "Camera Information",
          sectionKey: "camera_information",
          deviceType: "Camera",
          fields: [{ label: "Camera Count", value: "1" }],
          devices: [{ title: "Camera 1", fields: [{ label: "Camera Type", value: "IP" }] }],
        },
      ],
      photos: [{ fileName: "p1.jpg", dataUri: "data:image/jpeg;base64,QUJD" }],
    };
    const html = buildInspectionPdfHtml(form, "North Grid");

    expect(html).toContain("North Grid");
    expect(html).toContain("P001");
    expect(html).toContain("Camera Information");
    expect(html).toContain("Camera 1");
    expect(html).toContain("data:image/jpeg;base64,QUJD");
  });
});

describe("exportInspection", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("exports a single inspection as CSV (filtered table) and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([{ InspectionID: 1, FieldID: 1, FieldValue: "P001" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspection } = require("@/src/utils/exportData");
    const result = await exportInspection(1, "TestProject", 1, "P001", "csv");

    expect(result).toBe(true);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("exports a single inspection as PDF using the form-like HTML", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]); // remaining loadInspectionFormData queries resolve empty
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    const { exportInspection } = require("@/src/utils/exportData");
    const result = await exportInspection(1, "TestProject", 1, "P001", "pdf");

    expect(result).toBe(true);
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("returns false when the inspection has no rows", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspection } = require("@/src/utils/exportData");
    const result = await exportInspection(1, "TestProject", 999, "NONE", "csv");

    expect(result).toBe(false);
  });
});
```

Add the type for the test fixture near `ReportTableLike`:

```ts
interface InspectionFormDataLike {
  poleId: string;
  status: string;
  date: string;
  sections: {
    name: string;
    sectionKey: string;
    deviceType?: string;
    fields: { label: string; value: string }[];
    devices: { title: string; fields: { label: string; value: string }[] }[];
  }[];
  photos: { fileName: string; dataUri: string | null }[];
}
```

> Note: the default `readAsStringAsync` mock currently rejects; the first photo test overrides it to resolve. Set the default in the `jest.mock("expo-file-system/legacy", ...)` object to resolve `"QUJD"` and override per-test with `mockRejectedValueOnce` where needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: FAIL — functions missing.

- [ ] **Step 3: Write the implementation**

Add to `src/utils/exportData.ts`:

```ts
export interface InspectionFormField {
  label: string;
  value: string;
}

export interface InspectionFormDevice {
  title: string;
  fields: InspectionFormField[];
}

export interface InspectionFormSection {
  name: string;
  sectionKey: string;
  deviceType?: string;
  fields: InspectionFormField[];
  devices: InspectionFormDevice[];
}

export interface InspectionFormData {
  poleId: string;
  status: string;
  date: string;
  sections: InspectionFormSection[];
  photos: { fileName: string; dataUri: string | null }[];
}

function parseDeviceData(data: string | null): Record<string, string> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function readPhotoDataUri(filePath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
  const mime = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

export async function loadInspectionFormData(inspectionId: number): Promise<InspectionFormData> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    SectionID: number;
    SectionKey: string;
    SectionName: string;
    IsRepeatable: number;
    FieldID: number;
    FieldKey: string;
    FieldName: string;
  }>(
    `SELECT s.SectionID, s.SectionKey, s.SectionName, s.IsRepeatable,
            f.FieldID, f.FieldKey, f.FieldName
     FROM InspectionFields f
     JOIN InspectionSections s ON f.SectionID = s.SectionID
     WHERE f.IsActive = 1 AND f.IsVisible = 1
       AND s.IsActive = 1 AND s.IsVisible = 1
       AND s.SectionKey != 'photos'
     ORDER BY s.DisplayOrder, f.DisplayOrder`
  );

  const valueRows = await db.getAllAsync<{ FieldID: number; FieldValue: string | null }>(
    `SELECT FieldID, FieldValue FROM InspectionValues WHERE InspectionID = ?`,
    [inspectionId]
  );
  const valueMap = new Map<number, string>();
  for (const v of valueRows) valueMap.set(v.FieldID, v.FieldValue ?? "");

  const deviceDefs = await db.getAllAsync<{ DeviceType: string; FieldName: string; Label: string }>(
    `SELECT DeviceType, FieldName, Label FROM DeviceFieldDefinitions WHERE IsActive = 1 ORDER BY DeviceType, DisplayOrder`
  );
  const defsByType = new Map<string, { FieldName: string; Label: string }[]>();
  for (const d of deviceDefs) {
    if (!defsByType.has(d.DeviceType)) defsByType.set(d.DeviceType, []);
    defsByType.get(d.DeviceType)!.push({ FieldName: d.FieldName, Label: d.Label });
  }
  const deviceTypes = [...defsByType.keys()];

  const recordRows = await db.getAllAsync<{ DeviceType: string; DeviceNo: number; DeviceData: string | null }>(
    `SELECT DeviceType, DeviceNo, DeviceData FROM DeviceRecords WHERE InspectionID = ? AND IsActive = 1 ORDER BY DeviceType, DeviceNo`,
    [inspectionId]
  );
  const recordsByType = new Map<string, typeof recordRows>();
  for (const rec of recordRows) {
    if (!recordsByType.has(rec.DeviceType)) recordsByType.set(rec.DeviceType, []);
    recordsByType.get(rec.DeviceType)!.push(rec);
  }

  const insp = await db.getFirstAsync<{ Status: string }>(
    `SELECT Status FROM Inspections WHERE InspectionID = ?`,
    [inspectionId]
  );

  const photoRows = await db.getAllAsync<{ FileName: string; FilePath: string }>(
    `SELECT FileName, FilePath FROM Photos WHERE InspectionID = ? ORDER BY PhotoID`,
    [inspectionId]
  );

  const dateFallback = getCurrentInspectionDate();

  let poleId = "";
  const sections: InspectionFormSection[] = [];
  const sectionsByKey = new Map<string, InspectionFormSection>();

  for (const r of rows) {
    let section = sectionsByKey.get(r.SectionKey);
    if (!section) {
      section = { name: r.SectionName, sectionKey: r.SectionKey, fields: [], devices: [] };
      if (r.IsRepeatable === 1) {
        section.deviceType = deviceTypes.find((t) => normalizeDeviceType(t) === r.SectionKey);
      }
      sectionsByKey.set(r.SectionKey, section);
      sections.push(section);
    }
    let value = valueMap.get(r.FieldID) ?? "";
    if (r.FieldKey === "date" && !value) value = dateFallback;
    if (r.FieldKey === "pole_id") poleId = value;
    section.fields.push({ label: r.FieldName, value });
  }

  for (const section of sections) {
    if (!section.deviceType) continue;
    const records = recordsByType.get(section.deviceType) ?? [];
    for (const rec of records) {
      const data = parseDeviceData(rec.DeviceData);
      const fields: InspectionFormField[] = [{ label: "Device No", value: String(rec.DeviceNo) }];
      for (const def of defsByType.get(section.deviceType) ?? []) {
        fields.push({ label: def.Label, value: data[def.FieldName] ?? "" });
      }
      section.devices.push({ title: `${section.deviceType} ${rec.DeviceNo}`, fields });
    }
  }

  const photos: { fileName: string; dataUri: string | null }[] = [];
  for (const p of photoRows) {
    const dataUri = await readPhotoDataUri(p.FilePath).catch(() => null);
    photos.push({ fileName: p.FileName, dataUri });
  }

  return {
    poleId,
    status: insp?.Status ?? "",
    date: valueMap.get(dateFieldId(rows)) ?? dateFallback,
    sections,
    photos,
  };
}

function dateFieldId(rows: { FieldKey: string; FieldID: number }[]): number {
  return rows.find((r) => r.FieldKey === "date")?.FieldID ?? -1;
}
```

> **Note:** the returned `date` uses the saved value when present; `dateFieldId` resolves it. This keeps `buildInspectionPdfHtml` independent of the form rows.

Add `buildInspectionPdfHtml`:

```ts
export function buildInspectionPdfHtml(formData: InspectionFormData, projectName: string): string {
  const metaRows = [
    ["Pole ID", formData.poleId],
    ["Inspection Date", formData.date],
    ["Status", formData.status],
  ]
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("");

  const sectionsHtml = formData.sections
    .map((s) => {
      const fieldRows = s.fields
        .map((f) => `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(f.value)}</td></tr>`)
        .join("");
      const devicesHtml = s.devices
        .map(
          (d) =>
            `<div class="device"><h4>${escapeHtml(d.title)}</h4><table>${d.fields
              .map((f) => `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(f.value)}</td></tr>`)
              .join("")}</table></div>`
        )
        .join("");
      return `<div class="section"><h3>${escapeHtml(s.name)}</h3><table>${fieldRows}</table>${devicesHtml}</div>`;
    })
    .join("");

  const photosHtml =
    formData.photos.length === 0
      ? "<p>No photos captured.</p>"
      : `<div class="photos">${formData.photos
          .map((p) =>
            p.dataUri
              ? `<img src="${p.dataUri}" alt="${escapeHtml(p.fileName)}" />`
              : `<p>${escapeHtml(p.fileName)}</p>`
          )
          .join("")}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: sans-serif; }
    h1 { font-size: 18px; }
    h2 { font-size: 14px; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 12px; }
    th, td { border: 1px solid #ccc; padding: 5px; text-align: left; }
    th { background: #f0f0f0; width: 40%; }
    .section { margin-top: 16px; }
    .section h3 { color: #1976D2; margin-bottom: 8px; }
    .device { border-left: 4px solid #1976D2; padding-left: 10px; margin-bottom: 12px; }
    .device h4 { margin: 8px 0; }
    .photos img { max-width: 120px; margin: 4px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(projectName)} - Inspection Report</h1>
  <h2>Inspection: ${escapeHtml(formData.poleId || "—")}</h2>
  <table class="meta">${metaRows}</table>
  ${sectionsHtml}
  <div class="section"><h3>Photos</h3>${photosHtml}</div>
</body>
</html>`;
}
```

Add `exportInspection` (after `exportInspections`):

```ts
export async function exportInspection(
  projectId: number,
  projectName: string,
  inspectionId: number,
  poleId: string,
  format: ExportFormat
): Promise<boolean> {
  const table = await buildReportTable(projectId, inspectionId);
  if (table.rows.length === 0) return false;
  if (format === "pdf") {
    const formData = await loadInspectionFormData(inspectionId);
    return sharePdfFile(buildInspectionPdfHtml(formData, projectName), projectName, poleId);
  }
  return shareTableFile(table, projectName, poleId, format);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack yarn jest src/__tests__/utils/exportData.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exportData.ts src/__tests__/utils/exportData.test.ts
git commit -m "feat: add single-inspection export with form-like PDF and filtered table"
```

---

### Task 5: Reports screen with live table preview

**Files:**
- Create: `src/components/reports/ReportTablePreview.tsx`
- Replace: `app/reports/index.tsx`
- Create: `src/__tests__/components/reports/ReportTablePreview.test.tsx` (light render test if the harness allows; otherwise skip)

**Interfaces:**
- `ReportTablePreview({ table }: { table: ReportTable })` — presentational, no DB access.
- Reports screen reads `projectId`/`projectName` params, renders three export buttons, a busy state, and a scrollable banded preview with a summary line.

- [ ] **Step 1: Write the preview component**

Create `src/components/reports/ReportTablePreview.tsx`:

```tsx
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { ReportTable } from "@/src/utils/exportData";

const COLUMN_WIDTH = 150;

export default function ReportTablePreview({ table }: { table: ReportTable }) {
  const bandRow = table.sections.flatMap((s) => s.columns.map(() => s.name));

  const renderRow = (cells: string[], isHeader: boolean, tinted: boolean) => (
    <View style={styles.row} key={`${isHeader ? "h" : "d"}-${cells[0] ?? ""}-${cells.length}`}>
      {cells.map((cell, i) => (
        <View key={i} style={[styles.cell, isHeader && styles.headerCell, tinted && styles.tintedCell]}>
          <Text style={isHeader ? styles.headerText : styles.cellText} numberOfLines={2}>
            {cell}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView horizontal style={styles.scroll}>
      <View>
        {renderRow(bandRow, true, false)}
        {renderRow(table.headers, true, false)}
        {table.rows.map((row, i) => renderRow(row.cells, false, row.isDeviceRow))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: "row" },
  cell: {
    width: COLUMN_WIDTH,
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: "#C8C8C8",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  headerCell: { backgroundColor: "#E3E3E3" },
  tintedCell: { backgroundColor: "#E3F2FD" },
  headerText: { fontSize: 11, fontWeight: "700" },
  cellText: { fontSize: 11 },
});
```

- [ ] **Step 2: Write the Reports screen**

Replace `app/reports/index.tsx` with:

```tsx
import React, { useCallback, useState } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Appbar, Button, Divider, Text, ActivityIndicator } from "react-native-paper";
import {
  buildReportTable,
  exportInspections,
  ExportFormat,
  ReportTable,
} from "@/src/utils/exportData";
import ReportTablePreview from "@/src/components/reports/ReportTablePreview";
import { logger } from "@/src/utils/logger";

const EXPORT_ACTIONS: { format: ExportFormat; label: string; icon: string }[] = [
  { format: "csv", label: "Export as CSV", icon: "file-delimited" },
  { format: "excel", label: "Export as Excel", icon: "microsoft-excel" },
  { format: "pdf", label: "Export as PDF", icon: "file-pdf-box" },
];

export default function ReportsScreen() {
  const { projectId, projectName } = useLocalSearchParams<{
    projectId?: string;
    projectName?: string;
  }>();
  const router = useRouter();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (projectId) loadPreview();
    }, [projectId])
  );

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      setTable(await buildReportTable(Number(projectId)));
    } catch (error) {
      logger.error("Preview load error:", error);
      setTable(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  const handleExport = async (format: ExportFormat) => {
    if (!projectId) {
      Alert.alert("Export Failed", "Unable to export inspection data.");
      return;
    }
    setExporting(format);
    try {
      const success = await exportInspections(Number(projectId), projectName ?? "Project", format);
      if (!success) {
        Alert.alert("No Data", "No inspection data found to export for this project.");
      }
    } catch (error) {
      logger.error("Export error:", error);
      Alert.alert("Export Failed", "Unable to export inspection data.");
    } finally {
      setExporting(null);
    }
  };

  const baseCount = table?.rows.filter((r) => !r.isDeviceRow).length ?? 0;
  const deviceCount = table?.rows.filter((r) => r.isDeviceRow).length ?? 0;
  const columnCount = table?.headers.length ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Reports" />
      </Appbar.Header>
      <View style={styles.content}>
        <Text variant="titleMedium" style={styles.subtitle}>
          {projectName ? `Export ${projectName} inspection data` : "Export inspection data"}
        </Text>
        {EXPORT_ACTIONS.map(({ format, label, icon }) => (
          <Button
            key={format}
            mode="contained"
            icon={icon}
            onPress={() => handleExport(format)}
            disabled={exporting !== null}
            loading={exporting === format}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            {label}
          </Button>
        ))}
        <Divider style={styles.divider} />
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Preview
        </Text>
        {loadingPreview ? (
          <ActivityIndicator style={styles.previewLoading} />
        ) : table && table.rows.length > 0 ? (
          <>
            <Text style={styles.summary}>
              {baseCount} inspections · {deviceCount} device rows · {columnCount} columns
            </Text>
            <ReportTablePreview table={table} />
          </>
        ) : (
          <Text style={styles.empty}>No inspection data to preview.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20 },
  subtitle: { marginBottom: 20 },
  button: { marginBottom: 15 },
  buttonContent: { paddingVertical: 4 },
  divider: { marginVertical: 16 },
  sectionTitle: { marginBottom: 10 },
  previewLoading: { marginTop: 20 },
  summary: { marginBottom: 10, fontSize: 13, color: "#555" },
  empty: { marginTop: 10, color: "#777" },
});
```

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/ReportTablePreview.tsx app/reports/index.tsx
git commit -m "feat: build Reports screen with CSV Excel PDF export and table preview"
```

---

### Task 6: Single-inspection export from the Inspection List

**Files:**
- Modify: `app/inspection/index.tsx`

**Interfaces:**
- Adds a per-card export icon → format chooser (`Alert.alert` with PDF/Excel/CSV) → `exportInspection(projectId, projectName, inspectionId, poleId, format)`.

- [ ] **Step 1: Make the edits**

In `app/inspection/index.tsx`:
1. Add `Alert` to the `react-native` import.
2. Add imports:

```tsx
import { exportInspection, ExportFormat } from "@/src/utils/exportData";
import { logger } from "@/src/utils/logger";
```

3. Add state `const [exportingId, setExportingId] = useState<number | null>(null);`.
4. Add handlers (after `openEdit`):

```tsx
  function handleExport(item: InspectionListItem, format: ExportFormat) {
    if (!projectId || exportingId !== null) return;
    setExportingId(item.InspectionID);
    exportInspection(
      Number(projectId),
      project?.ProjectName ?? "Project",
      item.InspectionID,
      item.PoleID,
      format
    )
      .then((success) => {
        if (!success) {
          Alert.alert("No Data", "No inspection data found to export.");
        }
      })
      .catch((error) => {
        logger.error("Export error:", error);
        Alert.alert("Export Failed", "Unable to export inspection data.");
      })
      .finally(() => setExportingId(null));
  }

  function promptExport(item: InspectionListItem) {
    Alert.alert(`Export ${item.PoleID || "Inspection"}`, "Choose a format", [
      { text: "PDF", onPress: () => handleExport(item, "pdf") },
      { text: "Excel", onPress: () => handleExport(item, "excel") },
      { text: "CSV", onPress: () => handleExport(item, "csv") },
      { text: "Cancel", style: "cancel" },
    ]);
  }
```

5. Replace the pencil `IconButton` block with a row of two icons:

```tsx
                {!selectionMode && (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <IconButton
                      icon="export-variant"
                      size={20}
                      disabled={exportingId === item.InspectionID}
                      onPress={() => promptExport(item)}
                    />
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => openEdit(item)}
                    />
                  </View>
                )}
```

- [ ] **Step 2: Verify types, lint, and full test suite**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors. Run: `corepack yarn test --watch=false` — all suites pass.

- [ ] **Step 3: Commit**

```bash
git add app/inspection/index.tsx
git commit -m "feat: add single-inspection PDF Excel CSV export to Inspection List"
```

---

### Task 7: Dashboard cleanup and legacy removal

**Files:**
- Modify: `app/projects/dashboard.tsx`
- Modify: `src/utils/exportData.ts` (remove `exportProjectData`)

**Interfaces:**
- Dashboard no longer imports `exportData`; the "Generate inspection reports" card passes `params: { projectId, projectName }` to `/reports`; the CSV export card is gone.

- [ ] **Step 1: Make the edits**

In `app/projects/dashboard.tsx`:
- Remove `import { exportProjectData } from "@/src/utils/exportData";`.
- Remove `const [, setExporting] = useState(false);`.
- Remove the whole `handleExport` function block.
- If `Alert` becomes unused after removing `handleExport`, remove `Alert` from the `react-native` import (verify with tsc/lint).
- Change the Reports card `onPress` (currently `onPress={() => router.push("/reports")}`) to:

```tsx
        onPress={() =>
          router.push({
            pathname: "/reports",
            params: {
              projectId: project.ProjectID.toString(),
              projectName: project.ProjectName,
            },
          })
        }
```

- Remove the third `<View style={styles.actionRow}>` block (the "Export" card + empty half).

In `src/utils/exportData.ts`:
- Delete the `exportProjectData` function entirely.

- [ ] **Step 2: Verify types, lint, and full test suite**

Run: `npx tsc --noEmit` — clean. Run: `corepack yarn lint` — 0 errors. Run: `corepack yarn test --watch=false` — all suites pass.

- [ ] **Step 3: Commit**

```bash
git add app/projects/dashboard.tsx src/utils/exportData.ts
git commit -m "refactor: move export off dashboard into Reports screen"
```

---

## Self-Review Notes

- **Spec coverage (v2):** Decision 1 (banded headers) → Tasks 1-4 (`buildReportTable` band structure, `buildCsv` band row, `buildExcelBase64` merges, `buildProjectPdfHtml` colspan). Decision 2 (columns = template, live) → Task 1 query. Decision 3 (device sections included) → Task 1 device column attach + Task 4 device cards. Decision 4 (one row per device) → Task 1 repeat set. Decision 5 (derived Lat/Long) → Task 1 `splitLatLong` + gps_lat/gps_lng columns. Decision 6 (Status + Photos appended) → Task 1 Summary section. Decision 7 (single-inspection export) → Task 4 + Task 6. Decision 8 (single unified service) → Tasks 1-4. Decision 9 (exports live in Reports, dashboard cleanup) → Tasks 5, 7. Decision 10 (ADR-014) → no `getGlobalDatabase` anywhere.
- **Mock call order** for `buildReportTable` tests: template → deviceDefs → inspections → values → records → photos (6 `getAllAsync` calls). For `loadInspectionFormData`: template → values → deviceDefs → records → photos (5 `getAllAsync`) + `getFirstAsync` (status). Tests must stub in that exact order.
- **Type consistency:** `ReportTable`, `ReportColumn`, `ReportRow`, `ReportSection`, `ExportFormat`, `buildReportTable`, `buildCsv`, `buildExcelBase64`, `buildProjectPdfHtml`, `buildInspectionPdfHtml`, `loadInspectionFormData`, `exportInspections`, `exportInspection`, `splitLatLong` are identical across tasks.
- **Placeholder scan:** every code step is concrete; no "TBD" steps. Task 2's temporary `sharePdfFile` stub is explicitly removed in Task 3.
- **Cross-task consistency:** Task 1 final implementation uses `section.sectionKey` for device-section resolution and a single `parseDeviceData` helper (hoisted function declaration, safe to place below `buildReportTable`).
