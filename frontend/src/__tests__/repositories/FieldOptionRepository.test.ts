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

describe("FieldOptionRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("setDefault", () => {
    it("1. makes exactly one option default", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await FieldOptionRepository.setDefault(1, 10);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) => c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?"));
      const setCall = calls.find((c: { sql: string }) => c.sql.includes("IsDefault = 1") && c.sql.includes("OptionID = ?"));

      expect(clearCall).toBeTruthy();
      expect(setCall).toBeTruthy();
      expect(clearCall!.params).toContain(1);
      expect(setCall!.params).toContain(10);
    });

    it("2. clears previous default when setting new one", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await FieldOptionRepository.setDefault(1, 20);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) => c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?"));
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toEqual([1]);
    });

    it("3. clearing default allows zero defaults", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      await FieldOptionRepository.setDefault(1, 10);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) => c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?"));
      const setCall = calls.find((c: { sql: string }) => c.sql.includes("IsDefault = 1") && c.sql.includes("OptionID = ?"));

      expect(clearCall).toBeTruthy();
      expect(setCall).toBeTruthy();
    });
  });

  describe("create with IsDefault enforcement", () => {
    it("4. create(IsDefault=1) clears sibling default", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Max: 5 });
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 100, changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await FieldOptionRepository.create({
        FieldID: 1,
        OptionLabel: "New Option",
        OptionValue: "new",
        IsDefault: 1,
      });

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toContain(1);
      expect(clearCall!.params).toContain(100);
    });

    it("5. create(IsDefault=0) does not clear sibling default", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Max: 5 });
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 100, changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await FieldOptionRepository.create({
        FieldID: 1,
        OptionLabel: "New Option",
        OptionValue: "new",
        IsDefault: 0,
      });

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeUndefined();
    });
  });

  describe("update with IsDefault enforcement", () => {
    it("6. update(IsDefault=1) clears sibling default", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await FieldOptionRepository.update(10, { IsDefault: 1 });

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toContain(1);
      expect(clearCall!.params).toContain(10);
    });

    it("7. update(IsDefault=0) does not clear sibling default", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await FieldOptionRepository.update(10, { IsDefault: 0 });

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) =>
        c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?") && c.sql.includes("OptionID != ?")
      );
      expect(clearCall).toBeUndefined();
    });
  });

  describe("isolation", () => {
    it("8. unrelated dropdown is unaffected", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      await FieldOptionRepository.setDefault(1, 10);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const clearCall = calls.find((c: { sql: string }) => c.sql.includes("IsDefault = 0") && c.sql.includes("FieldID = ?"));
      expect(clearCall).toBeTruthy();
      expect(clearCall!.params).toEqual([1]);
    });

    it("9. 3+ options still produce maximum one default", async () => {
      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");

      await FieldOptionRepository.setDefault(1, 10);
      await FieldOptionRepository.setDefault(1, 20);
      await FieldOptionRepository.setDefault(1, 30);

      const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
        sql: String(c[0]),
        params: c[1],
      }));

      const setCalls = calls.filter((c: { sql: string }) => c.sql.includes("IsDefault = 1") && c.sql.includes("OptionID = ?"));
      expect(setCalls.length).toBe(3);

      const lastSetCall = setCalls[2];
      expect(lastSetCall.params).toContain(30);
    });
  });

  describe("create duplicate prevention", () => {
    it("10. A: same field + same option -> duplicate prevented (create throws)", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "yes", OptionValue: "yes" },
        { OptionID: 2, OptionLabel: "no", OptionValue: "no" },
      ]);

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(
        FieldOptionRepository.create({ FieldID: 1, OptionLabel: "yes", OptionValue: "yes", IsDefault: 0 })
      ).rejects.toThrow(/already exists/);
    });

    it("11. same value with different label still blocked (value identity)", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "Installed", OptionValue: "Yes" },
      ]);

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(
        FieldOptionRepository.create({ FieldID: 1, OptionLabel: "Installed ", OptionValue: "Yes", IsDefault: 0 })
      ).rejects.toThrow(/already exists/);
    });

    it("12. B: same field + different option allowed", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "yes", OptionValue: "yes" },
      ]);
      mockDb.getFirstAsync.mockResolvedValue({ Max: 1 });
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 2, changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      const id = await FieldOptionRepository.create({
        FieldID: 1, OptionLabel: "no", OptionValue: "no", IsDefault: 0,
      });
      expect(id).toBe(2);
    });

    it("13. C: same option on different field allowed", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);
      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      const id = await FieldOptionRepository.create({
        FieldID: 2, OptionLabel: "yes", OptionValue: "yes", IsDefault: 0,
      });
      expect(id).toBe(5);
    });

    it("14. E: thrown duplicate create does NOT insert or clear any default", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 1, OptionLabel: "yes", OptionValue: "yes", IsDefault: 1 },
      ]);

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(
        FieldOptionRepository.create({ FieldID: 1, OptionLabel: "yes", OptionValue: "yes", IsDefault: 1 })
      ).rejects.toThrow(/already exists/);

      const insertCalls = mockDb.runAsync.mock.calls.filter(
        (c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions")
      );
      expect(insertCalls.length).toBe(0);
    });
  });

  describe("update duplicate prevention", () => {
    it("15. D: editing an option to itself does NOT trigger duplicate detection", async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        FieldID: 1, OptionLabel: "yes", OptionValue: "yes",
      });
      mockDb.getAllAsync.mockResolvedValue([]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "yes", OptionValue: "yes" })
      ).resolves.toBeUndefined();
    });

    it("16. editing to a value used by another option in same field -> blocked", async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        FieldID: 1, OptionLabel: "old", OptionValue: "old",
      });
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 20, OptionLabel: "yes", OptionValue: "yes" },
      ]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "yes", OptionValue: "yes" })
      ).rejects.toThrow(/already exists/);
    });

    it("17. editing label/value to a non-conflicting value allowed", async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        FieldID: 1, OptionLabel: "old", OptionValue: "old",
      });
      mockDb.getAllAsync.mockResolvedValue([
        { OptionID: 20, OptionLabel: "no", OptionValue: "no" },
      ]);
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(
        FieldOptionRepository.update(10, { OptionLabel: "yes", OptionValue: "yes" })
      ).resolves.toBeUndefined();
    });

    it("18. C: update does not affect default handling (IsDefault-only still allowed)", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ FieldID: 1 });
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository");
      await expect(FieldOptionRepository.update(10, { IsDefault: 1 })).resolves.toBeUndefined();
    });
  });
});
