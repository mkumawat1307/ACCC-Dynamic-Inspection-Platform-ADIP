jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpenDatabaseAsync(...args),
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  moveAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/database/schema", () => ({
  createProjectSchema: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/inspection-template.seed", () => ({
  seedInspectionTemplate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/inspection-sections.seed", () => ({
  seedInspectionSections: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/inspection-fields.seed", () => ({
  seedInspectionFields: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/field-options.seed", () => ({
  seedFieldOptions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/repeatable-groups.seed", () => ({
  seedRepeatableGroups: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/repeatable-group-fields.seed", () => ({
  seedRepeatableGroupFields: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/device-options.seed", () => ({
  seedDeviceOptions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/device-field-definitions.seed", () => ({
  seedDeviceFieldDefinitions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/src/database/seeds/dashboard-cards.seed", () => ({
  seedDashboardCards: jest.fn().mockResolvedValue(undefined),
}));

const mockOpenDatabaseAsync = jest.fn();

function createMockDb() {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

const DB_PATH = "/mock/documents/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db";

describe("createProjectDb failure isolation (real db.ts connection state)", () => {
  let dbModule: typeof import("@/src/database/db");
  let seedDashboardCards: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenDatabaseAsync.mockReset();
    mockOpenDatabaseAsync.mockResolvedValue(createMockDb());
    jest.resetModules();

    dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    seedDashboardCards = require("@/src/database/seeds/dashboard-cards.seed").seedDashboardCards as jest.Mock;
  });

  it("does not leave a partial project active when a seed fails", async () => {
    const { createProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    seedDashboardCards.mockRejectedValue(new Error("seed boom"));

    await expect(createProjectDb("AMC 2026", DB_PATH, 7)).rejects.toThrow("seed boom");

    expect(dbModule.getActiveProjectPath()).toBeNull();

    const db = await dbModule.getDatabase();
    expect(db).toBeDefined();
    expect(mockOpenDatabaseAsync).toHaveBeenLastCalledWith("accc_global.db");
  });

  it("leaves the connection on the global DB even when setActiveProject itself fails", async () => {
    const { createProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    mockOpenDatabaseAsync.mockRejectedValueOnce(new Error("disk full"));

    await expect(createProjectDb("AMC 2026", DB_PATH, 7)).rejects.toThrow("disk full");

    expect(dbModule.getActiveProjectPath()).toBeNull();
  });

  it("allows a clean retry after a failed creation and never re-activates the partial DB", async () => {
    const { createProjectDb } = require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    seedDashboardCards
      .mockRejectedValueOnce(new Error("seed boom"))
      .mockResolvedValue(undefined);

    await expect(createProjectDb("AMC 2026", DB_PATH, 7)).rejects.toThrow("seed boom");
    expect(dbModule.getActiveProjectPath()).toBeNull();

    await expect(createProjectDb("AMC 2026", DB_PATH, 7)).resolves.toBeUndefined();

    expect(dbModule.getActiveProjectPath()).toBeNull();
    const db = await dbModule.getDatabase();
    expect(db).toBeDefined();
    expect(mockOpenDatabaseAsync).toHaveBeenLastCalledWith("accc_global.db");
  });
});