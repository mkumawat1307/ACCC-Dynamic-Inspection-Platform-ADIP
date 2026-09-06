import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";

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
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
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

interface OrphanFieldRow extends Row {
  SectionID: number;
  FieldID: number;
  FieldKey: string;
  FieldName: string;
  IsActive: number;
  IsVisible: number;
  DisplayOrder: number;
}

interface OrphanSectionRow extends Row {
  SectionID: number;
  SectionName: string;
  SectionKey: string;
  IsRepeatable: number;
  IsActive: number;
  IsVisible: number;
}

interface InspRow extends Row {
  InspectionID: number;
  ProjectID: number;
  Status: string;
}

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
      )) as unknown as OrphanFieldRow[];
      const sections = (await orig(
        "SELECT SectionID, SectionKey, SectionName, IsRepeatable, IsActive, IsVisible, DisplayOrder FROM InspectionSections",
        []
      )) as unknown as OrphanSectionRow[];
      const sectionById = new Map(sections.map((s) => [s.SectionID, s]));
      const rows: Record<string, unknown>[] = [];
      for (const f of fields) {
        if (f.IsActive !== 1 || f.IsVisible !== 1) continue;
        const s = sectionById.get(f.SectionID);
        if (!s || s.IsActive !== 1 || s.IsVisible !== 1 || s.SectionKey === "photos") continue;
        rows.push({ SectionID: s.SectionID, SectionKey: s.SectionKey, SectionName: s.SectionName, IsRepeatable: s.IsRepeatable, FieldID: f.FieldID, FieldKey: f.FieldKey, FieldName: f.FieldName });
      }
      rows.sort((a, b) => String(a.DisplayOrder).localeCompare(String(b.DisplayOrder)));
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

const PROJECT = "/mock/documents/Projects/SequentialDeletions/inspection.db";

describe("Report preview survives MULTIPLE sequential configuration deletions", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openSeededProject(): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const { createProjectSchema } = require("@/src/database/schema");
    await createProjectSchema();
    await (require("@/src/database/seeds/inspection-template.seed") as typeof import("@/src/database/seeds/inspection-template.seed")).seedInspectionTemplate();
    await (require("@/src/database/seeds/inspection-sections.seed") as typeof import("@/src/database/seeds/inspection-sections.seed")).seedInspectionSections();
    await (require("@/src/database/seeds/inspection-fields.seed") as typeof import("@/src/database/seeds/inspection-fields.seed")).seedInspectionFields();
    await (require("@/src/database/seeds/field-options.seed") as typeof import("@/src/database/seeds/field-options.seed")).seedFieldOptions();
    await (require("@/src/database/seeds/device-options.seed") as typeof import("@/src/database/seeds/device-options.seed")).seedDeviceOptions();
    await (require("@/src/database/seeds/device-field-definitions.seed") as typeof import("@/src/database/seeds/device-field-definitions.seed")).seedDeviceFieldDefinitions();
    const db = (await dbModule.getDatabase()) as SQLiteDatabase;
    installReportJoinShim(db);
    return db;
  }

  async function insertInspectionWithData(db: SQLiteDatabase, projectId: number): Promise<number> {
    await db.runAsync("INSERT INTO Inspections (ProjectID, Status) VALUES (?, ?)", [projectId, "Completed"]);
    const insp = await db.getFirstAsync<{ InspectionID: number }>("SELECT InspectionID FROM Inspections ORDER BY InspectionID DESC LIMIT 1");
    const inspectionId = insp!.InspectionID;

    const fieldByKey = async (key: string): Promise<number> => {
      const f = await db.getFirstAsync<{ FieldID: number; SectionID: number }>(
        "SELECT FieldID, SectionID FROM InspectionFields WHERE FieldKey = ?",
        [key]
      );
      return f!.FieldID;
    };

    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, await fieldByKey("pole_id"), "P-001"]);
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, await fieldByKey("foundation_cond"), "Acceptable"]);
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, await fieldByKey("camera_count"), "1"]);
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, await fieldByKey("switch_count"), "1"]);
    return inspectionId;
  }

  async function buildTable(projectId = 1) {
    const { buildReportTable } = require("@/src/utils/exportData") as typeof import("@/src/utils/exportData");
    const table = await buildReportTable(projectId);
    return { table, headerIdx: (label: string) => table.headers.indexOf(label) };
  }

  it("scalar: delete a field, then delete a whole section — inspections always remain", async () => {
    const db = await openSeededProject();
    await insertInspectionWithData(db, 1);

    const foundation = await db.getFirstAsync<{ SectionID: number; FieldID: number }>(
      "SELECT SectionID, FieldID FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );

    let r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);

    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    await FieldRepository.delete(foundation!.FieldID);
    r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.headers).toContain("Deleted Foundation Condition");

    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(poleSection!.SectionID);
    r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    expect(r.table.sections.map((s) => s.name)).toContain("Deleted Pole Structure Details");
  });

  it("scalar: delete an option, then a whole section — inspections always remain", async () => {
    const db = await openSeededProject();
    await insertInspectionWithData(db, 1);

    const foundation = await db.getFirstAsync<{ SectionID: number; FieldID: number }>(
      "SELECT SectionID, FieldID FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    const foundationOption = await db.getFirstAsync<{ OptionID: number }>(
      "SELECT OptionID FROM FieldOptions WHERE FieldID = ? LIMIT 1",
      [foundation!.FieldID]
    );
    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );

    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.delete(foundationOption!.OptionID);

    let r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);

    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(poleSection!.SectionID);

    r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    expect(r.table.sections.map((s) => s.name)).toContain("Deleted Pole Structure Details");
  });

  it("device: delete Camera type, then Switch type — inspections always remain with both Deleted bands", async () => {
    const db = await openSeededProject();
    await insertInspectionWithData(db, 1);
    const insp = await db.getFirstAsync<{ InspectionID: number }>("SELECT InspectionID FROM Inspections ORDER BY InspectionID DESC LIMIT 1");
    await db.runAsync("INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData) VALUES (?, 'Camera', 1, '{\"CameraType\":\"PTZ\"}')", [insp!.InspectionID]);
    await db.runAsync("INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData) VALUES (?, 'Switch', 1, '{\"SwitchType\":\"8-Port\"}')", [insp!.InspectionID]);

    const deleteDeviceType = async (deviceType: string): Promise<void> => {
      const countKey = deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count";
      const sectionKey = deviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information";
      await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE DeviceType = ?", [deviceType]);
      await db.runAsync("UPDATE DeviceOptions SET IsActive = 0 WHERE DeviceType = ?", [deviceType]);
      await db.runAsync("UPDATE InspectionSections SET IsActive = 0 WHERE SectionKey = ?", [sectionKey]);
      const countField = await db.getFirstAsync<{ FieldID: number }>("SELECT FieldID FROM InspectionFields WHERE FieldKey = ?", [countKey]);
      if (countField) await db.runAsync("UPDATE InspectionFields SET IsActive = 0 WHERE FieldID = ?", [countField.FieldID]);
      await db.runAsync("DELETE FROM ProjectDeviceTypes WHERE DeviceType = ?", [deviceType]);
    };

    let r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);

    await deleteDeviceType("Camera");
    r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.sections.map((s) => s.name)).toContain("Deleted Camera Information");

    await deleteDeviceType("Switch");
    r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    const names = r.table.sections.map((s) => s.name);
    expect(names).toContain("Deleted Camera Information");
    expect(names).toContain("Deleted Switch Information");
  });

  it("device: delete Camera type, then a standard section — inspections always remain", async () => {
    const db = await openSeededProject();
    await insertInspectionWithData(db, 1);
    const insp = await db.getFirstAsync<{ InspectionID: number }>("SELECT InspectionID FROM Inspections ORDER BY InspectionID DESC LIMIT 1");
    await db.runAsync("INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData) VALUES (?, 'Camera', 1, '{\"CameraType\":\"PTZ\"}')", [insp!.InspectionID]);

    await db.runAsync("UPDATE InspectionSections SET IsActive = 0 WHERE SectionKey = 'camera_information'");

    let r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.sections.map((s) => s.name)).toContain("Deleted Camera Information");

    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );
    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(poleSection!.SectionID);

    r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    const names = r.table.sections.map((s) => s.name);
    expect(names).toContain("Deleted Camera Information");
    expect(names).toContain("Deleted Pole Structure Details");
  });

  it("device option deletion after a standard section deletion stays working", async () => {
    const db = await openSeededProject();
    await insertInspectionWithData(db, 1);
    const insp = await db.getFirstAsync<{ InspectionID: number }>("SELECT InspectionID FROM Inspections ORDER BY InspectionID DESC LIMIT 1");
    await db.runAsync("INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData) VALUES (?, 'Camera', 1, '{\"CameraType\":\"PTZ\"}')", [insp!.InspectionID]);

    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );
    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(poleSection!.SectionID);

    const cameraTypeOption = await db.getFirstAsync<{ OptionID: number }>(
      "SELECT OptionID FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'CameraType' LIMIT 1"
    );
    const DeviceOptionsRepository = require("@/src/database/repositories/DeviceOptionsRepository").default;
    await DeviceOptionsRepository.delete(cameraTypeOption!.OptionID);

    const r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    expect(r.table.sections.map((s) => s.name)).toContain("Deleted Pole Structure Details");
  });

  it("single deletion only — inspections always remain", async () => {
    const db = await openSeededProject();
    await insertInspectionWithData(db, 1);

    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );
    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(poleSection!.SectionID);

    const r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    expect(r.table.sections.map((s) => s.name)).toContain("Deleted Pole Structure Details");
  });

  it("repeated same category: three standard section deletions — inspections always remain", async () => {
    const db = await openSeededProject();
    const inspectionId = await insertInspectionWithData(db, 1);

    const firstFieldIn = async (sectionKey: string): Promise<number> => {
      const sec = await db.getFirstAsync<{ SectionID: number }>(
        "SELECT SectionID FROM InspectionSections WHERE SectionKey = ?",
        [sectionKey]
      );
      const f = await db.getFirstAsync<{ FieldID: number }>(
        "SELECT FieldID FROM InspectionFields WHERE SectionID = ? ORDER BY DisplayOrder LIMIT 1",
        [sec!.SectionID]
      );
      return f!.FieldID;
    };
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, await firstFieldIn("junction_box"), "x"]);
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, await firstFieldIn("earthing"), "x"]);

    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    for (const key of ["pole_structure", "junction_box", "earthing"]) {
      const sec = await db.getFirstAsync<{ SectionID: number }>(
        "SELECT SectionID FROM InspectionSections WHERE SectionKey = ?",
        [key]
      );
      await SectionRepository.softDeleteSection(sec!.SectionID);
    }

    const r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    const names = r.table.sections.map((s) => s.name);
    for (const name of ["Pole Structure Details", "Junction Box and Power Cable", "Earthing Details"]) {
      expect(names).toContain(`Deleted ${name}`);
    }
  });

  it("three or more mixed deletions: field, section, device section — inspections always remain", async () => {
    const db = await openSeededProject();
    const inspectionId = await insertInspectionWithData(db, 1);
    await db.runAsync("INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData) VALUES (?, 'Camera', 1, '{\"CameraType\":\"PTZ\"}')", [inspectionId]);

    const foundation = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    await FieldRepository.delete(foundation!.FieldID);

    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );
    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(poleSection!.SectionID);

    await db.runAsync("UPDATE InspectionSections SET IsActive = 0 WHERE SectionKey = 'camera_information'");

    const r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    expect(r.table.headers).toContain("Deleted Foundation Condition");
    const names = r.table.sections.map((s) => s.name);
    expect(names).toContain("Deleted Pole Structure Details");
    expect(names).toContain("Deleted Camera Information");
  });

  it("standard + custom mixed deletions — inspections always remain", async () => {
    const db = await openSeededProject();
    const inspectionId = await insertInspectionWithData(db, 1);

    const tpl = await db.getFirstAsync<{ TemplateID: number }>("SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1");
    const csec = await db.runAsync(
      "INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive, IsVisible) VALUES (?, ?, ?, ?, 0, 1, 1)",
      [tpl!.TemplateID, "RF Survey", "rf_survey", 20]
    );
    const customSectionId = csec.lastInsertRowId as number;

    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const customFieldId = await FieldRepository.create({
      SectionID: customSectionId,
      FieldName: "RF Data",
      FieldKey: "rf_data",
      FieldType: "dropdown",
    });
    await db.runAsync("INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)", [inspectionId, customFieldId, "Good"]);

    const poleSection = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );
    const SectionRepository = require("@/src/database/repositories/SectionRepository").default as typeof import("@/src/database/repositories/SectionRepository").default;
    await SectionRepository.softDeleteSection(customSectionId);
    await SectionRepository.softDeleteSection(poleSection!.SectionID);

    const r = await buildTable();
    expect(r.table.inspectionCount).toBe(1);
    expect(r.table.rows.length).toBe(1);
    const names = r.table.sections.map((s) => s.name);
    expect(names).toContain("Deleted RF Survey");
    expect(names).toContain("Deleted Pole Structure Details");
  });
});