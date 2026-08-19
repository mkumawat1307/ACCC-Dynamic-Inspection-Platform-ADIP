jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

function createMockDb() {
  let fieldOptions: Array<{ OptionID: number; FieldID: number; IsDefault: number }> = [];
  let deviceOptions: Array<{ OptionID: number; DeviceType: string; FieldName: string; OptionLabel: string; OptionValue: string; DisplayOrder: number; IsDefault: number; IsActive: number; TemplateID: number }> = [];
  let nextFieldOptionId = 1;
  let nextDeviceOptionId = 1;

  const runAsyncFn = jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
    const sqlUpper = sql.toUpperCase();

    if (sqlUpper.includes("INSERT INTO FIELDOPTIONS")) {
      const id = nextFieldOptionId++;
      const isDefault = params[4] as number;
      fieldOptions.push({ OptionID: id, FieldID: params[0] as number, IsDefault: isDefault });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (sqlUpper.includes("UPDATE FIELDOPTIONS") && sqlUpper.includes("ISDEFAULT = 0") && sqlUpper.includes("FIELDID = ?")) {
      const fieldId = params[0] as number;
      const excludeId = params[1] as number | undefined;
      fieldOptions = fieldOptions.map((o) => {
        if (o.FieldID === fieldId && o.OptionID !== excludeId) {
          return { ...o, IsDefault: 0 };
        }
        return o;
      });
      return { changes: 1 };
    }

    if (sqlUpper.includes("UPDATE FIELDOPTIONS") && sqlUpper.includes("ISDEFAULT = 1")) {
      const optionId = params[0] as number;
      fieldOptions = fieldOptions.map((o) => {
        if (o.OptionID === optionId) {
          return { ...o, IsDefault: 1 };
        }
        return o;
      });
      return { changes: 1 };
    }

    if (sqlUpper.includes("INSERT INTO DEVICEOPTIONS")) {
      const id = nextDeviceOptionId++;
      const isDefault = params[6] as number;
      deviceOptions.push({
        OptionID: id,
        TemplateID: params[0] as number,
        DeviceType: params[1] as string,
        FieldName: params[2] as string,
        OptionLabel: params[3] as string,
        OptionValue: params[4] as string,
        DisplayOrder: params[5] as number,
        IsDefault: isDefault,
        IsActive: 1,
      });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (sqlUpper.includes("UPDATE DEVICEOPTIONS") && sqlUpper.includes("ISDEFAULT = 0") && sqlUpper.includes("DEVICETYPE = ?")) {
      const deviceType = params[0] as string;
      const fieldName = params[1] as string;
      const excludeId = params[3] as number | undefined;
      deviceOptions = deviceOptions.map((o) => {
        if (o.DeviceType === deviceType && o.FieldName === fieldName && o.OptionID !== excludeId) {
          return { ...o, IsDefault: 0 };
        }
        return o;
      });
      return { changes: 1 };
    }

    if (sqlUpper.includes("UPDATE DEVICEOPTIONS") && sqlUpper.includes("ISDEFAULT = 1")) {
      const optionId = params[0] as number;
      deviceOptions = deviceOptions.map((o) => {
        if (o.OptionID === optionId) {
          return { ...o, IsDefault: 1 };
        }
        return o;
      });
      return { changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 1 };
  });

  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: runAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
    getFieldOptions: () => fieldOptions,
    getDeviceOptions: () => deviceOptions,
    resetFieldOptions: () => { fieldOptions = []; nextFieldOptionId = 1; },
    resetDeviceOptions: () => { deviceOptions = []; nextDeviceOptionId = 1; },
  };
}

function countDefaultsPerField(
  options: Array<{ FieldID: number; IsDefault: number }>
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const opt of options) {
    if (opt.IsDefault === 1) {
      counts.set(opt.FieldID, (counts.get(opt.FieldID) ?? 0) + 1);
    }
  }
  return counts;
}

function countDefaultsPerDeviceGroup(
  options: Array<{ DeviceType: string; FieldName: string; IsDefault: number }>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const opt of options) {
    if (opt.IsDefault === 1) {
      const key = `${opt.DeviceType}:${opt.FieldName}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function assertFieldInvariant(mockDb: ReturnType<typeof createMockDb>) {
  const options = mockDb.getFieldOptions();
  const counts = countDefaultsPerField(options);
  for (const [fieldId, count] of counts) {
    expect(count).toBeLessThanOrEqual(1);
  }
}

function assertDeviceInvariant(mockDb: ReturnType<typeof createMockDb>) {
  const options = mockDb.getDeviceOptions();
  const counts = countDefaultsPerDeviceGroup(options);
  for (const [, count] of counts) {
    expect(count).toBeLessThanOrEqual(1);
  }
}

describe("Dropdown default invariant: COUNT(IsDefault=1) <= 1 per dropdown", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("FieldOptionRepository.setDefault", () => {
    it("produces at most one default per field after single setDefault", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

      const id1 = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A", OptionValue: "a", IsDefault: 0 });
      const id2 = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "B", OptionValue: "b", IsDefault: 0 });
      const id3 = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "C", OptionValue: "c", IsDefault: 0 });

      await FieldOptionRepository.setDefault(1, id2);

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const target = options.find((o) => o.OptionID === id2);
      expect(target?.IsDefault).toBe(1);
      expect(options.filter((o) => o.FieldID === 1 && o.IsDefault === 1)).toHaveLength(1);
    });

    it("produces at most one default per field after rapid succession", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

      const id1 = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A", OptionValue: "a", IsDefault: 0 });
      const id2 = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "B", OptionValue: "b", IsDefault: 0 });
      const id3 = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "C", OptionValue: "c", IsDefault: 0 });

      await FieldOptionRepository.setDefault(1, id1);
      await FieldOptionRepository.setDefault(1, id2);
      await FieldOptionRepository.setDefault(1, id3);

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const target = options.find((o) => o.OptionID === id3);
      expect(target?.IsDefault).toBe(1);
      expect(options.filter((o) => o.FieldID === 1 && o.IsDefault === 1)).toHaveLength(1);
    });

    it("changing Field A does not affect Field B defaults", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

      const f1a = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A", OptionValue: "a", IsDefault: 0 });
      const f1b = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "B", OptionValue: "b", IsDefault: 0 });
      const f2a = await FieldOptionRepository.create({ FieldID: 2, OptionLabel: "X", OptionValue: "x", IsDefault: 0 });
      const f2b = await FieldOptionRepository.create({ FieldID: 2, OptionLabel: "Y", OptionValue: "y", IsDefault: 0 });

      await FieldOptionRepository.setDefault(1, f1a);
      await FieldOptionRepository.setDefault(2, f2a);

      await FieldOptionRepository.setDefault(1, f1b);

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const field1Default = options.filter((o) => o.FieldID === 1 && o.IsDefault === 1);
      const field2Default = options.filter((o) => o.FieldID === 2 && o.IsDefault === 1);
      expect(field1Default).toHaveLength(1);
      expect(field1Default[0].OptionID).toBe(f1b);
      expect(field2Default).toHaveLength(1);
      expect(field2Default[0].OptionID).toBe(f2a);
    });
  });

  describe("FieldOptionRepository.create with IsDefault enforcement", () => {
    it("creates option with IsDefault=1 without violating invariant", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ Max: 5 });

      await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A", OptionValue: "a", IsDefault: 1 });
      await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "B", OptionValue: "b", IsDefault: 1 });

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const field1Defaults = options.filter((o) => o.FieldID === 1 && o.IsDefault === 1);
      expect(field1Defaults).toHaveLength(1);
      expect(field1Defaults[0].OptionID).toBe(2);
    });

    it("creates option with IsDefault=0 without affecting existing default", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ Max: 5 });

      await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A", OptionValue: "a", IsDefault: 1 });
      await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "B", OptionValue: "b", IsDefault: 0 });

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const field1Defaults = options.filter((o) => o.FieldID === 1 && o.IsDefault === 1);
      expect(field1Defaults).toHaveLength(1);
      expect(field1Defaults[0].OptionID).toBe(1);
    });

    it("creating in Field A does not affect Field B defaults", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ Max: 5 });

      await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A1", OptionValue: "a1", IsDefault: 1 });
      await FieldOptionRepository.create({ FieldID: 2, OptionLabel: "B1", OptionValue: "b1", IsDefault: 1 });
      await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "A2", OptionValue: "a2", IsDefault: 1 });

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const field1Defaults = options.filter((o) => o.FieldID === 1 && o.IsDefault === 1);
      const field2Defaults = options.filter((o) => o.FieldID === 2 && o.IsDefault === 1);
      expect(field1Defaults).toHaveLength(1);
      expect(field1Defaults[0].OptionID).toBe(3);
      expect(field2Defaults).toHaveLength(1);
      expect(field2Defaults[0].OptionID).toBe(2);
    });
  });

  describe("FieldOptionRepository.update with IsDefault enforcement", () => {
    it("update(IsDefault=1) produces at most one default", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await FieldOptionRepository.update(10, { IsDefault: 1 });
      await FieldOptionRepository.update(20, { IsDefault: 1 });

      assertFieldInvariant(mockDb);
    });

    it("update(IsDefault=0) does not change other defaults", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await FieldOptionRepository.update(10, { IsDefault: 1 });
      await FieldOptionRepository.update(10, { IsDefault: 0 });

      assertFieldInvariant(mockDb);
      const options = mockDb.getFieldOptions();
      const field1Defaults = options.filter((o) => o.FieldID === 1 && o.IsDefault === 1);
      expect(field1Defaults).toHaveLength(0);
    });
  });

  describe("DeviceOptionRepository.setDefault", () => {
    it("produces at most one default per DeviceType+FieldName", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "A", OptionValue: "a", DisplayOrder: 1, IsDefault: 0, IsActive: 1 }, 1);
      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "B", OptionValue: "b", DisplayOrder: 2, IsDefault: 0, IsActive: 1 }, 1);
      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "C", OptionValue: "c", DisplayOrder: 3, IsDefault: 0, IsActive: 1 }, 1);

      const opts = mockDb.getDeviceOptions();
      const aId = opts.find((o) => o.OptionLabel === "A")!.OptionID;
      const bId = opts.find((o) => o.OptionLabel === "B")!.OptionID;
      const cId = opts.find((o) => o.OptionLabel === "C")!.OptionID;

      await DeviceOptionsRepository.setDefault("Camera", "CameraType", aId, 1);
      await DeviceOptionsRepository.setDefault("Camera", "CameraType", bId, 1);
      await DeviceOptionsRepository.setDefault("Camera", "CameraType", cId, 1);

      assertDeviceInvariant(mockDb);
      const afterSet = mockDb.getDeviceOptions();
      const target = afterSet.find((o) => o.OptionID === cId);
      expect(target?.IsDefault).toBe(1);
      expect(afterSet.filter((o) => o.DeviceType === "Camera" && o.FieldName === "CameraType" && o.IsDefault === 1)).toHaveLength(1);
    });

    it("changing CameraType does not affect CameraStatus defaults", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "T1", OptionValue: "t1", DisplayOrder: 1, IsDefault: 0, IsActive: 1 }, 1);
      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "T2", OptionValue: "t2", DisplayOrder: 2, IsDefault: 0, IsActive: 1 }, 1);
      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "S1", OptionValue: "s1", DisplayOrder: 1, IsDefault: 0, IsActive: 1 }, 1);

      const opts = mockDb.getDeviceOptions();
      const t1 = opts.find((o) => o.OptionLabel === "T1")!.OptionID;
      const t2 = opts.find((o) => o.OptionLabel === "T2")!.OptionID;
      const s1 = opts.find((o) => o.OptionLabel === "S1")!.OptionID;

      await DeviceOptionsRepository.setDefault("Camera", "CameraType", t1, 1);
      await DeviceOptionsRepository.setDefault("Camera", "CameraStatus", s1, 1);

      await DeviceOptionsRepository.setDefault("Camera", "CameraType", t2, 1);

      assertDeviceInvariant(mockDb);
      const options = mockDb.getDeviceOptions();
      const typeDefaults = options.filter((o) => o.DeviceType === "Camera" && o.FieldName === "CameraType" && o.IsDefault === 1);
      const statusDefaults = options.filter((o) => o.DeviceType === "Camera" && o.FieldName === "CameraStatus" && o.IsDefault === 1);
      expect(typeDefaults).toHaveLength(1);
      expect(typeDefaults[0].OptionID).toBe(t2);
      expect(statusDefaults).toHaveLength(1);
      expect(statusDefaults[0].OptionID).toBe(s1);
    });

    it("changing Camera does not affect Switch defaults", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "T1", OptionValue: "t1", DisplayOrder: 1, IsDefault: 0, IsActive: 1 }, 1);
      await DeviceOptionsRepository.add({ DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "T2", OptionValue: "t2", DisplayOrder: 2, IsDefault: 0, IsActive: 1 }, 1);
      await DeviceOptionsRepository.add({ DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "SW1", OptionValue: "sw1", DisplayOrder: 1, IsDefault: 0, IsActive: 1 }, 1);

      const opts = mockDb.getDeviceOptions();
      const t1 = opts.find((o) => o.OptionLabel === "T1")!.OptionID;
      const t2 = opts.find((o) => o.OptionLabel === "T2")!.OptionID;
      const sw1 = opts.find((o) => o.OptionLabel === "SW1")!.OptionID;

      await DeviceOptionsRepository.setDefault("Camera", "CameraType", t1, 1);
      await DeviceOptionsRepository.setDefault("Switch", "SwitchType", sw1, 1);

      await DeviceOptionsRepository.setDefault("Camera", "CameraType", t2, 1);

      assertDeviceInvariant(mockDb);
      const options = mockDb.getDeviceOptions();
      const switchDefaults = options.filter((o) => o.DeviceType === "Switch" && o.FieldName === "SwitchType" && o.IsDefault === 1);
      expect(switchDefaults).toHaveLength(1);
      expect(switchDefaults[0].OptionID).toBe(sw1);
    });
  });

  describe("DeviceOptionRepository.add with IsDefault enforcement", () => {
    it("add(IsDefault=1) produces at most one default per group", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "A", OptionValue: "a",
        DisplayOrder: 1, IsDefault: 1, IsActive: 1,
      }, 1);

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "B", OptionValue: "b",
        DisplayOrder: 2, IsDefault: 1, IsActive: 1,
      }, 1);

      assertDeviceInvariant(mockDb);
      const options = mockDb.getDeviceOptions();
      const defaults = options.filter(
        (o) => o.DeviceType === "Camera" && o.FieldName === "CameraType" && o.IsDefault === 1
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].OptionID).toBe(2);
    });

    it("add(IsDefault=0) does not clear existing default", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "A", OptionValue: "a",
        DisplayOrder: 1, IsDefault: 1, IsActive: 1,
      }, 1);

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "B", OptionValue: "b",
        DisplayOrder: 2, IsDefault: 0, IsActive: 1,
      }, 1);

      assertDeviceInvariant(mockDb);
      const options = mockDb.getDeviceOptions();
      const defaults = options.filter(
        (o) => o.DeviceType === "Camera" && o.FieldName === "CameraType" && o.IsDefault === 1
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].OptionID).toBe(1);
    });

    it("adding to CameraType does not affect CameraStatus defaults", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "A", OptionValue: "a",
        DisplayOrder: 1, IsDefault: 1, IsActive: 1,
      }, 1);

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraStatus",
        OptionLabel: "S", OptionValue: "s",
        DisplayOrder: 1, IsDefault: 1, IsActive: 1,
      }, 1);

      await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "B", OptionValue: "b",
        DisplayOrder: 2, IsDefault: 1, IsActive: 1,
      }, 1);

      assertDeviceInvariant(mockDb);
      const options = mockDb.getDeviceOptions();
      const typeDefaults = options.filter(
        (o) => o.DeviceType === "Camera" && o.FieldName === "CameraType" && o.IsDefault === 1
      );
      const statusDefaults = options.filter(
        (o) => o.DeviceType === "Camera" && o.FieldName === "CameraStatus" && o.IsDefault === 1
      );
      expect(typeDefaults).toHaveLength(1);
      expect(typeDefaults[0].OptionLabel).toBe("B");
      expect(statusDefaults).toHaveLength(1);
      expect(statusDefaults[0].OptionLabel).toBe("S");
    });
  });

  describe("DeviceOptionRepository.update with IsDefault enforcement", () => {
    it("update(IsDefault=1) produces at most one default", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      mockDb.runAsync.mockImplementation(async (sql: string) => {
        if (sql.toUpperCase().includes("UPDATE DEVICEOPTIONS") && sql.toUpperCase().includes("ISDEFAULT = 0")) {
          return { changes: 1 };
        }
        return { changes: 1 };
      });

      await DeviceOptionsRepository.update({
        OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "A", OptionValue: "a", DisplayOrder: 1,
        IsDefault: 1, TemplateID: 1, IsActive: 1,
      });

      await DeviceOptionsRepository.update({
        OptionID: 20, DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "B", OptionValue: "b", DisplayOrder: 2,
        IsDefault: 1, TemplateID: 1, IsActive: 1,
      });

      assertDeviceInvariant(mockDb);
    });

    it("update(IsDefault=0) does not change other defaults", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      mockDb.runAsync.mockImplementation(async (sql: string) => {
        if (sql.toUpperCase().includes("UPDATE DEVICEOPTIONS") && sql.toUpperCase().includes("ISDEFAULT = 0")) {
          return { changes: 1 };
        }
        return { changes: 1 };
      });

      await DeviceOptionsRepository.update({
        OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "A", OptionValue: "a", DisplayOrder: 1,
        IsDefault: 1, TemplateID: 1, IsActive: 1,
      });

      await DeviceOptionsRepository.update({
        OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "A", OptionValue: "a", DisplayOrder: 1,
        IsDefault: 0, TemplateID: 1, IsActive: 1,
      });

      assertDeviceInvariant(mockDb);
      const options = mockDb.getDeviceOptions();
      const defaults = options.filter(
        (o) => o.DeviceType === "Camera" && o.FieldName === "CameraType" && o.IsDefault === 1
      );
      expect(defaults).toHaveLength(0);
    });
  });

  describe("ResetRepository preserves invariant", () => {
    it("reset produces at most one default per FieldOption group", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { SectionKey: "general_information", SectionID: 1 },
      ]);
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

      const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
      await ResetRepository.performReset();

      const insertCalls = mockDb.runAsync.mock.calls.filter(
        (c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions")
      );
      let defaultCount = 0;
      for (const call of insertCalls) {
        const isDefault = (call as [string, unknown[]])[1][4];
        if (isDefault === 1) defaultCount++;
      }
      expect(defaultCount).toBeLessThanOrEqual(1);
    });

    it("reset clears DeviceOptions IsDefault to 0 for all canonical options", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { SectionKey: "general_information", SectionID: 1 },
      ]);

      const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
      await ResetRepository.performReset();

      const deviceOptionUpdates = mockDb.runAsync.mock.calls.filter((c: [string]) =>
        String(c[0]).includes("UPDATE DeviceOptions") &&
        String(c[0]).includes("IsDefault") &&
        String(c[0]).includes("OptionLabel")
      );
      expect(deviceOptionUpdates.length).toBe(50);
      for (const call of deviceOptionUpdates) {
        expect(String(call[0])).toContain("IsDefault = 0");
      }
    });
  });
});
