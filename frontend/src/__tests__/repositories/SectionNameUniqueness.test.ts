jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import SectionRepository from "@/src/database/repositories/SectionRepository";

function createMockDb() {
  const runAsyncFn = jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 1 });
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: runAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

describe("SectionRepository.nameExists", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("1. returns true when another active section has the same name (case-insensitive)", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionName: "Pole Structure" }]);

    const exists = await SectionRepository.nameExists("pole structure");

    expect(exists).toBe(true);
  });

  it("2. returns true when only the casing differs", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionName: "junction_box_details" }]);

    const exists = await SectionRepository.nameExists("JUNCTION_BOX_DETAILS");

    expect(exists).toBe(true);
  });

  it("3. ignores surrounding whitespace on both sides", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionName: "  Pole Structure  " }]);

    const exists = await SectionRepository.nameExists("Pole Structure");

    expect(exists).toBe(true);
  });

  it("4. returns false when no active section matches", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionName: "Pole Structure" }]);

    const exists = await SectionRepository.nameExists("Earthing");

    expect(exists).toBe(false);
  });

  it("5. returns false when nothing is returned (the query filters inactive rows)", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const exists = await SectionRepository.nameExists("Deleted Section");

    expect(exists).toBe(false);
  });

  it("6. excludes a given section id so an editing section can keep its own name", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionName: "Pole Structure" }]);

    const exists = await SectionRepository.nameExists("pole structure", 9);

    expect(exists).toBe(true);
    const query = mockDb.getAllAsync.mock.calls[0][0];
    const params = mockDb.getAllAsync.mock.calls[0][1];
    expect(String(query)).toContain("SectionID != ?");
    expect(params).toEqual([9]);
  });

  it("7. query only considers active sections", async () => {
    await SectionRepository.nameExists("Pole Structure");

    const query = String(mockDb.getAllAsync.mock.calls[0][0]);
    expect(query).toContain("FROM InspectionSections");
    expect(query).toContain("IsActive = 1");
  });

  it("8. no parameter is bound when no section id is excluded", async () => {
    await SectionRepository.nameExists("Pole Structure");

    expect(mockDb.getAllAsync.mock.calls[0][1]).toEqual([]);
  });
});