jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

function staleHandle(name: string): SQLiteDatabase {
  return {
    name,
    closeAsync: jest.fn().mockResolvedValue(undefined),
  } as unknown as SQLiteDatabase;
}

describe("db activation staleness guard", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("keeps the latest concurrent project activation active and discards the stale opener", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const SQLite = require("expo-sqlite") as typeof import("expo-sqlite");

    const originalOpen = SQLite.openDatabaseAsync;
    const handleA = staleHandle(PROJECT_A);
    let resolveA!: (handle: SQLiteDatabase) => void;
    let aOpens = 0;
    const openSpy = jest.spyOn(SQLite, "openDatabaseAsync");
    openSpy.mockImplementation((path: string) => {
      if (path === PROJECT_A) {
        aOpens++;
        if (aOpens === 1) {
          return new Promise<SQLiteDatabase>((resolve) => {
            resolveA = resolve;
          });
        }
        return originalOpen(path);
      }
      return originalOpen(path);
    });

    const activationA = dbModule.setActiveProject(PROJECT_A);
    const activationB = dbModule.setActiveProject(PROJECT_B);

    await expect(activationB).resolves.toBeUndefined();

    resolveA(handleA);
    await expect(activationA).rejects.toThrow(/Superseded project activation/);

    expect(handleA.closeAsync).toHaveBeenCalled();

    const activeDb = await dbModule.getDatabase();
    const activeTarget = await originalOpen(PROJECT_B);
    expect(activeDb).toBe(activeTarget);
  });

  it("recovers: a clean activation of the same path works after a stale rejection", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const SQLite = require("expo-sqlite") as typeof import("expo-sqlite");

    const originalOpen = SQLite.openDatabaseAsync;
    let resolveA!: (handle: SQLiteDatabase) => void;
    let aOpens = 0;
    const openSpy = jest.spyOn(SQLite, "openDatabaseAsync");
    openSpy.mockImplementation((path: string) => {
      if (path === PROJECT_A) {
        aOpens++;
        if (aOpens === 1) {
          return new Promise<SQLiteDatabase>((resolve) => {
            resolveA = resolve;
          });
        }
        return originalOpen(path);
      }
      return originalOpen(path);
    });

    const activationA = dbModule.setActiveProject(PROJECT_A);
    await dbModule.setActiveProject(PROJECT_B);
    resolveA(staleHandle(PROJECT_A));
    await expect(activationA).rejects.toThrow(/Superseded project activation/);

    const aHandle = await originalOpen(PROJECT_A);
    await dbModule.setActiveProject(PROJECT_A);
    const activeDb = await dbModule.getDatabase();
    expect(activeDb).toBe(aHandle);
  });

  it("a newer project activation supersedes an in-flight global activation", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const SQLite = require("expo-sqlite") as typeof import("expo-sqlite");

    const originalOpen = SQLite.openDatabaseAsync;
    const staleGlobal = staleHandle("accc_global.db");
    let resolveGlobal!: (handle: SQLiteDatabase) => void;
    const openSpy = jest.spyOn(SQLite, "openDatabaseAsync");
    openSpy.mockImplementation((path: string) => {
      if (path === "accc_global.db") {
        return new Promise<SQLiteDatabase>((resolve) => {
          resolveGlobal = resolve;
        });
      }
      return originalOpen(path);
    });

    const closeGlobal = dbModule.clearActiveProject();
    await dbModule.setActiveProject(PROJECT_B);
    resolveGlobal(staleGlobal);
    await expect(closeGlobal).rejects.toThrow(/Superseded database activation/);

    expect(staleGlobal.closeAsync).toHaveBeenCalled();

    const activeDb = await dbModule.getDatabase();
    const bHandle = await originalOpen(PROJECT_B);
    expect(activeDb).toBe(bHandle);
  });

  it("sequential activations still resolve normally (no false positives)", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    await dbModule.setActiveProject(PROJECT_A);
    const dbA = await dbModule.getDatabase();

    await dbModule.setActiveProject(PROJECT_B);
    const dbB = await dbModule.getDatabase();
    expect(dbA).not.toBe(dbB);

    await dbModule.clearActiveProject();
    const globalDb = await dbModule.getGlobalDatabase();
    expect(globalDb).toBeDefined();

    await dbModule.setActiveProject(PROJECT_A);
    const dbAAgain = await dbModule.getDatabase();
    expect(dbAAgain).toBe(dbA);
  });

  it("openProjectDbForBackup snapshots another project without changing the active project", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    await dbModule.setActiveProject(PROJECT_A);
    const dbA = await dbModule.getDatabase();

    const dbB = await dbModule.openProjectDbForBackup(PROJECT_B);

    expect(dbB).toBeDefined();
    const restored = await dbModule.getDatabase();
    expect(restored).toBe(dbA);
  });

  it("openProjectDbForBackup sequentially closes the previous handle before opening", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    await dbModule.setActiveProject(PROJECT_A);
    const dbA = await dbModule.getDatabase();
    const closeSpy = jest.spyOn(dbA, "closeAsync");

    await dbModule.openProjectDbForBackup(PROJECT_B);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    const restored = await dbModule.getDatabase();
    expect(restored).toBe(dbA);
  });
});