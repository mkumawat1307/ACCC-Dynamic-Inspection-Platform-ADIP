jest.mock("@/src/database/db");

import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";

const updateCalls: { sql: string; params: unknown[] }[] = [];

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn().mockResolvedValue({
    runAsync: jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      updateCalls.push({ sql, params });
      return { lastInsertRowId: 0, changes: 1 };
    }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  }),
}));

describe("InspectionRepository.updateInspectorNameForProject", () => {
  beforeEach(() => {
    updateCalls.length = 0;
  });

  it("runs a single UPDATE targeting the inspector_name field across the project DB", async () => {
    await InspectionRepository.updateInspectorNameForProject("New Inspector");

    expect(updateCalls).toHaveLength(1);
    const { sql, params } = updateCalls[0];
    expect(params).toEqual(["New Inspector"]);
    expect(sql).toContain("UPDATE InspectionValues");
    expect(sql).toContain("FieldKey = 'inspector_name'");
    expect(sql).toContain("FieldValue = ?");
  });
});