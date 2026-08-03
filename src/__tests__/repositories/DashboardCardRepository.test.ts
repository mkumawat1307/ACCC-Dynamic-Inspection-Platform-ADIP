jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { DashboardCard } from "@/src/models/DashboardCard";
import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "@/src/database/seeds/dashboard-cards.seed";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

function baseCard(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    ProjectID: 1,
    CardKey: "custom_card",
    Title: "Total Switches",
    Icon: "lan",
    Color: "#198754",
    EntityType: "devices",
    CounterType: "total",
    FilterJson: null,
    CountMode: "count",
    CardMode: "entitycount",
    DistinctColumn: null,
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 0,
    ...overrides,
  };
}

function rowOf(card: DashboardCard): Record<string, unknown> {
  return {
    CardID: card.CardID ?? 1,
    ProjectID: card.ProjectID,
    CardKey: card.CardKey,
    Title: card.Title,
    Icon: card.Icon,
    Color: card.Color,
    EntityType: card.EntityType,
    CounterType: card.CounterType,
    FilterJson: card.FilterJson ?? null,
    CountMode: card.CountMode,
    DistinctColumn: card.DistinctColumn ?? null,
    BreakdownField: card.BreakdownField ?? null,
    SectionLabel: card.SectionLabel ?? null,
    AggregateField: card.AggregateField ?? null,
    DeviceType: card.DeviceType ?? null,
    CardMode: card.CardMode,
    SortOrder: card.SortOrder,
    Enabled: card.Enabled,
    IsDefault: card.IsDefault,
  };
}

describe("DashboardCardRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("getCardById returns the card when found", async () => {
    mockDb.getFirstAsync.mockResolvedValue(rowOf(baseCard({ CardID: 5 })));
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const card = await DashboardCardRepository.getCardById(5);
    expect(card).not.toBeNull();
    expect(card!.CardID).toBe(5);
    expect(card!.Title).toBe("Total Switches");
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE CardID = ?"),
      [5]
    );
  });

  it("getCardById returns null when not found", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    expect(await DashboardCardRepository.getCardById(999)).toBeNull();
  });

  it("getAllCards maps rows and scopes by project", async () => {
    mockDb.getAllAsync.mockResolvedValue([rowOf(baseCard({ CardID: 1, SortOrder: 2 }))]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const cards = await DashboardCardRepository.getAllCards(1);
    expect(cards).toHaveLength(1);
    expect(cards[0].SortOrder).toBe(2);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ProjectID = ?"),
      [1]
    );
  });

  it("getEnabledCards filters by Enabled = 1", async () => {
    mockDb.getAllAsync.mockResolvedValue([rowOf(baseCard())]);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const cards = await DashboardCardRepository.getEnabledCards(1);
    expect(cards).toHaveLength(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("Enabled = 1"),
      [1]
    );
  });

  it("createCard inserts and returns the new ID", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    const id = await DashboardCardRepository.createCard(baseCard());
    expect(id).toBe(42);
    const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("INSERT INTO DashboardCards");
    expect(params).toContain("custom_card");
  });

  it("createCard defaults SortOrder to max+1 when omitted", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ max: 7 });
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.createCard(baseCard({ SortOrder: undefined as unknown as number }));
    const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(params[14]).toBe(8);
  });

  it("createCard falls back to 0 when max SortOrder is null", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.createCard(baseCard({ SortOrder: undefined as unknown as number }));
    const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(params[14]).toBe(0);
  });

  it("updateCard persists changes with parameterized values", async () => {
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.updateCard({
      ...baseCard({ CardID: 5, Title: "Renamed", FilterJson: "{\"CameraType\":\"PTZ\"}" }),
    });
    const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("UPDATE DashboardCards");
    expect(sql).toContain("UpdatedAt = CURRENT_TIMESTAMP");
    expect(params).toContain("Renamed");
    expect(params).toContain("{\"CameraType\":\"PTZ\"}");
    expect(params[params.length - 1]).toBe(5);
  });

  it("deleteCard removes a card by id", async () => {
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.deleteCard(5);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM DashboardCards WHERE CardID = ?"),
      [5]
    );
  });

  it("setCardEnabled updates the Enabled flag", async () => {
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.setCardEnabled(5, false);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET Enabled = ?"),
      [0, 5]
    );
  });

  it("reorderCards rewrites SortOrder inside a transaction", async () => {
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.reorderCards(1, [10, 20, 30]);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE CardID = ? AND ProjectID = ?"),
      [0, 10, 1]
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("SET SortOrder = ?"),
      [2, 30, 1]
    );
  });

  describe("ensureDefaultCards", () => {
    it("inserts all six sectioned defaults when none exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(6);
      const allParams = (mockDb.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
      const keys = allParams.map((p) => p[1]);
      expect(keys).toEqual(["total_inspection_done", "total_pole_status", "total_camera_count", "today_inspection_done", "today_pole_status", "today_camera_count"]);
    });

    it("is idempotent when all sectioned defaults exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("does not re-enable or overwrite an existing default", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("re-inserts only the deleted legacy key when the project has legacy cards", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspections" },
        { CardKey: "total_poles" },
        { CardKey: "today_inspections_done" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[1]).toBe("total_cameras");
      expect(params[10]).toBeNull();
      expect(params[11]).toBeNull();
      expect(params[12]).toBeNull();
      expect(sql.match(/\?/g)).toHaveLength(16);
    });

    it("does not inject legacy cards into a sectioned project", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe("BreakdownField", () => {
    it("maps BreakdownField from a row", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        rowOf(baseCard({ CardID: 3, BreakdownField: "foundation_cond" })),
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].BreakdownField).toBe("foundation_cond");
    });

    it("createCard persists BreakdownField", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.createCard(
        baseCard({ BreakdownField: "foundation_cond" })
      );
      const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[10]).toBe("foundation_cond");
      expect(params[14]).toBe(0);
    });

    it("updateCard persists BreakdownField", async () => {
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.updateCard(
        baseCard({ CardID: 5, BreakdownField: "pole_status" })
      );
      const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(sql).toContain("BreakdownField = ?");
      expect(params).toContain("pole_status");
    });
  });

  describe("migrateDefaultCards", () => {
    it("inserts the two new defaults and renumbers the old four", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { CardKey: "total_poles" },
          { CardKey: "total_cameras" },
          { CardKey: "today_poles" },
          { CardKey: "today_cameras" },
        ])
        .mockResolvedValueOnce([
          { CardID: 1, CardKey: "total_poles" },
          { CardID: 2, CardKey: "total_cameras" },
          { CardID: 3, CardKey: "today_poles" },
          { CardID: 4, CardKey: "today_cameras" },
        ]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.migrateDefaultCards(1);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(6);
      const inserts = (mockDb.runAsync as jest.Mock).mock.calls.filter((c) => c[0].includes("INSERT INTO DashboardCards"));
      expect(inserts).toHaveLength(2);
      const insertParams = inserts.map((c) => c[1]);
      expect(insertParams.map((p) => p[1])).toEqual(["total_inspections", "today_inspections_done"]);
      expect(insertParams[1][7]).toBe(JSON.stringify({ Status: "Completed" }));

      const updates = (mockDb.runAsync as jest.Mock).mock.calls.filter((c) => c[0].includes("UPDATE DashboardCards"));
      expect(updates).toHaveLength(4);
      expect(updates[0][1]).toEqual([1, "i.PoleID", 1]);
      expect(updates[1][1]).toEqual([2, null, 2]);
      expect(updates[2][1]).toEqual([4, "i.PoleID", 3]);
      expect(updates[3][1]).toEqual([5, null, 4]);
      expect(updates[0][0]).not.toContain("SET Title");
    });

    it("is a no-op when both new defaults already exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspections" },
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_inspections_done" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.migrateDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
      expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
    });

    it("migrateDefaultCards is a no-op for a sectioned project", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_inspection_done" },
        { CardKey: "total_pole_status" },
        { CardKey: "total_camera_count" },
        { CardKey: "today_inspection_done" },
        { CardKey: "today_pole_status" },
        { CardKey: "today_camera_count" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.migrateDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
      expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
    });

    it("preserves admin-edited titles and Enabled state on existing defaults", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { CardKey: "total_poles" },
          { CardKey: "total_cameras" },
          { CardKey: "today_poles" },
          { CardKey: "today_cameras" },
        ])
        .mockResolvedValueOnce([
          { CardID: 1, CardKey: "total_poles" },
          { CardID: 2, CardKey: "total_cameras" },
          { CardID: 3, CardKey: "today_poles" },
          { CardID: 4, CardKey: "today_cameras" },
        ]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.migrateDefaultCards(1);

      const updates = (mockDb.runAsync as jest.Mock).mock.calls.filter((c) => c[0].includes("UPDATE DashboardCards"));
      for (const [, params] of updates) {
        expect(params).toHaveLength(3);
      }
      expect(updates[0][0]).not.toContain("Enabled");
    });
  });

  describe("SectionLabel & AggregateField", () => {
    it("maps SectionLabel and AggregateField from a row", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        rowOf(baseCard({ CardID: 3, SectionLabel: "Total", AggregateField: "camera_count" })),
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].SectionLabel).toBe("Total");
      expect(cards[0].AggregateField).toBe("camera_count");
    });

    it("createCard persists SectionLabel and AggregateField", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.createCard(
        baseCard({ SectionLabel: "Today's", AggregateField: "camera_count" })
      );
      const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[11]).toBe("Today's");
      expect(params[12]).toBe("camera_count");
      expect(params[14]).toBe(0);
    });

    it("createCard INSERT columns, placeholders, and params all match", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.createCard(baseCard());
      const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      const columns = sql.match(/\(([^)]*)\)\s*VALUES/)![1].split(",").map((s: string) => s.trim());
      const placeholders = (sql.match(/\?/g) ?? []).length;
      expect(columns.length).toBe(18);
      expect(placeholders).toBe(18);
      expect(params).toHaveLength(18);
    });

    it("updateCard does NOT write SectionLabel or AggregateField", async () => {
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.updateCard(
        baseCard({ CardID: 5, SectionLabel: "Total", AggregateField: "camera_count" })
      );
      const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(sql).not.toContain("SectionLabel");
      expect(sql).not.toContain("AggregateField");
      expect(params).not.toContain("Total");
      expect(params).not.toContain("camera_count");
    });

    it("maps DeviceType from a row", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        rowOf(baseCard({ CardID: 3, DeviceType: "Camera" })),
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].DeviceType).toBe("Camera");
    });

    it("mapRow defaults a missing DeviceType to null", async () => {
      mockDb.getAllAsync.mockResolvedValue([rowOf(baseCard({ CardID: 3 }))]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].DeviceType).toBeNull();
    });

    it("createCard persists DeviceType", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.createCard(baseCard({ DeviceType: "Switch" }));
      const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[17]).toBe("Switch");
    });
  });

  describe("CardMode", () => {
    it("createCard persists CardMode and round-trips via getAllCards", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ max: 3 });
      mockDb.getAllAsync.mockResolvedValue([rowOf(baseCard({ CardID: 9, CardMode: "dropdown" }))]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.createCard(baseCard({ CardMode: "dropdown" }));
      const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[13]).toBe("dropdown");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].CardMode).toBe("dropdown");
    });

    it("mapRow defaults a missing CardMode to entitycount", async () => {
      const row = rowOf(baseCard());
      delete row.CardMode;
      mockDb.getAllAsync.mockResolvedValue([row]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].CardMode).toBe("entitycount");
    });

    it("mapRow defaults an empty CardMode to entitycount", async () => {
      const row = rowOf(baseCard());
      row.CardMode = "";
      mockDb.getAllAsync.mockResolvedValue([row]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const cards = await DashboardCardRepository.getAllCards(1);
      expect(cards[0].CardMode).toBe("entitycount");
    });

    it("updateCard writes CardMode", async () => {
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.updateCard(baseCard({ CardID: 5, CardMode: "datebreakdown" }));
      const [sql, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(sql).toContain("CardMode = ?");
      expect(params).toContain("datebreakdown");
    });

    it("ensureDefaultCards inserts CardMode from the seed for missing defaults", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      const allParams = (mockDb.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
      expect(allParams.map((p) => p[13])).toEqual(["entitycount", "dropdown", "sum", "entitycount", "dropdown", "sum"]);
    });
  });

  describe("normalizeSections", () => {
    it("renumbers into total, today, custom-alphabetical, then uncategorized order", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      db.getAllAsync.mockResolvedValue([
        rowOf(baseCard({ CardID: 3, CardKey: "smart_x_today", SectionLabel: SECTION_LABEL_TODAY, SortOrder: 0 })),
        rowOf(baseCard({ CardID: 1, CardKey: "default_total", SectionLabel: SECTION_LABEL_TOTAL, SortOrder: 1 })),
        rowOf(baseCard({ CardID: 5, CardKey: "bare", SectionLabel: null, SortOrder: 2 })),
        rowOf(baseCard({ CardID: 2, CardKey: "smart_y_total", SectionLabel: SECTION_LABEL_TOTAL, SortOrder: 3 })),
        rowOf(baseCard({ CardID: 4, CardKey: "zzz_custom", SectionLabel: "ZZZ", SortOrder: 4 })),
        rowOf(baseCard({ CardID: 6, CardKey: "aaa_custom", SectionLabel: "AAA", SortOrder: 5 })),
      ]);
      db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

      await DashboardCardRepository.normalizeSections(1);

      expect(db.runAsync).toHaveBeenCalledTimes(6);
      const updates = (db.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
      expect(updates.map((p) => p[0])).toEqual([0, 1, 2, 3, 4, 5]);
      expect(updates.map((p) => p[1])).toEqual([1, 2, 3, 6, 4, 5]);
      expect(updates[0][2]).toBe(1);
    });
  });

  describe("resetDefaultCards", () => {
    it("deletes all cards and re-inserts the canonical sectioned set, then normalizes", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      const inserted: Record<string, unknown>[] = [];
      db.getAllAsync.mockResolvedValue(inserted);
      db.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
        if (String(sql).includes("DELETE FROM DashboardCards")) {
          return { lastInsertRowId: 0, changes: 1 };
        }
        if (String(sql).includes("INSERT INTO DashboardCards")) {
          inserted.push(rowOf(baseCard({ CardID: inserted.length + 1, CardKey: String(params[1]), SectionLabel: (params[11] as string) ?? null })));
        }
        return { lastInsertRowId: 42, changes: 1 };
      });
      db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const { DEFAULT_SECTIONED_CARDS } = require("@/src/database/seeds/dashboard-cards.seed");

      await DashboardCardRepository.resetDefaultCards(1);

      const calls = (db.runAsync as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(calls.filter((s) => s.includes("DELETE FROM DashboardCards WHERE ProjectID = ?"))).toHaveLength(1);
      expect(calls.filter((s) => s.includes("INSERT INTO DashboardCards"))).toHaveLength(DEFAULT_SECTIONED_CARDS.length);
      expect(inserted).toHaveLength(DEFAULT_SECTIONED_CARDS.length);
      expect(db.getAllAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe("migrateDeviceCards", () => {
    it("rewrites smart cards, repoints legacy cameras, rebinds field cameras, renames pole cards, and renames legacy labels", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      db.getAllAsync.mockResolvedValue([
        { CardID: 1, CardKey: "smart_dev_Camera_CameraStatus_total" },
        { CardID: 2, CardKey: "smart_dev_Switch_SwitchState_today" },
        { CardID: 3, CardKey: "total_camera_count" },
        { CardID: 4, CardKey: "today_camera_count" },
        { CardID: 5, CardKey: "total_cameras" },
        { CardID: 6, CardKey: "today_cameras" },
        { CardID: 7, CardKey: "total_pole_status" },
        { CardID: 8, CardKey: "today_pole_status" },
        { CardID: 9, CardKey: "total_inspections" },
      ]);
      db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      const { SECTION_LABEL_TOTAL, SECTION_LABEL_TODAY } = require("@/src/database/seeds/dashboard-cards.seed");

      await DashboardCardRepository.migrateDeviceCards(1);

      const calls = (db.runAsync as jest.Mock).mock.calls as Array<[string, unknown[]]>;
      const smart = calls.filter(([sql]) => sql.includes("EntityType = 'devices'") && !sql.includes("FilterJson"));
      expect(smart).toHaveLength(2);
      expect(smart[0][1]).toEqual(["Camera", "CameraStatus", 1, 1]);
      expect(smart[1][1]).toEqual(["Switch", "SwitchState", 2, 1]);

      const cameraRepoint = calls.filter(([sql]) => sql.includes("FilterJson = ?"));
      expect(cameraRepoint).toHaveLength(2);
      expect(cameraRepoint.map(([, p]) => p[1])).toEqual([5, 6]);
      expect(cameraRepoint[0][1]).toEqual(['{"DeviceType":"Camera"}', 5, 1]);

      const sumRebind = calls.filter(([sql]) => sql.includes("CardMode = ?"));
      expect(sumRebind).toHaveLength(2);
      expect(sumRebind[0][1]).toEqual(["inspections", "sum", "camera_count", 3, 1]);
      expect(sumRebind[1][1]).toEqual(["inspections", "sum", "camera_count", 4, 1]);

      const poleRename = calls.filter(([sql]) => sql.includes("SET Title = ?"));
      expect(poleRename).toHaveLength(2);
      expect(poleRename[0][1]).toEqual(["Pole Availability", 7, 1]);
      expect(poleRename[1][1]).toEqual(["Pole Availability", 8, 1]);

      const renameTotal = calls.find(([sql, p]) => String(sql).includes("SectionLabel = ?") && p[0] === SECTION_LABEL_TOTAL);
      expect(renameTotal).toBeDefined();
      expect(renameTotal![1]).toEqual([SECTION_LABEL_TOTAL, "Total", 1]);
      const renameToday = calls.find(([sql, p]) => String(sql).includes("SectionLabel = ?") && p[0] === SECTION_LABEL_TODAY);
      expect(renameToday).toBeDefined();
      expect(renameToday![1]).toEqual([SECTION_LABEL_TODAY, "Today's", 1]);
    });

    it("rebinds field camera cards and renames pole cards even without smart or legacy camera cards", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      db.getAllAsync.mockResolvedValue([
        { CardID: 3, CardKey: "total_camera_count" },
        { CardID: 4, CardKey: "today_camera_count" },
        { CardID: 7, CardKey: "total_pole_status" },
        { CardID: 8, CardKey: "today_pole_status" },
        { CardID: 9, CardKey: "total_inspections" },
      ]);
      db.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

      await DashboardCardRepository.migrateDeviceCards(1);

      const calls = (db.runAsync as jest.Mock).mock.calls as Array<[string, unknown[]]>;
      const sumRebind = calls.filter(([sql]) => sql.includes("CardMode = ?"));
      expect(sumRebind).toHaveLength(2);
      const poleRename = calls.filter(([sql]) => sql.includes("SET Title = ?"));
      expect(poleRename).toHaveLength(2);
      const smart = calls.filter(([sql]) => sql.includes("EntityType = 'devices'") && !sql.includes("FilterJson"));
      expect(smart).toHaveLength(0);
      const cameraRepoint = calls.filter(([sql]) => sql.includes("FilterJson = ?"));
      expect(cameraRepoint).toHaveLength(0);
    });

    it("is a no-op when no device cards, camera cards, or pole cards exist", async () => {
      const db = createMockDb();
      (getDatabase as jest.Mock).mockResolvedValue(db);
      db.getAllAsync.mockResolvedValue([{ CardID: 1, CardKey: "total_inspections" }]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

      await DashboardCardRepository.migrateDeviceCards(1);

      expect(db.runAsync).not.toHaveBeenCalled();
      expect(db.withTransactionAsync).not.toHaveBeenCalled();
    });
  });
});
