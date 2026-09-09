jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

describe("InspectionFieldRepository", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  describe("getFieldOptions", () => {
    const option = (over: Partial<{
      OptionID: number; FieldID: number; OptionLabel: string; OptionValue: string;
      DisplayOrder: number; IsDefault: number; IsActive?: number;
    }>) => ({
      OptionID: 1,
      FieldID: 1,
      OptionLabel: "Label",
      OptionValue: "V",
      DisplayOrder: 1,
      IsDefault: 0,
      IsActive: 1,
      ...over,
    });

    let rows: Record<string, unknown>[];

    beforeEach(() => {
      rows = [];
      mockDb.getAllAsync.mockImplementation((sql: string) => {
        let result = sql.includes("IsActive = 1")
          ? rows.filter((r) => (r.IsActive as number) !== 0)
          : rows;
        if (sql.includes("ORDER BY DisplayOrder")) {
          result = [...result].sort(
            (a, b) => (a.DisplayOrder as number) - (b.DisplayOrder as number)
          );
        }
        return Promise.resolve(result);
      });
    });

    it("returns active options preserving ordering, labels, values, and IsDefault", async () => {
      rows = [
        option({ OptionID: 1, OptionLabel: "No", OptionValue: "N", DisplayOrder: 2, IsDefault: 0 }),
        option({ OptionID: 2, OptionLabel: "Yes", OptionValue: "Y", DisplayOrder: 1, IsDefault: 1 }),
      ];

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const options = await InspectionFieldRepository.getFieldOptions(1);

      expect(options.map((o: { OptionValue: string }) => o.OptionValue)).toEqual(["Y", "N"]);
      expect(options.map((o: { OptionLabel: string }) => o.OptionLabel)).toEqual(["Yes", "No"]);
      expect(options.map((o: { IsDefault: number }) => o.IsDefault)).toEqual([1, 0]);
    });

    it("excludes inactive options", async () => {
      rows = [option({ OptionID: 1, OptionValue: "Old", IsActive: 0 })];

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const options = await InspectionFieldRepository.getFieldOptions(1);

      expect(options).toEqual([]);
    });

    it("returns only active options from a mixed set", async () => {
      rows = [
        option({ OptionID: 1, OptionValue: "Old", DisplayOrder: 1, IsActive: 0 }),
        option({ OptionID: 2, OptionValue: "New", DisplayOrder: 2, IsActive: 1 }),
        option({ OptionID: 3, OptionValue: "Mid", DisplayOrder: 3, IsActive: 1 }),
      ];

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const options = await InspectionFieldRepository.getFieldOptions(1);

      expect(options.map((o: { OptionValue: string }) => o.OptionValue)).toEqual(["New", "Mid"]);
    });

    it("returns empty array when field has no options", async () => {
      rows = [];

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const options = await InspectionFieldRepository.getFieldOptions(999);

      expect(options).toEqual([]);
    });

    it("queries the field's options filtered by IsActive = 1 with the existing columns and ordering", async () => {
      rows = [option({})];

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.getFieldOptions(7);

      const [sql, params] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(sql).toContain("FROM FieldOptions");
      expect(sql).toContain("WHERE FieldID = ?");
      expect(sql).toContain("AND IsActive = 1");
      expect(sql).toContain("ORDER BY DisplayOrder");
      expect(sql).toContain("OptionLabel");
      expect(sql).toContain("OptionValue");
      expect(sql).toContain("IsDefault");
      expect(params).toEqual([7]);
    });
  });

  describe("getActiveTemplateFields", () => {
    it("loads active fields of the default template", async () => {
      mockDb.getAllAsync.mockResolvedValue([
        { FieldKey: "foundation_cond", FieldName: "Foundation Condition" },
        { FieldKey: "pole_status", FieldName: "Pole Status" },
      ]);
      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      const rows = await InspectionFieldRepository.getActiveTemplateFields();
      expect(rows).toHaveLength(2);
      const [sql] = (mockDb.getAllAsync as jest.Mock).mock.calls[0];
      expect(sql).toContain("t.IsDefault = 1");
      expect(sql).toContain("s.IsActive = 1");
      expect(sql).toContain("f.IsActive = 1");
    });
  });

  describe("applyDefaultSelections", () => {
    const field = (over: Partial<{
      FieldID: number; SectionID: number; FieldName: string; FieldKey: string;
      FieldType: string; DefaultValue: string | null; IsRequired: number;
      IsVisible: number; IsActive: number; DisplayOrder: number;
    }> = {}) => ({
      FieldID: 1, SectionID: 1, FieldName: "F", FieldKey: "f",
      FieldType: "text", DefaultValue: null, IsRequired: 0, IsVisible: 1,
      IsActive: 1, DisplayOrder: 1, ...over,
    });

    const option = (over: {
      OptionID: number; FieldID: number; OptionLabel: string;
      OptionValue: string; IsDefault: number; DisplayOrder: number;
    }) => over;

    function routeDb(fields: unknown[], savedValues: unknown[], options: unknown[]) {
      (mockDb.getAllAsync as jest.Mock).mockImplementation((sql: string) => {
        if (sql.includes("FROM FieldOptions")) return Promise.resolve(options);
        if (sql.includes("FROM InspectionValues")) return Promise.resolve(savedValues);
        return Promise.resolve(fields);
      });
      (mockDb.getFirstAsync as jest.Mock).mockImplementation((sql: string) => {
        if (sql.includes("hasInspection")) {
          return Promise.resolve({ hasInspection: 1, hasField: 1 });
        }
        if (sql.includes("SELECT ValueID")) return Promise.resolve(null);
        return Promise.resolve(null);
      });
    }

    it("1. 3 of 4 dropdowns with Default Selection: only enabled ones get defaults, disabled stays empty", async () => {
      const fields = [
        field({ FieldID: 1, FieldKey: "dd1", FieldType: "dropdown" }),
        field({ FieldID: 2, FieldKey: "dd2", FieldType: "dropdown" }),
        field({ FieldID: 3, FieldKey: "dd3", FieldType: "dropdown" }),
        field({ FieldID: 4, FieldKey: "dd4", FieldType: "dropdown" }),
      ];
      const options = [
        option({ OptionID: 1, FieldID: 1, OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 }),
        option({ OptionID: 2, FieldID: 2, OptionLabel: "B", OptionValue: "B", IsDefault: 1, DisplayOrder: 1 }),
        option({ OptionID: 3, FieldID: 3, OptionLabel: "C", OptionValue: "C", IsDefault: 1, DisplayOrder: 1 }),
        // Field 4: Default Selection disabled — no option carries IsDefault
        option({ OptionID: 4, FieldID: 4, OptionLabel: "D", OptionValue: "D", IsDefault: 0, DisplayOrder: 1 }),
      ];
      routeDb(fields, [], options);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9);

      const saved = (mockDb.runAsync as jest.Mock).mock.calls
        .map((c: unknown[]) => c)
        .filter((c: any[]) => String(c[0]).includes("INSERT INTO InspectionValues"));
      const savedFields = saved.map((c: any[]) => c[1]?.[1]);
      expect(savedFields).toContain(1);
      expect(savedFields).toContain(2);
      expect(savedFields).toContain(3);
      expect(savedFields).not.toContain(4);
    });

    it("2. disabled field (no IsDefault option, no DefaultValue) stays empty — no persist", async () => {
      const fields = [field({ FieldID: 4, FieldKey: "dd4", FieldType: "dropdown" })];
      const options = [
        option({ OptionID: 4, FieldID: 4, OptionLabel: "D", OptionValue: "D", IsDefault: 0, DisplayOrder: 1 }),
      ];
      routeDb(fields, [], options);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9);

      const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls
        .filter((c: any[]) => String(c[0]).includes("INSERT INTO InspectionValues"));
      expect(insertCalls).toHaveLength(0);
    });

    it("3. existing saved value is never overwritten by a configured default", async () => {
      const fields = [field({ FieldID: 1, FieldKey: "dd1", FieldType: "dropdown" })];
      const options = [
        option({ OptionID: 1, FieldID: 1, OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 }),
      ];
      routeDb(fields, [
        { ValueID: 1, InspectionID: 9, FieldID: 1, FieldValue: "X" },
      ], options);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9);

      const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls
        .filter((c: any[]) => String(c[0]).includes("INSERT INTO InspectionValues"));
      expect(insertCalls).toHaveLength(0);
    });

    it("4. text field with DefaultValue is persisted", async () => {
      const fields = [field({ FieldID: 5, FieldKey: "notes", FieldType: "text", DefaultValue: "No issues" })];
      routeDb(fields, [], []);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9);

      const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls
        .filter((c: any[]) => String(c[0]).includes("INSERT INTO InspectionValues"));
      expect(insertCalls).toHaveLength(1);
      const args = insertCalls[0][1];
      expect(args[0]).toBe(9);
      expect(args[1]).toBe(5);
      expect(args[2]).toBe("No issues");
    });

    it("5. no fields -> no persistence", async () => {
      routeDb([], [], []);
      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it("6. dropdown type PROJECT_DROPDOWN resolves its IsDefault option", async () => {
      const fields = [field({ FieldID: 6, FieldKey: "pd", FieldType: "PROJECT_DROPDOWN" })];
      const options = [
        option({ OptionID: 9, FieldID: 6, OptionLabel: "N", OptionValue: "North", IsDefault: 1, DisplayOrder: 1 }),
      ];
      routeDb(fields, [], options);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9);

      const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls
        .filter((c: any[]) => String(c[0]).includes("INSERT INTO InspectionValues"));
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0][1][2]).toBe("North");
    });

    it("7. EXISTING inspection: defaults are never applied or persisted", async () => {
      const fields = [
        field({ FieldID: 1, FieldKey: "dd1", FieldType: "dropdown" }),
        field({ FieldID: 2, FieldKey: "dd2", FieldType: "text", DefaultValue: "No issues" }),
      ];
      const options = [
        option({ OptionID: 1, FieldID: 1, OptionLabel: "A", OptionValue: "A", IsDefault: 1, DisplayOrder: 1 }),
      ];
      routeDb(fields, [], options);

      const { default: InspectionFieldRepository } = require(
        "@/src/database/repositories/InspectionFieldRepository"
      );
      await InspectionFieldRepository.applyDefaultSelections(9, true);

      const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls
        .filter((c: any[]) => String(c[0]).includes("INSERT INTO InspectionValues"));
      expect(insertCalls).toHaveLength(0);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });
});
