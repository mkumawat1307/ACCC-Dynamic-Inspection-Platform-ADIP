jest.mock("@/src/database/db");
jest.mock("@/src/database/tables/divisions.table", () => ({
  createDivisionsTable: "CREATE TABLE Divisions...",
}));
jest.mock("@/src/database/tables/districts.table", () => ({
  createDistrictsTable: "CREATE TABLE Districts...",
}));
jest.mock("@/src/database/tables/blocks.table", () => ({
  createBlocksTable: "CREATE TABLE Blocks...",
}));
jest.mock("@/src/database/tables/inspection-templates.table", () => ({
  createInspectionTemplatesTable: "CREATE TABLE InspectionTemplates...",
}));
jest.mock("@/src/database/tables/inspection-sections.table", () => ({
  createInspectionSectionsTable: "CREATE TABLE InspectionSections...",
}));
jest.mock("@/src/database/tables/inspection-fields.table", () => ({
  createInspectionFieldsTable: "CREATE TABLE InspectionFields...",
}));
jest.mock("@/src/database/tables/field-options.table", () => ({
  createFieldOptionsTable: "CREATE TABLE FieldOptions...",
}));
jest.mock("@/src/database/tables/repeatable-groups.table", () => ({
  createRepeatableGroupsTable: "CREATE TABLE RepeatableGroups...",
}));
jest.mock("@/src/database/tables/repeatable-group-fields.table", () => ({
  createRepeatableGroupFieldsTable: "CREATE TABLE RepeatableGroupFields...",
}));
jest.mock("@/src/database/tables/inspections.table", () => ({
  createInspectionsTable: "CREATE TABLE Inspections...",
}));
jest.mock("@/src/database/tables/inspection-values.table", () => ({
  createInspectionValuesTable: "CREATE TABLE InspectionValues...",
}));
jest.mock("@/src/database/tables/repeatable-records.table", () => ({
  createRepeatableRecordsTable: "CREATE TABLE RepeatableRecords...",
}));
jest.mock("@/src/database/tables/repeatable-values.table", () => ({
  createRepeatableValuesTable: "CREATE TABLE RepeatableValues...",
}));
jest.mock("@/src/database/tables/cameras.table", () => ({
  createCamerasTable: "CREATE TABLE Cameras...",
}));
jest.mock("@/src/database/tables/switches.table", () => ({
  createSwitchesTable: "CREATE TABLE Switches...",
}));
jest.mock("@/src/database/tables/photos.table", () => ({
  createPhotosTable: "CREATE TABLE Photos...",
}));
jest.mock("@/src/database/tables/device-records.table", () => ({
  createDeviceRecordsTable: "CREATE TABLE DeviceRecords...",
}));
jest.mock("@/src/database/tables/dashboard-cards.table", () => ({
  createDashboardCardsTable: "CREATE TABLE DashboardCards...",
}));
jest.mock("@/src/database/seeds/dashboard-cards.seed", () => ({
  seedDashboardCards: jest.fn().mockResolvedValue(undefined),
  DEFAULT_DASHBOARD_CARDS: [],
}));
jest.mock("@/src/database/repositories/DashboardCardRepository", () => ({
  DashboardCardRepository: {
    ensureDefaultCards: jest.fn().mockResolvedValue(undefined),
    migrateDefaultCards: jest.fn().mockResolvedValue(undefined),
    migrateDeviceCards: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
const mockRunAsync = jest.fn().mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

jest.mock("@/src/database/db", () => ({
  getGlobalDatabase: jest.fn().mockResolvedValue({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
    getFirstAsync: mockGetFirstAsync,
    runAsync: mockRunAsync,
  }),
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
    getFirstAsync: mockGetFirstAsync,
    runAsync: mockRunAsync,
  }),
}));

describe("schema.ts schema functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createGlobalSchema executes all global tables", async () => {
    const { createGlobalSchema } = require("@/src/database/schema");
    await createGlobalSchema();

    expect(mockExecAsync).toHaveBeenCalled();
  });

  it("createProjectSchema executes all project tables", async () => {
    const { createProjectSchema } = require("@/src/database/schema");
    await createProjectSchema();

    expect(mockExecAsync).toHaveBeenCalled();
  });

  it("createProjectSchema creates the DashboardCards table", async () => {
    const { createProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");

    await createProjectSchema();

    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
  });

  it("migrateProjectSchema creates DashboardCards table even when remarks section already exists", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema(1);

    expect(mockRunAsync).toHaveBeenCalledWith("UPDATE DashboardCards SET ProjectID = ?", [1]);
    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema creates DashboardCards table when categorization section is missing", async () => {
    mockGetFirstAsync.mockResolvedValueOnce(null);
    mockGetFirstAsync.mockResolvedValueOnce(null);

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema(1);

    expect(mockRunAsync).toHaveBeenCalledWith("UPDATE DashboardCards SET ProjectID = ?", [1]);
    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema deactivates Categorization section and makes Switch Count optional", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ SectionID: 99 })
      .mockResolvedValueOnce({ FieldID: 4 })
      .mockResolvedValueOnce({ FieldID: 5, IsRequired: 1 });

    const { migrateProjectSchema } = require("@/src/database/schema");

    await migrateProjectSchema(1);

    expect(mockRunAsync).toHaveBeenCalledWith(
      "UPDATE InspectionSections SET IsActive = 0, IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionKey = 'categorization'"
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      "UPDATE InspectionFields SET IsActive = 0, IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'pole_category'"
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE FieldOptions SET IsActive = 0")
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      "UPDATE InspectionFields SET IsRequired = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'switch_count'"
    );
  });

  it("migrateProjectSchema renames Pole ID field label to Site ID", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ SectionID: 99 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ FieldID: 6, FieldName: "Pole ID" });

    const { migrateProjectSchema } = require("@/src/database/schema");

    await migrateProjectSchema(1);

    expect(mockRunAsync).toHaveBeenCalledWith(
      "UPDATE InspectionFields SET FieldName = 'Site ID', Placeholder = 'Enter Site ID', UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'pole_id'"
    );
  });

  it("migrateProjectSchema splits remarks into its own section", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ SectionID: 9, TemplateID: 1, DisplayOrder: 8 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema(1);

    expect(mockRunAsync).toHaveBeenCalledTimes(4);
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionSections"),
      [1, "Remarks", "remarks", "Remarks", "note-text", 9]
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE InspectionFields SET SectionID = ?"),
      [5, 9]
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE InspectionSections SET SectionName = 'Categorization'"),
      [9]
    );
    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema creates DashboardCards table and ensures defaults", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ SectionID: 9, TemplateID: 1, DisplayOrder: 8 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema(1);

    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema repairs DashboardCards to the real ProjectID and uses it for defaults", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema(5);

    expect(mockRunAsync).toHaveBeenCalledWith("UPDATE DashboardCards SET ProjectID = ?", [5]);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(5);
    expect(DashboardCardRepository.migrateDefaultCards).toHaveBeenCalledWith(5);
    expect(DashboardCardRepository.migrateDeviceCards).toHaveBeenCalledWith(5);
  });

  it("migrateProjectSchema does not throw when ensureDefaultCards fails", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    (DashboardCardRepository.ensureDefaultCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const { migrateProjectSchema } = require("@/src/database/schema");
    await expect(migrateProjectSchema(1)).resolves.toBeUndefined();
  });

  it("migrateProjectSchema adds the BreakdownField column idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema(1);

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT")
    );
    expect(DashboardCardRepository.migrateDefaultCards).toHaveBeenCalledWith(1);
    expect(DashboardCardRepository.migrateDeviceCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema does not throw when migrateDefaultCards fails", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    (DashboardCardRepository.migrateDefaultCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const { migrateProjectSchema } = require("@/src/database/schema");
    await expect(migrateProjectSchema(1)).resolves.toBeUndefined();
  });

  it("migrateProjectSchema does not throw when migrateDeviceCards fails", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    (DashboardCardRepository.migrateDeviceCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const { migrateProjectSchema } = require("@/src/database/schema");
    await expect(migrateProjectSchema(1)).resolves.toBeUndefined();
  });

  it("migrateProjectSchema adds the SectionLabel and AggregateField columns idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");

    await migrateProjectSchema(1);

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT")
    );
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT")
    );
  });

  it("migrateProjectSchema adds the DeviceType column idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    await migrateProjectSchema(1);

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT")
    );
  });

  interface LegacyCardRow {
    CardKey: string;
    AggregateField?: string | null;
    BreakdownField?: string | null;
    CardMode?: string | null;
    [key: string]: unknown;
  }

  class LegacyDashboardDb {
    readonly columns = new Set<string>(["CardKey", "AggregateField", "BreakdownField"]);
    readonly cards: LegacyCardRow[] = [];
    readonly fields = new Map<string, string>();

    async execAsync(sql: string): Promise<void> {
      const alterMatch = sql.match(/ALTER TABLE DashboardCards ADD COLUMN (\w+)/);
      if (alterMatch) {
        const column = alterMatch[1];
        if (this.columns.has(column)) {
          throw new Error(`duplicate column name: ${column}`);
        }
        this.columns.add(column);
        for (const row of this.cards) {
          if (row[column] === undefined) {
            row[column] = column === "CardMode" ? "entitycount" : null;
          }
        }
        return;
      }
      if (/^\s*UPDATE DashboardCards/.test(sql)) {
        if (sql.includes("AggregateField IS NOT NULL")) {
          for (const row of this.cards) {
            if (row.CardMode === "entitycount" && row.AggregateField) {
              row.CardMode = "sum";
            }
          }
        } else if (sql.includes("InspectionFields f")) {
          for (const row of this.cards) {
            const aggregateMissing =
              row.AggregateField === null || row.AggregateField === undefined;
            if (row.CardMode === "entitycount" && row.BreakdownField && aggregateMissing) {
              row.CardMode = this.deriveMode(this.fields.get(String(row.BreakdownField)));
            }
          }
        }
      }
    }

    private deriveMode(fieldType: string | undefined): string {
      const normalized = (fieldType ?? "").toLowerCase();
      if (normalized === "date" || normalized === "date_auto") {
        return "datebreakdown";
      }
      if (normalized === "dropdown" || normalized === "switch" || normalized === "checkbox") {
        return "dropdown";
      }
      if (normalized === "text" || normalized === "multiline") {
        return "fieldcount";
      }
      return "entitycount";
    }

    async getFirstAsync<T>(): Promise<T | null> {
      return { SectionID: 99 } as T;
    }

    async runAsync(
      sql: string,
      params: unknown[] = []
    ): Promise<{ lastInsertRowId: number; changes: number }> {
      const insertMatch = sql.match(/^\s*INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\);?\s*$/i);
      if (!insertMatch) {
        return { lastInsertRowId: 0, changes: 0 };
      }
      const tableName = insertMatch[1];
      const columns = insertMatch[2].split(",").map((c) => c.trim());
      if (tableName === "DashboardCards") {
        const row: LegacyCardRow = { CardKey: "" };
        columns.forEach((column, i) => {
          row[column] = params[i] ?? null;
        });
        this.cards.push(row);
        return { lastInsertRowId: this.cards.length, changes: 1 };
      }
      if (tableName === "InspectionFields") {
        const keyIndex = columns.indexOf("FieldKey");
        const typeIndex = columns.indexOf("FieldType");
        this.fields.set(String(params[keyIndex] ?? ""), String(params[typeIndex] ?? ""));
        return { lastInsertRowId: this.fields.size, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }
  }

  function cardModes(cards: LegacyCardRow[]): Record<string, string> {
    const modes: Record<string, string> = {};
    for (const card of cards) {
      modes[card.CardKey] = String(card.CardMode);
    }
    return modes;
  }

  it("migrateProjectSchema backfills DashboardCards.CardMode idempotently", async () => {
    const legacyDb = new LegacyDashboardDb();

    await legacyDb.runAsync(
      `INSERT INTO DashboardCards (CardKey, AggregateField) VALUES (?, ?)`,
      ["sum_card", "camera_count"]
    );
    await legacyDb.runAsync(
      `INSERT INTO DashboardCards (CardKey, BreakdownField) VALUES (?, ?)`,
      ["fieldcount_card", "foundation_cond"]
    );
    await legacyDb.runAsync(
      `INSERT INTO DashboardCards (CardKey, BreakdownField) VALUES (?, ?)`,
      ["datebreakdown_card", "inspection_date"]
    );
    await legacyDb.runAsync(
      `INSERT INTO DashboardCards (CardKey, BreakdownField) VALUES (?, ?)`,
      ["dropdown_card", "fence_cond"]
    );
    await legacyDb.runAsync(
      `INSERT INTO DashboardCards (CardKey, BreakdownField) VALUES (?, ?)`,
      ["dangling_card", "removed_field"]
    );
    await legacyDb.runAsync(`INSERT INTO DashboardCards (CardKey) VALUES (?)`, ["entitycount_card"]);
    await legacyDb.runAsync(
      `INSERT INTO InspectionFields (FieldKey, FieldType) VALUES (?, ?)`,
      ["foundation_cond", "text"]
    );
    await legacyDb.runAsync(
      `INSERT INTO InspectionFields (FieldKey, FieldType) VALUES (?, ?)`,
      ["inspection_date", "date_auto"]
    );
    await legacyDb.runAsync(
      `INSERT INTO InspectionFields (FieldKey, FieldType) VALUES (?, ?)`,
      ["fence_cond", "dropdown"]
    );

    const { getDatabase } = require("@/src/database/db");
    getDatabase.mockResolvedValueOnce(legacyDb);

    const execSpy = jest.spyOn(legacyDb, "execAsync");

    const { migrateProjectSchema } = require("@/src/database/schema");
    await migrateProjectSchema(1);

    expect(legacyDb.columns.has("CardMode")).toBe(true);
    const expected = {
      sum_card: "sum",
      fieldcount_card: "fieldcount",
      datebreakdown_card: "datebreakdown",
      dropdown_card: "dropdown",
      dangling_card: "entitycount",
      entitycount_card: "entitycount",
    };
    expect(cardModes(legacyDb.cards)).toEqual(expected);

    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE DashboardCards SET CardMode = COALESCE((")
    );
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining("WHEN LOWER(f.FieldType) IN ('date', 'date_auto') THEN 'datebreakdown'")
    );
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining("WHEN LOWER(f.FieldType) IN ('dropdown', 'switch', 'checkbox') THEN 'dropdown'")
    );
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining("WHEN LOWER(f.FieldType) IN ('text', 'multiline') THEN 'fieldcount'")
    );
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining("ELSE 'entitycount'")
    );
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE CardMode = 'entitycount' AND BreakdownField IS NOT NULL AND BreakdownField != '' AND AggregateField IS NULL"
      )
    );

    getDatabase.mockResolvedValueOnce(legacyDb);
    await expect(migrateProjectSchema(1)).resolves.toBeUndefined();

    expect(cardModes(legacyDb.cards)).toEqual(expected);
  });

  it("real SQLite CardMode backfill tolerates a dangling BreakdownField via COALESCE", async () => {
    const { DatabaseSync } = require("node:sqlite");

    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    await migrateProjectSchema(1);

    const emitted = mockExecAsync.mock.calls.map((call) => String(call[0]));
    const sumBackfill = emitted.find(
      (sql) => sql.includes("UPDATE DashboardCards SET CardMode = 'sum'") && sql.includes("AggregateField IS NOT NULL")
    );
    const breakdownBackfill = emitted.find(
      (sql) => sql.includes("InspectionFields f") && sql.includes("BreakdownField")
    );
    expect(sumBackfill).toBeDefined();
    expect(breakdownBackfill).toBeDefined();

    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE InspectionFields (
        FieldID INTEGER PRIMARY KEY AUTOINCREMENT,
        FieldKey TEXT,
        FieldType TEXT
      );
      CREATE TABLE DashboardCards (
        CardID INTEGER PRIMARY KEY AUTOINCREMENT,
        ProjectID INTEGER NOT NULL,
        CardKey TEXT NOT NULL,
        AggregateField TEXT,
        BreakdownField TEXT,
        CardMode TEXT NOT NULL DEFAULT 'entitycount',
        UNIQUE(ProjectID, CardKey)
      );
    `);
    db.prepare("INSERT INTO InspectionFields (FieldKey, FieldType) VALUES (?, ?)").run(
      "foundation_cond",
      "text"
    );
    db.prepare(
      `INSERT INTO DashboardCards (ProjectID, CardKey, AggregateField, BreakdownField, CardMode)
       VALUES (1, 'valid_text', NULL, 'foundation_cond', 'entitycount')`
    ).run();
    db.prepare(
      `INSERT INTO DashboardCards (ProjectID, CardKey, AggregateField, BreakdownField, CardMode)
       VALUES (1, 'dangling', NULL, 'removed_field', 'entitycount')`
    ).run();
    db.prepare(
      `INSERT INTO DashboardCards (ProjectID, CardKey, AggregateField, BreakdownField, CardMode)
       VALUES (1, 'sum_card', 'camera_count', NULL, 'entitycount')`
    ).run();

    expect(() => {
      db.exec(sumBackfill!);
      db.exec(breakdownBackfill!);
    }).not.toThrow();

    const modes: Record<string, string> = {};
    const rows = db
      .prepare("SELECT CardKey, CardMode FROM DashboardCards ORDER BY CardKey")
      .all() as Array<{ CardKey: string; CardMode: string }>;
    for (const row of rows) {
      modes[row.CardKey] = row.CardMode;
    }

    expect(modes.valid_text).toBe("fieldcount");
    expect(modes.dangling).toBe("entitycount");
    expect(modes.sum_card).toBe("sum");
    db.close();
  });
});
