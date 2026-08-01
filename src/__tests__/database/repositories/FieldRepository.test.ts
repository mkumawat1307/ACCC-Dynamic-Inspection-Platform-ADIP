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

const sampleField = {
  FieldID: 1,
  SectionID: 1,
  FieldName: "Voltage",
  FieldKey: "voltage",
  FieldType: "text",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 1,
  IsRequired: 1,
  IsVisible: 1,
  IsReadOnly: 0,
  IsSystemField: 0,
  DataSourceType: null,
  DataSource: null,
  ParentFieldID: null,
  Width: 12,
  Icon: null,
  IsActive: 1,
  CreatedAt: "2024-01-01",
  UpdatedAt: "2024-01-01",
};

describe("FieldRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("getBySection", () => {
    it("returns fields for a section", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleField]);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const fields = await FieldRepository.getBySection(1);
      expect(fields).toHaveLength(1);
      expect(fields[0].FieldName).toBe("Voltage");
    });

    it("returns empty array when no fields", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const fields = await FieldRepository.getBySection(999);
      expect(fields).toEqual([]);
    });
  });

  describe("getById", () => {
    it("returns a field when found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(sampleField);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const field = await FieldRepository.getById(1);
      expect(field).toBeTruthy();
      expect(field!.FieldName).toBe("Voltage");
    });

    it("returns null when not found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const field = await FieldRepository.getById(999);
      expect(field).toBeNull();
    });
  });

  describe("create", () => {
    it("inserts a field and returns the new ID", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const newId = await FieldRepository.create({
        SectionID: 1,
        FieldName: "Current",
        FieldKey: "current",
        FieldType: "number",
      });
      expect(newId).toBe(42);
      expect(mockDb.runAsync).toHaveBeenCalled();
    });

    it("auto-increments DisplayOrder", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Max: 5 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.create({
        SectionID: 1,
        FieldName: "New Field",
        FieldKey: "new_field",
        FieldType: "text",
      });
      const callArgs = mockDb.runAsync.mock.calls[0][1];
      const displayOrderIndex = 8;
      expect(callArgs[displayOrderIndex]).toBe(6);
    });

    it("handles null maxOrder in create", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const newId = await FieldRepository.create({
        SectionID: 1,
        FieldName: "Fallback",
        FieldKey: "fallback",
        FieldType: "text",
      });
      expect(newId).toBe(42);
    });
  });

  describe("update", () => {
    it("updates field properties", async () => {
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.update(1, { FieldName: "Updated" });
      expect(mockDb.runAsync).toHaveBeenCalled();
    });

    it("updates multiple field properties", async () => {
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.update(1, {
        FieldName: "Updated",
        FieldKey: "updated_key",
        FieldType: "number",
        Placeholder: "Enter value",
        DefaultValue: "0",
        HelpText: "Help",
        ValidationRule: "required",
        DisplayOrder: 2,
        IsRequired: 1,
        IsVisible: 1,
        IsReadOnly: 0,
        DataSourceType: "static",
        DataSource: "values",
        Width: 6,
        Icon: "star",
      });
      expect(mockDb.runAsync).toHaveBeenCalled();
    });

    it("clears nullable string fields to null", async () => {
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.update(1, {
        Placeholder: null,
        DefaultValue: null,
        HelpText: null,
      });
      expect(mockDb.runAsync).toHaveBeenCalled();
      const query = (mockDb.runAsync as jest.Mock).mock.calls[0][0];
      const values = (mockDb.runAsync as jest.Mock).mock.calls[0][1];
      expect(query).toContain("Placeholder = ?");
      expect(query).toContain("DefaultValue = ?");
      expect(query).toContain("HelpText = ?");
      expect(values).toContain(null);
    });

    it("skips update when no fields provided", async () => {
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.update(1, {});
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("soft-deletes a field", async () => {
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.delete(1);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE InspectionFields SET IsActive = 0"),
        [1]
      );
    });
  });

  describe("hardDelete", () => {
    it("permanently deletes a field", async () => {
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.hardDelete(1);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM InspectionFields"),
        [1]
      );
    });
  });

  describe("reorder", () => {
    it("updates display order for multiple fields in a transaction", async () => {
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.reorder([
        { FieldID: 1, DisplayOrder: 2 },
        { FieldID: 2, DisplayOrder: 1 },
      ]);
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe("hasValues", () => {
    it("returns true when field has values", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 3 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const result = await FieldRepository.hasValues(1);
      expect(result).toBe(true);
    });

    it("returns false when field has no values", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const result = await FieldRepository.hasValues(1);
      expect(result).toBe(false);
    });

    it("returns false when query returns null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const result = await FieldRepository.hasValues(1);
      expect(result).toBe(false);
    });
  });

  describe("keyExists", () => {
    it("returns true when key exists", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const result = await FieldRepository.keyExists("voltage");
      expect(result).toBe(true);
    });

    it("returns false when key does not exist", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const result = await FieldRepository.keyExists("nonexistent");
      expect(result).toBe(false);
    });

    it("returns false when key query returns null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      const result = await FieldRepository.keyExists("unknown");
      expect(result).toBe(false);
    });

    it("excludes a given ID from the check", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });
      const { FieldRepository } = require("@/src/database/repositories/FieldRepository");
      await FieldRepository.keyExists("voltage", 5);
      const query = (mockDb.getFirstAsync as jest.Mock).mock.calls[0][0];
      expect(query).toContain("FieldID !=");
    });
  });
});
