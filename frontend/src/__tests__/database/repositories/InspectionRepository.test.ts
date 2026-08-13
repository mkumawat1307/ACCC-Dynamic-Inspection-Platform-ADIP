jest.mock("@/src/database/db");
jest.mock("@/src/utils/androidBackup", () => ({
  requestAndroidBackup: jest.fn(),
}));

import { getDatabase } from "@/src/database/db";
import { requestAndroidBackup } from "@/src/utils/androidBackup";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

const sampleSection = {
  SectionID: 1,
  SectionName: "General",
  SectionKey: "general",
  DisplayOrder: 1,
};

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
  IsActive: 1,
  CreatedAt: "2024-01-01",
  UpdatedAt: "2024-01-01",
};

describe("InspectionRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("getSections", () => {
    it("returns sections for a given template", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleSection]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const sections = await InspectionRepository.getSections(1);
      expect(sections).toHaveLength(1);
      expect(sections[0].SectionName).toBe("General");
    });

    it("looks up default template when none given", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ TemplateID: 2 });
      mockDb.getAllAsync.mockResolvedValue([sampleSection]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const sections = await InspectionRepository.getSections();
      expect(sections).toHaveLength(1);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining("IsDefault = 1")
      );
    });

    it("returns empty when no default template found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const sections = await InspectionRepository.getSections();
      expect(sections).toEqual([]);
    });

    it("returns empty when templateId is given but no sections", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const sections = await InspectionRepository.getSections(999);
      expect(sections).toEqual([]);
    });
  });

  describe("getAllSections", () => {
    it("returns sections including non-default ones", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleSection]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const sections = await InspectionRepository.getAllSections(1);
      expect(sections).toHaveLength(1);
    });
  });

  describe("getFieldsBySection", () => {
    it("returns visible active fields ordered by DisplayOrder", async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleField]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const fields = await InspectionRepository.getFieldsBySection(1);
      expect(fields).toHaveLength(1);
      expect(fields[0].FieldName).toBe("Voltage");
    });
  });

  describe("getFieldsByKey", () => {
    it("returns fields matching section key and template", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ TemplateID: 1 });
      mockDb.getAllAsync.mockResolvedValue([sampleField]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const fields = await InspectionRepository.getFieldsByKey("general");
      expect(fields).toHaveLength(1);
    });

    it("returns empty array when no default template", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const fields = await InspectionRepository.getFieldsByKey("general");
      expect(fields).toEqual([]);
    });
  });

  describe("createInspection", () => {
    it("creates a draft inspection and returns the ID", async () => {
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const id = await InspectionRepository.createInspection(1, 1, "2024-06-15");
      expect(id).toBe(42);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO Inspections"),
        [1, 1, "", "2024-06-15", "Draft"]
      );
    });
  });

  describe("saveFieldValue", () => {
    it("inserts when parent rows exist and no existing value", async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce(null);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.saveFieldValue(1, 1, "11kV");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO InspectionValues"),
        [1, 1, "11kV"]
      );
    });

    it("updates when existing value found", async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce({ ValueID: 5 });
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.saveFieldValue(1, 1, "22kV");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE InspectionValues"),
        ["22kV", 5]
      );
    });

    it("skips the write when the inspection does not exist", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ hasInspection: null, hasField: 1 });
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await expect(
        InspectionRepository.saveFieldValue(999, 1, "11kV")
      ).resolves.toBeUndefined();
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("skips the write when the field does not exist", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ hasInspection: 1, hasField: null });
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await expect(
        InspectionRepository.saveFieldValue(1, 999, "11kV")
      ).resolves.toBeUndefined();
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe("updateInspectionPoleId", () => {
    it("updates the pole ID", async () => {
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.updateInspectionPoleId(1, "P001");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE Inspections"),
        ["P001", 1]
      );
    });
  });

  describe("updateInspectionStatus", () => {
    it("updates the status", async () => {
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.updateInspectionStatus(1, "Completed");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE Inspections"),
        ["Completed", 1]
      );
    });
  });

  describe("getInspectionValues", () => {
    it("returns a key-value map of field values", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { FieldKey: "voltage", FieldValue: "11kV" },
        { FieldKey: "height", FieldValue: "12m" },
      ]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const values = await InspectionRepository.getInspectionValues(1);
      expect(values).toEqual({ voltage: "11kV", height: "12m" });
    });

    it("returns empty object when no values", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const values = await InspectionRepository.getInspectionValues(1);
      expect(values).toEqual({});
    });
  });

  describe("validateInspection", () => {
    it("returns valid=true when all required fields are filled", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldName: "Voltage", DefaultValue: null }])
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldValue: "11kV" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it("returns missing fields when required fields are empty", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldName: "Voltage", DefaultValue: null }])
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldValue: "" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("Voltage");
    });

    it("skips auto-filled fields (date, division, district)", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { FieldKey: "date", FieldName: "Date", DefaultValue: null },
          { FieldKey: "voltage", FieldName: "Voltage", DefaultValue: null },
        ])
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldValue: "11kV" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(true);
    });
  });

  describe("getInspectionByPoleId", () => {
    it("returns inspection matching pole ID", async () => {
      const expected = { InspectionID: 1, PoleID: "P001", Status: "Draft" };
      mockDb.getFirstAsync.mockResolvedValue(expected);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.getInspectionByPoleId("P001");
      expect(result).toEqual(expected);
    });

    it("returns null when no match", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.getInspectionByPoleId("NONEXISTENT");
      expect(result).toBeNull();
    });
  });

  describe("getInspectionPoleId", () => {
    it("returns pole ID for an inspection", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ PoleID: "P001" });
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.getInspectionPoleId(1);
      expect(result).toBe("P001");
    });

    it("returns empty string when inspection not found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.getInspectionPoleId(999);
      expect(result).toBe("");
    });
  });

  describe("getInspectionProjectId", () => {
    it("returns project ID for an inspection", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ ProjectID: 3 });
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.getInspectionProjectId(1);
      expect(result).toBe(3);
    });

    it("returns null when inspection not found", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.getInspectionProjectId(999);
      expect(result).toBeNull();
    });
  });

  describe("deleteInspection", () => {
    it("deletes inspection and related data in a transaction", async () => {
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.deleteInspection(1);
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledTimes(5);
    });

    it("signals Android for a fresh backup after deleting", async () => {
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.deleteInspection(1);
      expect(requestAndroidBackup).toHaveBeenCalled();
    });
  });

  describe("deleteMultipleInspections", () => {
    it("deletes multiple inspections in a transaction", async () => {
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.deleteMultipleInspections([1, 2]);
      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledTimes(10);
    });

    it("signals Android for a fresh backup after deleting multiple", async () => {
      mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      await InspectionRepository.deleteMultipleInspections([1, 2]);
      expect(requestAndroidBackup).toHaveBeenCalled();
    });
  });
});
