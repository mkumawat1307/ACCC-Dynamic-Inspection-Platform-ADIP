import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";
import type { ReportTable } from "@/src/utils/exportData";

jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

jest.mock("@/src/utils/storageManager", () => ({
  ensureRootFolder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://mock/exported/file.xlsx"),
    writeUtf8: jest.fn().mockResolvedValue("content://mock/exported/file.csv"),
    readBase64: jest.fn().mockResolvedValue("QUJD"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: 0 }),
}));

type Row = Record<string, unknown>;

interface InspRow extends Row {
  InspectionID: number;
  ProjectID: number;
  Status: string;
}

// The expo-sqlite mock cannot parse JOINs. This shim serves the report's
// JOIN queries from the real seeded tables, mirroring the production SQL
// semantics. Column ORDER is decided by exportData in JS, not here.
function installReportJoinShim(db: SQLiteDatabase): void {
  const orig = db.getAllAsync.bind(db);

  (db as { getAllAsync: typeof db.getAllAsync }).getAllAsync = (async <T = Row>(
    sql: string,
    params: SQLiteBindParams = []
  ): Promise<T[]> => {
    const p: unknown[] = Array.isArray(params) ? params : Object.values(params);

    if (sql.includes("FROM InspectionFields f") && sql.includes("JOIN InspectionSections")) {
      const fields = (await orig(
        "SELECT SectionID, FieldID, FieldKey, FieldName, IsActive, IsVisible, DisplayOrder FROM InspectionFields",
        []
      )) as unknown as { SectionID: number; FieldID: number; FieldKey: string; FieldName: string; IsActive: number; IsVisible: number; DisplayOrder: number }[];
      const sections = (await orig(
        "SELECT SectionID, SectionKey, SectionName, IsRepeatable, IsActive, IsVisible, DisplayOrder FROM InspectionSections",
        []
      )) as unknown as { SectionID: number; SectionKey: string; SectionName: string; IsRepeatable: number; IsActive: number; IsVisible: number; DisplayOrder: number }[];
      const sectionById = new Map(sections.map((s) => [s.SectionID, s]));
      const rows: Row[] = [];
      for (const f of fields) {
        if (f.IsActive !== 1 || f.IsVisible !== 1) continue;
        const s = sectionById.get(f.SectionID);
        if (!s || s.IsActive !== 1 || s.IsVisible !== 1 || s.SectionKey === "photos") continue;
        rows.push({
          SectionID: s.SectionID,
          SectionKey: s.SectionKey,
          SectionName: s.SectionName,
          IsRepeatable: s.IsRepeatable,
          DisplayOrder: s.DisplayOrder,
          FieldID: f.FieldID,
          FieldKey: f.FieldKey,
          FieldName: f.FieldName,
        });
      }
      return rows as T[];
    }

    if (sql.includes("FROM InspectionValues") && sql.includes("JOIN Inspections")) {
      const projectId = p[0] as number;
      const values = (await orig("SELECT InspectionID, FieldID, FieldValue FROM InspectionValues", [])) as unknown as { InspectionID: number; FieldID: number; FieldValue: string | null }[];
      const inspections = (await orig("SELECT InspectionID, ProjectID, Status FROM Inspections", [])) as unknown as InspRow[];
      const projectInspIds = new Set(inspections.filter((i) => i.ProjectID === projectId).map((i) => i.InspectionID));
      return values.filter((v) => projectInspIds.has(v.InspectionID)) as T[];
    }

    if (sql.includes("FROM DeviceRecords") && sql.includes("JOIN Inspections")) {
      const projectId = p[0] as number;
      const records = (await orig("SELECT InspectionID, DeviceType, DeviceNo, DeviceData, IsActive FROM DeviceRecords", [])) as unknown as { InspectionID: number; DeviceType: string; DeviceNo: number; DeviceData: string | null; IsActive: number }[];
      const inspections = (await orig("SELECT InspectionID, ProjectID, Status FROM Inspections", [])) as unknown as InspRow[];
      const projectInspIds = new Set(inspections.filter((i) => i.ProjectID === projectId).map((i) => i.InspectionID));
      const filtered = records.filter((r) => r.IsActive === 1 && projectInspIds.has(r.InspectionID));
      filtered.sort((a, b) => String(a.DeviceType).localeCompare(String(b.DeviceType)) || (a.DeviceNo - b.DeviceNo));
      return filtered.map((r) => ({ InspectionID: r.InspectionID, DeviceType: r.DeviceType, DeviceNo: r.DeviceNo, DeviceData: r.DeviceData })) as T[];
    }

    return orig(sql, params) as Promise<T[]>;
  }) as typeof db.getAllAsync;
}

const PROJECT = "/mock/documents/Projects/ExportColumnOrder/inspection.db";

describe("CSV export column order matches the inspection form order (Issue 1)", () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    jest.resetModules();
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const { createProjectSchema } = require("@/src/database/schema") as typeof import("@/src/database/schema");
    await createProjectSchema();
    await (require("@/src/database/seeds/inspection-template.seed") as typeof import("@/src/database/seeds/inspection-template.seed")).seedInspectionTemplate();
    await (require("@/src/database/seeds/inspection-sections.seed") as typeof import("@/src/database/seeds/inspection-sections.seed")).seedInspectionSections();
    await (require("@/src/database/seeds/inspection-fields.seed") as typeof import("@/src/database/seeds/inspection-fields.seed")).seedInspectionFields();
    await (require("@/src/database/seeds/field-options.seed") as typeof import("@/src/database/seeds/field-options.seed")).seedFieldOptions();
    await (require("@/src/database/seeds/device-options.seed") as typeof import("@/src/database/seeds/device-options.seed")).seedDeviceOptions();
    await (require("@/src/database/seeds/device-field-definitions.seed") as typeof import("@/src/database/seeds/device-field-definitions.seed")).seedDeviceFieldDefinitions();
    db = (await dbModule.getDatabase()) as SQLiteDatabase;
    installReportJoinShim(db);
  });

  async function fieldId(key: string): Promise<number> {
    const f = await db.getFirstAsync<{ FieldID: number }>("SELECT FieldID FROM InspectionFields WHERE FieldKey = ?", [key]);
    return f!.FieldID;
  }

  async function newInspection(): Promise<number> {
    await db.runAsync("INSERT INTO Inspections (ProjectID, Status) VALUES (?, ?)", [1, "Completed"]);
    const insp = await db.getFirstAsync<{ InspectionID: number }>("SELECT InspectionID FROM Inspections ORDER BY InspectionID DESC LIMIT 1");
    return insp!.InspectionID;
  }

  async function setValue(inspectionId: number, key: string, value: string): Promise<void> {
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [
      inspectionId,
      await fieldId(key),
      value,
    ]);
  }

  async function build(): Promise<ReportTable> {
    const { buildReportTable } = require("@/src/utils/exportData") as typeof import("@/src/utils/exportData");
    return buildReportTable(1);
  }

  it("Date and a later 'Installed' value never cross columns", async () => {
    const inspectionId = await newInspection();
    await setValue(inspectionId, "pole_id", "SIK001");
    await setValue(inspectionId, "date", "11/09/2026");
    await setValue(inspectionId, "jb_status", "Installed");

    const table = await build();
    const dateIdx = table.headers.indexOf("Date");
    const jbIdx = table.headers.indexOf("Junction Box Status");

    expect(table.headers.length).toBe(table.rows[0].cells.length);
    expect(dateIdx).toBeGreaterThanOrEqual(0);
    expect(jbIdx).toBeGreaterThan(dateIdx);
    expect(table.rows[0].cells[dateIdx]).toBe("11/09/2026");
    expect(table.rows[0].cells[jbIdx]).toBe("Installed");
    expect(table.rows[0].cells[dateIdx]).not.toBe("Installed");
  });

  it("values from several sections land under their exact header", async () => {
    const inspectionId = await newInspection();
    await setValue(inspectionId, "pole_id", "SIK001");
    await setValue(inspectionId, "date", "11/09/2026");
    await setValue(inspectionId, "jb_status", "Installed");
    await setValue(inspectionId, "earthing_wire", "Crimped");
    await setValue(inspectionId, "meter_status", "Working");
    await setValue(inspectionId, "remarks", "Clean install done");

    const table = await build();
    const cells = table.rows[0].cells;

    expect(cells[table.headers.indexOf("Site ID")]).toBe("SIK001");
    expect(cells[table.headers.indexOf("Date")]).toBe("11/09/2026");
    expect(cells[table.headers.indexOf("Junction Box Status")]).toBe("Installed");
    expect(cells[table.headers.indexOf("Earthing Wire")]).toBe("Crimped");
    expect(cells[table.headers.indexOf("Meter Status")]).toBe("Working");
    expect(cells[table.headers.indexOf("Remarks")]).toBe("Clean install done");
  });

  it("an empty Date never absorbs a later populated value", async () => {
    const inspectionId = await newInspection();
    await setValue(inspectionId, "pole_id", "SIK001");
    await setValue(inspectionId, "jb_status", "Installed");

    const table = await build();
    const { getCurrentInspectionDate } = require("@/src/utils/date") as typeof import("@/src/utils/date");

    const dateIdx = table.headers.indexOf("Date");
    const jbIdx = table.headers.indexOf("Junction Box Status");
    expect(table.rows[0].cells[dateIdx]).toBe(getCurrentInspectionDate());
    expect(table.rows[0].cells[jbIdx]).toBe("Installed");
    expect(table.rows[0].cells[dateIdx]).not.toBe("Installed");
  });

  it("exported column order matches the form order when custom sections exist", async () => {
    const inspectionId = await newInspection();

    const templateId = (await db.getFirstAsync<{ TemplateID: number }>("SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"))!.TemplateID;
    await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive) VALUES (?, 'Label Info', 'label_info', 99, 0, 1, 0, 1)`,
      [templateId]
    );
    const labelSection = await db.getFirstAsync<{ SectionID: number }>("SELECT SectionID FROM InspectionSections WHERE SectionKey = 'label_info'");

    const maxField = await db.getFirstAsync<{ MaxID: number }>("SELECT MAX(FieldID) AS MaxID FROM InspectionFields");
    await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive) VALUES (?, ?, 'Label Position', 'label_position', 'dropdown', 1, 0, 1, 1)`,
      [labelSection!.SectionID, (maxField?.MaxID ?? 0) + 1]
    );
    await setValue(inspectionId, "label_position", "Mounted");

    const table = await build();
    const labelIdx = table.headers.indexOf("Label Position");
    const remarksIdx = table.headers.indexOf("Remarks");

    expect(labelIdx).toBeGreaterThanOrEqual(0);
    expect(remarksIdx).toBeGreaterThanOrEqual(0);
    expect(labelIdx).toBeLessThan(remarksIdx);
    expect(table.rows[0].cells[labelIdx]).toBe("Mounted");
    expect(table.headers[table.headers.length - 1]).toBe("Remarks");
  });

  it("device field definition values map to their exact device columns", async () => {
    const inspectionId = await newInspection();
    await setValue(inspectionId, "pole_id", "SIK001");
    await db.runAsync(
      "INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData, IsActive) VALUES (?, ?, ?, ?, 1)",
      [inspectionId, "Camera", 1, JSON.stringify({ CameraType: "4K", CameraStatus: "Active" })]
    );

    const table = await build();
    const camTypeIdx = table.headers.indexOf("Camera Type");
    const swTypeIdx = table.headers.indexOf("Switch Type");

    expect(table.headers.length).toBe(table.rows[0].cells.length);
    expect(table.rows[0].cells[camTypeIdx]).toBe("4K");
    expect(table.rows[0].cells[table.headers.indexOf("Camera Status")]).toBe("Active");
    expect(table.rows[0].cells[swTypeIdx]).toBe("");
  });
});