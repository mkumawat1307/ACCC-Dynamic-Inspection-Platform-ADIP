jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

function createMockDb() {
  const runAsyncFn = jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 1 });
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: runAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

function installSchemaMock(mockDb: ReturnType<typeof createMockDb>) {
  mockDb.getAllAsync.mockImplementation(async (sql: string): Promise<any[]> => {
    if (sql.includes("WHERE SectionKey IN")) return [{ SectionID: 1 }];
    if (sql.includes("SELECT SectionKey, SectionID FROM InspectionSections")) {
      return [
        { SectionKey: "general_information", SectionID: 1 },
        { SectionKey: "pole_structure", SectionID: 2 },
      ];
    }
    if (sql.includes("InspectionSections") && sql.includes("AND IsDefault = 1 LIMIT 1")) return [{ SectionID: 7 }];
    if (sql.includes("InspectionSections") && sql.includes("ORDER BY")) return [];
    if (sql.includes("InspectionFields") && sql.includes("ORDER BY")) return [];
    if (sql.includes("InspectionFields") && sql.includes("LIMIT 1")) return [{ FieldID: 33, IsActive: 1 }];
    return [];
  });
}

describe("ResetRepository.performReset", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("1. deactivates custom sections (IsDefault=0)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("UPDATE InspectionSections SET IsActive = 0") && s.includes("IsDefault = 0"))).toBe(true);
  });

  it("2. deactivates custom fields (FieldKey NOT IN default list)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("UPDATE InspectionFields SET IsActive = 0") && s.includes("NOT IN"))).toBe(true);
  });

  it("3. deactivates custom device field definitions", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("UPDATE DeviceFieldDefinitions SET IsActive = 0") && s.includes("NOT IN"))).toBe(true);
  });

  it("4. deactivates custom device options", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("UPDATE DeviceOptions SET IsActive = 0") && s.includes("NOT IN"))).toBe(true);
  });

  it("5. deletes custom ProjectDeviceTypes", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM ProjectDeviceTypes") && s.includes("NOT IN"))).toBe(true);
  });

  it("6. restores default section properties (DisplayOrder, Name, etc.) for non-locked sections", async () => {
    installSchemaMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const sectionUpdate = calls.find((c) => c.sql.includes("UPDATE InspectionSections") && c.sql.includes("SectionName = ?") && c.sql.includes("IsDefault = 1") && c.sql.includes("WHERE SectionKey = ?"));
    expect(sectionUpdate).toBeTruthy();
    expect(sectionUpdate!.params).toContain("Pole Structure Details");
    expect(sectionUpdate!.params).toContain("pole_structure");
  });

  it("6b. does NOT restore locked default sections (general_information)", async () => {
    installSchemaMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const updates = calls.filter((c) => c.sql.includes("UPDATE InspectionSections") && c.sql.includes("WHERE SectionKey = ?"));
    const allParams = updates.flatMap((c) => c.params as unknown[]);
    expect(allParams).not.toContain("general_information");
    expect(allParams).not.toContain("remarks");
    expect(allParams).not.toContain("photos");
  });

  it("7. restores default field properties (FieldName, FieldType, etc.) for non-locked fields", async () => {
    installSchemaMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const fieldUpdate = calls.find((c) => c.sql.includes("UPDATE InspectionFields") && c.sql.includes("FieldName = ?") && c.sql.includes("FieldKey = ?"));
    expect(fieldUpdate).toBeTruthy();
    expect(fieldUpdate!.params).toContain("Foundation Condition");
    expect(fieldUpdate!.params).toContain("foundation_cond");
  });

  it("7b. does NOT restore fields inside locked sections (date)", async () => {
    installSchemaMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const updates = calls.filter((c) => c.sql.includes("UPDATE InspectionFields") && c.sql.includes("FieldKey = ?"));
    const allParams = updates.flatMap((c) => c.params as unknown[]);
    expect(allParams).not.toContain("date");
  });

  it("8. restores default device field definition properties", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const dfdUpdate = calls.find((c) => c.sql.includes("UPDATE DeviceFieldDefinitions") && c.sql.includes("Label = ?"));
    expect(dfdUpdate).toBeTruthy();
    expect(dfdUpdate!.params).toContain("Camera Type");
    expect(dfdUpdate!.params).toContain("Camera");
    expect(dfdUpdate!.params).toContain("CameraType");
  });

  it("9. restores default device option properties", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const doUpdate = calls.find((c) => c.sql.includes("UPDATE DeviceOptions") && c.sql.includes("OptionLabel = ?"));
    expect(doUpdate).toBeTruthy();
    expect(doUpdate!.params).toContain("4K");
    expect(doUpdate!.params).toContain("Camera");
    expect(doUpdate!.params).toContain("CameraType");
  });

  it("10. soft-deactivates all FieldOptions then re-inserts canonical set", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("UPDATE FieldOptions SET IsActive = 0"))).toBe(true);
    expect(calls.some((s: string) => s.includes("DELETE FROM FieldOptions"))).toBe(false);
    expect(calls.some((s: string) => s.includes("INSERT INTO FieldOptions"))).toBe(true);
  });

  it("11. re-inserts canonical field options for each seed option", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 42 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const insertCalls = mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions"));
    const { fieldOptions } = require("@/src/database/seeds/field-options.data");
    expect(insertCalls).toHaveLength(fieldOptions.length);
  });

  it("12. restores IsRequired on existing ProjectDeviceTypes (UPDATE, not INSERT OR IGNORE)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ ID: 5 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const { FACTORY_DEVICE_TYPES, FACTORY_REQUIRED_DEVICE_TYPES } = require("@/src/database/seeds/factory-config");
    const updates = mockDb.runAsync.mock.calls
      .map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }))
      .filter((c) => c.sql.includes("UPDATE ProjectDeviceTypes SET IsActive = 1, IsRequired = ?"));
    expect(updates).toHaveLength(FACTORY_DEVICE_TYPES.length);
    for (const update of updates) {
      expect(update.sql).toContain("SET IsActive = 1, IsRequired = ?");
      expect(update.sql).not.toContain("UpdatedAt");
    }
    const requiredFlag = (dt: string) => (FACTORY_REQUIRED_DEVICE_TYPES.includes(dt) ? 1 : 0);
    const expectedFlags = FACTORY_DEVICE_TYPES.map((dt: string) => requiredFlag(dt));
    for (const update of updates) {
      expect(update.params).toContain(5);
    }
    expect(updates.map((u) => (u.params as unknown[])[0])).toEqual(expectedFlags);
    const ignoredInserts = mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("INSERT OR IGNORE INTO ProjectDeviceTypes"));
    expect(ignoredInserts).toHaveLength(0);
  });

  it("12b. inserts a missing default ProjectDeviceTypes row (plain INSERT, never INSERT OR IGNORE)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue(null);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO ProjectDeviceTypes"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params).toContain("Camera");
    expect(inserts[1].params).toContain("Switch");
    expect(calls.some((c) => c.sql.includes("INSERT OR IGNORE INTO ProjectDeviceTypes"))).toBe(false);
  });

  it("13. runs inside a transaction (withTransactionAsync called)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it("14. transaction rolls back on error", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.runAsync.mockRejectedValueOnce(new Error("DB error"));

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await expect(ResetRepository.performReset()).rejects.toThrow("DB error");
  });

  it("15. reset twice produces no duplicates (idempotent)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();
    await ResetRepository.performReset();

    const softDeactivateFieldOptions = mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("UPDATE FieldOptions SET IsActive = 0"));
    expect(softDeactivateFieldOptions).toHaveLength(2);
  });

  it("16. deactivates sections by IsDefault=0 (not hardcoded list)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const deactivateSections = calls.find((c) => c.sql.includes("UPDATE InspectionSections SET IsActive = 0") && c.sql.includes("IsDefault = 0"));
    expect(deactivateSections).toBeTruthy();
  });

  it("17. default section IsActive restored to 1", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const restoreSections = calls.find((c) => c.sql.includes("UPDATE InspectionSections") && c.sql.includes("IsActive = 1") && c.sql.includes("IsDefault = 1"));
    expect(restoreSections).toBeTruthy();
  });

  it("18. default field IsActive restored to 1", async () => {
    installSchemaMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const restoreFields = calls.find((c) => c.sql.includes("UPDATE InspectionFields") && c.sql.includes("IsActive = 1") && c.sql.includes("FieldKey = ?"));
    expect(restoreFields).toBeTruthy();
    expect(restoreFields!.params).toContain("foundation_cond");
  });

  it("19. DeviceFieldDefinitions for Camera/Switch IsActive restored to 1", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const restoreDfd = calls.find((c) => c.sql.includes("UPDATE DeviceFieldDefinitions SET IsActive = 1"));
    expect(restoreDfd).toBeTruthy();
    expect(restoreDfd!.params).toContain("Camera");
    expect(restoreDfd!.params).toContain("Switch");
  });

  it("20. DeviceOptions for Camera/Switch IsActive restored to 1", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] }));
    const restoreDo = calls.find((c) => c.sql.includes("UPDATE DeviceOptions SET IsActive = 1"));
    expect(restoreDo).toBeTruthy();
    expect(restoreDo!.params).toContain("Camera");
    expect(restoreDo!.params).toContain("Switch");
  });

  it("21. does NOT delete Inspections table", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM Inspections"))).toBe(false);
  });

  it("22. does NOT delete InspectionValues", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM InspectionValues"))).toBe(false);
  });

  it("23. does NOT delete DeviceRecords", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM DeviceRecords"))).toBe(false);
  });

  it("24. does NOT delete Photos", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM Photos"))).toBe(false);
  });

  it("25. does NOT delete Projects", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM Projects"))).toBe(false);
  });

  it("26. handles missing section key gracefully (no crash)", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await expect(ResetRepository.performReset()).resolves.toBeUndefined();
  });

  it("27. field options use correct FieldID from InspectionFields lookup", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 99 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const insertCalls = mockDb.runAsync.mock.calls.filter((c: [string, unknown[]]) => String(c[0]).includes("INSERT INTO FieldOptions"));
    for (const call of insertCalls) {
      expect(call[1][0]).toBe(99);
    }
  });

  it("28. reset restores canonical default flags (IsDefault from seed data)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const insertCalls = mockDb.runAsync.mock.calls.filter((c: [string, unknown[]]) => String(c[0]).includes("INSERT INTO FieldOptions"));
    for (const call of insertCalls) {
      const isDefault = call[1][4];
      expect(isDefault).toBe(0);
    }
  });

  it("29. reset does not create duplicate defaults", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const insertCalls = mockDb.runAsync.mock.calls.filter((c: [string, unknown[]]) => String(c[0]).includes("INSERT INTO FieldOptions"));
    const defaultCount = insertCalls.filter((c: [string, unknown[]]) => c[1][4] === 1).length;
    expect(defaultCount).toBe(0);
  });

  it("30. reset is idempotent (second call produces same result)", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();
    const firstCallCount = mockDb.runAsync.mock.calls.length;

    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    await ResetRepository.performReset();
    const secondCallCount = mockDb.runAsync.mock.calls.length;

    expect(secondCallCount).toBe(firstCallCount);
  });

  it("31. reset does not delete historical inspection data", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s: string) => s.includes("DELETE FROM InspectionValues"))).toBe(false);
    expect(calls.some((s: string) => s.includes("DELETE FROM DeviceRecords"))).toBe(false);
    expect(calls.some((s: string) => s.includes("DELETE FROM Photos"))).toBe(false);
    expect(calls.some((s: string) => s.includes("DELETE FROM Inspections"))).toBe(false);
  });

  it("32. DeviceOptions reset restores IsDefault=0 for every canonical option", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const deviceOptionUpdates = mockDb.runAsync.mock.calls.filter((c: [string]) =>
      String(c[0]).includes("UPDATE DeviceOptions") &&
      String(c[0]).includes("OptionLabel") &&
      String(c[0]).includes("OptionValue") &&
      String(c[0]).includes("DisplayOrder")
    );

    expect(deviceOptionUpdates.length).toBe(50);

    for (const call of deviceOptionUpdates) {
      const sql = String(call[0]);
      expect(sql).toContain("IsDefault = 0");
    }
  });

  it("33. DeviceOptions reset restores all canonical labels, values and DisplayOrder", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const deviceOptionUpdates = mockDb.runAsync.mock.calls.filter((c: [string]) =>
      String(c[0]).includes("UPDATE DeviceOptions") &&
      String(c[0]).includes("OptionLabel") &&
      String(c[0]).includes("OptionValue")
    );

    const bulletUpdate = deviceOptionUpdates.find((c: [unknown[], unknown[]]) => {
      const params = c[1] as unknown[];
      return params[3] === "Camera" && params[4] === "CameraType" && params[5] === "Bullet";
    });

    expect(bulletUpdate).toBeDefined();
    const bulletParams = bulletUpdate![1] as unknown[];
    expect(bulletParams[0]).toBe("Bullet");
    expect(bulletParams[1]).toBe("Bullet");
    expect(bulletParams[2]).toBe(4);
  });

  it("34. repeated DeviceOptions reset produces identical IsDefault=0 for all options", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");

    await ResetRepository.performReset();
    const firstCalls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
      sql: String(c[0]),
      params: [...(c[1] || [])],
    }));

    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });

    await ResetRepository.performReset();
    const secondCalls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
      sql: String(c[0]),
      params: [...(c[1] || [])],
    }));

    const firstDeviceOpts = firstCalls.filter((c) =>
      c.sql.includes("UPDATE DeviceOptions") && c.sql.includes("IsDefault")
    );
    const secondDeviceOpts = secondCalls.filter((c) =>
      c.sql.includes("UPDATE DeviceOptions") && c.sql.includes("IsDefault")
    );

    expect(secondDeviceOpts.length).toBe(firstDeviceOpts.length);

    for (let i = 0; i < firstDeviceOpts.length; i++) {
      expect(secondDeviceOpts[i].sql).toBe(firstDeviceOpts[i].sql);
      expect(secondDeviceOpts[i].params).toEqual(firstDeviceOpts[i].params);
    }
  });
});
