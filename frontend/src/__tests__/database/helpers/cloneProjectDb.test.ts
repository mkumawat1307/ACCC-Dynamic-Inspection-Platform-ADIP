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

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("cloneProjectDb", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function setupProject(dbPath: string): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const schemaModule = require("@/src/database/schema") as typeof import("@/src/database/schema");
    await schemaModule.createProjectSchema();
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault) VALUES (?, ?, ?)`,
      ["Default", "desc", 1]
    );
    return db;
  }

  it("copies settings from source project into the cloned project DB", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);

    const template = await dbA.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    expect(template).not.toBeNull();

    await dbA.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [template!.TemplateID, "Custom Section", "custom_section", "d", "icon", 1, 0, 1, 0, 1]
    );

    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB: SQLiteDatabase = await dbModule.getDatabase();

    const sectionsInB = await dbB.getAllAsync<{ SectionKey: string }>(
      "SELECT SectionKey FROM InspectionSections"
    );
    expect(sectionsInB.some((s) => s.SectionKey === "custom_section")).toBe(true);
    await dbModule.clearActiveProject();
  });

  it("copies per-inspection data into the cloned project DB with remapped IDs", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);

    await dbA.runAsync(
      `INSERT INTO Inspections (InspectionID, ProjectID, DistrictID, PoleID, InspectionDate, Status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [101, 7, 1, "P001", "2024-01-01", "Draft"]
    );
    await dbA.runAsync(
      `INSERT INTO InspectionValues (ValueID, InspectionID, FieldID, FieldValue)
       VALUES (?, ?, ?, ?)`,
      [301, 101, 1, "P001"]
    );
    await dbA.runAsync(
      `INSERT INTO Photos (PhotoID, InspectionID, FileName, FilePath, Latitude, Longitude)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [401, 101, "p.jpg", "/x/p.jpg", 12.3, 77.4]
    );
    await dbA.runAsync(
      `INSERT INTO DeviceRecords (RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [601, 101, "UPS", 1, '{"UPSModel":"APC"}', 1]
    );

    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB: SQLiteDatabase = await dbModule.getDatabase();

    const inspections = await dbB.getAllAsync<{ InspectionID: number; ProjectID: number; PoleID: string }>(
      "SELECT InspectionID, ProjectID, PoleID FROM Inspections"
    );
    expect(inspections).toHaveLength(1);
    expect(inspections[0].ProjectID).toBe(99);
    expect(inspections[0].PoleID).toBe("P001");
    expect(inspections[0].InspectionID).not.toBe(101);

    const newInspectionId = inspections[0].InspectionID;

    const values = await dbB.getAllAsync<{ InspectionID: number; FieldValue: string }>(
      "SELECT InspectionID, FieldValue FROM InspectionValues"
    );
    expect(values).toHaveLength(1);
    expect(values[0].InspectionID).toBe(newInspectionId);
    expect(values[0].FieldValue).toBe("P001");

    const photos = await dbB.getAllAsync<{ InspectionID: number; FileName: string }>(
      "SELECT InspectionID, FileName FROM Photos"
    );
    expect(photos).toHaveLength(1);
    expect(photos[0].InspectionID).toBe(newInspectionId);
    expect(photos[0].FileName).toBe("p.jpg");

    const devices = await dbB.getAllAsync<{ InspectionID: number; DeviceType: string }>(
      "SELECT InspectionID, DeviceType FROM DeviceRecords"
    );
    expect(devices).toHaveLength(1);
    expect(devices[0].InspectionID).toBe(newInspectionId);
    expect(devices[0].DeviceType).toBe("UPS");

    await dbModule.clearActiveProject();
  });

  it("remaps repeatable record and value IDs when cloning", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);

    await dbA.runAsync(
      `INSERT INTO Inspections (InspectionID, ProjectID, DistrictID, PoleID, InspectionDate, Status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [101, 7, 1, "P001", "2024-01-01", "Draft"]
    );
    await dbA.runAsync(
      `INSERT INTO RepeatableRecords (RecordID, InspectionID, GroupID, RecordIndex, IsActive)
       VALUES (?, ?, ?, ?, ?)`,
      [501, 101, 1, 1, 1]
    );
    await dbA.runAsync(
      `INSERT INTO RepeatableValues (ValueID, RecordID, GroupFieldID, FieldValue)
       VALUES (?, ?, ?, ?)`,
      [551, 501, 1, "v"]
    );

    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB: SQLiteDatabase = await dbModule.getDatabase();

    const inspections = await dbB.getAllAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections"
    );
    const newInspectionId = inspections[0].InspectionID;

    const records = await dbB.getAllAsync<{ RecordID: number; InspectionID: number }>(
      "SELECT RecordID, InspectionID FROM RepeatableRecords"
    );
    expect(records).toHaveLength(1);
    expect(records[0].InspectionID).toBe(newInspectionId);
    expect(records[0].RecordID).not.toBe(501);

    const values = await dbB.getAllAsync<{ RecordID: number; FieldValue: string }>(
      "SELECT RecordID, FieldValue FROM RepeatableValues"
    );
    expect(values).toHaveLength(1);
    expect(values[0].RecordID).toBe(records[0].RecordID);
    expect(values[0].FieldValue).toBe("v");

    await dbModule.clearActiveProject();
  });

  it("clones cleanly when the target DB already has DashboardCards rows with the same CardKeys (retry of a failed clone)", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const schemaModule = require("@/src/database/schema") as typeof import("@/src/database/schema");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);
    await dbA.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, CountMode, CardMode, SectionLabel, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [7, "total_pole_status", "Pole Availability", "transmission-tower", "#198754", "inspections", "total", "count", "dropdown", "Total Summary", 1, 1, 1]
    );
    await dbModule.clearActiveProject();

    await dbModule.setActiveProject(PROJECT_B);
    await schemaModule.createProjectSchema();
    const dbB = await dbModule.getDatabase();
    await dbB.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, CountMode, CardMode, SectionLabel, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [7, "total_pole_status", "Pole Availability", "transmission-tower", "#198754", "inspections", "total", "count", "dropdown", "Total Summary", 1, 1, 1]
    );
    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB2 = await dbModule.getDatabase();
    const cards = await dbB2.getAllAsync<{ ProjectID: number; CardKey: string }>(
      "SELECT ProjectID, CardKey FROM DashboardCards"
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].ProjectID).toBe(99);
    expect(cards[0].CardKey).toBe("total_pole_status");
    await dbModule.clearActiveProject();
  });

  it("dedupes DashboardCards with duplicate CardKeys in the source when cloning", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { cloneProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    const dbA = await setupProject(PROJECT_A);
    for (let i = 0; i < 2; i++) {
      await dbA.runAsync(
        `INSERT INTO DashboardCards
         (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, CountMode, CardMode, SectionLabel, SortOrder, Enabled, IsDefault)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [7, "total_pole_status", "Pole Availability", "transmission-tower", "#198754", "inspections", "total", "count", "dropdown", "Total Summary", 1, 1, 1]
      );
    }
    await dbModule.clearActiveProject();

    await cloneProjectDb(PROJECT_A, "Clone", PROJECT_B, 99);

    await dbModule.setActiveProject(PROJECT_B);
    const dbB = await dbModule.getDatabase();
    const cards = await dbB.getAllAsync<{ ProjectID: number; CardKey: string }>(
      "SELECT ProjectID, CardKey FROM DashboardCards"
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].ProjectID).toBe(99);
    expect(cards[0].CardKey).toBe("total_pole_status");
    await dbModule.clearActiveProject();
  });
});
