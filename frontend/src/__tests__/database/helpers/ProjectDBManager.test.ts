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
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false, isDirectory: false }),
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
    it("returns a district-qualified DB path for a project", () => {
      const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
      const path = getProjectDbPath("Jaipur", "AMC 2026");
      expect(path).toContain("Projects/Jaipur_AMC 2026_");
      expect(path).toMatch(/inspection\.db$/);
    });

    it("is deterministic and distinct across districts with the same project name", () => {
      const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
      const sikar = getProjectDbPath("SIKAR", "XYZ");
      const jaipur = getProjectDbPath("JAIPUR", "XYZ");
      expect(sikar).toBe(getProjectDbPath("SIKAR", "XYZ"));
      expect(sikar).not.toBe(jaipur);
      expect(jaipur).toContain("Projects/JAIPUR_XYZ_");
    });

    it("uses the same identity hash for case/whitespace variants", () => {
      const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
      const a = getProjectDbPath(" SIKAR ", "AMC 2026");
      const b = getProjectDbPath("sikar", "amc 2026");
      const hashOf = (p: string) => p.match(/_([0-9a-f]{8})\/inspection\.db$/)![1];
      expect(hashOf(a)).toBe(hashOf(b));
    });

    it("sanitizes special characters in project name", () => {
      const { getProjectDbPath } = require("@/src/database/helpers/ProjectDBManager");
      const path = getProjectDbPath("District", "My:Project/1");
      expect(path).toContain("Projects/District_My_Project_1_");
    });
  });

  describe("createProjectDb", () => {
    it("creates project directory and seeds database", async () => {
      const { seedDashboardCards } = require("@/src/database/seeds/dashboard-cards.seed");
      const { createProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await createProjectDb("TestProject", "/mock/documents/Projects/TestProject/inspection.db", 2);

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
      expect(setActiveProject).toHaveBeenCalled();
      expect(createProjectSchema).toHaveBeenCalled();
      expect(seedDashboardCards).toHaveBeenCalledWith(2);
      expect(clearActiveProject).toHaveBeenCalled();
    });

    it("throws ProjectFolderExistsError and creates nothing when the target DB file already exists", async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
        exists: true,
        isDirectory: false,
      });
      const { createProjectDb, ProjectFolderExistsError } = require("@/src/database/helpers/ProjectDBManager");

      await expect(
        createProjectDb("TestProject", "/mock/documents/Projects/TestProject/inspection.db", 2)
      ).rejects.toBeInstanceOf(ProjectFolderExistsError);

      expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
      expect(setActiveProject).not.toHaveBeenCalled();
    });
  });

  describe("openProjectDb", () => {
    it("opens when schema is valid", async () => {
      mockDb.getFirstAsync.mockResolvedValue({ cnt: 1 });
      const { openProjectDb } = require("@/src/database/helpers/ProjectDBManager");
      await openProjectDb("/path/to/inspection.db", 3);
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
