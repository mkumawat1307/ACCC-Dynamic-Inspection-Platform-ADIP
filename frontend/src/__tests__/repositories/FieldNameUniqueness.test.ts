jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { FieldRepository } from "@/src/database/repositories/FieldRepository";

function createMockDb() {
  const runAsyncFn = jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 });
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: runAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

describe("FieldRepository — FieldName uniqueness is scoped to the section and normalized", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("nameExists", () => {
    it("1. returns true for an active name duplicate (case-insensitive)", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ FieldName: "Pole Condition" }]);

      const exists = await FieldRepository.nameExists("pole condition", 1);

      expect(exists).toBe(true);
    });

    it("2. returns true ignoring surrounding whitespace", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ FieldName: "  Make  " }]);

      const exists = await FieldRepository.nameExists("Make", 1);

      expect(exists).toBe(true);
    });

    it("3. returns false when no active field matches in the section", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ FieldName: "Make" }]);

      const exists = await FieldRepository.nameExists("Model", 1);

      expect(exists).toBe(false);
    });

it("4. returns false when the match is in a different section", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const exists = await FieldRepository.nameExists("Make", 2);

    expect(exists).toBe(false);
    const query = String(mockDb.getAllAsync.mock.calls[0][0]);
    expect(query).toContain("SectionID = ?");
    expect(mockDb.getAllAsync.mock.calls[0][1]).toEqual([2]);
  });

    it("5. query only considers active rows", async () => {
      await FieldRepository.nameExists("Make", 1);

      const query = String(mockDb.getAllAsync.mock.calls[0][0]);
      expect(query).toContain("IsActive = 1");
    });

    it("6. excludes a given field id so an editing field can keep its own name", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ FieldName: "Make" }]);

      const exists = await FieldRepository.nameExists("Make", 1, 7);

      expect(exists).toBe(true);
      expect(String(mockDb.getAllAsync.mock.calls[0][0])).toContain("FieldID !=");
      expect(mockDb.getAllAsync.mock.calls[0][1]).toEqual([1, 7]);
    });
  });

  describe("create", () => {
    it("7. create rejects when the FieldName duplicates an active field in the same section", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });
      mockDb.getAllAsync.mockResolvedValue([{ FieldName: "Voltage" }]);

      await expect(
        FieldRepository.create({ SectionID: 1, FieldName: "voltage", FieldKey: "voltage2", FieldType: "text" })
      ).rejects.toThrow(/already exists/);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

it("8. create allows the same FieldName in a different section (delete->recreate flow)", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });
    mockDb.getAllAsync
      .mockResolvedValueOnce([{ SectionID: 1 }])
      .mockResolvedValueOnce([]);

    const id = await FieldRepository.create({ SectionID: 2, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" });

    expect(id).toBe(42);
    const scan = mockDb.getAllAsync.mock.calls[1];
    expect(scan[1]).toEqual([2]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("9. create succeeds when a differently-cased name exists in another section", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });
    mockDb.getAllAsync.mockResolvedValue([]);

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "VOLTAGE", FieldKey: "voltage_2", FieldType: "text" });

    expect(id).toBe(42);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

    it("10. create with a unique name inserts normally", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

      const id = await FieldRepository.create({ SectionID: 1, FieldName: "Current", FieldKey: "current", FieldType: "number" });

      expect(id).toBe(42);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });

    it("11. key check runs before the name check", async () => {
      mockDb.getAllAsync.mockResolvedValue([{ SectionID: 1 }]);
      mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

      await expect(
        FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" })
      ).rejects.toThrow(/already exists/);

      const firstLookup = String(mockDb.getFirstAsync.mock.calls[0][0]);
      expect(firstLookup).toContain("LOWER(TRIM(FieldKey))");
      expect(firstLookup).toContain("SectionID IN");
      expect(firstLookup).not.toContain("SectionID = ?");

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
      const sectionsQuery = String(mockDb.getAllAsync.mock.calls[0][0]);
      expect(sectionsQuery).toContain("InspectionSections WHERE IsActive = 1");
    });
  });

  describe("update", () => {
    it("12. update rejects when renaming a field to an active duplicate Name in the section", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ SectionID: 1 });
      mockDb.getAllAsync.mockResolvedValue([{ FieldName: "Voltage" }]);

      await expect(
        FieldRepository.update(3, { FieldName: "voltage" })
      ).rejects.toThrow(/already exists/);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("13. update allows keeping the current FieldName (its own id is excluded)", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ SectionID: 1 });
      mockDb.getAllAsync.mockResolvedValue([]);

      await FieldRepository.update(3, { FieldName: "Voltage" });

      expect(String(mockDb.getAllAsync.mock.calls[0][0])).toContain("FieldID !=");
      expect(mockDb.getAllAsync.mock.calls[0][1]).toEqual([1, 3]);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });

    it("14. update allows renaming to a name used only in a different section", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ SectionID: 1 });
      mockDb.getAllAsync.mockResolvedValue([]);

      await FieldRepository.update(3, { FieldName: "Voltage" });

      const scan = mockDb.getAllAsync.mock.calls[0];
      expect(scan[1]).toEqual([1, 3]);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });
  });
});