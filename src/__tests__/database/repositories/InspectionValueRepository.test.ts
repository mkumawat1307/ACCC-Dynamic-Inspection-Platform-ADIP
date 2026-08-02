jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

describe("InspectionValueRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("saveValue", () => {
    it("inserts when parent rows exist and no existing value", async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce(null);
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await InspectionValueRepository.saveValue(1, 1, "11kV");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO InspectionValues"),
        [1, 1, "11kV"]
      );
    });

    it("updates when an existing value is found", async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce({ ValueID: 5 });
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await InspectionValueRepository.saveValue(1, 1, "22kV");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE InspectionValues"),
        ["22kV", 5]
      );
    });

    it("skips the write when the inspection does not exist", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ hasInspection: null, hasField: 1 });
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await expect(
        InspectionValueRepository.saveValue(999, 1, "11kV")
      ).resolves.toBeUndefined();
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("skips the write when the field does not exist", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ hasInspection: 1, hasField: null });
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await expect(
        InspectionValueRepository.saveValue(1, 999, "11kV")
      ).resolves.toBeUndefined();
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("skips the write when the parent query returns no row", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await InspectionValueRepository.saveValue(999, 1, "11kV");
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe("saveValues", () => {
    it("saves each value through saveValue", async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce(null);
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await InspectionValueRepository.saveValues(1, [
        { fieldId: 1, value: "11kV" },
        { fieldId: 2, value: "12m" },
      ]);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe("getValue", () => {
    it("returns the stored value", async () => {
      const row = { ValueID: 1, InspectionID: 1, FieldID: 1, FieldValue: "11kV" };
      mockDb.getFirstAsync.mockResolvedValue(row);
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      const result = await InspectionValueRepository.getValue(1, 1);
      expect(result).toEqual(row);
    });

    it("returns null when no value stored", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      const result = await InspectionValueRepository.getValue(1, 1);
      expect(result).toBeNull();
    });
  });

  describe("getValuesByInspection", () => {
    it("returns all values for the inspection", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { ValueID: 1, InspectionID: 1, FieldID: 1, FieldValue: "11kV" },
      ]);
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      const result = await InspectionValueRepository.getValuesByInspection(1);
      expect(result).toHaveLength(1);
    });
  });

  describe("deleteByInspection", () => {
    it("deletes all values of the inspection", async () => {
      const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository");
      await InspectionValueRepository.deleteByInspection(1);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM InspectionValues"),
        [1]
      );
    });
  });
});
