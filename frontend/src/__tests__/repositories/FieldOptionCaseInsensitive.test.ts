jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { FieldOptionRepository } from "@/src/database/repositories/FieldOptionRepository";

function createMockDb() {
  const runAsyncFn = jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 1 });
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: runAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

describe("FieldOptionRepository — dropdown option duplicates are case-insensitive", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("create", () => {
    it("1. A: create blocked when the label differs only by case", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Yes", OptionValue: "Yes" }]);

      await expect(
        FieldOptionRepository.create({ FieldID: 1, OptionLabel: "yes", OptionValue: "yes", IsDefault: 0 })
      ).rejects.toThrow(`"yes" Already Exists`);
    });

    it("2. create blocked when the value differs only by case", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Good", OptionValue: "YES" }]);

      await expect(
        FieldOptionRepository.create({ FieldID: 1, OptionLabel: "Bad", OptionValue: "yes", IsDefault: 0 })
      ).rejects.toThrow(/already exists/i);
    });

    it("3. B: different option in the same field is still allowed", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Yes", OptionValue: "Yes" }]);
      mockDb.getFirstAsync.mockResolvedValue({ Max: 1 });
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 2, changes: 1 });

      const id = await FieldOptionRepository.create({ FieldID: 1, OptionLabel: "No", OptionValue: "No", IsDefault: 0 });

      expect(id).toBe(2);
    });

    it("4. C: the same option on a different field is allowed", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

      const id = await FieldOptionRepository.create({ FieldID: 2, OptionLabel: "Yes", OptionValue: "Yes", IsDefault: 0 });

      expect(id).toBe(5);
    });

    it("5. E: a blocked create does not insert anything", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 1, OptionLabel: "Yes", OptionValue: "Yes" }]);

      await expect(
        FieldOptionRepository.create({ FieldID: 1, OptionLabel: "yes", OptionValue: "yes", IsDefault: 1 })
      ).rejects.toThrow(/already exists/i);

      expect(
        mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions")).length
      ).toBe(0);
    });
  });

  describe("update", () => {
    it("6. D: editing an option to itself (case only) does NOT trigger duplicate detection", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1, OptionLabel: "yes", OptionValue: "yes" });
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "Yes", OptionValue: "Yes" })
      ).resolves.toBeUndefined();
    });

    it("7. editing to a value used by another option in the same field, differing only by case, is blocked", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1, OptionLabel: "old", OptionValue: "old" });
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 20, OptionLabel: "Yes", OptionValue: "Yes" }]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "yes", OptionValue: "yes" })
      ).rejects.toThrow(/already exists/i);
    });

    it("8. editing to a case-differing label used by a sibling is blocked even when the value differs", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1, OptionLabel: "old", OptionValue: "old" });
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 20, OptionLabel: "Yes", OptionValue: "YES" }]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "yes", OptionValue: "no", IsDefault: 0 })
      ).rejects.toThrow(/already exists/i);
    });

    it("9. editing to a non-conflicting value is allowed", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1, OptionLabel: "old", OptionValue: "old" });
      mockDb.getAllAsync.mockResolvedValue([{ OptionID: 20, OptionLabel: "Yes", OptionValue: "Yes" }]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "No", OptionValue: "No" })
      ).resolves.toBeUndefined();
    });
  });
});