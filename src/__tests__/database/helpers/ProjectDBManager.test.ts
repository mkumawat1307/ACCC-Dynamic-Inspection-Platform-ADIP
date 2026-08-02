jest.mock("@/src/database/db");
jest.mock("@/src/database/schema");
jest.mock("@/src/database/seeds/inspection-template.seed");
jest.mock("@/src/database/seeds/inspection-sections.seed");
jest.mock("@/src/database/seeds/inspection-fields.seed");
jest.mock("@/src/database/seeds/field-options.seed");
jest.mock("@/src/database/seeds/repeatable-groups.seed");
jest.mock("@/src/database/seeds/repeatable-group-fields.seed");
jest.mock("@/src/database/seeds/device-options.seed");
jest.mock("@/src/database/seeds/device-field-definitions.seed");
jest.mock("@/src/database/seeds/dashboard-cards.seed");

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn(),
}));

import { getDatabase, setActiveProject, clearActiveProject } from "@/src/database/db";
import { createProjectSchema } from "@/src/database/schema";
import * as FileSystem from "expo-file-system/legacy";

function createMockDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    withTransactionAsync: jest.fn(),
  };
}

describe("ProjectDBManager", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    (setActiveProject as jest.Mock).mockResolvedValue(undefined);
    (clearActiveProject as jest.Mock).mockResolvedValue(undefined);
    (createProjectSchema as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
  });

  describe("getProjectDbPath", () => {
    it("returns the correct DB path for a project", () => {
      const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
      const path = getProjectDbPath("MyProject");
      expect(path).toContain("Projects/MyProject/inspection.db");
    });

    it("sanitizes special characters in project name", () => {
      const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
      const path = getProjectDbPath("My:Project/1");
      expect(path).toContain("My_Project_1");
    });
  });

  describe("getProjectFolderPath", () => {
    it("returns the correct folder path", () => {
      const { getProjectFolderPath } = require("@/src/database/helpers/ProjectDBManager");
      const path = getProjectFolderPath("Test");
      expect(path).toMatch(/\/Projects\/Test\/$/);
    });
  });

  describe("createProjectDb", () => {
    it("creates project directory and seeds database", async () => {
      const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
      const { createProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await createProjectDb("TestProject", "/mock/documents/Projects/TestProject/inspection.db");

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
      expect(setActiveProject).toHaveBeenCalled();
      expect(createProjectSchema).toHaveBeenCalled();
      expect(seedDashboardCards).toHaveBeenCalled();
      expect(clearActiveProject).toHaveBeenCalled();
    });
  });

  describe("openProjectDb", () => {
    it("opens when schema is valid", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ cnt: 1 });
      const { openProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await openProjectDb("/path/to/inspection.db");
      expect(setActiveProject).toHaveBeenCalled();
      expect(clearActiveProject).not.toHaveBeenCalled();
    });

    it("throws and clears when schema is missing", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ cnt: 0 });
      const { openProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await expect(openProjectDb("/path/to/inspection.db")).rejects.toThrow("empty or missing schema");
      expect(clearActiveProject).toHaveBeenCalled();
    });
  });

  describe("deleteProjectDb", () => {
    it("deletes the project folder", async () => {
      const { deleteProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await deleteProjectDb("/path/to/inspection.db");
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith("/path/to/");
    });

    it("does nothing when path is empty", async () => {
      const { deleteProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await deleteProjectDb("");
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });

  describe("deleteProjectFolder", () => {
    it("deletes folder by project name", async () => {
      const { deleteProjectFolder } = require("@/src/database/helpers/ProjectDBManager");
      await deleteProjectFolder("TestProject");
      expect(FileSystem.deleteAsync).toHaveBeenCalled();
    });
  });

  describe("listProjectFolders", () => {
    it("returns list of project folders excluding dotfiles", async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(["ProjectA", "ProjectB", ".trash"]);
      const { listProjectFolders } = require("@/src/database/helpers/ProjectDBManager");
      const result = await listProjectFolders();
      expect(result).toEqual(["ProjectA", "ProjectB"]);
    });

    it("returns empty array when readDirectoryAsync fails", async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error("Permission denied"));
      const { listProjectFolders } = require("@/src/database/helpers/ProjectDBManager");
      const result = await listProjectFolders();
      expect(result).toEqual([]);
    });
  });
});
