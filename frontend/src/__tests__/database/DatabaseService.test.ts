jest.mock("@/src/database/db", () => ({
  getGlobalDatabase: jest.fn(),
}));
jest.mock("@/src/database/schema");
jest.mock("@/src/database/seed");

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

  it("returns null initError before any initialization attempt", () => {
    jest.isolateModules(() => {
      const { getInitError } = require("@/src/database/DatabaseService");
      expect(getInitError()).toBeNull();
    });
  });
});
