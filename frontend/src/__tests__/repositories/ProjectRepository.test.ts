jest.mock("@/src/database/db");
jest.mock("expo-file-system/legacy");
jest.mock("@/src/models/Project", () => ({
  Project: class MockProject {},
}));

const mockGetAllAsync = jest.fn();
const mockGetFirstAsync = jest.fn();
const mockRunAsync = jest.fn();

jest.mock("@/src/database/db", () => ({
  getGlobalDatabase: jest.fn().mockResolvedValue({
    getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
  }),
}));

const sampleProject = {
  ProjectID: 1,
  ProjectName: "Test Project",
  DistrictID: 1,
  DivisionName: "North",
  DistrictName: "District A",
  Block: "B1",
  Client: "Client X",
  Description: "Test",
  InspectorName: "Alice",
  DBPath: "/db/project.db",
  SAFPath: "/saf/",
  CreatedAt: "2024-01-01",
  UpdatedAt: "2024-01-01",
};

describe("ProjectRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFirstAsync.mockReset();
    mockRunAsync.mockReset();
    mockGetFirstAsync.mockResolvedValue(null);
  });

  describe("getProjects", () => {
    it("returns all projects ordered by CreatedAt DESC", async () => {
      mockGetAllAsync.mockResolvedValue([sampleProject, { ...sampleProject, ProjectID: 2, ProjectName: "Second" }]);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const projects = await ProjectRepository.getProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0].ProjectName).toBe("Test Project");
      expect(mockGetAllAsync).toHaveBeenCalled();
    });

    it("returns empty array when no projects exist", async () => {
      mockGetAllAsync.mockResolvedValue([]);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const projects = await ProjectRepository.getProjects();

      expect(projects).toEqual([]);
    });
  });

  describe("getProjectById", () => {
    it("returns a project when found", async () => {
      mockGetFirstAsync.mockResolvedValue(sampleProject);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const project = await ProjectRepository.getProjectById(1);

      expect(project).toBeTruthy();
      expect(project!.ProjectName).toBe("Test Project");
    });

    it("returns null when project not found", async () => {
      mockGetFirstAsync.mockResolvedValue(null);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const project = await ProjectRepository.getProjectById(999);

      expect(project).toBeNull();
    });
  });

  describe("ProjectAlreadyExistsError / isUniqueConstraintError", () => {
    it("exposes existingProjectId and spec message", () => {
      const { ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      const err = new ProjectAlreadyExistsError(7);
      expect(err.existingProjectId).toBe(7);
      expect(err.message).toBe("A project with the same District and Project Name already exists.");
      expect(err.name).toBe("ProjectAlreadyExistsError");
    });

    it("detects SQLITE_CONSTRAINT_UNIQUE code", () => {
      const { isUniqueConstraintError } = require("@/src/database/repositories/ProjectRepository");
      expect(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_UNIQUE" })).toBe(true);
    });

    it("detects UNIQUE constraint message", () => {
      const { isUniqueConstraintError } = require("@/src/database/repositories/ProjectRepository");
      expect(
        isUniqueConstraintError(new Error("UNIQUE constraint failed: Projects.DistrictKey, Projects.ProjectKey"))
      ).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      const { isUniqueConstraintError } = require("@/src/database/repositories/ProjectRepository");
      expect(isUniqueConstraintError(new Error("disk I/O error"))).toBe(false);
      expect(isUniqueConstraintError(null)).toBe(false);
      expect(isUniqueConstraintError(undefined)).toBe(false);
    });
  });

  describe("createProject", () => {
    const createArgs = {
      projectName: "New Project",
      districtId: 2,
      dbPath: "/db/new.db",
      safPath: "/saf/",
      block: "B2",
      client: "Client Y",
      description: "A new project",
      inspectorName: "Bob",
    };

    it("inserts a project with normalized keys and returns the new ID", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.createProject(createArgs);

      expect(newId).toBe(5);
      const sql = mockRunAsync.mock.calls[0][0] as string;
      const params = mockRunAsync.mock.calls[0][1] as unknown[];
      expect(sql).toContain("DistrictKey");
      expect(sql).toContain("ProjectKey");
      expect(params).toContain("sikar");
      expect(params).toContain("new project");
      expect(params[0]).toBe("New Project");
    });

    it("rejects an exact duplicate without calling runAsync", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 9 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.createProject(createArgs)).rejects.toBeInstanceOf(
        ProjectAlreadyExistsError
      );
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it("succeeds for the same district with a different project name", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.createProject({
        ...createArgs,
        projectName: "ABC",
      });
      expect(newId).toBe(5);
    });

    it("succeeds for a different district with the same project name", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "JAIPUR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.createProject(createArgs);
      expect(newId).toBe(5);
    });

    it("rejects a name that differs only by case", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 3 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.createProject({ ...createArgs, projectName: "XYZ" })
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
    });

    it("rejects a district that differs only by case", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 3 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.createProject({
          ...createArgs,
          projectName: "XYZ",
          districtId: 1,
        })
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
    });

    it("rejects when both district and name differ only by case", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 3 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.createProject({
          ...createArgs,
          projectName: "xyz",
          districtId: 1,
        })
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
    });

    it("rejects leading/trailing whitespace variants", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 3 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.createProject({ ...createArgs, projectName: " XYZ " })
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
    });

    it("throws when the district is missing", async () => {
      mockGetFirstAsync.mockResolvedValueOnce(null);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.createProject(createArgs)).rejects.toThrow(
        "District not found"
      );
    });

    it("converts a SQLite UNIQUE constraint error to ProjectAlreadyExistsError", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockRejectedValue({ code: "SQLITE_CONSTRAINT_UNIQUE" });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.createProject(createArgs)).rejects.toBeInstanceOf(
        ProjectAlreadyExistsError
      );
    });

    it("converts a UNIQUE constraint message error to ProjectAlreadyExistsError", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockRejectedValue(
        new Error("UNIQUE constraint failed: Projects.DistrictKey, Projects.ProjectKey")
      );

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.createProject(createArgs)).rejects.toBeInstanceOf(
        ProjectAlreadyExistsError
      );
    });

    it("propagates unexpected failures unchanged", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockRejectedValue(new Error("disk I/O error"));

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.createProject(createArgs)).rejects.toThrow("disk I/O error");
    });

    it("resolves concurrent duplicates so only one wins", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ DistrictName: "sikar" })
        .mockResolvedValueOnce(null);
      mockRunAsync
        .mockResolvedValueOnce({ lastInsertRowId: 5, changes: 1 })
        .mockRejectedValueOnce({ code: "SQLITE_CONSTRAINT_UNIQUE" });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      const first = await ProjectRepository.createProject(createArgs);
      await expect(
        ProjectRepository.createProject({ ...createArgs, projectName: "new project" })
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
      expect(first).toBe(5);
    });
  });

  describe("updateProject", () => {
    it("updates the project with recomputed keys and returns void", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.updateProject(1, {
        projectName: "Updated Name",
        districtId: 1,
      });

      const sql = mockRunAsync.mock.calls[0][0] as string;
      const params = mockRunAsync.mock.calls[0][1] as unknown[];
      expect(sql).toContain("DistrictKey = ?");
      expect(sql).toContain("ProjectKey = ?");
      expect(params).toContain("sikar");
      expect(params).toContain("updated name");
    });

    it("updates optional fields when provided", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.updateProject(1, {
        projectName: "Updated Name",
        districtId: 1,
        block: "B9",
        client: "Client Z",
        description: "Updated description",
        inspectorName: "Carol",
      });

      const sql = mockRunAsync.mock.calls[0][0] as string;
      expect(sql).toContain("Block = ?");
      expect(sql).toContain("Client = ?");
      expect(sql).toContain("Description = ?");
      expect(sql).toContain("InspectorName = ?");
    });

    it("allows updating a project to its own current values (excludes self)", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.updateProject(5, {
        projectName: "XYZ",
        districtId: 1,
      });

      const precheckSql = mockGetFirstAsync.mock.calls[1][0] as string;
      expect(precheckSql).toContain("ProjectID != ?");
      expect(precheckSql).toContain("DistrictKey = ?");
    });

    it("rejects renaming to a name that collides with another project", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 8 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.updateProject(1, { projectName: "XYZ", districtId: 1 })
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
      expect(mockRunAsync).not.toHaveBeenCalled();
    });
  });

  describe("cloneProject", () => {
    it("clones a project and returns new ID with keys", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce(sampleProject)
        .mockResolvedValueOnce(null);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 10, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.cloneProject(1, "Cloned Project");

      expect(newId).toBe(10);
      const sql = mockRunAsync.mock.calls[0][0] as string;
      const params = mockRunAsync.mock.calls[0][1] as unknown[];
      expect(sql).toContain("DistrictKey");
      expect(sql).toContain("ProjectKey");
      expect(params).toContain("district a");
      expect(params).toContain("cloned project");
    });

    it("returns 0 when source project not found", async () => {
      mockGetFirstAsync.mockResolvedValueOnce(null);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.cloneProject(999, "Ghost");

      expect(newId).toBe(0);
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it("rejects cloning to a colliding name in the same district", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce(sampleProject)
        .mockResolvedValueOnce({ ProjectID: 2 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.cloneProject(1, "Test Project")
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it("propagates unexpected failures unchanged", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce(sampleProject)
        .mockResolvedValueOnce(null);
      mockRunAsync.mockRejectedValue(new Error("disk I/O error"));

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.cloneProject(1, "Cloned")).rejects.toThrow("disk I/O error");
    });
  });

  describe("assertIdentityAvailable", () => {
    it("throws ProjectAlreadyExistsError when a matching identity exists elsewhere", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce({ ProjectID: 8 });

      const { ProjectRepository, ProjectAlreadyExistsError } = require("@/src/database/repositories/ProjectRepository");
      await expect(
        ProjectRepository.assertIdentityAvailable(1, "XYZ", 5)
      ).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
      const precheckSql = mockGetFirstAsync.mock.calls[1][0] as string;
      expect(precheckSql).toContain("ProjectID != ?");
    });

    it("resolves when the identity is available", async () => {
      mockGetFirstAsync
        .mockResolvedValueOnce({ DistrictName: "SIKAR" })
        .mockResolvedValueOnce(null);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await expect(ProjectRepository.assertIdentityAvailable(1, "XYZ", 5)).resolves.toBeUndefined();
    });
  });

  describe("pending photo folder rename markers", () => {
    it("setPendingPhotoFolderRename writes the marker into the row", async () => {
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.setPendingPhotoFolderRename(1, '{"from":"a","to":"b"}');

      const sql = mockRunAsync.mock.calls[0][0] as string;
      const params = mockRunAsync.mock.calls[0][1] as unknown[];
      expect(sql).toContain("PendingPhotoFolderRename = ?");
      expect(params[0]).toBe('{"from":"a","to":"b"}');
      expect(params[1]).toBe(1);
    });

    it("setPendingPhotoFolderRename clears the marker when pending is null", async () => {
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.setPendingPhotoFolderRename(1, null);

      const params = mockRunAsync.mock.calls[0][1] as unknown[];
      expect(params[0]).toBeNull();
    });

    it("getPendingPhotoFolderRenames only returns rows with a non-null marker", async () => {
      mockGetAllAsync.mockResolvedValue([
        { ProjectID: 1, PendingPhotoFolderRename: '{"from":"a"}' },
      ]);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const rows = await ProjectRepository.getPendingPhotoFolderRenames();

      expect(rows).toEqual([{ ProjectID: 1, PendingPhotoFolderRename: '{"from":"a"}' }]);
      const sql = mockGetAllAsync.mock.calls[0][0] as string;
      expect(sql).toContain("PendingPhotoFolderRename IS NOT NULL");
    });
  });

  describe("deleteProject", () => {
    it("deletes a project by ID", async () => {
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.deleteProject(1);

      expect(mockRunAsync).toHaveBeenCalled();
    });
  });
});
