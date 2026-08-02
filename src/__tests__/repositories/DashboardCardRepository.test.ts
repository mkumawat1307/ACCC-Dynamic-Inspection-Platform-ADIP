jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { DashboardCard } from "@/src/models/DashboardCard";

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
    expect(params[11]).toBe(8);
  });

  it("createCard falls back to 0 when max SortOrder is null", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    await DashboardCardRepository.createCard(baseCard({ SortOrder: undefined as unknown as number }));
    const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
    expect(params[11]).toBe(0);
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
    it("inserts all four defaults when none exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(4);
      const allParams = (mockDb.runAsync as jest.Mock).mock.calls.map((c) => c[1]);
      const keys = allParams.map((p) => p[1]);
      expect(keys).toEqual(["total_poles", "total_cameras", "today_poles", "today_cameras"]);
    });

    it("is idempotent when all defaults exist", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("does not re-enable or overwrite an existing default", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_poles" },
        { CardKey: "total_cameras" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("re-inserts only the deleted default keys", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { CardKey: "total_poles" },
        { CardKey: "today_poles" },
        { CardKey: "today_cameras" },
      ]);
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
      await DashboardCardRepository.ensureDefaultCards(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      const [, params] = (mockDb.runAsync as jest.Mock).mock.calls[0];
      expect(params[1]).toBe("total_cameras");
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
      expect(params[11]).toBe(0);
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
});
