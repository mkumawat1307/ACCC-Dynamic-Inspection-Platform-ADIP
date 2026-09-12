jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";

function createMockDb() {
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 7, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

const baseField = {
  DeviceType: "Camera",
  FieldName: "CameraStatus",
  Label: "Camera Status",
  FieldType: "dropdown",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
};

describe("DeviceFieldDefinitionsRepository.add — device field names are normalized per device type", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("1. throws when an active sibling FieldName differs only by case within the same device type", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([{ FieldName: "camerastatus" }]);

    await expect(
      DeviceFieldDefinitionsRepository.add({ ...baseField, FieldName: "CameraStatus" }, 1)
    ).rejects.toThrow(/already exists/);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("2. allows a case-differing FieldName on a different device type", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([]);

    const id = await DeviceFieldDefinitionsRepository.add({ ...baseField, DeviceType: "NVR" }, 1);

    expect(id).toBe(7);
    const scan = mockDb.getAllAsync.mock.calls[0];
    expect(scan[1]).toEqual([1, "NVR"]);
    expect(
      mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"))
    ).toBe(true);
  });

  it("3. scan is scoped to the same template and device type and only sees active rows", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await DeviceFieldDefinitionsRepository.add({ ...baseField }, 3);

    const scan = mockDb.getAllAsync.mock.calls[0];
    expect(String(scan[0])).toContain("TemplateID = ?");
    expect(String(scan[0])).toContain("DeviceType = ?");
    expect(String(scan[0])).toContain("IsActive = 1");
    expect(scan[1]).toEqual([3, "Camera"]);
  });

  it("4. inserts normally when no active sibling shares the normalized name", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([{ FieldName: "Make" }]);

    const id = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);

    expect(id).toBe(7);
    expect(
      mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"))
    ).toBe(true);
  });

  it("5. reactivation path is unaffected: exact inactive match reactivates without a scan", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ FieldDefID: 4, IsActive: 0 });

    const id = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);

    expect(id).toBe(4);
    expect(
      mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("UPDATE DeviceFieldDefinitions"))
    ).toBe(true);
    expect(
      mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"))
    ).toBe(false);
  });

  it("6. exact-match path is unchanged: an active exact match throws (pre-normalization check)", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ FieldDefID: 4, IsActive: 1 });

    await expect(
      DeviceFieldDefinitionsRepository.add({ ...baseField }, 1)
    ).rejects.toThrow(/already exists/);
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("7. error message names both the field and the device type", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([{ FieldName: "camerastatus" }]);

    await expect(
      DeviceFieldDefinitionsRepository.add({ ...baseField }, 1)
    ).rejects.toThrow(/"CameraStatus"/);
    await expect(
      DeviceFieldDefinitionsRepository.add({ ...baseField }, 1)
    ).rejects.toThrow(/device type/);
  });

  it("8. implements the Unicode-normalized comparison (JS toLowerCase, not an exact match)", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([{ FieldName: "  CameraStatus  " }]);

    await expect(
      DeviceFieldDefinitionsRepository.add({ ...baseField, FieldName: "camerastatus" }, 1)
    ).rejects.toThrow(/already exists/);
  });
});