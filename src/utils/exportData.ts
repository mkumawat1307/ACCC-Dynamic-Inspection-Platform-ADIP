import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { getDatabase } from "../database/db";

export interface InspectionTable {
  headers: string[];
  rows: string[][];
}

export async function buildInspectionTable(projectId: number): Promise<InspectionTable> {
  const db = await getDatabase();

  const columns = await db.getAllAsync<{ FieldID: number; FieldName: string }>(
    `SELECT f.FieldID, f.FieldName
     FROM InspectionFields f
     JOIN InspectionSections s ON f.SectionID = s.SectionID
     WHERE f.IsActive = 1 AND f.IsVisible = 1
       AND s.IsActive = 1 AND s.IsVisible = 1 AND s.IsRepeatable = 0
     ORDER BY s.DisplayOrder, f.DisplayOrder`
  );

  const headers = [...columns.map((c) => c.FieldName), "Status", "Remarks"];

  const inspections = await db.getAllAsync<{
    InspectionID: number;
    Status: string;
    Remarks: string | null;
  }>(
    `SELECT InspectionID, Status, Remarks
     FROM Inspections
     WHERE ProjectID = ?
     ORDER BY InspectionID`,
    [projectId]
  );

  const values = await db.getAllAsync<{
    InspectionID: number;
    FieldID: number;
    FieldValue: string | null;
  }>(
    `SELECT v.InspectionID, v.FieldID, v.FieldValue
     FROM InspectionValues v
     JOIN Inspections i ON v.InspectionID = i.InspectionID
     WHERE i.ProjectID = ?`,
    [projectId]
  );

  const valueMapByInspection = new Map<number, Map<number, string>>();
  for (const v of values) {
    if (!valueMapByInspection.has(v.InspectionID)) {
      valueMapByInspection.set(v.InspectionID, new Map());
    }
    valueMapByInspection.get(v.InspectionID)!.set(v.FieldID, v.FieldValue ?? "");
  }

  const rows = inspections.map((insp) => {
    const valueMap = valueMapByInspection.get(insp.InspectionID) ?? new Map<number, string>();
    return [
      ...columns.map((c) => valueMap.get(c.FieldID) ?? ""),
      insp.Status,
      insp.Remarks ?? "",
    ];
  });

  return { headers, rows };
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
