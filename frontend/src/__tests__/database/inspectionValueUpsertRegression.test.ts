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

const DB_PATH = "/mock/documents/Projects/UpsertRegression/inspection.db";

describe("InspectionValueRepository upsert regression", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(DB_PATH);
    return (await dbModule.getDatabase()) as SQLiteDatabase;
  }

  async function seedParent(
    db: SQLiteDatabase,
    poleId: string
  ): Promise<{ inspectionId: number; fieldId: number }> {
    const insp = await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, poleId, "2026-08-02", "Draft"]
    );
    const field = await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "Pole Voltage", "pole_voltage", "text", 1, 1, 1, 1]
    );
    return {
      inspectionId: insp.lastInsertRowId as number,
      fieldId: field.lastInsertRowId as number,
    };
  }

  async function addField(db: SQLiteDatabase): Promise<number> {
    const field = await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "Pole Type", "pole_type", "text", 2, 1, 1, 1]
    );
    return field.lastInsertRowId as number;
  }

  it("collapses rapid overlapping saves for the same (inspection, field) into a single row", async () => {
    const db = await openProject();
    const { inspectionId, fieldId } = await seedParent(db, "P-UPS-1");
    const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository") as typeof import("@/src/database/repositories/InspectionValueRepository");

    await Promise.all([
      InspectionValueRepository.saveValue(inspectionId, fieldId, "11kV"),
      InspectionValueRepository.saveValue(inspectionId, fieldId, "22kV"),
    ]);

    const rows = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?",
      [inspectionId, fieldId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].FieldValue).toBe("22kV");
  });

  it("keeps a single row with the latest value for sequential saves of the same pair", async () => {
    const db = await openProject();
    const { inspectionId, fieldId } = await seedParent(db, "P-UPS-2");
    const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository") as typeof import("@/src/database/repositories/InspectionValueRepository");

    await InspectionValueRepository.saveValue(inspectionId, fieldId, "33kV");
    await InspectionValueRepository.saveValue(inspectionId, fieldId, "44kV");

    const rows = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?",
      [inspectionId, fieldId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].FieldValue).toBe("44kV");
  });

  it("keeps values for different fields on the same inspection as separate rows", async () => {
    const db = await openProject();
    const { inspectionId, fieldId } = await seedParent(db, "P-UPS-3");
    const secondFieldId = await addField(db);
    const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository") as typeof import("@/src/database/repositories/InspectionValueRepository");

    await InspectionValueRepository.saveValue(inspectionId, fieldId, "A");
    await InspectionValueRepository.saveValue(inspectionId, secondFieldId, "B");

    const rows = await db.getAllAsync<{ FieldID: number; FieldValue: string }>(
      "SELECT FieldID, FieldValue FROM InspectionValues WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(rows).toHaveLength(2);
  });

  it("keeps values for the same field across different inspections as separate rows", async () => {
    const db = await openProject();
    const { inspectionId: firstInspectionId, fieldId } = await seedParent(db, "P-UPS-4");
    const second = await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, "P-UPS-5", "2026-08-02", "Draft"]
    );
    const secondInspectionId = second.lastInsertRowId as number;
    const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository") as typeof import("@/src/database/repositories/InspectionValueRepository");

    await InspectionValueRepository.saveValue(firstInspectionId, fieldId, "X");
    await InspectionValueRepository.saveValue(secondInspectionId, fieldId, "Y");

    const rows = await db.getAllAsync<{ InspectionID: number; FieldValue: string }>(
      "SELECT InspectionID, FieldValue FROM InspectionValues WHERE FieldID = ?",
      [fieldId]
    );
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      { InspectionID: firstInspectionId, FieldValue: "X" },
      { InspectionID: secondInspectionId, FieldValue: "Y" },
    ]));
  });
});