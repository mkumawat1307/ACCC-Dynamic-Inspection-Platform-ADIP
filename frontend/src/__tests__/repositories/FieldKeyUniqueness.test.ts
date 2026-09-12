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

function activeSections(sectionIds: number[]) {
  return sectionIds.map((SectionID) => ({ SectionID }));
}

describe("FieldRepository — FieldKey uniqueness is global across ACTIVE sections, active-only, and normalized (trim + lowercase)", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("create rejects when the FieldKey already exists on an active field in the SAME section", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    await expect(
      FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" })
    ).rejects.toThrow(/A field with the identifier "voltage" already exists\./);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("create rejects when the FieldKey exists on an active field in a DIFFERENT active section (global, not section-scoped)", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1, 2, 9]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    await expect(
      FieldRepository.create({ SectionID: 2, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" })
    ).rejects.toThrow(/already exists/);

    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(String(keyCheck[0])).toContain("SectionID IN");
    expect(keyCheck[1]).toEqual([1, 2, 9, "voltage"]);
  });

  it("create rejects a case/whitespace variant of an existing key (normalized comparison)", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    await expect(
      FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "  VOLTAGE ", FieldType: "text" })
    ).rejects.toThrow(/already exists/);

    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(String(keyCheck[0])).toContain("LOWER(TRIM(FieldKey))");
    expect(keyCheck[1]).toEqual([1, "voltage"]);
  });

  it("create succeeds when the FieldKey is globally unique", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(activeSections([1]))
      .mockResolvedValue([]);
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ Count: 0 })
      .mockResolvedValue({ Max: 0 });

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "Current", FieldKey: "current", FieldType: "number" });

    expect(id).toBe(42);
    const sectionsQuery = mockDb.getAllAsync.mock.calls[0];
    expect(String(sectionsQuery[0])).toContain("InspectionSections WHERE IsActive = 1");

    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(String(keyCheck[0])).toContain("FieldKey");
    expect(String(keyCheck[0])).toContain("LOWER(TRIM(FieldKey))");
    expect(String(keyCheck[0])).toContain("SectionID IN");
    expect(String(keyCheck[0])).not.toContain("SectionID = ?");
    expect(keyCheck[1]).toEqual([1, "current"]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("create preserves the FieldKey text exactly as typed (normalization applies only to the comparison)", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(activeSections([1]))
      .mockResolvedValue([]);
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ Count: 0 })
      .mockResolvedValue({ Max: 0 });

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "  VOLTAGE ", FieldType: "text" });

    expect(id).toBe(42);
    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(keyCheck[1]).toEqual([1, "voltage"]);

    const insertParams = mockDb.runAsync.mock.calls[0][1] as unknown[];
    expect(insertParams[2]).toBe("  VOLTAGE ");
  });

  it("create allows a FieldKey that only exists on a deactivated (IsActive=0) field", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(activeSections([1]))
      .mockResolvedValue([]);
    mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text" });

    expect(id).toBe(42);
    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(String(keyCheck[0])).toContain("IsActive = 1");
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("create allows a FieldKey used only by a field in a soft-deleted (inactive) section — delete->recreate flow", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(activeSections([1]))
      .mockResolvedValue([]);
    mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });

    const id = await FieldRepository.create({ SectionID: 1, FieldName: "Status", FieldKey: "status", FieldType: "text" });

    expect(id).toBe(42);
    const keyCheck = mockDb.getFirstAsync.mock.calls[0];
    expect(String(keyCheck[0])).toContain("SectionID IN (?)");
    expect(keyCheck[1]).toEqual([1, "status"]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("update rejects when reassigning to a FieldKey owned by another active field anywhere (different active section)", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([3, 9]));
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ SectionID: 3 })
      .mockResolvedValue({ Count: 1 });

    await expect(
      FieldRepository.update(5, { FieldKey: "voltage" })
    ).rejects.toThrow(/A field with the identifier "voltage" already exists\./);

    const keyCheck = mockDb.getFirstAsync.mock.calls[1];
    expect(String(keyCheck[0])).toContain("SectionID IN");
    expect(String(keyCheck[0])).toContain("FieldID != ?");
    expect(keyCheck[1]).toEqual([3, 9, "voltage", 5]);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("update allows keeping the current FieldKey (excludes its own ID)", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(activeSections([3]))
      .mockResolvedValue([]);
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ SectionID: 3 })
      .mockResolvedValue({ Count: 0 });

    await FieldRepository.update(1, { FieldKey: "voltage" });

    const sectionLookup = mockDb.getFirstAsync.mock.calls[0];
    expect(String(sectionLookup[0])).toContain("SELECT SectionID FROM InspectionFields WHERE FieldID = ?");
    const keyCheck = mockDb.getFirstAsync.mock.calls[1];
    expect(String(keyCheck[0])).toContain("LOWER(TRIM(FieldKey))");
    expect(String(keyCheck[0])).toContain("SectionID IN");
    expect(String(keyCheck[0])).not.toContain("SectionID = ?");
    expect(String(keyCheck[0])).toContain("FieldID != ?");
    expect(keyCheck[1]).toEqual([3, "voltage", 1]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("update with only a FieldName runs a name check but not a key check", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 3 });

    await FieldRepository.update(1, { FieldName: "Renamed" });

    expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
    expect(String(mockDb.getFirstAsync.mock.calls[0][0])).toContain("SELECT SectionID FROM InspectionFields WHERE FieldID = ?");

    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    const scan = mockDb.getAllAsync.mock.calls[0];
    expect(String(scan[0])).toContain("SectionID = ?");
    expect(String(scan[0])).toContain("IsActive = 1");
    expect(scan[1]).toEqual([3, 1]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it("keyExists returns true when the normalized FieldKey matches an active field anywhere (active sections only)", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1, 2]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    const exists = await FieldRepository.keyExists("voltage");

    expect(exists).toBe(true);
    const sectionsQuery = mockDb.getAllAsync.mock.calls[0];
    expect(String(sectionsQuery[0])).toContain("InspectionSections WHERE IsActive = 1");
    const query = String(mockDb.getFirstAsync.mock.calls[0][0]);
    expect(query).toContain("IsActive = 1");
    expect(query).toContain("LOWER(TRIM(FieldKey))");
    expect(query).toContain("SectionID IN");
  });

  it("keyExists compares normalized (trim + lowercase) values", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 1 });

    const exists = await FieldRepository.keyExists("  VOLTAGE ");

    expect(exists).toBe(true);
    expect(mockDb.getFirstAsync.mock.calls[0][1]).toEqual([1, "voltage"]);
  });

  it("keyExists ignores IsActive=0 rows (recreating a deleted field key is allowed)", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });

    const exists = await FieldRepository.keyExists("voltage");

    expect(exists).toBe(false);
    const query = String(mockDb.getFirstAsync.mock.calls[0][0]);
    expect(query).toContain("IsActive = 1");
  });

  it("keyExists ignores fields in soft-deleted (inactive) sections while detecting across all active ones", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1, 4]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });

    const exists = await FieldRepository.keyExists("voltage");

    expect(exists).toBe(false);
    const query = String(mockDb.getFirstAsync.mock.calls[0][0]);
    expect(query).toContain("SectionID IN (?, ?)");
    expect(mockDb.getFirstAsync.mock.calls[0][1]).toEqual([1, 4, "voltage"]);
  });

  it("keyExists returns false when no sections are active at all", async () => {
    const exists = await FieldRepository.keyExists("voltage");

    expect(exists).toBe(false);
    expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
  });

  it("keyExists excludes a given FieldID from the check (edit keeps its own key)", async () => {
    mockDb.getAllAsync.mockResolvedValue(activeSections([1]));
    mockDb.getFirstAsync.mockResolvedValue({ Count: 0 });

    const exists = await FieldRepository.keyExists("voltage", 7);

    expect(exists).toBe(false);
    const query = String(mockDb.getFirstAsync.mock.calls[0][0]);
    expect(query).toContain("FieldID != ?");
    expect(mockDb.getFirstAsync.mock.calls[0][1]).toEqual([1, "voltage", 7]);
  });
});