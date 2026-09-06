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

const PROJECT_A = "/mock/documents/Projects/DeviceProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/DeviceProjectBeta/inspection.db";

describe("Device-count data isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault) VALUES (?, ?, ?)`,
      ["Template", "desc", 1]
    );
    return db;
  }

  it("does not leak DeviceRecords written in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const dbA = await openProject(PROJECT_A);

    await dbA.runAsync(
      `INSERT INTO DeviceRecords (RecordID, InspectionID, DeviceType, DeviceLabel, DeviceData, IsActive)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, 100, "Camera", "CAM-LEAK", JSON.stringify({ CameraStatus: "Operational" }), 1]
    );

    const rowsInA = await dbA.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE DeviceType = 'Camera'"
    );
    expect(rowsInA).toHaveLength(1);

    await dbModule.clearActiveProject();
    const dbB = await openProject(PROJECT_B);

    const rowsInB = await dbB.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE DeviceType = 'Camera'"
    );
    expect(rowsInB).toEqual([]);

    const rowsInAAfter = await dbA.getAllAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM DeviceRecords WHERE DeviceType = 'Camera'"
    );
    expect(rowsInAAfter).toHaveLength(1);
  });

  it("does not leak a device-count card created in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const dbA = await openProject(PROJECT_A);

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository") as typeof import("@/src/database/repositories/DashboardCardRepository");
    const cardId = await DashboardCardRepository.createCard({
      ProjectID: 1,
      CardKey: "leak_device_card",
      Title: "Total Camera Count",
      Icon: "camera",
      Color: "#111111",
      EntityType: "devices",
      CounterType: "total",
      FilterJson: JSON.stringify({ DeviceType: "Camera" }),
      CountMode: "count",
      CardMode: "entitycount",
      DistinctColumn: null,
      DeviceType: "Camera",
      SortOrder: 0,
      Enabled: 1,
      IsDefault: 0,
    });
    expect(cardId).toBeGreaterThan(0);

    const cardInA = await dbA.getAllAsync<{ CardKey: string; DeviceType: string | null }>(
      "SELECT CardKey, DeviceType FROM DashboardCards WHERE CardKey = 'leak_device_card'"
    );
    expect(cardInA).toEqual([{ CardKey: "leak_device_card", DeviceType: "Camera" }]);

    await dbModule.clearActiveProject();

    const dbB = await openProject(PROJECT_B);

    const cardsInB = await dbB.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );
    expect(cardsInB.some((c) => c.CardKey === "leak_device_card")).toBe(false);

    const cardsInAAfter = await dbA.getAllAsync<{ CardKey: string; DeviceType: string | null }>(
      "SELECT CardKey, DeviceType FROM DashboardCards WHERE CardKey = 'leak_device_card'"
    );
    expect(cardsInAAfter).toEqual([{ CardKey: "leak_device_card", DeviceType: "Camera" }]);
  });
});
