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

  describe("breakdownCard", () => {
    const breakdownCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ EntityType: "inspections", BreakdownField: "foundation_cond", ...overrides });

    it("groups inspections by field value", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: "Good", count: 42 },
        { label: "Bad", count: 7 },
        { label: "Fair", count: 3 },
      ]);
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([
        { label: "Good", count: 42 },
        { label: "Bad", count: 7 },
        { label: "Fair", count: 3 },
      ]);
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("FROM Inspections i");
      expect(normalizeSql(sql)).toContain("JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("JOIN InspectionFields f ON f.FieldID = iv.FieldID");
      expect(normalizeSql(sql)).toContain("GROUP BY iv.FieldValue");
      expect(params).toEqual([1, "foundation_cond"]);
    });

    it("adds the today date clause and param", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.breakdownCard(1, breakdownCard({ CounterType: "today" }));
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString(), "foundation_cond"]);
    });

    it("stacks a Status filter from FilterJson", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.breakdownCard(
        1,
        breakdownCard({ FilterJson: JSON.stringify({ Status: "Completed" }) })
      );
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.Status = ?");
      expect(params).toEqual([1, "Completed", "foundation_cond"]);
    });

    it("maps null FieldValue labels to (Not set)", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: null, count: 5 },
      ]);
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([{ label: "(Not set)", count: 5 }]);
    });

    it("returns [] for a non-inspections entity without touching the db", async () => {
      const result = await StatisticCountService.breakdownCard(1, breakdownCard({ EntityType: "cameras" }));
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when BreakdownField is missing", async () => {
      const result = await StatisticCountService.breakdownCard(1, cardOf());
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when the query rejects", async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([]);
    });

    it("returns [] when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.breakdownCard(1, breakdownCard());
      expect(result).toEqual([]);
    });
  });

  describe("fieldCard", () => {
    const fieldCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ EntityType: "inspections", AggregateField: "camera_count", ...overrides });

    it("sums the numeric field values for a total card", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ total: 7 });
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(7);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("SUM(CAST(iv.FieldValue AS REAL))");
      expect(normalizeSql(sql)).toContain("FROM Inspections i");
      expect(normalizeSql(sql)).toContain("JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("JOIN InspectionFields f ON f.FieldID = iv.FieldID");
      expect(normalizeSql(sql)).toContain("AND f.FieldKey = ?");
      expect(normalizeSql(sql)).toContain("AND f.IsActive = 1");
      expect(params).toEqual([1, "camera_count"]);
    });

    it("adds the today date clause and param", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ total: 3 });
      const result = await StatisticCountService.fieldCard(1, fieldCard({ CounterType: "today" }));
      expect(result).toBe(3);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString(), "camera_count"]);
    });

    it("returns 0 when the sum is null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(0);
    });

    it("returns 0 for a non-inspections entity without touching the db", async () => {
      const result = await StatisticCountService.fieldCard(1, fieldCard({ EntityType: "cameras" }));
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 when AggregateField is missing", async () => {
      const result = await StatisticCountService.fieldCard(1, cardOf());
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 for an unknown counter type", async () => {
      const result = await StatisticCountService.fieldCard(1, fieldCard({ CounterType: "weekly" }));
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 when the query rejects", async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(0);
    });

    it("returns 0 when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.fieldCard(1, fieldCard());
      expect(result).toBe(0);
    });
  });
});
