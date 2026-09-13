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
    mockDb.getFirstAsync.mockResolvedValue({ DeviceType: "Camera", FieldName: "CameraType", TemplateID: 1, IsActive: 1 });
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("setDefault", () => {
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

    it("10a. rejects a non-existent option and never writes", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await expect(DeviceOptionsRepository.setDefault("Camera", "CameraType", 999, 1)).rejects.toThrow("Option ID 999 does not exist.");
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("10b. rejects an option that belongs to another device group and never writes", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ DeviceType: "Switch", FieldName: "SwitchType", TemplateID: 1, IsActive: 1 });
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await expect(DeviceOptionsRepository.setDefault("Camera", "CameraType", 10, 1))
        .rejects.toThrow("Option ID 10 does not belong to Camera:CameraType for template 1.");
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("10c. rejects an inactive option and never writes", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ DeviceType: "Camera", FieldName: "CameraType", TemplateID: 1, IsActive: 0 });
      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");

      await expect(DeviceOptionsRepository.setDefault("Camera", "CameraType", 10, 1))
        .rejects.toThrow("Option ID 10 is inactive and cannot be set as default.");
      expect(mockDb.runAsync).not.toHaveBeenCalled();
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

  describe("add duplicate prevention", () => {
    it("17. A: same field + same option -> duplicate prevented (add throws)", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "Bullet", OptionValue: "Bullet" },
        { OptionID: 2, OptionLabel: "Dome", OptionValue: "Dome" },
      ]);

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await expect(
        DeviceOptionsRepository.add({
          DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Bullet", OptionValue: "Bullet",
          DisplayOrder: 3, IsDefault: 0, IsActive: 1,
        }, 1)
      ).rejects.toThrow(/already exists/i);
    });

    it("18. B: same field + different option allowed", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "Bullet", OptionValue: "Bullet" },
      ]);
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 7, changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      const id = await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "Dome", OptionValue: "Dome",
        DisplayOrder: 2, IsDefault: 0, IsActive: 1,
      }, 1);
      expect(id).toBe(7);
    });

    it("19. C: same option on different device field allowed", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 8, changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      const id = await DeviceOptionsRepository.add({
        DeviceType: "Switch", FieldName: "SwitchMake",
        OptionLabel: "Bullet", OptionValue: "Bullet",
        DisplayOrder: 1, IsDefault: 0, IsActive: 1,
      }, 1);
      expect(id).toBe(8);
    });

    it("20. E: thrown duplicate add does NOT insert or clear any default", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "Bullet", OptionValue: "Bullet", IsDefault: 1 },
      ]);

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await expect(
        DeviceOptionsRepository.add({
          DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Bullet", OptionValue: "Bullet",
          DisplayOrder: 1, IsDefault: 1, IsActive: 1,
        }, 1)
      ).rejects.toThrow(/already exists/i);

      const insertCalls = mockDb.runAsync.mock.calls.filter(
        (c: [string]) => String(c[0]).includes("INSERT INTO DeviceOptions")
      );
      expect(insertCalls.length).toBe(0);
    });
  });

  describe("update duplicate prevention", () => {
    it("21. D: editing an option to itself does NOT trigger duplicate detection", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await expect(
        DeviceOptionsRepository.update({
          OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Bullet", OptionValue: "Bullet",
          DisplayOrder: 1, TemplateID: 1, IsDefault: 0, IsActive: 1,
        })
      ).resolves.toBeUndefined();
    });

    it("22. editing to a value used by another option in same field -> blocked", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 20, OptionLabel: "Bullet", OptionValue: "Bullet" },
      ]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await expect(
        DeviceOptionsRepository.update({
          OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Bullet", OptionValue: "Bullet",
          DisplayOrder: 1, TemplateID: 1, IsDefault: 0, IsActive: 1,
        })
      ).rejects.toThrow(/already exists/i);
    });

    it("23. editing to a non-conflicting value allowed", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 20, OptionLabel: "Dome", OptionValue: "Dome" },
      ]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { default: DeviceOptionsRepository } = require("@/src/database/repositories/DeviceOptionsRepository");
      await expect(
        DeviceOptionsRepository.update({
          OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Bullet", OptionValue: "Bullet",
          DisplayOrder: 1, TemplateID: 1, IsDefault: 0, IsActive: 1,
        })
      ).resolves.toBeUndefined();
    });
  });
});
