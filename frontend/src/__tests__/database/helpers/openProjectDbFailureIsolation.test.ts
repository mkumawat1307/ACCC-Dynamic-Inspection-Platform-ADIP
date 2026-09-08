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
  migrateProjectSchema: jest.fn().mockResolvedValue(undefined),
}));

const mockOpenDatabaseAsync = jest.fn();

function createMockDb() {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ cnt: 1 }),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  };
}

const PROJECT_A = "/mock/documents/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db";
const PROJECT_B = "/mock/documents/Projects/Sikar_AMC 2026_b2c3d4e5/inspection.db";

function lastOpenCall(): unknown[] {
  const calls = mockOpenDatabaseAsync.mock.calls;
  return calls[calls.length - 1];
}

describe("openProjectDb failure isolation (real db.ts connection state)", () => {
  let dbModule: typeof import("@/src/database/db");
  let migrateProjectSchema: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenDatabaseAsync.mockReset();
    mockOpenDatabaseAsync.mockImplementation(() => Promise.resolve(createMockDb()));
    jest.resetModules();

    dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    migrateProjectSchema =
      require("@/src/database/schema").migrateProjectSchema as jest.Mock;
  });

  it("opens successfully and keeps the project active without clearing", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");

    await expect(openProjectDb(PROJECT_A, 1)).resolves.toBeUndefined();

    expect(dbModule.getActiveProjectPath()).toBe(PROJECT_A);
    expect(lastOpenCall()).toEqual([PROJECT_A, undefined, ""]);
    expect(mockOpenDatabaseAsync).not.toHaveBeenCalledWith("accc_global.db");
  });

  it("propagates a migration failure and leaves no project active", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    migrateProjectSchema.mockRejectedValue(new Error("migration boom"));

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow("migration boom");

    expect(dbModule.getActiveProjectPath()).toBeNull();
  });

  it("returns the connection to the global DB after a migration failure", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    migrateProjectSchema.mockRejectedValue(new Error("migration boom"));

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow("migration boom");

    const db = await dbModule.getDatabase();
    expect(db).toBeDefined();
    expect(lastOpenCall()).toEqual(["accc_global.db"]);
  });

  it("propagates an open failure and leaves no project active", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    mockOpenDatabaseAsync.mockRejectedValueOnce(new Error("disk full"));

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow("disk full");

    expect(dbModule.getActiveProjectPath()).toBeNull();
  });

  it("allows a clean retry after an open failure and never re-activates the bad DB", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    mockOpenDatabaseAsync
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(createMockDb());

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow("disk full");
    expect(dbModule.getActiveProjectPath()).toBeNull();

    await expect(openProjectDb(PROJECT_A, 1)).resolves.toBeUndefined();

    expect(dbModule.getActiveProjectPath()).toBe(PROJECT_A);
  });

  it("throws the missing-schema error and clears the stale activation", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    mockOpenDatabaseAsync.mockImplementation(() =>
      Promise.resolve({ ...createMockDb(), getFirstAsync: jest.fn().mockResolvedValue({ cnt: 0 }) })
    );

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow(
      "Project database is empty or missing schema"
    );

    expect(dbModule.getActiveProjectPath()).toBeNull();
    const db = await dbModule.getDatabase();
    expect(db).toBeDefined();
    expect(lastOpenCall()).toEqual(["accc_global.db"]);
  });

  it("does not clear a newer activation that leveled past the failed open", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    let rejectGate: (reason: Error) => void = () => {};
    let markMigrateCalled: () => void = () => {};
    const gate = new Promise<never>((_, reject) => {
      rejectGate = reject;
    });
    const migrateEntered = new Promise<void>((resolve) => {
      markMigrateCalled = resolve;
    });
    migrateProjectSchema.mockImplementation(async () => {
      markMigrateCalled();
      await gate;
    });

    const pendingA = openProjectDb(PROJECT_A, 1).then(
      () => undefined,
      (e: unknown) => e as Error
    );

    await migrateEntered;
    await dbModule.setActiveProject(PROJECT_B);
    rejectGate(new Error("migration boom"));

    const reason = (await pendingA) as Error | undefined;
    expect(reason?.message).toBe("migration boom");
    expect(dbModule.getActiveProjectPath()).toBe(PROJECT_B);
    expect(lastOpenCall()).toEqual([PROJECT_B, undefined, ""]);
  });

  it("allows a clean retry after a migration failure and stays active on success", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    migrateProjectSchema
      .mockRejectedValueOnce(new Error("migration boom"))
      .mockResolvedValue(undefined);

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow("migration boom");
    expect(dbModule.getActiveProjectPath()).toBeNull();

    await expect(openProjectDb(PROJECT_A, 1)).resolves.toBeUndefined();

    expect(dbModule.getActiveProjectPath()).toBe(PROJECT_A);
  });

  it("propagates a schema-check failure and recovers on the next open", async () => {
    const { openProjectDb } =
      require("@/src/database/helpers/ProjectDBManager") as typeof import("@/src/database/helpers/ProjectDBManager");
    mockOpenDatabaseAsync.mockImplementationOnce(() =>
      Promise.resolve({
        ...createMockDb(),
        getFirstAsync: jest.fn().mockRejectedValue(new Error("query boom")),
      })
    );

    await expect(openProjectDb(PROJECT_A, 1)).rejects.toThrow("query boom");
    expect(dbModule.getActiveProjectPath()).toBeNull();

    await expect(openProjectDb(PROJECT_A, 1)).resolves.toBeUndefined();
    expect(dbModule.getActiveProjectPath()).toBe(PROJECT_A);
  });
});