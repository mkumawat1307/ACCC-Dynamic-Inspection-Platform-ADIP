jest.mock("@/src/database/db");
jest.mock("@/src/utils/androidBackup", () => ({
  requestAndroidBackup: jest.fn(),
}));
jest.mock("@/src/utils/InspectionDataBus");

import { getDatabase } from "@/src/database/db";
import { requestAndroidBackup } from "@/src/utils/androidBackup";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import {
  InspectionRepository,
  INSPECTION_FINAL_STATUSES,
  isFieldValueEmpty,
} from "@/src/database/repositories/InspectionRepository";
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";

jest.mock("@/src/database/repositories/DeviceRecordsRepository", () => {
  const getByInspectionAll = jest.fn().mockResolvedValue([]);
  const flushPendingDeviceSaves = jest.fn().mockResolvedValue(undefined);
  return {
    __esModule: true,
    default: { getByInspectionAll, flushPendingDeviceSaves },
    DeviceRecordsRepository: { getByInspectionAll, flushPendingDeviceSaves },
  };
});

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

  describe("countFinalInspections", () => {
    it("returns the number of Completed and Submitted inspections", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 4 });
      const count = await InspectionRepository.countFinalInspections();
      expect(count).toBe(4);
    });

    it("returns zero when no inspections exist", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });
      const count = await InspectionRepository.countFinalInspections();
      expect(count).toBe(0);
    });

    it("returns zero when the query returns null", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const count = await InspectionRepository.countFinalInspections();
      expect(count).toBe(0);
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

  describe("updatePoleIdDirectSave", () => {
    it("writes the field value and Inspections.PoleID inside one transaction", async () => {
      mockDb.withTransactionAsync.mockImplementation(
        async (fn: () => Promise<unknown>) => fn()
      );
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
        .mockResolvedValueOnce({ ValueID: 5 })
        .mockResolvedValue({ ProjectID: 1 });
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");

      await InspectionRepository.updatePoleIdDirectSave(42, 1, "SIK101");

      expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE InspectionValues"),
        expect.arrayContaining(["SIK101"])
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE Inspections"),
        ["SIK101", 42]
      );
    });

    it("does not emit changed events when the transaction aborts", async () => {
      mockDb.withTransactionAsync.mockRejectedValue(new Error("boom"));
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const { InspectionDataBus } = require("@/src/utils/InspectionDataBus");

      await expect(
        InspectionRepository.updatePoleIdDirectSave(42, 1, "SIK101")
      ).rejects.toThrow("boom");

      expect(InspectionDataBus.emitInspectionsChanged).not.toHaveBeenCalled();
    });

    it("rejects when a write inside the transaction fails", async () => {
      mockDb.withTransactionAsync.mockImplementation(
        async (fn: () => Promise<unknown>) => fn()
      );
      mockDb.getFirstAsync.mockResolvedValue({ hasInspection: 1, hasField: 1 });
      mockDb.runAsync.mockRejectedValue(new Error("db failure"));
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");

      await expect(
        InspectionRepository.updatePoleIdDirectSave(42, 1, "SIK101")
      ).rejects.toThrow("db failure");
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
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldName: "Voltage", FieldType: "text", DefaultValue: null }])
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldValue: "11kV" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it("returns missing fields when required fields are empty", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldName: "Voltage", FieldType: "text", DefaultValue: null }])
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldValue: "" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("Voltage");
    });

    it("skips auto-filled fields (date, division, district)", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { FieldKey: "date", FieldName: "Date", FieldType: "date", DefaultValue: null },
          { FieldKey: "voltage", FieldName: "Voltage", FieldType: "text", DefaultValue: null },
        ])
        .mockResolvedValueOnce([{ FieldKey: "voltage", FieldValue: "11kV" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(true);
    });

    it("treats a required checkbox stored as '0' as missing", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { FieldKey: "ready", FieldName: "Ready", FieldType: "checkbox", DefaultValue: null },
        ])
        .mockResolvedValueOnce([{ FieldKey: "ready", FieldValue: "0" }]);
      const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository");
      const result = await InspectionRepository.validateInspection(1);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("Ready");
    });

    it("accepts a required checkbox stored as '1'", async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { FieldKey: "ready", FieldName: "Ready", FieldType: "checkbox", DefaultValue: null },
        ])
        .mockResolvedValueOnce([{ FieldKey: "ready", FieldValue: "1" }]);
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

describe("INSPECTION_FINAL_STATUSES", () => {
  it("includes Completed and Submitted but not Draft", () => {
    expect(INSPECTION_FINAL_STATUSES).toEqual(["Completed", "Submitted"]);
    expect(INSPECTION_FINAL_STATUSES).not.toContain("Draft");
  });
});

describe("InspectionRepository auto-refresh emits", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("createInspection emits with its projectId", async () => {
    const id = await InspectionRepository.createInspection(9, 1, "02-Aug-2026");
    expect(id).toBe(42);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(9);
  });

  it("saveFieldValue emits with the resolved projectId", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ProjectID: 5 });
    await InspectionRepository.saveFieldValue(3, 7, "Yes");
    expect(mockDb.runAsync).toHaveBeenCalled();
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(5);
  });

  it("saveFieldValue emits after an UPDATE path", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce({ ValueID: 11 })
      .mockResolvedValueOnce({ ProjectID: 5 });
    await InspectionRepository.saveFieldValue(3, 7, "No");
    expect(mockDb.runAsync).toHaveBeenCalled();
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(5);
  });

  it("updateInspectionPoleId emits with the resolved projectId", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 4 });
    await InspectionRepository.updateInspectionPoleId(2, "P-100");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(4);
  });

  it("updateInspectionStatus emits with the resolved projectId", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 6 });
    await InspectionRepository.updateInspectionStatus(2, "Completed");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(6);
  });

  it("deleteInspection resolves projectId before deleting and emits after", async () => {
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 8 });
    await InspectionRepository.deleteInspection(2);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(8);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(requestAndroidBackup).toHaveBeenCalled();
  });

  it("deleteMultipleInspections resolves projectId from the first id and emits after", async () => {
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());
    mockDb.getFirstAsync.mockResolvedValueOnce({ ProjectID: 3 });
    await InspectionRepository.deleteMultipleInspections([2, 5, 9]);
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(3);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(requestAndroidBackup).toHaveBeenCalled();
  });

  it("emits 0 when projectId cannot be resolved (save path)", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ hasInspection: 1, hasField: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await InspectionRepository.saveFieldValue(3, 7, "Yes");
    expect(InspectionDataBus.emitInspectionsChanged).toHaveBeenCalledWith(0);
  });
});

describe("isFieldValueEmpty", () => {
  it("text field with whitespace is empty", () => {
    expect(isFieldValueEmpty("text", "   ")).toBe(true);
  });

  it("text field with content is not empty", () => {
    expect(isFieldValueEmpty("text", "Hello")).toBe(false);
  });

  it("number field with 0 is not empty", () => {
    expect(isFieldValueEmpty("number", "0")).toBe(false);
  });

  it("number field with empty string is empty", () => {
    expect(isFieldValueEmpty("number", "")).toBe(true);
  });

  it("checkbox field with 1 is not empty", () => {
    expect(isFieldValueEmpty("checkbox", "1")).toBe(false);
  });

  it("checkbox field with 0 is empty", () => {
    expect(isFieldValueEmpty("checkbox", "0")).toBe(true);
  });

  it("switch field with 1 is not empty", () => {
    expect(isFieldValueEmpty("switch", "1")).toBe(false);
  });

  it("switch field with 0 is empty", () => {
    expect(isFieldValueEmpty("switch", "0")).toBe(true);
  });

  it("dropdown field with content is not empty", () => {
    expect(isFieldValueEmpty("dropdown", "PTZ")).toBe(false);
  });

  it("dropdown field with whitespace only is empty", () => {
    expect(isFieldValueEmpty("dropdown", "  ")).toBe(true);
  });

  it("multiline field with whitespace is empty", () => {
    expect(isFieldValueEmpty("multiline", "   ")).toBe(true);
  });

  it("multiline field with content is not empty", () => {
    expect(isFieldValueEmpty("multiline", "Hello")).toBe(false);
  });
});

describe("validateDeviceMandatory", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  function mockDeviceValidationQueries(options: {
    requiredFields: Array<Record<string, unknown>>;
    deviceTypes?: Array<Record<string, unknown>>;
    countFields?: Array<Record<string, unknown>>;
    values?: Array<Record<string, unknown>>;
  }) {
    mockDb.getAllAsync
      .mockResolvedValueOnce(options.requiredFields)
      .mockResolvedValueOnce(options.deviceTypes ?? [])
      .mockResolvedValueOnce(options.countFields ?? [])
      .mockResolvedValueOnce(options.values ?? []);
  }

  it("returns valid=true when all required device fields are filled", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", FieldType: "dropdown" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }],
      countFields: [{ FieldKey: "camera_count" }],
      values: [{ FieldKey: "camera_count", FieldValue: "1" }],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([
      { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "PTZ" }) },
    ]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("returns missing fields when required device fields are empty", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "SerialNo", Label: "Serial No", FieldType: "text" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }],
      countFields: [{ FieldKey: "camera_count" }],
      values: [{ FieldKey: "camera_count", FieldValue: "1" }],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([
      { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ SerialNo: "" }) },
    ]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("Camera — Serial No (Device 1)");
  });

  it("handles unparseable DeviceData JSON as all missing", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "Voltage", Label: "Voltage", FieldType: "number" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }],
      countFields: [{ FieldKey: "camera_count" }],
      values: [{ FieldKey: "camera_count", FieldValue: "1" }],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([
      { DeviceType: "Camera", DeviceNo: 1, DeviceData: "not-valid-json" },
    ]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(false);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it("returns valid when no required device field definitions exist", async () => {
    mockDeviceValidationQueries({ requiredFields: [] });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("timer-determinism: no advance needed after flush", async () => {
    jest.useFakeTimers();
    try {
      mockDeviceValidationQueries({
        requiredFields: [
          { DeviceType: "Camera", FieldName: "Voltage", Label: "Voltage", FieldType: "number" },
        ],
        deviceTypes: [{ DeviceType: "Camera" }],
        countFields: [{ FieldKey: "camera_count" }],
        values: [{ FieldKey: "camera_count", FieldValue: "1" }],
      });
      (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([
        { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ Voltage: "12" }) },
      ]);
      const result = await InspectionRepository.validateDeviceMandatory(1);
      expect(result.valid).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("flushes pending device saves before validating", async () => {
    mockDeviceValidationQueries({ requiredFields: [] });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([]);
    await InspectionRepository.validateDeviceMandatory(1);
    expect(DeviceRecordsRepository.flushPendingDeviceSaves).toHaveBeenCalled();
  });

  it("flags untouched devices that were never persisted when count exceeds existing records", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "Voltage", Label: "Voltage", FieldType: "number" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }],
      countFields: [{ FieldKey: "camera_count" }],
      values: [{ FieldKey: "camera_count", FieldValue: "2" }],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([
      { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ Voltage: "12" }) },
    ]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("Camera — Voltage (Device 2)");
    expect(result.missingFields).not.toContain("Camera — Voltage (Device 1)");
  });

  it("flags every expected device as missing when the type has a count but no records exist", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "Voltage", Label: "Voltage", FieldType: "number" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }],
      countFields: [{ FieldKey: "camera_count" }],
      values: [{ FieldKey: "camera_count", FieldValue: "2" }],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual([
      "Camera — Voltage (Device 1)",
      "Camera — Voltage (Device 2)",
    ]);
  });

  it("validates only types that have required field definitions", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "Voltage", Label: "Voltage", FieldType: "number" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }, { DeviceType: "Switch" }],
      countFields: [{ FieldKey: "camera_count" }, { FieldKey: "switch_count" }],
      values: [
        { FieldKey: "camera_count", FieldValue: "1" },
        { FieldKey: "switch_count", FieldValue: "2" },
      ],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([
      { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ Voltage: "12" }) },
    ]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("ignores device types whose count is 0 even when required fields exist", async () => {
    mockDeviceValidationQueries({
      requiredFields: [
        { DeviceType: "Camera", FieldName: "Voltage", Label: "Voltage", FieldType: "number" },
      ],
      deviceTypes: [{ DeviceType: "Camera" }],
      countFields: [{ FieldKey: "camera_count" }],
      values: [{ FieldKey: "camera_count", FieldValue: "0" }],
    });
    (DeviceRecordsRepository.getByInspectionAll as jest.Mock).mockResolvedValue([]);
    const result = await InspectionRepository.validateDeviceMandatory(1);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });
});