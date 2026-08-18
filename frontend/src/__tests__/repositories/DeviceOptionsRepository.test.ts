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

describe("DeviceOptionsRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("setDefault (existing behavior)", () => {
    it("10. clears all defaults then sets target", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await DeviceOptionsRepository.setDefault("Camera", "CameraType", 10, 1);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("DeviceType = ?") && c.sql.includes("FieldName = ?")
      );
      const setCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 1") && c.sql.includes("OptionID = ?")
      );

      expect(clearCall).toBeTruthy();
      expect(setCall).toBeTruthy();
      expect(clearCall!.params).toContain("Camera");
      expect(clearCall!.params).toContain("CameraType");
      expect(setCall!.params).toContain(10);
    });
  });

  describe("update with IsDefault enforcement", () => {
    it("11. update(IsDefault=1) clears previous default", async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await DeviceOptionsRepository.update({
        OptionID: 10,
        DeviceType: "Camera",
        FieldName: "CameraType",
        OptionLabel: "Bullet",
        OptionValue: "Bullet",
        DisplayOrder: 1,
        IsDefault: 1,
        TemplateID: 1,
        IsActive: 1,
      });

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("DeviceType = ?") && c.sql.includes("FieldName = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toContain("Camera");
      expect(clearCall!.params).toContain("CameraType");
      expect(clearCall!.params).toContain(10);
    });

    it("12. update(IsDefault=0) does not clear other defaults", async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await DeviceOptionsRepository.update({
        OptionID: 10,
        DeviceType: "Camera",
        FieldName: "CameraType",
        OptionLabel: "Bullet",
        OptionValue: "Bullet",
        DisplayOrder: 1,
        IsDefault: 0,
        TemplateID: 1,
        IsActive: 1,
      });

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("DeviceType = ?") && c.sql.includes("FieldName = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeUndefined();
    });
  });

  describe("add with IsDefault enforcement", () => {
    it("13. add(IsDefault=1) clears previous default", async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 100, changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await DeviceOptionsRepository.add({
        DeviceType: "Camera",
        FieldName: "CameraType",
        OptionLabel: "New Type",
        OptionValue: "NewType",
        DisplayOrder: 4,
        IsDefault: 1,
        IsActive: 1,
      }, 1);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("DeviceType = ?") && c.sql.includes("FieldName = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toContain("Camera");
      expect(clearCall!.params).toContain("CameraType");
      expect(clearCall!.params).toContain(100);
    });

    it("14. add(IsDefault=0) does not clear other defaults", async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 100, changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await DeviceOptionsRepository.add({
        DeviceType: "Camera",
        FieldName: "CameraType",
        OptionLabel: "New Type",
        OptionValue: "NewType",
        DisplayOrder: 4,
        IsDefault: 0,
        IsActive: 1,
      }, 1);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("DeviceType = ?") && c.sql.includes("FieldName = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeUndefined();
    });
  });

  describe("isolation", () => {
    it("15. unrelated DeviceType/field is unaffected", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await DeviceOptionsRepository.setDefault("Camera", "CameraType", 10, 1);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("DeviceType = ?") && c.sql.includes("FieldName = ?")
      );
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toContain("Camera");
      expect(clearCall!.params).toContain("CameraType");
    });

    it("16. repeated default changes remain correct", async () => {
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await DeviceOptionsRepository.setDefault("Camera", "CameraType", 10, 1);
      await DeviceOptionsRepository.setDefault("Camera", "CameraType", 20, 1);
      await DeviceOptionsRepository.setDefault("Camera", "CameraType", 30, 1);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const setCalls = calls.filter((c: { sql: string }) =>
        c.sql.includes("IsDefault = 1") && c.sql.includes("OptionID = ?")
      );
      expect(setCalls.length).toBe(3);
      expect(setCalls[2].params).toContain(30);
    });
  });
});
