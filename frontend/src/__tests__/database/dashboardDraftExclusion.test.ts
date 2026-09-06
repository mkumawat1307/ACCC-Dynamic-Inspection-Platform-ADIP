import type { SQLiteDatabase } from "expo-sqlite";
import type { DashboardCard } from "@/src/models/DashboardCard";

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

const PROJECT_PATH = "/mock/documents/Projects/DraftCountProj/inspection.db";

function cardOf(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    ProjectID: 1,
    CardKey: "total_inspections",
    Title: "Total Inspections",
    Icon: "chart-box-outline",
    Color: "#0B5ED7",
    EntityType: "inspections",
    CounterType: "total",
    FilterJson: null,
    CountMode: "count",
    DistinctColumn: null,
    CardMode: "entitycount",
    DeviceType: null,
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 0,
    ...overrides,
  };
}

describe("Dashboard count draft exclusion", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    return db;
  }

  async function seed(db: SQLiteDatabase): Promise<void> {
    const statuses = [
      "Completed",
      "Completed",
      "Completed",
      "Completed",
      "Completed",
      "Completed",
      "Completed",
      "Draft",
      "Draft",
      "Draft",
    ];
    for (let i = 0; i < statuses.length; i++) {
      await db.runAsync(
        "INSERT INTO Inspections (ProjectID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?)",
        [1, `P-${i + 1}`, "2026-08-02", statuses[i]]
      );
    }
  }

  it("verifies Total=10, Draft=3, Dashboard-visible=7 for the dashboard count", async () => {
    const { StatisticCountService } = require("@/src/database/repositories/StatisticCountService") as typeof import("@/src/database/repositories/StatisticCountService");

    const db = await openProject(PROJECT_PATH);
    await seed(db);

    const totalRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM Inspections"
    );
    expect(totalRow?.count).toBe(10);

    const draftRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM Inspections WHERE Status = 'Draft'"
    );
    expect(draftRow?.count).toBe(3);

    const built = StatisticCountService.buildCountSql(cardOf());
    expect(built).not.toBeNull();
    expect(built!.sql).toContain("i.Status != 'Draft'");

    const dashboardVisible = await StatisticCountService.countCard(1, cardOf());
    expect(dashboardVisible).toBe(7);
  });
});
