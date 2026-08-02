import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as XLSX from "xlsx";
import { Platform } from "react-native";
import { getDatabase, getGlobalDatabase } from "../database/db";
import { getCurrentInspectionDate } from "./date";

export type ExportFormat = "csv" | "excel";

export interface ExportResult {
  fileUri: string;
  fileName: string;
  format: ExportFormat;
  inspectionCount: number;
  rowCount: number;
  durationMs: number;
}

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
  inspectionCount: number;
}

function normalizeDeviceType(deviceType: string): string {
  return deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information";
}

const REPEATED_SECTION_KEYS = new Set(["general_information", "categorization"]);

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
  const lines = [table.headers, ...table.rows.map((r) => r.cells)];
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

  worksheet["!cols"] = aoa[0].map((_, ci) => {
    let max = 0;
    for (const row of aoa) {
      const v = row[ci];
      if (v != null) max = Math.max(max, String(v).length);
    }
    return { wch: Math.min(Math.max(max + 2, 8), 40) };
  });

  const thin = { style: "thin", color: { rgb: "C8C8C8" } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const bandFill = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
  const altFill = { patternType: "solid", fgColor: { rgb: "F7F7F7" } };

  for (let r = 0; r <= lastRow; r++) {
    for (let c = 0; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!worksheet[addr]) worksheet[addr] = { v: "", t: "s" };
      const cell = worksheet[addr] as { s?: unknown };
      const isBand = r === 0;
      const isHeader = r === 1;
      const isAlt = r >= 2 && (r - 2) % 2 === 1;
      cell.s = {
        border,
        alignment: {
          vertical: "center",
          wrapText: true,
          horizontal: isBand || isHeader ? "center" : "left",
        },
        font: isBand || isHeader ? { bold: true } : undefined,
        fill: isBand ? bandFill : isAlt ? altFill : undefined,
      };
    }
  }

  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } }) };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 2 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inspections");
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
}

export async function buildReportTable(
  projectId: number,
  inspectionIds?: number | number[]
): Promise<ReportTable> {
  return (await buildReportTableInternal(projectId, inspectionIds)).table;
}

export async function getReportCounts(projectId: number): Promise<{
  inspectionCount: number;
  rowCount: number;
  columnCount: number;
}> {
  const { table } = await buildReportTableInternal(projectId);
  return {
    inspectionCount: table.inspectionCount,
    rowCount: table.rows.length,
    columnCount: table.headers.length,
  };
}

async function buildReportTableInternal(
  projectId: number,
  inspectionIds?: number | number[]
): Promise<{ table: ReportTable; inspectionCount: number }> {
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
    if (r.FieldKey === "gps") {
      section.columns.push(
        { key: "gps_lat", label: "Latitude", isDeviceColumn: false, sectionIndex: section.index },
        { key: "gps_lng", label: "Longitude", isDeviceColumn: false, sectionIndex: section.index }
      );
    } else {
      section.columns.push({
        key: r.FieldKey,
        label: r.FieldName,
        fieldId: r.FieldID,
        isDeviceColumn: false,
        sectionIndex: section.index,
      });
    }
  }

  for (const section of sections) {
    if (section.sectionKey === "general_information" || !section.sectionKey.endsWith("_information")) continue;
    const deviceType = deviceTypes.find((t) => normalizeDeviceType(t) === section.sectionKey);
    if (!deviceType) continue;
    section.deviceType = deviceType;
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

  const summarySection: ReportSection = {
    index: sections.length,
    name: "Summary",
    sectionKey: "summary",
    isRepeatable: false,
    columns: [{ key: "photos", label: "Photos", isDeviceColumn: false, sectionIndex: sections.length }],
  };
  sections.push(summarySection);

  const allColumns: ReportColumn[] = [];
  for (const s of sections) allColumns.push(...s.columns);

  const headers = allColumns.map((c) => c.label);

  const idList =
    inspectionIds === undefined
      ? null
      : Array.isArray(inspectionIds)
        ? inspectionIds
        : [inspectionIds];

  const placeholders = idList ? idList.map(() => "?").join(",") : null;

  const inspections = await db.getAllAsync<{ InspectionID: number; Status: string }>(
    idList
      ? `SELECT InspectionID, Status FROM Inspections WHERE InspectionID IN (${placeholders}) ORDER BY InspectionID`
      : `SELECT InspectionID, Status FROM Inspections WHERE ProjectID = ? ORDER BY InspectionID`,
    idList ? idList : [projectId]
  );

  const values = await db.getAllAsync<{ InspectionID: number; FieldID: number; FieldValue: string | null }>(
    idList
      ? `SELECT InspectionID, FieldID, FieldValue FROM InspectionValues WHERE InspectionID IN (${placeholders})`
      : `SELECT v.InspectionID, v.FieldID, v.FieldValue FROM InspectionValues v JOIN Inspections i ON v.InspectionID = i.InspectionID WHERE i.ProjectID = ?`,
    idList ? idList : [projectId]
  );

  const records = await db.getAllAsync<{ InspectionID: number; DeviceType: string; DeviceNo: number; DeviceData: string | null }>(
    idList
      ? `SELECT InspectionID, DeviceType, DeviceNo, DeviceData FROM DeviceRecords WHERE InspectionID IN (${placeholders}) AND IsActive = 1 ORDER BY DeviceType, DeviceNo`
      : `SELECT r.InspectionID, r.DeviceType, r.DeviceNo, r.DeviceData FROM DeviceRecords r JOIN Inspections i ON r.InspectionID = i.InspectionID WHERE i.ProjectID = ? AND r.IsActive = 1 ORDER BY r.DeviceType, r.DeviceNo`,
    idList ? idList : [projectId]
  );

  const photos = await db.getAllAsync<{ InspectionID: number; FileName: string }>(
    idList
      ? `SELECT InspectionID, FileName FROM Photos WHERE InspectionID IN (${placeholders}) ORDER BY PhotoID`
      : `SELECT p.InspectionID, p.FileName FROM Photos p JOIN Inspections i ON p.InspectionID = i.InspectionID WHERE i.ProjectID = ? ORDER BY p.PhotoID`,
    idList ? idList : [projectId]
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

  const photosByInspection = new Map<number, string>();
  for (const p of photos) {
    const current = photosByInspection.get(p.InspectionID) ?? "";
    photosByInspection.set(p.InspectionID, current ? `${current}, ${p.FileName}` : p.FileName);
  }

  const dateFallback = getCurrentInspectionDate();

  const rowsOut: ReportRow[] = [];

  const scalarCell = (
    c: ReportColumn,
    valueMap: Map<number, string>,
    lat: string,
    lng: string,
    photoNames: string
  ): string => {
    if (c.key === "photos") return photoNames;
    if (c.key === "gps_lat") return lat;
    if (c.key === "gps_lng") return lng;
    if (c.key === "date") return valueMap.get(c.fieldId ?? -1) || dateFallback;
    return valueMap.get(c.fieldId ?? -1) ?? "";
  };

  for (const insp of inspections) {
    const valueMap = valueMapByInspection.get(insp.InspectionID) ?? new Map<number, string>();
    const gpsValue = valueMap.get(gpsFieldId ?? -1) ?? "";
    const [lat, lng] = splitLatLong(gpsValue);
    const photoNames = photosByInspection.get(insp.InspectionID) ?? "";

    const inspRecords = recordsByInspection.get(insp.InspectionID) ?? [];
    const recordsByType = new Map<string, typeof inspRecords>();
    for (const rec of inspRecords) {
      if (!recordsByType.has(rec.DeviceType)) recordsByType.set(rec.DeviceType, []);
      recordsByType.get(rec.DeviceType)!.push(rec);
    }

    const deviceSections = sections.filter(
      (s) => s.deviceType && (recordsByType.get(s.deviceType) ?? []).length > 0
    );

    if (deviceSections.length === 0) {
      const baseRow: string[] = allColumns.map((c) => {
        if (c.isDeviceColumn) return "";
        return scalarCell(c, valueMap, lat, lng, photoNames);
      });
      rowsOut.push({ cells: baseRow, isDeviceRow: false });
      continue;
    }

    const sectionsWithRecords = deviceSections.map((section) => ({
      section,
      records: recordsByType.get(section.deviceType!) ?? [],
    }));
    const maxDevices = Math.max(...sectionsWithRecords.map((s) => s.records.length));

    for (let k = 0; k < maxDevices; k++) {
      const dataBySection = new Map<number, Record<string, string>>();
      for (const { section, records } of sectionsWithRecords) {
        const rec = records[k];
        if (rec) dataBySection.set(section.index, parseDeviceData(rec.DeviceData));
      }
      const isFirstRow = k === 0;
      const cells: string[] = allColumns.map((c) => {
        if (c.isDeviceColumn) {
          const data = dataBySection.get(c.sectionIndex);
          return data ? (data[c.deviceFieldName ?? ""] ?? "") : "";
        }
        const columnSection = sections[c.sectionIndex];
        if (REPEATED_SECTION_KEYS.has(columnSection.sectionKey)) {
          return scalarCell(c, valueMap, lat, lng, photoNames);
        }
        return isFirstRow ? scalarCell(c, valueMap, lat, lng, photoNames) : "";
      });
      rowsOut.push({ cells, isDeviceRow: true });
    }
  }

  return { table: { sections, headers, rows: rowsOut, inspectionCount: inspections.length }, inspectionCount: inspections.length };
}

function parseDeviceData(data: string | null): Record<string, string> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function buildFileName(division: string, projectName: string, inspector: string, ext: string): string {
  const safe = (s: string) => s.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  const parts = [safe(division), safe(projectName), safe(inspector)].filter(Boolean);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(
    2,
    "0"
  )}-${String(now.getSeconds()).padStart(2, "0")}`;
  return `${parts.join("_")}_${stamp}.${ext}`;
}

async function getProjectExportMeta(
  projectId: number
): Promise<{ division: string; inspector: string }> {
  const db = await getGlobalDatabase();
  const row = await db.getFirstAsync<{ DivisionName: string | null; InspectorName: string | null }>(
    `SELECT dv.DivisionName, p.InspectorName
     FROM Projects p
     INNER JOIN Districts d ON p.DistrictID = d.DistrictID
     INNER JOIN Divisions dv ON d.DivisionID = dv.DivisionID
     WHERE p.ProjectID = ?`,
    [projectId]
  );
  return { division: row?.DivisionName ?? "", inspector: row?.InspectorName ?? "" };
}

function mimeInfo(format: ExportFormat): { mimeType: string; uti: string } {
  return format === "csv"
    ? { mimeType: "text/csv", uti: "public.comma-separated-values-text" }
    : {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        uti: "org.openxmlformats.spreadsheetml.sheet",
      };
}

export async function createExportFile(
  projectId: number,
  projectName: string,
  inspectionIds: number[] | null,
  poleId: string | null,
  format: ExportFormat
): Promise<ExportResult | null> {
  const startedAt = Date.now();
  const { division, inspector } = await getProjectExportMeta(projectId);
  const { table, inspectionCount } = await buildReportTableInternal(
    projectId,
    inspectionIds && inspectionIds.length > 0 ? inspectionIds : undefined
  );
  if (table.rows.length === 0) return null;

  const ext = format === "csv" ? "csv" : "xlsx";
  const fileUri = FileSystem.documentDirectory + buildFileName(division, projectName, inspector, ext);
  if (format === "csv") {
    await FileSystem.writeAsStringAsync(fileUri, buildCsv(table), { encoding: FileSystem.EncodingType.UTF8 });
  } else {
    await FileSystem.writeAsStringAsync(fileUri, buildExcelBase64(table), { encoding: FileSystem.EncodingType.Base64 });
  }

  return {
    fileUri,
    fileName: fileUri.split("/").pop() ?? fileUri,
    format,
    inspectionCount,
    rowCount: table.rows.length,
    durationMs: Date.now() - startedAt,
  };
}

export async function shareExportFile(result: ExportResult): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const { mimeType, uti } = mimeInfo(result.format);
  const dialogTitle =
    result.format === "csv"
      ? "Export CSV Report"
      : "Export Excel Report";
  await Sharing.shareAsync(result.fileUri, { mimeType, dialogTitle, UTI: uti });
  return true;
}

export async function openExportFile(result: ExportResult): Promise<boolean> {
  if (Platform.OS === "android") {
    const contentUri = await FileSystem.getContentUriAsync(result.fileUri);
    const { mimeType } = mimeInfo(result.format);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: mimeType,
      flags: 1,
    });
    return true;
  }
  return shareExportFile(result);
}

export async function exportInspections(projectId: number, projectName: string, format: ExportFormat): Promise<boolean> {
  const result = await createExportFile(projectId, projectName, null, null, format);
  if (!result) return false;
  return shareExportFile(result);
}

export async function exportInspection(
  projectId: number,
  projectName: string,
  inspectionId: number,
  poleId: string,
  format: ExportFormat
): Promise<boolean> {
  const result = await createExportFile(projectId, projectName, [inspectionId], poleId, format);
  if (!result) return false;
  return shareExportFile(result);
}
