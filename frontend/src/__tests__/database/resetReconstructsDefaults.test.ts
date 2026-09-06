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

const PROJECT = "/mock/documents/Projects/ProjectReconstruct/inspection.db";

type SectionRow = {
  SectionID: number;
  SectionName: string;
  Description: string | null;
  Icon: string | null;
  DisplayOrder: number;
  IsRepeatable: number;
  IsVisible: number;
  IsDefault: number;
  IsActive: number;
};

type FieldRow = {
  FieldID: number;
  FieldName: string;
  FieldKey: string;
  FieldType: string;
  DisplayOrder: number;
  IsRequired: number;
  IsVisible: number;
  IsActive: number;
};

describe("Reset to Default reconstructs missing default configuration", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openSeededProject(): Promise<{ db: SQLiteDatabase }> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const { createProjectSchema } = require("@/src/database/schema");
    await createProjectSchema();
    const tpl = require("@/src/database/seeds/inspection-template.seed");
    await tpl.seedInspectionTemplate();
    const sec = require("@/src/database/seeds/inspection-sections.seed");
    await sec.seedInspectionSections();
    const fld = require("@/src/database/seeds/inspection-fields.seed");
    await fld.seedInspectionFields();
    const fo = require("@/src/database/seeds/field-options.seed");
    await fo.seedFieldOptions();
    const dopt = require("@/src/database/seeds/device-options.seed");
    await dopt.seedDeviceOptions();
    const ddf = require("@/src/database/seeds/device-field-definitions.seed");
    await ddf.seedDeviceFieldDefinitions();
    const db: SQLiteDatabase = await dbModule.getDatabase();
    return { db };
  }

  async function resetToDefault(): Promise<void> {
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();
  }

  it("A. fresh default config: reset keeps every section/field/device row intact with no duplicates", async () => {
    const { db } = await openSeededProject();
    const { FACTORY_SECTIONS } = require("@/src/database/seeds/factory-config");
    const { poleInspectionFields } = require("@/src/database/seeds/pole-inspection-data");
    const { fieldOptions } = require("@/src/database/seeds/field-options.data");
    const { FACTORY_DEVICE_FIELDS, FACTORY_DEVICE_OPTIONS } = require("@/src/database/seeds/factory-config");

    await resetToDefault();
    await resetToDefault();

    const sections = await db.getAllAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE IsDefault = 1"
    );
    expect(sections).toHaveLength(FACTORY_SECTIONS.length);

    const fields = await db.getAllAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields"
    );
    expect(fields).toHaveLength(poleInspectionFields.length);

    const deviceDefs = await db.getAllAsync<{ FieldDefID: number }>(
      "SELECT FieldDefID FROM DeviceFieldDefinitions"
    );
    expect(deviceDefs).toHaveLength(FACTORY_DEVICE_FIELDS.length);

    const deviceOptions = await db.getAllAsync<{ OptionID: number }>(
      "SELECT OptionID FROM DeviceOptions"
    );
    expect(deviceOptions).toHaveLength(FACTORY_DEVICE_OPTIONS.length);

    const fieldOptionsRows = await db.getAllAsync<{ OptionID: number }>(
      "SELECT OptionID FROM FieldOptions"
    );
    expect(fieldOptionsRows).toHaveLength(fieldOptions.length);
  });

  it("B. reset recreates a deleted default section with full metadata and original ordering", async () => {
    const { db } = await openSeededProject();
    await db.runAsync("DELETE FROM InspectionSections WHERE SectionKey = 'pole_structure'");

    await resetToDefault();

    const row = await db.getFirstAsync<SectionRow>(
      "SELECT SectionID, SectionName, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    );
    expect(row).toBeTruthy();
    expect(row!.SectionName).toBe("Pole Structure Details");
    expect(row!.Description).toBe("Pole structure");
    expect(row!.Icon).toBe("business");
    expect(row!.DisplayOrder).toBe(2);
    expect(row!.IsRepeatable).toBe(0);
    expect(row!.IsVisible).toBe(1);
    expect(row!.IsDefault).toBe(1);
    expect(row!.IsActive).toBe(1);

    const sections = await db.getAllAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE IsDefault = 1"
    );
    expect(sections).toHaveLength(10);
  });

  it("C. reset recreates every deleted default section (multiple sections)", async () => {
    const { db } = await openSeededProject();
    await db.runAsync(
      "DELETE FROM InspectionSections WHERE SectionKey IN ('pole_structure', 'earthing', 'meter')"
    );

    await resetToDefault();

    const sections = await db.getAllAsync<{ SectionKey: string; SectionName: string; DisplayOrder: number }>(
      "SELECT SectionKey, SectionName, DisplayOrder FROM InspectionSections WHERE IsDefault = 1 ORDER BY DisplayOrder ASC"
    );
    expect(sections).toHaveLength(10);

    const names = sections.map((s) => s.SectionName);
    expect(names).toContain("Pole Structure Details");
    expect(names).toContain("Earthing Details");
    expect(names).toContain("Metering Information");
    expect(sections[1].SectionKey).toBe("pole_structure");
    expect(sections[1].DisplayOrder).toBe(2);
    expect(sections[4].SectionKey).toBe("meter");
    expect(sections[4].DisplayOrder).toBe(5);
  });

  it("D. reset restores deleted default fields and their field options", async () => {
    const { db } = await openSeededProject();
    await db.runAsync("DELETE FROM InspectionFields WHERE FieldKey = 'pole_avail'");

    await resetToDefault();

    const field = await db.getFirstAsync<FieldRow>(
      "SELECT FieldID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive FROM InspectionFields WHERE FieldKey = 'pole_avail'"
    );
    expect(field).toBeTruthy();
    expect(field!.FieldName).toBe("Pole Availability");
    expect(field!.FieldType).toBe("dropdown");
    expect(field!.DisplayOrder).toBe(2);
    expect(field!.IsRequired).toBe(1);
    expect(field!.IsVisible).toBe(1);
    expect(field!.IsActive).toBe(1);

    const options = await db.getAllAsync<{ OptionID: number }>(
      "SELECT OptionID FROM FieldOptions WHERE FieldID = ?",
      [field!.FieldID]
    );
    expect(options.length).toBeGreaterThan(0);

    const fields = await db.getAllAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields"
    );
    const { poleInspectionFields } = require("@/src/database/seeds/pole-inspection-data");
    expect(fields).toHaveLength(poleInspectionFields.length);
  });

  it("E. reset restores original default section ordering after it was modified", async () => {
    const { db } = await openSeededProject();
    await db.runAsync("UPDATE InspectionSections SET DisplayOrder = ? WHERE SectionKey = 'meter'", [3]);
    await db.runAsync(
      "UPDATE InspectionSections SET DisplayOrder = ? WHERE SectionKey = 'pole_structure'",
      [6]
    );

    await resetToDefault();

    const order = await db.getAllAsync<{ SectionKey: string; DisplayOrder: number }>(
      "SELECT SectionKey, DisplayOrder FROM InspectionSections WHERE IsDefault = 1 ORDER BY DisplayOrder ASC"
    );
    expect(order).toEqual([
      { SectionKey: "general_information", DisplayOrder: 1 },
      { SectionKey: "pole_structure", DisplayOrder: 2 },
      { SectionKey: "junction_box", DisplayOrder: 3 },
      { SectionKey: "earthing", DisplayOrder: 4 },
      { SectionKey: "meter", DisplayOrder: 5 },
      { SectionKey: "connectivity", DisplayOrder: 6 },
      { SectionKey: "camera_information", DisplayOrder: 7 },
      { SectionKey: "switch_information", DisplayOrder: 8 },
      { SectionKey: "remarks", DisplayOrder: 9 },
      { SectionKey: "photos", DisplayOrder: 10 },
    ]);
  });

  it("E2. reset never touches locked sections (display order, name, fields)", async () => {
    const { db } = await openSeededProject();
    await db.runAsync(
      "UPDATE InspectionSections SET DisplayOrder = ? WHERE SectionKey = 'general_information'",
      [99]
    );
    await db.runAsync(
      "UPDATE InspectionSections SET SectionName = ? WHERE SectionKey = 'remarks'",
      ["My Remarks"]
    );
    await db.runAsync("DELETE FROM InspectionFields WHERE FieldKey = 'remarks'");

    await resetToDefault();

    const general = await db.getFirstAsync<{ DisplayOrder: number }>(
      "SELECT DisplayOrder FROM InspectionSections WHERE SectionKey = 'general_information'"
    );
    expect(general!.DisplayOrder).toBe(99);

    const remarksSection = await db.getFirstAsync<{ SectionName: string }>(
      "SELECT SectionName FROM InspectionSections WHERE SectionKey = 'remarks'"
    );
    expect(remarksSection!.SectionName).toBe("My Remarks");

    const remarksField = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'remarks'"
    );
    expect(remarksField).toBeNull();
  });

  it("F. custom section is preserved after reset (deactivated, never deleted)", async () => {
    const { db } = await openSeededProject();
    const template = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
    );
    const inserted = await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [template!.TemplateID, "Custom Section", "custom_admin_section", 999]
    );
    const customId = inserted.lastInsertRowId as number;

    await resetToDefault();

    const custom = await db.getFirstAsync<{ SectionID: number; IsActive: number; IsDefault: number }>(
      "SELECT SectionID, IsActive, IsDefault FROM InspectionSections WHERE SectionID = ?",
      [customId]
    );
    expect(custom).toBeTruthy();
    expect(custom!.IsActive).toBe(0);
    expect(custom!.IsDefault).toBe(0);
  });

  it("G. reset preserves existing inspection values, device records and photos while reconstructing", async () => {
    const { db } = await openSeededProject();

    const insp = await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, "P-RECON-1", "2026-09-01", "Draft"]
    );
    const inspId = insp.lastInsertRowId as number;

    const dateField = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'date'"
    );
    const locationField = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'location'"
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)`,
      [inspId, dateField!.FieldID, "2026-09-04"]
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)`,
      [inspId, locationField!.FieldID, "42 Reset Street"]
    );
    await db.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, IsActive) VALUES (?, ?, ?)`,
      [inspId, "Camera", 1]
    );
    await db.runAsync(`INSERT INTO Photos (InspectionID, Path) VALUES (?, ?)`, [
      inspId,
      "/mock/photo-reset.jpg",
    ]);

    await db.runAsync("DELETE FROM InspectionFields WHERE FieldKey = 'pole_avail'");

    await resetToDefault();

    const values = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ? ORDER BY FieldValue ASC",
      [inspId]
    );
    expect(values).toHaveLength(2);
    expect(values.map((v) => v.FieldValue)).toEqual(["2026-09-04", "42 Reset Street"]);

    const deviceRecords = await db.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE InspectionID = ?",
      [inspId]
    );
    expect(deviceRecords.length).toBeGreaterThan(0);

    const photos = await db.getAllAsync<{ Path: string }>(
      "SELECT Path FROM Photos WHERE InspectionID = ?",
      [inspId]
    );
    expect(photos).toHaveLength(1);

    const inspections = await db.getAllAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections WHERE InspectionID = ?",
      [inspId]
    );
    expect(inspections).toHaveLength(1);
  });

  it("H. reset recreates deleted Camera/Switch device field definitions and options", async () => {
    const { db } = await openSeededProject();
    await db.runAsync(
      "DELETE FROM DeviceFieldDefinitions WHERE DeviceType = 'Camera' AND FieldName = 'CameraIP'"
    );
    await db.runAsync(
      "DELETE FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'CameraType' AND OptionValue = 'Bullet'"
    );
    await db.runAsync("DELETE FROM ProjectDeviceTypes");

    await resetToDefault();

    const ipField = await db.getFirstAsync<{ FieldDefID: number; Label: string; IsActive: number }>(
      "SELECT FieldDefID, Label, IsActive FROM DeviceFieldDefinitions WHERE DeviceType = 'Camera' AND FieldName = 'CameraIP'"
    );
    expect(ipField).toBeTruthy();
    expect(ipField!.Label).toBe("Camera IP");
    expect(ipField!.IsActive).toBe(1);

    const bullet = await db.getFirstAsync<{ OptionID: number; OptionLabel: string }>(
      "SELECT OptionID, OptionLabel FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'CameraType' AND OptionValue = 'Bullet'"
    );
    expect(bullet).toBeTruthy();
    expect(bullet!.OptionLabel).toBe("Bullet");

    const deviceDefs = await db.getAllAsync<{ FieldDefID: number }>(
      "SELECT FieldDefID FROM DeviceFieldDefinitions"
    );
    expect(deviceDefs).toHaveLength(16);

    const deviceOptions = await db.getAllAsync<{ OptionID: number }>(
      "SELECT OptionID FROM DeviceOptions"
    );
    expect(deviceOptions).toHaveLength(50);

    const deviceTypes = await db.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM ProjectDeviceTypes ORDER BY DeviceType ASC"
    );
    expect(deviceTypes.map((t) => t.DeviceType)).toEqual(["Camera", "Switch"]);
  });
});