import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { getDatabase } from "../database/db";
import { getCurrentInspectionDate } from "./date";

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
  isRepeatable: boolean;
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
      section = { index: sections.length, name: r.SectionName, sectionKey: r.SectionKey, isRepeatable: r.IsRepeatable === 1, columns: [] };
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

  for (const section of sections) {
    if (!section.isRepeatable || !section.sectionKey.endsWith("_information")) continue;
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
    sectionKey: "summary",
    isRepeatable: false,
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

function parseDeviceData(data: string | null): Record<string, string> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

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

async function sharePdfFile(html: string, projectName: string, poleId: string | null): Promise<boolean> {
  const fileUri = FileSystem.documentDirectory + buildFileName(projectName, poleId, "pdf");
  const dialogTitle = poleId ? `Export ${poleId} Inspection` : `Export ${projectName} Inspection Data`;
  const { uri } = await Print.printToFileAsync({ html });
  await FileSystem.copyAsync({ from: uri, to: fileUri });
  return writeAndShare(fileUri, "application/pdf", dialogTitle, "com.adobe.pdf");
}

export async function exportProjectData(projectId: number, projectName: string): Promise<boolean> {
  const db = await getDatabase();

  const inspections = await db.getAllAsync<{
    InspectionID: number;
    PoleID: string;
    InspectorName: string | null;
    InspectionDate: string;
    Status: string;
    Remarks: string | null;
    Latitude: number | null;
    Longitude: number | null;
  }>(`
    SELECT
      InspectionID,
      PoleID,
      InspectorName,
      InspectionDate,
      Status,
      Remarks,
      Latitude,
      Longitude
    FROM Inspections
    WHERE ProjectID = ?
    ORDER BY InspectionDate
  `, [projectId]);

  if (inspections.length === 0) {
    return false;
  }

  const headers = [
    "Pole ID",
    "Inspector",
    "Date",
    "Status",
    "Latitude",
    "Longitude",
    "Remarks",
  ];

  const rows: string[][] = [];

  for (const insp of inspections) {
    const values = await db.getAllAsync<{
      FieldName: string;
      FieldValue: string;
    }>(`
      SELECT f.FieldName, v.FieldValue
      FROM InspectionValues v
      JOIN InspectionFields f ON v.FieldID = f.FieldID
      WHERE v.InspectionID = ?
      ORDER BY f.DisplayOrder
    `, [insp.InspectionID]);

    if (rows.length === 0 && values.length > 0) {
      const dynamicHeaders = values.map((v) => v.FieldName);
      headers.push(...dynamicHeaders);
    }

    const valueMap: Record<string, string> = {};
    values.forEach((v) => {
      valueMap[v.FieldName] = v.FieldValue ?? "";
    });

    rows.push([
      insp.PoleID,
      insp.InspectorName ?? "",
      insp.InspectionDate,
      insp.Status,
      insp.Latitude?.toString() ?? "",
      insp.Longitude?.toString() ?? "",
      insp.Remarks ?? "",
      ...Object.values(valueMap),
    ]);
  }

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => {
        const escaped = cell.replace(/"/g, '""');
        const safe = /^[=+\-@\t]/.test(escaped) ? "'" + escaped : escaped;
        return safe.includes(",") || safe.includes('"') || safe.includes("\n")
          ? `"${safe}"`
          : safe;
      }).join(",")
    ),
  ].join("\n");

  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `${safeName}_inspections_${new Date().toISOString().slice(0, 10)}.csv`;
  const fileUri = FileSystem.documentDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "text/csv",
      dialogTitle: `Export ${projectName} Inspection Data`,
      UTI: "public.comma-separated-values-text",
    });
    return true;
  }

  return false;
}
