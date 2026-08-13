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

  describe("createProject", () => {
    it("inserts a project and returns the new ID", async () => {
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 5, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.createProject({
        projectName: "New Project",
        districtId: 2,
        dbPath: "/db/new.db",
        safPath: "/saf/",
        block: "B2",
        client: "Client Y",
        description: "A new project",
        inspectorName: "Bob",
      });

      expect(newId).toBe(5);
      expect(mockRunAsync).toHaveBeenCalled();
    });
  });

  describe("updateProject", () => {
    it("updates the project and returns void", async () => {
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      await ProjectRepository.updateProject(1, {
        projectName: "Updated Name",
        districtId: 1,
      });

      expect(mockRunAsync).toHaveBeenCalled();
    });

    it("updates optional fields when provided", async () => {
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
  });

  describe("cloneProject", () => {
    it("clones a project and returns new ID", async () => {
      mockGetFirstAsync.mockResolvedValue(sampleProject);
      mockRunAsync.mockResolvedValue({ lastInsertRowId: 10, changes: 1 });

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.cloneProject(1, "Cloned Project");

      expect(newId).toBe(10);
    });

    it("returns 0 when source project not found", async () => {
      mockGetFirstAsync.mockResolvedValue(null);

      const { ProjectRepository } = require("@/src/database/repositories/ProjectRepository");
      const newId = await ProjectRepository.cloneProject(999, "Ghost");

      expect(newId).toBe(0);
      expect(mockRunAsync).not.toHaveBeenCalled();
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
