jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import {
  StatisticCountService,
  COUNT_ENTITIES,
  COUNTER_TYPES,
} from "@/src/database/repositories/StatisticCountService";
import { getTodayDateString } from "@/src/utils/date";
import { DashboardCard } from "@/src/models/DashboardCard";

function createMockDb() {
  return {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn(),
    withTransactionAsync: jest.fn(),
  };
}

function cardOf(
  overrides: Partial<DashboardCard> = {}
): DashboardCard {
  return {
    ProjectID: 1,
    CardKey: "test",
    Title: "Test",
    Icon: "chart-box-outline",
    Color: "#0B5ED7",
    EntityType: "inspections",
    CounterType: "total",
    FilterJson: null,
    CountMode: "count",
    DistinctColumn: null,
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 0,
    ...overrides,
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("StatisticCountService", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("registries", () => {
    it("exposes all four entities", () => {
      expect(Object.keys(COUNT_ENTITIES).sort()).toEqual([
        "cameras",
        "devices",
        "inspections",
        "switches",
      ]);
    });

    it("exposes total and today counter types", () => {
      expect(Object.keys(COUNTER_TYPES).sort()).toEqual(["today", "total"]);
    });
  });

  describe("buildCountSql", () => {
    it("builds a total inspections count with only the project param", () => {
      const built = StatisticCountService.buildCountSql(cardOf());
      expect(built).not.toBeNull();
      const sql = normalizeSql(built!.sql);
      expect(sql).toContain("FROM Inspections i");
      expect(sql).toContain("WHERE i.ProjectID = ?");
      expect(sql).not.toContain("InspectionDate");
      expect(built!.params).toEqual([]);
    });

    it("adds a today time clause for cameras/today", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({ EntityType: "cameras", CounterType: "today" })
      );
      expect(built).not.toBeNull();
      const sql = normalizeSql(built!.sql);
      expect(sql).toContain("JOIN Inspections i ON c.InspectionID = i.InspectionID");
      expect(sql).toContain("AND i.InspectionDate = ?");
      expect(built!.params).toEqual([getTodayDateString()]);
    });

    it("binds a DeviceType filter value for devices", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({
          EntityType: "devices",
          FilterJson: JSON.stringify({ DeviceType: "Switch" }),
        })
      );
      expect(built).not.toBeNull();
      const sql = normalizeSql(built!.sql);
      expect(sql).toContain("r.DeviceType = ?");
      expect(built!.params).toEqual(["Switch"]);
    });

    it("binds a CameraType filter for cameras", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({
          EntityType: "cameras",
          FilterJson: JSON.stringify({ CameraType: "PTZ" }),
        })
      );
      expect(built).not.toBeNull();
      const sql = normalizeSql(built!.sql);
      expect(sql).toContain("c.CameraType = ?");
      expect(built!.params).toEqual(["PTZ"]);
    });

    it("returns null for an unknown entity", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({ EntityType: "nope" })
      );
      expect(built).toBeNull();
    });

    it("returns null for an unknown counter type", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({ CounterType: "weekly" })
      );
      expect(built).toBeNull();
    });

    it("uses COUNT(DISTINCT) for an allowlisted distinct column", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({ CountMode: "distinct", DistinctColumn: "i.PoleID" })
      );
      expect(built).not.toBeNull();
      const sql = normalizeSql(built!.sql);
      expect(sql).toContain("COUNT(DISTINCT i.PoleID) AS count");
    });

    it("falls back to COUNT(*) for a non-allowlisted distinct column", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({ CountMode: "distinct", DistinctColumn: "SecretColumn" })
      );
      expect(built).not.toBeNull();
      expect(built!.sql).toContain("COUNT(*)");
      expect(built!.sql).not.toContain("SecretColumn");
    });

    it("drops filter keys that are not in the allowlist", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({
          EntityType: "cameras",
          FilterJson: JSON.stringify({ SecretColumn: "x", CameraStatus: "Offline" }),
        })
      );
      expect(built).not.toBeNull();
      expect(built!.sql).not.toContain("SecretColumn");
      const sql = normalizeSql(built!.sql);
      expect(sql).toContain("c.CameraStatus = ?");
      expect(built!.params).toEqual(["Offline"]);
    });

    it("tolerates invalid JSON filter payloads", () => {
      const built = StatisticCountService.buildCountSql(
        cardOf({ FilterJson: "not json" })
      );
      expect(built).not.toBeNull();
      expect(built!.sql).not.toContain("not json");
    });

    it("does not interpolate injected filter payloads into SQL", () => {
      const payload = 'x" OR 1=1 --';
      const built = StatisticCountService.buildCountSql(
        cardOf({
          EntityType: "cameras",
          FilterJson: JSON.stringify({ CameraType: payload }),
        })
      );
      expect(built).not.toBeNull();
      expect(built!.sql).not.toContain("OR 1=1");
      expect(built!.sql).not.toContain(payload);
      expect(built!.params).toEqual([payload]);
    });
  });

  describe("countCard", () => {
    it("returns the counted value for a total inspections card", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 7 });
      const result = await StatisticCountService.countCard(1, cardOf());
      expect(result).toBe(7);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining("FROM Inspections i"),
        [1]
      );
    });

    it("returns 0 when the query result is null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const result = await StatisticCountService.countCard(1, cardOf());
      expect(result).toBe(0);
    });

    it("returns 0 when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.countCard(1, cardOf());
      expect(result).toBe(0);
    });

    it("returns 0 when the query rejects", async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.countCard(1, cardOf());
      expect(result).toBe(0);
    });

    it("returns 0 for an unknown entity without touching the db", async () => {
      const result = await StatisticCountService.countCard(
        1,
        cardOf({ EntityType: "bogus" })
      );
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("counts today's cameras end-to-end with date param", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 3 });
      const result = await StatisticCountService.countCard(
        1,
        cardOf({ EntityType: "cameras", CounterType: "today" })
      );
      expect(result).toBe(3);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString()]);
    });
  });
});
