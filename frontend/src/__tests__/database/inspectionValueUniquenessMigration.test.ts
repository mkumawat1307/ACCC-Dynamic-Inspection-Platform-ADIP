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

const DB_PATH = "/mock/documents/Projects/DedupeRegression/inspection.db";

describe("migrateInspectionValueUniqueness", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(DB_PATH);
    return (await dbModule.getDatabase()) as SQLiteDatabase;
  }

  function requireMigrationHelper() {
    const { migrateInspectionValueUniqueness } = require("@/src/database/schema") as {
      migrateInspectionValueUniqueness: (db: SQLiteDatabase) => Promise<void>;
    };
    return migrateInspectionValueUniqueness;
  }

  it("dedupes legacy duplicate rows keeping the newest value per (inspection, field)", async () => {
    const db = await openProject();
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (1, 10, 'old', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (1, 10, 'new', '2026-01-02 00:00:00', '2026-01-02 00:00:00')`
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (2, 20, 'single', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`
    );

    const migrateInspectionValueUniqueness = requireMigrationHelper();
    await migrateInspectionValueUniqueness(db);

    const rows = await db.getAllAsync<{ InspectionID: number; FieldID: number; FieldValue: string }>(
      "SELECT InspectionID, FieldID, FieldValue FROM InspectionValues"
    );
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      { InspectionID: 1, FieldID: 10, FieldValue: "new" },
      { InspectionID: 2, FieldID: 20, FieldValue: "single" },
    ]));
  });

  it("breaks ties by keeping the highest ValueID", async () => {
    const db = await openProject();
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (3, 30, 'tie-old', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (3, 30, 'tie-new', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`
    );

    const migrateInspectionValueUniqueness = requireMigrationHelper();
    await migrateInspectionValueUniqueness(db);

    const rows = await db.getAllAsync<{ ValueID: number; FieldValue: string }>(
      "SELECT ValueID, FieldValue FROM InspectionValues WHERE InspectionID = 3 AND FieldID = 30"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].FieldValue).toBe("tie-new");
  });

  it("is idempotent across repeated runs", async () => {
    const db = await openProject();
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (1, 10, 'old', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`
    );
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue, CreatedAt, UpdatedAt) VALUES (1, 10, 'new', '2026-01-02 00:00:00', '2026-01-02 00:00:00')`
    );

    const migrateInspectionValueUniqueness = requireMigrationHelper();
    await migrateInspectionValueUniqueness(db);
    await migrateInspectionValueUniqueness(db);

    const rows = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].FieldValue).toBe("new");
  });
});