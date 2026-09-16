jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import SectionRepository, { SectionDeletionError } from "@/src/database/repositories/SectionRepository";

function createMockDb() {
  return {
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
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

describe("SectionRepository.keyExists", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("returns true when another active section in the same template uses the exact key", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionKey: "pole_structure" }]);

    await expect(SectionRepository.keyExists("pole_structure", 1)).resolves.toBe(true);
  });

  it("returns true for a case-insensitive match after trimming whitespace", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionKey: "  Pole_Structure  " }]);

    await expect(SectionRepository.keyExists("POLE_STRUCTURE", 1)).resolves.toBe(true);
  });

  it("returns false when the row returned for this template uses a different key", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionKey: "other_section" }]);

    await expect(SectionRepository.keyExists("pole_structure", 2)).resolves.toBe(false);
  });

  it("returns false when only inactive sections use the key", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    await expect(SectionRepository.keyExists("pole_structure", 1)).resolves.toBe(false);
  });

  it("excludes the edited section's own key (self-edit is allowed)", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    await expect(SectionRepository.keyExists("pole_structure", 1, 7)).resolves.toBe(false);
  });

  it("scopes the query to the template and excludes the edited section", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    await SectionRepository.keyExists("pole_structure", 3, 7);

    const [sql, params] = mockDb.getAllAsync.mock.calls[0];
    expect(String(sql)).toContain("WHERE TemplateID = ? AND IsActive = 1 AND SectionID != ?");
    expect(params).toEqual([3, 7]);
  });

  it("compares keys in JS (trim + lowercase) regardless of what the DB returns", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ SectionKey: "pole_structure" }]);

    await expect(SectionRepository.keyExists("  Pole_Structure  ", 1)).resolves.toBe(true);
  });
});

describe("SectionRepository.getMinimumPhotos", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("returns the configured minimum from the default template photos section", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ MinimumPhotos: 3 });

    await expect(SectionRepository.getMinimumPhotos()).resolves.toBe(3);
  });

  it("scopes the query to the photos section of the default template", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ MinimumPhotos: 1 });

    await SectionRepository.getMinimumPhotos();

    const [sql] = mockDb.getFirstAsync.mock.calls[0];
    expect(String(sql)).toContain("INNER JOIN InspectionTemplates t");
    expect(String(sql)).toContain("s.SectionKey = 'photos'");
    expect(String(sql)).toContain("s.IsActive = 1");
    expect(String(sql)).toContain("t.IsDefault = 1");
  });

  it("uses a fixed-key query without runtime parameters", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ MinimumPhotos: 1 });

    await SectionRepository.getMinimumPhotos();

    const call = mockDb.getFirstAsync.mock.calls[0];
    expect(String(call[0])).toContain("s.SectionKey = 'photos'");
    expect(call[1]).toBeUndefined();
  });

  it("falls back to 1 when the photos section row has a null minimum", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ MinimumPhotos: null });

    await expect(SectionRepository.getMinimumPhotos()).resolves.toBe(1);
  });

  it("falls back to 1 when no photos section exists", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await expect(SectionRepository.getMinimumPhotos()).resolves.toBe(1);
  });
});

describe("SectionRepository.setMinimumPhotos", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("updates MinimumPhotos on the found photos section and nothing else", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 10 });

    await SectionRepository.setMinimumPhotos(5);

    expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(String(sql)).toContain("UPDATE InspectionSections SET MinimumPhotos = ?");
    expect(String(sql)).toContain("WHERE SectionID = ?");
    expect(params).toEqual([5, 10]);
  });

  it("does not write when no photos section exists in the default template", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await SectionRepository.setMinimumPhotos(3);

    expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("persists 0 to represent optional photos", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ SectionID: 10 });

    await SectionRepository.setMinimumPhotos(0);

    const [, params] = mockDb.runAsync.mock.calls[0];
    expect(params).toEqual([0, 10]);
  });
});
