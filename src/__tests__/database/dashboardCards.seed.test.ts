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

const PROJECT_SEED = "/mock/documents/Projects/SeedProject/inspection.db";

describe("dashboard-cards.seed", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT_SEED);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    return db;
  }

  it("creates the DashboardCards table via createProjectSchema", async () => {
    await openProject();
    const schemaModule = require("@/src/database/schema") as typeof import("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const execSpy = jest.spyOn(db, "execAsync");

    await schemaModule.createProjectSchema();

    expect(execSpy).toHaveBeenCalledWith(createDashboardCardsTable);
  });

  it("seeds exactly the six default cards on an empty project", async () => {
    await openProject();
    const { seedDashboardCards, DEFAULT_DASHBOARD_CARDS } = require("@/src/database/seeds/dashboard-cards.seed");

    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string; Title: string }>(
      "SELECT CardKey, Title FROM DashboardCards"
    );

    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.CardKey).sort()).toEqual(
      ["total_inspections", "total_poles", "total_cameras", "today_inspections_done", "today_poles", "today_cameras"].sort()
    );
    expect(DEFAULT_DASHBOARD_CARDS).toHaveLength(6);
  });

  it("is idempotent — seeding twice leaves exactly 6 rows", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");

    await seedDashboardCards();
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );

    expect(cards).toHaveLength(6);
  });

  it("does not duplicate existing default cards when custom rows exist", async () => {
    await openProject();
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();

    await db.runAsync(
      `INSERT INTO DashboardCards
       (ProjectID, CardKey, Title, Icon, Color, EntityType, CounterType, FilterJson, CountMode, DistinctColumn, SortOrder, Enabled, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, 1, 0)`,
      [1, "custom_switch_total", "Total Switches", "lan", "#111111", "devices", "total", "count", 99]
    );

    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const cards = await db.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );

    expect(cards).toHaveLength(7);
    const keys = cards.map((c) => c.CardKey);
    expect(keys.filter((k) => k === "total_poles")).toHaveLength(1);
    expect(keys).toContain("custom_switch_total");
  });

  it("seeds today_inspections_done with a Completed status filter", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const row = await db.getFirstAsync<{ FilterJson: string; CounterType: string; SortOrder: number }>(
      "SELECT FilterJson, CounterType, SortOrder FROM DashboardCards WHERE CardKey = 'today_inspections_done'"
    );
    expect(row).not.toBeNull();
    expect(row!.FilterJson).toBe(JSON.stringify({ Status: "Completed" }));
    expect(row!.CounterType).toBe("today");
    expect(row!.SortOrder).toBe(3);
  });
});
