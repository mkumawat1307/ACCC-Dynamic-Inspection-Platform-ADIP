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

describe("DeviceFieldDefinitionsRepository.typeNameExists — device type names are normalized", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("1. returns true when an active device type differs only by case", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ DeviceType: "Camera" }]);

    const exists = await DeviceFieldDefinitionsRepository.typeNameExists("camera");

    expect(exists).toBe(true);
  });

  it("2. returns true ignoring surrounding whitespace", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ DeviceType: "  Junction Box  " }]);

    const exists = await DeviceFieldDefinitionsRepository.typeNameExists("Junction Box");

    expect(exists).toBe(true);
  });

  it("3. returns false when no active device type matches", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ DeviceType: "Camera" }]);

    const exists = await DeviceFieldDefinitionsRepository.typeNameExists("NVR");

    expect(exists).toBe(false);
  });

  it("4. returns false when every field of the type is inactive (delete -> recreate cycle)", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const exists = await DeviceFieldDefinitionsRepository.typeNameExists("Camera");

    expect(exists).toBe(false);
  });

  it("5. the underlying read query only considers active rows", async () => {
    await DeviceFieldDefinitionsRepository.typeNameExists("Camera");

    const query = String(mockDb.getAllAsync.mock.calls[0][0]);
    expect(query).toContain("IsActive = 1");
  });

  it("6. scopes the underlying query to the given template", async () => {
    await DeviceFieldDefinitionsRepository.typeNameExists("Camera", 4);

    const query = String(mockDb.getAllAsync.mock.calls[0][0]);
    const params = mockDb.getAllAsync.mock.calls[0][1];
    expect(query).toContain("TemplateID = ?");
    expect(params).toEqual([4]);
  });

  it("7. distinguishes types by template scope", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ DeviceType: "Camera" }]);

    const inTemplate1 = await DeviceFieldDefinitionsRepository.typeNameExists("Camera", 1);
    const inTemplate2 = await DeviceFieldDefinitionsRepository.typeNameExists("Camera", 2);

    expect(inTemplate1).toBe(true);
    expect(inTemplate2).toBe(true);
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(2);
  });

  it("8. is a pure read: never writes to the database", async () => {
    await DeviceFieldDefinitionsRepository.typeNameExists("Camera", 1);

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});