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

  it("seeds exactly the six sectioned default cards on an empty project", async () => {
    await openProject();
    const { seedDashboardCards, DEFAULT_SECTIONED_CARDS } = require("@/src/database/seeds/dashboard-cards.seed");

    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string; SectionLabel: string; CardMode: string }>(
      "SELECT CardKey, SectionLabel, CardMode FROM DashboardCards"
    );

    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.CardKey).sort()).toEqual(
      ["total_inspection_done", "total_pole_status", "total_camera_count", "today_inspection_done", "today_pole_status", "today_camera_count"].sort()
    );
    expect(cards.filter((c) => c.SectionLabel === "Total")).toHaveLength(3);
    expect(cards.filter((c) => c.SectionLabel === "Today's")).toHaveLength(3);
    expect(cards.filter((c) => c.CardMode === "entitycount")).toHaveLength(2);
    expect(cards.filter((c) => c.CardMode === "dropdown")).toHaveLength(2);
    expect(cards.filter((c) => c.CardMode === "sum")).toHaveLength(2);
    expect(DEFAULT_SECTIONED_CARDS).toHaveLength(6);
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
    expect(keys.filter((k) => k === "total_inspection_done")).toHaveLength(1);
    expect(keys).toContain("custom_switch_total");
  });

  it("seeds today_inspection_done with a Completed filter, today counter, and Today's label", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const row = await db.getFirstAsync<{ FilterJson: string; CounterType: string; SortOrder: number; SectionLabel: string }>(
      "SELECT FilterJson, CounterType, SortOrder, SectionLabel FROM DashboardCards WHERE CardKey = 'today_inspection_done'"
    );
    expect(row).not.toBeNull();
    expect(row!.FilterJson).toBe(JSON.stringify({ Status: "Completed" }));
    expect(row!.CounterType).toBe("today");
    expect(row!.SortOrder).toBe(3);
    expect(row!.SectionLabel).toBe("Today's");
  });

  it("seeds the Camera Count SUM and Pole Status breakdown defaults", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const camera = await db.getFirstAsync<{ AggregateField: string; SectionLabel: string; CardMode: string }>(
      "SELECT AggregateField, SectionLabel, CardMode FROM DashboardCards WHERE CardKey = 'total_camera_count'"
    );
    expect(camera).not.toBeNull();
    expect(camera!.AggregateField).toBe("camera_count");
    expect(camera!.SectionLabel).toBe("Total");
    expect(camera!.CardMode).toBe("sum");

    const pole = await db.getFirstAsync<{ BreakdownField: string; CardMode: string }>(
      "SELECT BreakdownField, CardMode FROM DashboardCards WHERE CardKey = 'total_pole_status'"
    );
    expect(pole).not.toBeNull();
    expect(pole!.BreakdownField).toBe("pole_avail");
    expect(pole!.CardMode).toBe("dropdown");
  });

  it("seeds every default card with an explicit CardMode", async () => {
    await openProject();
    const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
    await seedDashboardCards();

    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const db: SQLiteDatabase = await dbModule.getDatabase();
    const cards = await db.getAllAsync<{ CardKey: string; CardMode: string }>(
      "SELECT CardKey, CardMode FROM DashboardCards"
    );
    const byKey = Object.fromEntries(cards.map((c) => [c.CardKey, c.CardMode]));

    expect(byKey["total_inspection_done"]).toBe("entitycount");
    expect(byKey["total_pole_status"]).toBe("dropdown");
    expect(byKey["total_camera_count"]).toBe("sum");
    expect(byKey["today_inspection_done"]).toBe("entitycount");
    expect(byKey["today_pole_status"]).toBe("dropdown");
    expect(byKey["today_camera_count"]).toBe("sum");
  });
});
