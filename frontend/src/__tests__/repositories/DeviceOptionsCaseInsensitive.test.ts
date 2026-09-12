jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

function createMockDb() {
  const runAsyncFn = jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 1 });
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: runAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

describe("DeviceOptionsRepository — device option duplicates are case-insensitive", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("add", () => {
    it("1. A: add blocked when the label differs only by case", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Bullet", OptionValue: "Bullet" }]);

      await expect(
        DeviceOptionsRepository.add({
          DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "bullet", OptionValue: "bullet",
          DisplayOrder: 3, IsDefault: 0, IsActive: 1,
        }, 1)
      ).rejects.toThrow(`"bullet" Already Exists`);
    });

    it("2. add blocked when the value differs only by case", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Bullet", OptionValue: "BULLET" }]);

      await expect(
        DeviceOptionsRepository.add({
          DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Dome", OptionValue: "bullet",
          DisplayOrder: 3, IsDefault: 0, IsActive: 1,
        }, 1)
      ).rejects.toThrow(/already exists/i);
    });

    it("3. B: different option in the same device field is allowed", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Bullet", OptionValue: "Bullet" }]);
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 7, changes: 1 });

      const id = await DeviceOptionsRepository.add({
        DeviceType: "Camera", FieldName: "CameraType",
        OptionLabel: "Dome", OptionValue: "Dome",
        DisplayOrder: 2, IsDefault: 0, IsActive: 1,
      }, 1);

      expect(id).toBe(7);
    });

    it("4. C: the same option on a different device field is allowed", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 8, changes: 1 });

      const id = await DeviceOptionsRepository.add({
        DeviceType: "Switch", FieldName: "SwitchMake",
        OptionLabel: "Bullet", OptionValue: "Bullet",
        DisplayOrder: 1, IsDefault: 0, IsActive: 1,
      }, 1);

      expect(id).toBe(8);
    });

    it("5. E: a blocked add does not insert anything", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Bullet", OptionValue: "Bullet" }]);

      await expect(
        DeviceOptionsRepository.add({
          DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "BULLET", OptionValue: "BULLET",
          DisplayOrder: 1, IsDefault: 1, IsActive: 1,
        }, 1)
      ).rejects.toThrow(/already exists/i);

      expect(
        mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("INSERT INTO DeviceOptions")).length
      ).toBe(0);
    });
  });

  describe("update", () => {
    it("6. D: editing an option to itself (case only) does NOT trigger duplicate detection", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        DeviceOptionsRepository.update({
          OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "bullet", OptionValue: "bullet",
          DisplayOrder: 1, TemplateID: 1, IsDefault: 0, IsActive: 1,
        })
      ).resolves.toBeUndefined();
    });

    it("7. editing to a case-differing label used by a sibling option is blocked", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 20, OptionLabel: "Bullet", OptionValue: "Bullet" }]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        DeviceOptionsRepository.update({
          OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "bullet", OptionValue: "bullet",
          DisplayOrder: 1, TemplateID: 1, IsDefault: 0, IsActive: 1,
        })
      ).rejects.toThrow(/already exists/i);
    });

    it("8. editing to a non-conflicting value is allowed", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 20, OptionLabel: "Bullet", OptionValue: "Bullet" }]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        DeviceOptionsRepository.update({
          OptionID: 10, DeviceType: "Camera", FieldName: "CameraType",
          OptionLabel: "Dome", OptionValue: "Dome",
          DisplayOrder: 1, TemplateID: 1, IsDefault: 0, IsActive: 1,
        })
      ).resolves.toBeUndefined();
    });
  });
});