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
  DeviceType: "NVR",
  FieldName: "NVRStatus",
  Label: "NVR Status",
  FieldType: "dropdown",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
};

describe("DeviceFieldDefinitionsRepository.add — device type / field recreate", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("inserts a new row when no row exists for (TemplateID, DeviceType, FieldName)", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    const id = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);

    expect(id).toBe(7);
    const insert = mockDb.runAsync.mock.calls.find((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"));
    expect(insert).toBeDefined();
    expect(mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("UPDATE DeviceFieldDefinitions"))).toBe(false);
  });

  it("reactivates a deactivated row instead of failing (delete -> recreate cycle)", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ FieldDefID: 4, IsActive: 0 });

    const id = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);

    expect(id).toBe(4);
    const update = mockDb.runAsync.mock.calls.find((c: [string]) => String(c[0]).includes("UPDATE DeviceFieldDefinitions"));
    expect(update).toBeDefined();
    expect(String(update![0])).toContain("IsActive = 1");
    expect(String(update![0])).toContain("WHERE FieldDefID = ?");
    expect((update![1] as unknown[])[6]).toBe(4);
    expect(mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"))).toBe(false);
  });

  it("throws a descriptive error when an active row already exists", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ FieldDefID: 4, IsActive: 1 });

    await expect(DeviceFieldDefinitionsRepository.add({ ...baseField }, 1)).rejects.toThrow(/already exists/);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("looks up existing rows scoped to the same template (per-TemplateID uniqueness)", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await DeviceFieldDefinitionsRepository.add({ ...baseField }, 2);

    const lookup = mockDb.getFirstAsync.mock.calls[0];
    expect(String(lookup[0])).toContain("TemplateID = ?");
    expect(String(lookup[0])).toContain("DeviceType = ?");
    expect(String(lookup[0])).toContain("FieldName = ?");
    expect(lookup[1]).toEqual([2, "NVR", "NVRStatus"]);
  });

  it("allows the same FieldName on a different device type", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    const id = await DeviceFieldDefinitionsRepository.add({ ...baseField, DeviceType: "Camera" }, 1);

    expect(id).toBe(7);
    expect(mockDb.runAsync.mock.calls.some((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"))).toBe(true);
  });

  it("survives repeated delete/recreate cycles without accumulating rows", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ FieldDefID: 7, IsActive: 0 });

    const first = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);
    const second = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);
    const third = await DeviceFieldDefinitionsRepository.add({ ...baseField }, 1);

    expect(first).toBe(7);
    expect(second).toBe(7);
    expect(third).toBe(7);
    const inserts = mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("INSERT INTO DeviceFieldDefinitions"));
    expect(inserts).toHaveLength(1);
    expect(mockDb.runAsync.mock.calls.filter((c: [string]) => String(c[0]).includes("UPDATE DeviceFieldDefinitions"))).toHaveLength(2);
  });

  it("uses the templateId argument when provided as the lookup scope", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await DeviceFieldDefinitionsRepository.add({ ...baseField, TemplateID: 9 }, 3);

    expect(mockDb.getFirstAsync.mock.calls[0][1]).toEqual([3, "NVR", "NVRStatus"]);
  });
});