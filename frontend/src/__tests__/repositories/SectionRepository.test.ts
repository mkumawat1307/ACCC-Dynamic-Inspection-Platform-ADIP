jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import SectionRepository, { SectionDeletionError } from "@/src/database/repositories/SectionRepository";

function createMockDb() {
  return {
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 1 }),
  };
}

describe("SectionRepository.softDeleteSection", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("soft-deletes a custom (IsDefault=0) section via UPDATE IsActive=0", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 7, SectionKey: "rf_details", IsDefault: 0 });

    await SectionRepository.softDeleteSection(7);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(String(sql)).toContain("UPDATE InspectionSections SET IsActive = 0");
    expect(params).toEqual([7]);
  });

  it("soft-deletes a non-locked default (IsDefault=1) section when it has a non-locked key", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 4, SectionKey: "earthing", IsDefault: 1 });

    await SectionRepository.softDeleteSection(4);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(String(sql)).toContain("UPDATE InspectionSections SET IsActive = 0");
    expect(params).toEqual([4]);
  });

  it("rejects a locked section (general_information) and never writes to the DB", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 1, SectionKey: "general_information", IsDefault: 1 });

    await expect(SectionRepository.softDeleteSection(1)).rejects.toThrow(SectionDeletionError);
    await expect(SectionRepository.softDeleteSection(1)).rejects.toMatchObject({ reason: "protected" });
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("rejects a locked section (remarks) and never writes to the DB", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 9, SectionKey: "remarks", IsDefault: 1 });

    await expect(SectionRepository.softDeleteSection(9)).rejects.toThrow(SectionDeletionError);
    await expect(SectionRepository.softDeleteSection(9)).rejects.toMatchObject({ reason: "protected" });
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("rejects a locked section (photos) and never writes to the DB", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 10, SectionKey: "photos", IsDefault: 1 });

    await expect(SectionRepository.softDeleteSection(10)).rejects.toThrow(SectionDeletionError);
    await expect(SectionRepository.softDeleteSection(10)).rejects.toMatchObject({ reason: "protected" });
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("rejects a missing section and never writes to the DB", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await expect(SectionRepository.softDeleteSection(999)).rejects.toThrow(SectionDeletionError);
    await expect(SectionRepository.softDeleteSection(999)).rejects.toMatchObject({ reason: "not_found" });
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});
