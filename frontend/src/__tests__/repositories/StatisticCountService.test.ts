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
    CardMode: "entitycount",
    DeviceType: null,
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

    it("scopes devices counts to active records and device type", () => {
      const card = cardOf({
        EntityType: "devices",
        CounterType: "total",
        FilterJson: JSON.stringify({ DeviceType: "Camera" }),
        CountMode: "count",
      });
      const built = StatisticCountService.buildCountSql(card)!;
      const sql = normalizeSql(built.sql);
      expect(sql).toContain("FROM DeviceRecords r");
      expect(sql).toContain("WHERE i.ProjectID = ? AND r.IsActive = 1");
      expect(sql).toContain("AND r.DeviceType = ?");
      expect(built.params).toEqual(["Camera"]);
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

  describe("fieldCountCard", () => {
    const fieldCountCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ EntityType: "inspections", BreakdownField: "camera_count", ...overrides });

    it("counts inspections having a non-empty value, ignoring empty ones", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 7 });
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard());
      expect(result).toBe(7);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("COUNT(DISTINCT iv.InspectionID) AS count");
      expect(normalizeSql(sql)).toContain("FROM Inspections i");
      expect(normalizeSql(sql)).toContain("JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("JOIN InspectionFields f ON f.FieldID = iv.FieldID");
      expect(normalizeSql(sql)).toContain("AND iv.FieldValue IS NOT NULL AND iv.FieldValue != ''");
      expect(normalizeSql(sql)).toContain("AND f.FieldKey = ?");
      expect(normalizeSql(sql)).toContain("AND f.IsActive = 1");
      expect(params).toEqual([1, "camera_count"]);
    });

    it("adds the today date clause and param", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 3 });
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard({ CounterType: "today" }));
      expect(result).toBe(3);
      const [sql, params] = (mockDb.getFirstAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString(), "camera_count"]);
    });

    it("returns 0 when the query result is null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard());
      expect(result).toBe(0);
    });

    it("returns 0 for a non-inspections entity without touching the db", async () => {
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard({ EntityType: "cameras" }));
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 when BreakdownField is missing", async () => {
      const result = await StatisticCountService.fieldCountCard(1, cardOf());
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 for an unknown counter type", async () => {
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard({ CounterType: "weekly" }));
      expect(result).toBe(0);
      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
    });

    it("returns 0 when the query rejects", async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard());
      expect(result).toBe(0);
    });

    it("returns 0 when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.fieldCountCard(1, fieldCountCard());
      expect(result).toBe(0);
    });
  });

  describe("dateBreakdownCard", () => {
    const dateBreakdownCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ EntityType: "inspections", BreakdownField: "inspection_date", ...overrides });

    it("groups inspections by field value ordered count DESC, label ASC", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: "2026-08-01", count: 12 },
        { label: "2026-08-02", count: 5 },
      ]);
      const result = await StatisticCountService.dateBreakdownCard(1, dateBreakdownCard());
      expect(result).toEqual([
        { label: "2026-08-01", count: 12 },
        { label: "2026-08-02", count: 5 },
      ]);
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("FROM Inspections i");
      expect(normalizeSql(sql)).toContain("JOIN InspectionValues iv ON iv.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("JOIN InspectionFields f ON f.FieldID = iv.FieldID");
      expect(normalizeSql(sql)).toContain("GROUP BY iv.FieldValue");
      expect(normalizeSql(sql)).toContain("ORDER BY count DESC, label ASC");
      expect(params).toEqual([1, "inspection_date"]);
    });

    it("adds the today date clause and param", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.dateBreakdownCard(1, dateBreakdownCard({ CounterType: "today" }));
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString(), "inspection_date"]);
    });

    it("stacks a Status filter from FilterJson", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.dateBreakdownCard(
        1,
        dateBreakdownCard({ FilterJson: JSON.stringify({ Status: "Completed" }) })
      );
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.Status = ?");
      expect(params).toEqual([1, "Completed", "inspection_date"]);
    });

    it("maps null FieldValue labels to (Not set)", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ label: null, count: 5 }]);
      const result = await StatisticCountService.dateBreakdownCard(1, dateBreakdownCard());
      expect(result).toEqual([{ label: "(Not set)", count: 5 }]);
    });

    it("returns [] for a non-inspections entity without touching the db", async () => {
      const result = await StatisticCountService.dateBreakdownCard(1, dateBreakdownCard({ EntityType: "cameras" }));
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when BreakdownField is missing", async () => {
      const result = await StatisticCountService.dateBreakdownCard(1, cardOf());
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when the query rejects", async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.dateBreakdownCard(1, dateBreakdownCard());
      expect(result).toEqual([]);
    });

    it("returns [] when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.dateBreakdownCard(1, dateBreakdownCard());
      expect(result).toEqual([]);
    });
  });

  describe("deviceBreakdownCard", () => {
    const deviceBreakdownCard = (overrides: Partial<DashboardCard> = {}): DashboardCard =>
      cardOf({ EntityType: "cameras", BreakdownField: "CameraType", ...overrides });

    it("groups cameras by an allowlisted column", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: "PTZ", count: 3 },
        { label: "Fixed", count: 2 },
      ]);
      const result = await StatisticCountService.deviceBreakdownCard(1, deviceBreakdownCard());
      expect(result).toEqual([
        { label: "PTZ", count: 3 },
        { label: "Fixed", count: 2 },
      ]);
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("SELECT c.CameraType AS label");
      expect(normalizeSql(sql)).toContain("FROM Cameras c");
      expect(normalizeSql(sql)).toContain("JOIN Inspections i ON c.InspectionID = i.InspectionID");
      expect(normalizeSql(sql)).toContain("AND c.CameraType IS NOT NULL AND c.CameraType != ''");
      expect(normalizeSql(sql)).toContain("GROUP BY c.CameraType");
      expect(normalizeSql(sql)).toContain("ORDER BY count DESC, label ASC");
      expect(params).toEqual([1]);
    });

    it("groups switches by an allowlisted column", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ label: "Managed", count: 4 }]);
      const result = await StatisticCountService.deviceBreakdownCard(
        1,
        deviceBreakdownCard({ EntityType: "switches", BreakdownField: "SwitchType" })
      );
      expect(result).toEqual([{ label: "Managed", count: 4 }]);
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("SELECT s.SwitchType AS label");
      expect(normalizeSql(sql)).toContain("FROM Switches s");
      expect(params).toEqual([1]);
    });

    it("applies the today time clause via the entity alias", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      await StatisticCountService.deviceBreakdownCard(1, deviceBreakdownCard({ CounterType: "today" }));
      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(normalizeSql(sql)).toContain("AND i.InspectionDate = ?");
      expect(params).toEqual([1, getTodayDateString()]);
    });

    it("maps null column labels to (Not set)", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ label: null, count: 5 }]);
      const result = await StatisticCountService.deviceBreakdownCard(1, deviceBreakdownCard());
      expect(result).toEqual([{ label: "(Not set)", count: 5 }]);
    });

    it("rejects a non-allowlisted column without touching the db", async () => {
      const result = await StatisticCountService.deviceBreakdownCard(
        1,
        deviceBreakdownCard({ BreakdownField: "SecretColumn" })
      );
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] for an entity with an empty device allowlist", async () => {
      const result = await StatisticCountService.deviceBreakdownCard(
        1,
        deviceBreakdownCard({ EntityType: "inspections", BreakdownField: "foundation_cond" })
      );
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when BreakdownField is missing", async () => {
      const result = await StatisticCountService.deviceBreakdownCard(1, cardOf());
      expect(result).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("returns [] when the query rejects", async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error("no such table"));
      const result = await StatisticCountService.deviceBreakdownCard(1, deviceBreakdownCard());
      expect(result).toEqual([]);
    });

    it("returns [] when getDatabase throws", async () => {
      (getDatabase as jest.Mock).mockRejectedValue(new Error("db closed"));
      const result = await StatisticCountService.deviceBreakdownCard(1, deviceBreakdownCard());
      expect(result).toEqual([]);
    });

    it("deviceBreakdownCard json_extracts DeviceData for device-type cards", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { label: "Operational", count: 8 },
        { label: "Fault", count: 2 },
      ]);

      const rows = await StatisticCountService.deviceBreakdownCard(
        1,
        cardOf({ EntityType: "devices", CounterType: "total", DeviceType: "Camera", BreakdownField: "CameraStatus" })
      );

      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      const normalized = normalizeSql(String(sql));
      expect(normalized).toContain("FROM DeviceRecords r");
      expect(normalized).toContain("json_extract(r.DeviceData, '$.CameraStatus') AS label");
      expect(normalized).toContain("AND r.DeviceType = ?");
      expect(normalized).toContain("WHERE i.ProjectID = ? AND r.IsActive = 1");
      expect(params).toEqual([1, "Camera"]);
      expect(rows).toEqual([
        { label: "Operational", count: 8 },
        { label: "Fault", count: 2 },
      ]);
    });

    it("deviceBreakdownCard rejects non-allowlisted field names without querying", async () => {
      const rows = await StatisticCountService.deviceBreakdownCard(
        1,
        cardOf({ EntityType: "devices", CounterType: "total", DeviceType: "Camera", BreakdownField: "Bad Field; DROP TABLE" })
      );

      expect(rows).toEqual([]);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });
  });
});
