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

const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockGetAllAsync = jest.fn().mockResolvedValue([]);

jest.mock("@/src/database/db", () => ({
  getGlobalDatabase: jest.fn().mockResolvedValue({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
    getFirstAsync: jest.fn().mockResolvedValue(null),
  }),
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
    getFirstAsync: jest.fn().mockResolvedValue(null),
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
});
