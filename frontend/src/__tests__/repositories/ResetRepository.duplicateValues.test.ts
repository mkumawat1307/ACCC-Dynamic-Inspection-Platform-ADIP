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

function installDuplicateFieldsMock(mockDb: ReturnType<typeof createMockDb>, dupRows?: number) {
  mockDb.getAllAsync.mockImplementation(async (sql: string, params?: unknown[]): Promise<any[]> => {
    if (sql.includes("WHERE SectionKey IN")) return [{ SectionID: 1 }];
    if (sql.includes("SELECT SectionKey, SectionID FROM InspectionSections")) {
      return [
        { SectionKey: "general_information", SectionID: 1 },
        { SectionKey: "pole_structure", SectionID: 2 },
      ];
    }
    if (sql.includes("InspectionSections") && sql.includes("AND IsDefault = 1 LIMIT 1")) return [{ SectionID: 7 }];
    if (sql.includes("InspectionSections") && sql.includes("ORDER BY")) return [];
    if (sql.includes("InspectionFields") && sql.includes("ORDER BY")) {
      if ((params as unknown[])[0] === "foundation_cond") {
        const rows = [
          { FieldID: 5, SectionID: 2, IsActive: 1 },
          { FieldID: 9, SectionID: 2, IsActive: 1 },
        ];
        if (dupRows && dupRows > 2) rows.push({ FieldID: 14, SectionID: 2, IsActive: 1 });
        return rows;
      }
      return [];
    }
    if (sql.includes("InspectionFields") && sql.includes("LIMIT 1")) return [{ FieldID: 33, IsActive: 1 }];
    return [];
  });
}

describe("ResetRepository.performReset — duplicate-field value reconciliation", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("discards colliding duplicate values (canonical wins) before remapping", async () => {
    installDuplicateFieldsMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await expect(ResetRepository.performReset()).resolves.toBeUndefined();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] as unknown[] }));

    const scopedDelete = calls.find(
      (c) => c.sql.includes("DELETE FROM InspectionValues") && c.params[0] === 9 && c.params[1] === 5
    );
    expect(scopedDelete).toBeDefined();
    expect(scopedDelete!.sql).toContain("IN (SELECT InspectionID FROM InspectionValues WHERE FieldID = ?)");

    const deleteIdx = calls.findIndex(
      (c) => c.sql === scopedDelete!.sql && c.params[0] === 9 && c.params[1] === 5
    );
    const remapIdx = calls.findIndex((c) => c.sql.includes("UPDATE InspectionValues") && c.params[0] === 5 && c.params[1] === 9);
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(remapIdx).toBeGreaterThan(deleteIdx);
  });

  it("migrates duplicate-only values to the canonical field and removes the duplicate field", async () => {
    installDuplicateFieldsMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s) => s.includes("UPDATE InspectionValues SET FieldID = ?") && s.includes("WHERE FieldID = ?"))).toBe(true);
    expect(calls.some((s) => s.includes("DELETE FROM FieldOptions WHERE FieldID = ?"))).toBe(true);
    expect(calls.some((s) => s.includes("DELETE FROM InspectionFields WHERE FieldID = ?"))).toBe(true);
  });

  it("uses the canonical (lowest active FieldID) as the merge target", async () => {
    installDuplicateFieldsMock(mockDb);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] as unknown[] }));
    const remap = calls.find((c) => c.sql.includes("UPDATE InspectionValues"));
    expect(remap!.params).toEqual([5, 9]);
  });

  it("issues NO InspectionValues delete when there are no duplicate fields", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { SectionKey: "general_information", SectionID: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string]) => String(c[0]));
    expect(calls.some((s) => s.includes("DELETE FROM InspectionValues"))).toBe(false);
  });

  it("every InspectionValues delete during reconciliation is scoped (never a blanket delete)", async () => {
    installDuplicateFieldsMock(mockDb, 3);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const deletes = mockDb.runAsync.mock.calls
      .map((c: [string]) => String(c[0]))
      .filter((s) => s.includes("DELETE FROM InspectionValues"));
    expect(deletes.length).toBeGreaterThan(0);
    for (const sql of deletes) {
      expect(sql).toContain("IN (SELECT InspectionID FROM InspectionValues WHERE FieldID = ?)");
    }
  });

  it("a constraint failure during duplicate reconciliation propagates (transaction rolls back)", async () => {
    installDuplicateFieldsMock(mockDb);
    mockDb.runAsync.mockImplementation(async (sql: string) => {
      if (String(sql).includes("DELETE FROM InspectionValues")) throw new Error("UNIQUE constraint failed");
      return { lastInsertRowId: 0, changes: 1 };
    });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await expect(ResetRepository.performReset()).rejects.toThrow("UNIQUE constraint failed");
  });

  it("consolidates multiple duplicate rows for one FieldKey (each remap preceded by its scoped delete)", async () => {
    installDuplicateFieldsMock(mockDb, 3);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const calls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: c[1] as unknown[] }));
    const remaps = calls.filter((c) => c.sql.includes("UPDATE InspectionValues"));
    expect(remaps).toHaveLength(2);
    expect(remaps.map((r) => r.params)).toContainEqual([5, 9]);
    expect(remaps.map((r) => r.params)).toContainEqual([5, 14]);

    const deletes = calls.filter((c) => c.sql.includes("DELETE FROM InspectionValues"));
    for (const dupId of [9, 14]) {
      const delIdx = calls.findIndex((c) => c.sql.includes("DELETE FROM InspectionValues") && c.params[0] === dupId && c.params[1] === 5);
      const remapIdx = calls.findIndex((c) => c.sql.includes("UPDATE InspectionValues") && c.params[0] === 5 && c.params[1] === dupId);
      expect(delIdx).toBeGreaterThanOrEqual(0);
      expect(remapIdx).toBeGreaterThan(delIdx);
      expect(deletes.some((d) => d.params[0] === dupId && d.params[1] === 5)).toBe(true);
    }
  });
});