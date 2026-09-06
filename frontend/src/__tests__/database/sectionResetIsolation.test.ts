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

describe("Section delete + Reset project isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string): Promise<{ db: SQLiteDatabase }> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault) VALUES (?, ?, ?)`,
      ["Template", "desc", 1]
    );
    return { db };
  }

  async function seedDefaultSection(db: SQLiteDatabase, sectionKey: string): Promise<number> {
    const template = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    const res = await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, 1, 1)`,
      [template!.TemplateID, "Default " + sectionKey, sectionKey, 1]
    );
    return res.lastInsertRowId as number;
  }

  it("soft-deleting a custom section in project A does not affect project B", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const template = await dbA.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    const inserted = await dbA.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [template!.TemplateID, "Custom A", "custom_a", 999]
    );
    const customId = inserted.lastInsertRowId as number;

    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    await SectionRepository.softDeleteSection(customId);

    const deleted = await dbA.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [customId]
    );
    expect(deleted!.IsActive).toBe(0);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    const sectionsInB = await dbB.getAllAsync<{ SectionKey: string }>(
      "SELECT SectionKey FROM InspectionSections"
    );
    expect(sectionsInB.some((s) => s.SectionKey === "custom_a")).toBe(false);
  });

  it("protects default sections from deletion (repository rejects, DB unchanged)", async () => {
    const { db: dbA } = await openProject(PROJECT_A);

    const defaultId = await seedDefaultSection(dbA, "general_information");

    const { default: SectionRepository, SectionDeletionError } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");

    await expect(SectionRepository.softDeleteSection(defaultId)).rejects.toThrow(SectionDeletionError);

    const row = await dbA.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [defaultId]
    );
    expect(row!.IsActive).toBe(1);
  });

  it("reset never deletes historical inspection data and is project-isolated", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const insp = await dbA.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, "P-RESET-A", "2026-08-02", "Draft"]
    );
    const inspId = insp.lastInsertRowId as number;

    const field = await dbA.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "Reset Field", "reset_field", "text", 1, 1, 1, 1]
    );
    const fieldId = field.lastInsertRowId as number;
    await dbA.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)`,
      [inspId, fieldId, "keep-me"]
    );
    await dbA.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, IsActive) VALUES (?, ?, ?)`,
      [inspId, "Camera", 1]
    );
    await dbA.runAsync(
      `INSERT INTO Photos (InspectionID, Path) VALUES (?, ?)`,
      [inspId, "/mock/photo.jpg"]
    );

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    await ResetRepository.performReset();

    const valuesAfter = await dbA.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ?",
      [inspId]
    );
    expect(valuesAfter).toEqual([{ FieldValue: "keep-me" }]);

    const deviceRecords = await dbA.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE InspectionID = ?",
      [inspId]
    );
    expect(deviceRecords.length).toBeGreaterThan(0);

    const photos = await dbA.getAllAsync<{ Path: string }>(
      "SELECT Path FROM Photos WHERE InspectionID = ?",
      [inspId]
    );
    expect(photos.length).toBeGreaterThan(0);

    const inspectionsStillThere = await dbA.getAllAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections WHERE InspectionID = ?",
      [inspId]
    );
    expect(inspectionsStillThere.length).toBe(1);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    const valuesInB = await dbB.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ?",
      [inspId]
    );
    expect(valuesInB).toEqual([]);
  });
});
