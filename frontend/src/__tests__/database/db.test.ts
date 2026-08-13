jest.mock("expo-sqlite");

const mockOpenDatabaseAsync = jest.fn();
const mockCloseAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpenDatabaseAsync(...args),
}));

jest.mock("expo-file-system/legacy", () => ({
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
}));

function createMockDb() {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    closeAsync: mockCloseAsync,
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

describe("db.ts DatabaseManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenDatabaseAsync.mockReset();
    jest.resetModules();
  });

  it("getGlobalDatabase opens and caches the global DB", async () => {
    const mockDb = createMockDb();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);

    const dbModule = require("@/src/database/db");
    const db1 = await dbModule.getGlobalDatabase();
    const db2 = await dbModule.getGlobalDatabase();

    expect(mockOpenDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith("accc_global.db");
    expect(db1).toBe(db2);
  });

  it("setActiveProject opens a project DB", async () => {
    const mockDb = createMockDb();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);

    const dbModule = require("@/src/database/db");
    await dbModule.setActiveProject("/path/to/project.db");

    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith("/path/to/project.db", undefined, "");
  });

  it("getDatabase returns project DB when activeProjectPath is set", async () => {
    const mockDb = createMockDb();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);

    const dbModule = require("@/src/database/db");
    await dbModule.setActiveProject("/path/to/project.db");
    const db = await dbModule.getDatabase();

    expect(db).toBeDefined();
  });

  it("getDatabase returns global DB when no active project", async () => {
    const mockDb = createMockDb();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);

    const dbModule = require("@/src/database/db");
    const db = await dbModule.getDatabase();

    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith("accc_global.db");
    expect(db).toBeDefined();
  });

  it("clearActiveProject resets back to global DB", async () => {
    mockOpenDatabaseAsync.mockResolvedValue(createMockDb());

    const dbModule = require("@/src/database/db");
    await dbModule.setActiveProject("/path/to/project.db");
    expect(mockOpenDatabaseAsync).toHaveBeenLastCalledWith("/path/to/project.db", undefined, "");

    await dbModule.clearActiveProject();
    expect(mockOpenDatabaseAsync).toHaveBeenLastCalledWith("accc_global.db");
  });

  it("closeAllDatabases closes the active handle without reopening", async () => {
    const mockDb = createMockDb();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);

    const dbModule = require("@/src/database/db");
    await dbModule.getGlobalDatabase();
    await dbModule.closeAllDatabases();

    expect(mockDb.closeAsync).toHaveBeenCalled();
    expect(mockOpenDatabaseAsync).toHaveBeenCalledTimes(1);
  });

  it("closeAllDatabases is safe with no open handle", async () => {
    const dbModule = require("@/src/database/db");
    await expect(dbModule.closeAllDatabases()).resolves.toBeUndefined();
  });
});
