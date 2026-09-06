jest.mock("@/src/database/repositories/ProjectRepository");

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { updateProjectFlow } from "@/src/database/services/ProjectEditService";

const mockGetById = ProjectRepository.getProjectById as jest.Mock;
const mockGetDistrictName = ProjectRepository.getDistrictName as jest.Mock;
const mockAssert = ProjectRepository.assertIdentityAvailable as jest.Mock;
const mockUpdate = ProjectRepository.updateProject as jest.Mock;

const existingProject = {
  ProjectID: 1,
  District: "Jaipur",
  DistrictName: "Jaipur",
  ProjectName: "AMC 2026",
  CreatedAt: "2026-01-01",
  IsCustom: 0,
  DivisionID: null,
  Division: null,
  Block: null,
  Client: null,
  Description: null,
  InspectorName: null,
  PendingPhotoFolderRename: null,
};

const input = {
  projectName: "AMC 2027",
  districtId: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetById.mockResolvedValue(existingProject);
  mockGetDistrictName.mockResolvedValue("Jaipur");
  mockUpdate.mockResolvedValue(undefined);
  mockAssert.mockResolvedValue(undefined);
});

describe("updateProjectFlow", () => {
  it("throws when the project does not exist", async () => {
    mockGetById.mockResolvedValueOnce(null);

    await expect(updateProjectFlow(1, input)).rejects.toThrow("Project not found");

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAssert).not.toHaveBeenCalled();
  });

  it("checks identity availability when the project label changes", async () => {
    await updateProjectFlow(1, input);

    expect(mockAssert).toHaveBeenCalledWith(input.districtId, "AMC 2027", 1);
    expect(mockUpdate).toHaveBeenCalledWith(1, input);
  });

  it("skips the identity check when the label is unchanged", async () => {
    const unchanged = { ...input, projectName: "AMC 2026" };

    await updateProjectFlow(1, unchanged);

    expect(mockAssert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(1, unchanged);
  });

  it("never touches photo files, photo rows, or the pending marker", async () => {
    await updateProjectFlow(1, input);

    expect(ProjectRepository.setPendingPhotoFolderRename).not.toHaveBeenCalled();
    expect(ProjectRepository.getPendingPhotoFolderRenames).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
