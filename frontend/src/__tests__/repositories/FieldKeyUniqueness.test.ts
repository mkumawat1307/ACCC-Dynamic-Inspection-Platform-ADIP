jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { FieldRepository } from "@/src/database/repositories/FieldRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

describe("FieldRepository — FieldKey uniqueness is scoped to the section", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("create rejects when the FieldKey already exists on an active field in the SAME section", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    await expect(
      FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" })
    ).rejects.toThrow(/already exists/);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("create succeeds when the FieldKey is unique within the section", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "Current", FieldKey: "current", FieldType: "number" });

    expect(id).toBe(42);
    const check = mockDb.getFirstAsync.mock.calls[0];
    expect(String(check[0])).toContain("FieldKey = ?");
    expect(String(check[0])).toContain("SectionID = ?");
    expect(check[1]).toEqual(["current", 1]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("create allows reusing a FieldKey from a DIFFERENT section (delete->recreate flow)", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

    const id = await FieldRepository.create({ SectionID: 2, FieldName: "Status", FieldKey: "status", FieldType: "dropdown" });

    expect(id).toBe(42);
    const check = mockDb.getFirstAsync.mock.calls[0];
    expect(String(check[0])).toContain("SectionID = ?");
    expect(check[1]).toEqual(["status", 2]);
  });

  it("create allows a FieldKey that only exists on a deactivated (IsActive=0) field in the same section", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Max: 0 });

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" });

    expect(id).toBe(42);
    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(String(keyCheck[0])).toContain("FieldKey = ?");
    expect(String(keyCheck[0])).toContain("IsActive = 1");
  });

  it("update rejects when reassigning to a FieldKey owned by another active field in the SAME section", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ SectionID: 3 })
      .mockResolvedValue({ Count: 1 });

    await expect(
      FieldRepository.update(1, { FieldKey: "voltage" })
    ).rejects.toThrow(/already exists/);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("update allows keeping the current FieldKey (excludes its own ID)", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ SectionID: 3 })
      .mockResolvedValue({ Count: 0 });

    await FieldRepository.update(1, { FieldKey: "voltage" });

    const sectionLookup = mockDb.getFirstAsync.mock.calls[0];
    expect(String(sectionLookup[0])).toContain("SELECT SectionID FROM InspectionFields WHERE FieldID = ?");
    const keyCheck = mockDb.getFirstAsync.mock.calls[1];
    expect(String(keyCheck[0])).toContain("FieldKey = ?");
    expect(String(keyCheck[0])).toContain("IsActive = 1");
    expect(String(keyCheck[0])).toContain("SectionID = ?");
    expect(String(keyCheck[0])).toContain("FieldID != ?");
    expect(keyCheck[1]).toEqual(["voltage", 3, 1]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("update with only a FieldName runs a name check but not a key check", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 3 });

    await FieldRepository.update(1, { FieldName: "Renamed" });

    expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
    expect(String(mockDb.getFirstAsync.mock.calls[0][0])).toContain("SELECT SectionID FROM InspectionFields WHERE FieldID = ?");
    expect(mockDb.getFirstAsync.mock.calls.every((c) => !String(c[0]).includes("FieldKey = ?"))).toBe(true);

    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    const scan = mockDb.getAllAsync.mock.calls[0];
    expect(String(scan[0])).toContain("SectionID = ?");
    expect(String(scan[0])).toContain("IsActive = 1");
    expect(scan[1]).toEqual([3, 1]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("keyExists returns true for an active duplicate FieldKey in the section", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    const exists = await FieldRepository.keyExists("voltage", 1);

    expect(exists).toBe(true);
  });

  it("keyExists ignores IsActive=0 rows (recreating a deleted field key is allowed)", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });

    const exists = await FieldRepository.keyExists("voltage", 1);

    expect(exists).toBe(false);
    const query = mockDb.getFirstAsync.mock.calls[0][0];
    expect(String(query)).toContain("IsActive = 1");
  });
});