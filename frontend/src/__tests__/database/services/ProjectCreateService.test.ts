jest.mock("@/src/database/repositories/ProjectRepository");
jest.mock("@/src/database/helpers/ProjectDBManager");
jest.mock("@/src/utils/storageManager");
jest.mock("@/src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn() },
}));

import { ProjectRepository, ProjectAlreadyExistsError } from "@/src/database/repositories/ProjectRepository";
import {
  createProjectDb,
  deleteProjectDb,
  getProjectDbPath,
  ProjectFolderExistsError,
} from "@/src/database/helpers/ProjectDBManager";
import { ensureProjectFolder } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";
import { createProjectFlow } from "@/src/database/services/ProjectCreateService";

const mockCreateProject = ProjectRepository.createProject as jest.Mock;
const mockDeleteProject = ProjectRepository.deleteProject as jest.Mock;
const mockCreateProjectDb = createProjectDb as jest.Mock;
const mockDeleteProjectDb = deleteProjectDb as jest.Mock;
const mockGetProjectDbPath = getProjectDbPath as jest.Mock;
const mockEnsureProjectFolder = ensureProjectFolder as jest.Mock;

const input = {
  projectName: "AMC 2026",
  districtId: 1,
  districtName: "Jaipur",
  client: "Client",
  description: "Desc",
  inspectorName: "Inspector",
};

describe("createProjectFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectDbPath.mockReturnValue("/docs/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db");
    mockCreateProject.mockResolvedValue(5);
    mockCreateProjectDb.mockResolvedValue(undefined);
    mockEnsureProjectFolder.mockResolvedValue(undefined);
    mockDeleteProject.mockResolvedValue(undefined);
    mockDeleteProjectDb.mockResolvedValue(undefined);
  });

  it("creates through repo, project DB, and photo folder; returns the new id", async () => {
    const id = await createProjectFlow(input);

    expect(id).toBe(5);
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "AMC 2026",
        districtId: 1,
        dbPath: "/docs/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db",
      })
    );
    expect(mockCreateProjectDb).toHaveBeenCalledWith(
      "AMC 2026",
      "/docs/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db",
      5
    );
    expect(mockEnsureProjectFolder).toHaveBeenCalledWith("Jaipur_AMC 2026");
    expect(logger.info).toHaveBeenCalledWith(
      "[ProjectCreate] start district=Jaipur project=AMC 2026"
    );
  });

  it("logs rejectedDuplicate and creates nothing on a duplicate", async () => {
    const dup = new ProjectAlreadyExistsError() as ProjectAlreadyExistsError & { existingProjectId: number };
    dup.existingProjectId = 3;
    mockCreateProject.mockRejectedValue(dup);

    await expect(createProjectFlow(input)).rejects.toBe(dup);

    expect(mockCreateProjectDb).not.toHaveBeenCalled();
    expect(mockEnsureProjectFolder).not.toHaveBeenCalled();
    expect(mockDeleteProjectDb).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("[ProjectCreate] duplicateDetected projectId=3");
    expect(logger.info).toHaveBeenCalledWith("[ProjectCreate] rejectedDuplicate");
  });

  it("cleans up only the failed attempt's own resources on createProjectDb failure", async () => {
    mockCreateProjectDb.mockRejectedValue(new Error("seed failed"));

    await expect(createProjectFlow(input)).rejects.toThrow("seed failed");

    expect(mockDeleteProject).toHaveBeenCalledWith(5);
    expect(mockDeleteProjectDb).toHaveBeenCalledWith(
      "/docs/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db"
    );
    expect(logger.error).toHaveBeenCalledWith(
      "[ProjectCreate] failed=",
      expect.objectContaining({ message: "seed failed" })
    );
  });

  it("does not delete anything when the repository insert itself fails", async () => {
    mockCreateProject.mockRejectedValue(new Error("disk I/O error"));

    await expect(createProjectFlow(input)).rejects.toThrow("disk I/O error");

    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(mockDeleteProjectDb).not.toHaveBeenCalled();
  });

  it("removes its own row but never the pre-existing folder on a folder collision", async () => {
    mockCreateProjectDb.mockRejectedValue(
      new ProjectFolderExistsError("/docs/Projects/Jaipur_AMC 2026_a1b2c3d4/inspection.db")
    );

    await expect(createProjectFlow(input)).rejects.toBeInstanceOf(ProjectFolderExistsError);

    expect(mockDeleteProject).toHaveBeenCalledWith(5);
    expect(mockDeleteProjectDb).not.toHaveBeenCalled();
  });

  it("propagates the ProjectAlreadyExistsError untouched", async () => {
    const dup = new ProjectAlreadyExistsError(9);
    mockCreateProject.mockRejectedValue(dup);

    await expect(createProjectFlow(input)).rejects.toBe(dup);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
