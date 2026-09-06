import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as XLSX from "xlsx";
import { Alert, Platform } from "react-native";
import { getDatabase } from "../database/db";
import { INSPECTION_FINAL_STATUSES, isFieldValueEmpty } from "../database/repositories/InspectionRepository";
import { getCurrentInspectionDate } from "./date";
import { ensureRootFolder } from "./storageManager";
import { downloadStorage } from "./downloadStorage";

export type ExportFormat = "csv" | "excel";

export interface ExportResult {
  fileUri: string;
  fileName: string;
  format: ExportFormat;
  inspectionCount: number;
  rowCount: number;
  durationMs: number;
}

export interface ExportProjectMeta {
  division: string;
  inspector: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  fieldId?: number;
  deviceFieldName?: string;
  isDeviceColumn: boolean;
  sectionIndex: number;
  deleted?: boolean;
}

export interface ReportSection {
  index: number;
  name: string;
  sectionKey: string;
  isRepeatable: boolean;
  deviceType?: string;
  deleted?: boolean;
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

  const getAllSafe = async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try {
      const result = await db.getAllAsync<T>(sql, params as never);
      return result ?? [];
    } catch {
      return [];
    }
  };

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

  const deviceDefs = await getAllSafe<{
    DeviceType: string;
    FieldName: string;
    Label: string;
    IsActive: number;
  }>(
    `SELECT DeviceType, FieldName, Label, IsActive
     FROM DeviceFieldDefinitions
     ORDER BY DeviceType, DisplayOrder`
  );

  const defsByType = new Map<string, { FieldName: string; Label: string }[]>();
  const inactiveDefsByType = new Map<string, { FieldName: string; Label: string }[]>();
  for (const d of deviceDefs) {
    if (d.IsActive === 0) {
      if (!inactiveDefsByType.has(d.DeviceType)) inactiveDefsByType.set(d.DeviceType, []);
      inactiveDefsByType.get(d.DeviceType)!.push({ FieldName: d.FieldName, Label: d.Label });
      continue;
    }
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

  const idList =
    inspectionIds === undefined
      ? null
      : Array.isArray(inspectionIds)
        ? inspectionIds
        : [inspectionIds];

  const placeholders = idList ? idList.map(() => "?").join(",") : null;
  const statusPlaces = INSPECTION_FINAL_STATUSES.map(() => "?").join(",");

  const inspections = await db.getAllAsync<{ InspectionID: number; Status: string }>(
    idList
      ? `SELECT InspectionID, Status FROM Inspections WHERE InspectionID IN (${placeholders}) AND Status IN (${statusPlaces}) ORDER BY InspectionID`
      : `SELECT InspectionID, Status FROM Inspections WHERE ProjectID = ? AND Status IN (${statusPlaces}) ORDER BY InspectionID`,
    idList ? [...idList, ...INSPECTION_FINAL_STATUSES] : [projectId, ...INSPECTION_FINAL_STATUSES]
  );

  const values = await db.getAllAsync<{ InspectionID: number; FieldID: number; FieldValue: string | null }>(
    idList
      ? `SELECT InspectionID, FieldID, FieldValue FROM InspectionValues WHERE InspectionID IN (${placeholders})`
      : `SELECT v.InspectionID, v.FieldID, v.FieldValue FROM InspectionValues v JOIN Inspections i ON v.InspectionID = i.InspectionID WHERE i.ProjectID = ?`,
    idList ? idList : [projectId]
  );

  const records = await getAllSafe<{ InspectionID: number; DeviceType: string; DeviceNo: number; DeviceData: string | null }>(
    idList
      ? `SELECT InspectionID, DeviceType, DeviceNo, DeviceData FROM DeviceRecords WHERE InspectionID IN (${placeholders}) AND IsActive = 1 ORDER BY DeviceType, DeviceNo`
      : `SELECT r.InspectionID, r.DeviceType, r.DeviceNo, r.DeviceData FROM DeviceRecords r JOIN Inspections i ON r.InspectionID = i.InspectionID WHERE i.ProjectID = ? AND r.IsActive = 1 ORDER BY r.DeviceType, r.DeviceNo`,
    idList ? idList : [projectId]
  );

  const fieldOptions = (await db.getAllAsync<{ FieldID: number; OptionLabel: string; OptionValue: string }>(
    `SELECT FieldID, OptionLabel, OptionValue FROM FieldOptions WHERE IsActive = 1`
  )) ?? [];
  const optionLabelsByField = new Map<number, Map<string, string>>();
  for (const o of fieldOptions) {
    let byValue = optionLabelsByField.get(o.FieldID);
    if (!byValue) {
      byValue = new Map<string, string>();
      optionLabelsByField.set(o.FieldID, byValue);
    }
    byValue.set(o.OptionValue, o.OptionLabel);
  }

  const deviceOptions = await getAllSafe<{ DeviceType: string; FieldName: string; OptionLabel: string; OptionValue: string }>(
    `SELECT DeviceType, FieldName, OptionLabel, OptionValue FROM DeviceOptions WHERE IsActive = 1`
  );
  const deviceOptionLabels = new Map<string, Map<string, Map<string, string>>>();
  for (const o of deviceOptions) {
    if (!deviceOptionLabels.has(o.DeviceType)) deviceOptionLabels.set(o.DeviceType, new Map());
    const byField = deviceOptionLabels.get(o.DeviceType)!;
    if (!byField.has(o.FieldName)) byField.set(o.FieldName, new Map());
    byField.get(o.FieldName)!.set(o.OptionValue, o.OptionLabel);
  }

  const activeFieldIds = new Set(rows.map((r) => r.FieldID));

  let reportValueFieldIds: number[] = [];
  if (idList) {
    reportValueFieldIds = (
      (await db.getAllAsync<{ FieldID: number }>(
        `SELECT FieldID FROM InspectionValues WHERE InspectionID IN (${placeholders})`,
        idList
      )) ?? []
    ).map((r) => r.FieldID);
  } else {
    const projectInspections =
      (await db.getAllAsync<{ InspectionID: number }>(
        `SELECT InspectionID FROM Inspections WHERE ProjectID = ? AND Status IN (${statusPlaces})`,
        [projectId, ...INSPECTION_FINAL_STATUSES]
      )) ?? [];
    if (projectInspections.length > 0) {
      const projectIds = projectInspections.map((i) => i.InspectionID);
      const projectPh = projectIds.map(() => "?").join(",");
      reportValueFieldIds = (
        (await db.getAllAsync<{ FieldID: number }>(
          `SELECT FieldID FROM InspectionValues WHERE InspectionID IN (${projectPh})`,
          projectIds
        )) ?? []
      ).map((r) => r.FieldID);
    }
  }

  const distinctValueFieldIds = [...new Set(reportValueFieldIds)];

  if (distinctValueFieldIds.length > 0) {
    const valuePh = distinctValueFieldIds.map(() => "?").join(",");
    const fieldRows =
      (await db.getAllAsync<{
        SectionID: number;
        FieldID: number;
        FieldKey: string;
        FieldName: string;
        FieldType: string;
        IsActive: number;
        IsVisible: number;
        DisplayOrder: number;
      }>(
        `SELECT SectionID, FieldID, FieldKey, FieldName, FieldType, IsActive, IsVisible, DisplayOrder
         FROM InspectionFields WHERE FieldID IN (${valuePh})`,
        distinctValueFieldIds
      )) ?? [];

    const typeByField = new Map(fieldRows.map((f) => [f.FieldID, f.FieldType ?? ""]));
    const finalInspectionValueIds = new Set(inspections.map((i) => i.InspectionID));
    const populatedFieldIds = new Set<number>();
    for (const v of values) {
      if (!finalInspectionValueIds.has(v.InspectionID)) continue;
      if (!isFieldValueEmpty(typeByField.get(v.FieldID) ?? "", v.FieldValue ?? "")) {
        populatedFieldIds.add(v.FieldID);
      }
    }

    const relevantFieldRows = fieldRows.filter(
      (f) => !activeFieldIds.has(f.FieldID) && populatedFieldIds.has(f.FieldID)
    );
    if (relevantFieldRows.length > 0) {
      const orphanSectionIds = [...new Set(relevantFieldRows.map((f) => f.SectionID))];
      const sectionPh = orphanSectionIds.map(() => "?").join(",");
      const orphanSections =
        (await db.getAllAsync<{
          SectionID: number;
          SectionName: string;
          SectionKey: string;
          IsRepeatable: number;
          IsActive: number;
          IsVisible: number;
        }>(
        `SELECT SectionID, SectionName, SectionKey, IsRepeatable, IsActive, IsVisible
         FROM InspectionSections WHERE SectionID IN (${sectionPh})`,
        orphanSectionIds
      )) ?? [];
      const sectionRowsById = new Map<number, (typeof orphanSections)[number]>();
      for (const sRow of orphanSections) sectionRowsById.set(sRow.SectionID, sRow);

      const orphans = relevantFieldRows.filter((f) => {
        const sec = sectionRowsById.get(f.SectionID);
        const sectionClosed = sec == null || sec.IsActive !== 1 || sec.IsVisible !== 1;
        return f.IsActive === 0 || sectionClosed;
      });

      if (orphans.length > 0) {
        const orphanBands = new Map<number, ReportSection>();
        const getOrphanBand = (sectionId: number): ReportSection => {
          const existing = orphanBands.get(sectionId);
          if (existing) return existing;

          const sec = sectionRowsById.get(sectionId);
          const sectionClosed = sec == null || sec.IsActive !== 1 || sec.IsVisible !== 1;

          let target = sectionsById.get(sectionId);
          if (target && !sectionClosed) {
            target.deleted = false;
          } else {
            target = {
              index: sections.length,
              name: sectionClosed ? `Deleted ${sec?.SectionName ?? ""}` : (sec?.SectionName ?? ""),
              sectionKey: sec?.SectionKey ?? "",
              isRepeatable: sec?.IsRepeatable === 1,
              deleted: sectionClosed,
              columns: [],
            };
            sectionsById.set(sectionId, target);
            sections.push(target);
          }
          orphanBands.set(sectionId, target);
          return target;
        };

        for (const orphan of orphans) {
          const target = getOrphanBand(orphan.SectionID);
          target.columns.push({
            key: `deleted:${orphan.SectionID}:${orphan.FieldID}`,
            label: `Deleted ${orphan.FieldName}`,
            fieldId: orphan.FieldID,
            isDeviceColumn: false,
            sectionIndex: target.index,
            deleted: true,
          });
        }
      }
    }
  }

  // Device-config historical resolution: deleted device sections, deleted device
  // types, or deleted device fields must never drop historical device data.
  const finalInspectionIds = new Set(inspections.map((i) => i.InspectionID));
  const deviceHistoryKeysByType = new Map<string, Set<string>>();
  for (const rec of records) {
    if (!finalInspectionIds.has(rec.InspectionID)) continue;
    if (!deviceHistoryKeysByType.has(rec.DeviceType)) deviceHistoryKeysByType.set(rec.DeviceType, new Set());
    Object.entries(parseDeviceData(rec.DeviceData))
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .forEach(([k]) => deviceHistoryKeysByType.get(rec.DeviceType)!.add(k));
  }

  if (deviceHistoryKeysByType.size > 0) {
    const deviceTypesWithHistory = [...deviceHistoryKeysByType.keys()];

    // Deleted device fields on a section that still emits an active device group.
    for (const deviceType of deviceTypesWithHistory) {
      const sectionKey = normalizeDeviceType(deviceType);
      const activeSection = sections.find((s) => s.sectionKey === sectionKey && s.deviceType && !s.deleted);
      if (!activeSection) continue;
      const keys = deviceHistoryKeysByType.get(deviceType)!;
      for (const def of inactiveDefsByType.get(deviceType) ?? []) {
        if (!keys.has(def.FieldName)) continue;
        activeSection.columns.push({
          key: `device:${deviceType}:${def.FieldName}:deleted`,
          label: `Deleted ${def.Label}`,
          deviceFieldName: def.FieldName,
          isDeviceColumn: true,
          sectionIndex: activeSection.index,
          deleted: true,
        });
      }
    }

    // Device sections that hold historical records but no active device group.
    const orphanDeviceTypes = deviceTypesWithHistory.filter((deviceType) => {
      const sectionKey = normalizeDeviceType(deviceType);
      return !sections.some((s) => s.sectionKey === sectionKey && s.deviceType && !s.deleted);
    });

    if (orphanDeviceTypes.length > 0) {
      const orphanKeys = [...new Set(orphanDeviceTypes.map((t) => normalizeDeviceType(t)))];
      const orphanPh = orphanKeys.map(() => "?").join(",");
      const orphanDeviceSections =
        (await db.getAllAsync<{
          SectionID: number;
          SectionName: string;
          SectionKey: string;
          IsRepeatable: number;
          IsActive: number;
          IsVisible: number;
        }>(
          `SELECT SectionID, SectionName, SectionKey, IsRepeatable, IsActive, IsVisible
           FROM InspectionSections WHERE SectionKey IN (${orphanPh})`,
          orphanKeys
        )) ?? [];
      const orphanSectionKeyMap = new Map(orphanDeviceSections.map((s) => [s.SectionKey, s]));

      for (const deviceType of orphanDeviceTypes) {
        const sectionKey = normalizeDeviceType(deviceType);
        const keys = deviceHistoryKeysByType.get(deviceType)!;
        const sec = orphanSectionKeyMap.get(sectionKey);
        const sectionClosed = sec == null || sec.IsActive !== 1 || sec.IsVisible !== 1;

        let band = sections.find((s) => s.sectionKey === sectionKey);
        if (!band) {
          band = {
            index: sections.length,
            name: (sectionClosed ? "Deleted " : "") + (sec?.SectionName ?? deviceType),
            sectionKey,
            isRepeatable: sec?.IsRepeatable === 1,
            deviceType,
            deleted: sectionClosed,
            columns: [],
          };
          sections.push(band);
        } else {
          band.deviceType = deviceType;
          band.deleted = sectionClosed || band.deleted;
        }

        const activeDefSet = new Set((defsByType.get(deviceType) ?? []).map((d) => d.FieldName));
        for (const def of [...(defsByType.get(deviceType) ?? []), ...(inactiveDefsByType.get(deviceType) ?? [])]) {
          if (!keys.has(def.FieldName)) continue;
          const fieldDeleted = sectionClosed || !activeDefSet.has(def.FieldName);
          band.columns.push({
            key: `device:${deviceType}:${def.FieldName}:deleted`,
            label: (fieldDeleted ? "Deleted " : "") + def.Label,
            deviceFieldName: def.FieldName,
            isDeviceColumn: true,
            sectionIndex: band.index,
            deleted: fieldDeleted,
          });
        }
      }
    }
  }

  const allColumns: ReportColumn[] = [];
  for (const s of sections) allColumns.push(...s.columns);

  const headers = allColumns.map((c) => c.label);

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

  const dateFallback = getCurrentInspectionDate();
  const rowsOut: ReportRow[] = [];

  const resolveOptionLabel = (fieldId: number, value: string): string => {
    if (!value) return value;
    const byValue = optionLabelsByField.get(fieldId);
    if (!byValue) return value;
    return byValue.get(value) ?? value;
  };

  const scalarCell = (
    c: ReportColumn,
    valueMap: Map<number, string>,
    lat: string,
    lng: string
  ): string => {
    if (c.key === "gps_lat") return lat;
    if (c.key === "gps_lng") return lng;
    if (c.key === "date") return resolveOptionLabel(c.fieldId ?? -1, valueMap.get(c.fieldId ?? -1) || dateFallback);
    return resolveOptionLabel(c.fieldId ?? -1, valueMap.get(c.fieldId ?? -1) ?? "");
  };

  for (const insp of inspections) {
    const valueMap = valueMapByInspection.get(insp.InspectionID) ?? new Map<number, string>();
    const gpsValue = valueMap.get(gpsFieldId ?? -1) ?? "";
    const [lat, lng] = splitLatLong(gpsValue);

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
        return scalarCell(c, valueMap, lat, lng);
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
          if (!data) return "";
          const raw = data[c.deviceFieldName ?? ""] ?? "";
          if (!raw) return "";
          const deviceType = sections[c.sectionIndex]?.deviceType;
          const byField = deviceType
            ? deviceOptionLabels.get(deviceType)?.get(c.deviceFieldName ?? "")
            : undefined;
          return byField?.get(raw) ?? raw;
        }
        const columnSection = sections[c.sectionIndex];
        if (REPEATED_SECTION_KEYS.has(columnSection.sectionKey)) {
          return scalarCell(c, valueMap, lat, lng);
        }
        return isFirstRow ? scalarCell(c, valueMap, lat, lng) : "";
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
  format: ExportFormat,
  meta?: ExportProjectMeta
): Promise<ExportResult | null> {
  const startedAt = Date.now();
  const division = meta?.division ?? "";
  const inspector = meta?.inspector ?? "";
  const { table, inspectionCount } = await buildReportTableInternal(
    projectId,
    inspectionIds && inspectionIds.length > 0 ? inspectionIds : undefined
  );
  if (table.rows.length === 0) return null;

  const ext = format === "csv" ? "csv" : "xlsx";
  const fileName = buildFileName(division, projectName, inspector, ext);
  await ensureRootFolder();
  let fileUri: string;
  if (format === "csv") {
    fileUri = await downloadStorage.writeUtf8("", fileName, "text/csv", buildCsv(table));
  } else {
    fileUri = await downloadStorage.writeBase64(
      "",
      fileName,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buildExcelBase64(table)
    );
  }

  return {
    fileUri,
    fileName,
    format,
    inspectionCount,
    rowCount: table.rows.length,
    durationMs: Date.now() - startedAt,
  };
}

export async function openExportFile(result: ExportResult): Promise<boolean> {
  if (Platform.OS === "android") {
    const contentUri = result.fileUri.startsWith("content://")
      ? result.fileUri
      : await FileSystem.getContentUriAsync(result.fileUri);
    const { mimeType } = mimeInfo(result.format);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: mimeType,
      flags: 1,
    });
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) return false;
  const { mimeType, uti } = mimeInfo(result.format);
  const dialogTitle =
    result.format === "csv"
      ? "Export CSV Report"
      : "Export Excel Report";
  await Sharing.shareAsync(result.fileUri, { mimeType, dialogTitle, UTI: uti });
  return true;
}

export async function exportInspections(
  projectId: number,
  projectName: string,
  format: ExportFormat,
  meta?: ExportProjectMeta
): Promise<boolean> {
  const result = await createExportFile(projectId, projectName, null, format, meta);
  if (!result) return false;
  Alert.alert(
    "Export Successful",
    result.format === "csv" ? "CSV exported successfully" : "Excel exported successfully"
  );
  return true;
}
