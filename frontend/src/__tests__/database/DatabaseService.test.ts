jest.mock("@/src/database/db", () => ({
  getGlobalDatabase: jest.fn(),
}));
jest.mock("@/src/database/schema");
jest.mock("@/src/database/seed");
jest.mock("@/src/database/services/PendingRenameDrain", () => ({
  drainLegacyPendingPhotoFolderRenames: jest.fn().mockResolvedValue(undefined),
}));

import { getGlobalDatabase } from "@/src/database/db";
import { createGlobalSchema } from "@/src/database/schema";
import { seedGlobalDatabase } from "@/src/database/seed";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

describe("DatabaseService", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getGlobalDatabase as jest.Mock).mockResolvedValue(mockDb);
    (createGlobalSchema as jest.Mock).mockResolvedValue(undefined);
    (seedGlobalDatabase as jest.Mock).mockResolvedValue(undefined);
  });

  it("initializes the database successfully", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ name: "Projects" }, { name: "Divisions" }]);
    const { initializeDatabase } = require("@/src/database/DatabaseService");
    await initializeDatabase();
    expect(getGlobalDatabase).toHaveBeenCalledTimes(1);
    expect(createGlobalSchema).toHaveBeenCalled();
    expect(seedGlobalDatabase).toHaveBeenCalled();
  });

  it("skips initialization if already in progress", async () => {
    const { initializeDatabase } = require("@/src/database/DatabaseService");
    await Promise.all([initializeDatabase(), initializeDatabase()]);
    expect(getGlobalDatabase).toHaveBeenCalledTimes(1);
  });

  it("throws and sets initError on failure", async () => {
    (createGlobalSchema as jest.Mock).mockRejectedValue(new Error("Schema error"));
    const { initializeDatabase, getInitError } = require("@/src/database/DatabaseService");
    await expect(initializeDatabase()).rejects.toThrow("Schema error");
    expect(getInitError()).toBe("Schema error");
  });

  it("stores duplicate groups from the uniqueness migration", async () => {
    jest.resetModules();
    const { migrateProjectUniqueness } = require("@/src/database/schema");
    (migrateProjectUniqueness as jest.Mock).mockResolvedValue([
      { districtKey: "sikar", projectKey: "xyz", members: [] },
    ]);
    const { initializeDatabase, getProjectDuplicates } = require("@/src/database/DatabaseService");
    await initializeDatabase();
    expect(getProjectDuplicates()).toHaveLength(1);
  });

  it("does not throw when pre-existing duplicates are detected", async () => {
    jest.resetModules();
    const { migrateProjectUniqueness } = require("@/src/database/schema");
    (migrateProjectUniqueness as jest.Mock).mockResolvedValue([
      {
        districtKey: "sikar",
        projectKey: "xyz",
        members: [{ ProjectID: 1 }, { ProjectID: 2 }],
      },
    ]);
    const { initializeDatabase } = require("@/src/database/DatabaseService");
    await expect(initializeDatabase()).resolves.toBeUndefined();
  });

  it("returns null initError before any initialization attempt", () => {
    jest.isolateModules(() => {
      const { getInitError } = require("@/src/database/DatabaseService");
      expect(getInitError()).toBeNull();
    });
  });

  it("runs the legacy pending-rename drain during initialization", async () => {
    const { drainLegacyPendingPhotoFolderRenames } = require("@/src/database/services/PendingRenameDrain");
    const { initializeDatabase } = require("@/src/database/DatabaseService");
    await initializeDatabase();
    expect(drainLegacyPendingPhotoFolderRenames).toHaveBeenCalled();
  });

  it("does not fail initialization when the drain throws", async () => {
    const { drainLegacyPendingPhotoFolderRenames } = require("@/src/database/services/PendingRenameDrain");
    (drainLegacyPendingPhotoFolderRenames as jest.Mock).mockRejectedValueOnce(new Error("drain boom"));
    const { initializeDatabase } = require("@/src/database/DatabaseService");
    await expect(initializeDatabase()).resolves.toBeUndefined();
  });
});
