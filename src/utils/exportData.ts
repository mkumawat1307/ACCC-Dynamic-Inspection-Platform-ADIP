import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
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
    sectionKey: "summary",
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
