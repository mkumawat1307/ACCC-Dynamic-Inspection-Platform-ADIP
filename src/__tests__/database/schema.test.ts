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
jest.mock("@/src/database/tables/device-options.table", () => ({
  createDeviceOptionsTable: "CREATE TABLE DeviceOptions...",
}));
jest.mock("@/src/database/tables/device-field-definitions.table", () => ({
  createDeviceFieldDefinitionsTable: "CREATE TABLE DeviceFieldDefinitions...",
}));
jest.mock("@/src/database/tables/device-records.table", () => ({
  createDeviceRecordsTable: "CREATE TABLE DeviceRecords...",
}));
jest.mock("@/src/database/tables/project-device-types.table", () => ({
  createProjectDeviceTypesTable: "CREATE TABLE ProjectDeviceTypes...",
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

describe("schema.ts createSchema", () => {
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

  it("createSchema detects global DB and calls createGlobalSchema", async () => {
    mockGetAllAsync.mockResolvedValueOnce([{ name: "Divisions" }]);

    const { createSchema } = require("@/src/database/schema");
    await createSchema();

    expect(mockGetAllAsync).toHaveBeenCalledWith(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
  });

  it("createSchema detects project DB and calls createProjectSchema", async () => {
    mockGetAllAsync.mockResolvedValueOnce([]);

    const { createSchema } = require("@/src/database/schema");
    await createSchema();

    expect(mockGetAllAsync).toHaveBeenCalledWith(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
  });

  it("migrateProjectSchema creates DashboardCards table even when remarks section already exists", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema();

    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema creates DashboardCards table when categorization section is missing", async () => {
    mockGetFirstAsync.mockResolvedValueOnce(null);
    mockGetFirstAsync.mockResolvedValueOnce(null);

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema();

    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema splits remarks into its own section", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ SectionID: 9, TemplateID: 1, DisplayOrder: 8 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { createDashboardCardsTable } = require("@/src/database/tables/dashboard-cards.table");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema();

    expect(mockRunAsync).toHaveBeenCalledTimes(3);
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

    await migrateProjectSchema();

    expect(mockExecAsync).toHaveBeenCalledWith(createDashboardCardsTable);
    expect(DashboardCardRepository.ensureDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema does not throw when ensureDefaultCards fails", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    (DashboardCardRepository.ensureDefaultCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const { migrateProjectSchema } = require("@/src/database/schema");
    await expect(migrateProjectSchema()).resolves.toBeUndefined();
  });

  it("migrateProjectSchema adds the BreakdownField column idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");
    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");

    await migrateProjectSchema();

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT")
    );
    expect(DashboardCardRepository.migrateDefaultCards).toHaveBeenCalledWith(1);
  });

  it("migrateProjectSchema does not throw when migrateDefaultCards fails", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository");
    (DashboardCardRepository.migrateDefaultCards as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const { migrateProjectSchema } = require("@/src/database/schema");
    await expect(migrateProjectSchema()).resolves.toBeUndefined();
  });

  it("migrateProjectSchema adds the SectionLabel and AggregateField columns idempotently", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ SectionID: 99 });

    const { migrateProjectSchema } = require("@/src/database/schema");

    await migrateProjectSchema();

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT")
    );
    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT")
    );
  });
});
