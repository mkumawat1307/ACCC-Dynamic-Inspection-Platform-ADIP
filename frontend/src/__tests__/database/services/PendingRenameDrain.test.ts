jest.mock("@/src/database/repositories/ProjectRepository");
jest.mock("@/src/utils/storageManager", () => ({
  hasProjectFolderFiles: jest.fn(),
}));

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { hasProjectFolderFiles } from "@/src/utils/storageManager";
import { drainLegacyPendingPhotoFolderRenames } from "@/src/database/services/PendingRenameDrain";

const mockGet = ProjectRepository.getPendingPhotoFolderRenames as jest.Mock;
const mockSet = ProjectRepository.setPendingPhotoFolderRename as jest.Mock;
const mockHasFiles = hasProjectFolderFiles as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("drainLegacyPendingPhotoFolderRenames", () => {
  it("clears an empty marker", async () => {
    mockGet.mockResolvedValueOnce([{ ProjectID: 1, PendingPhotoFolderRename: "{}" }]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
  });

  it("clears a malformed marker", async () => {
    mockGet.mockResolvedValueOnce([
      { ProjectID: 1, PendingPhotoFolderRename: "{not-json" },
    ]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
  });

  it("clears an identity marker (from === to)", async () => {
    mockGet.mockResolvedValueOnce([
      {
        ProjectID: 1,
        PendingPhotoFolderRename: JSON.stringify({
          from: "Jaipur_AMC 2026",
          to: "Jaipur_AMC 2026",
        }),
      },
    ]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
  });

  it("clears a marker when files exist only in the from folder (no move attempted)", async () => {
    mockGet.mockResolvedValueOnce([
      {
        ProjectID: 1,
        PendingPhotoFolderRename: JSON.stringify({
          from: "Jaipur_AMC 2026",
          to: "Jaipur_AMC 2027",
        }),
      },
    ]);
    mockHasFiles.mockImplementation((label: string) => label === "Jaipur_AMC 2026");

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).toHaveBeenCalledWith(1, null);
    expect(mockHasFiles).toHaveBeenCalled();
  });

  it("warns and clears a marker when files exist in the to folder", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGet.mockResolvedValueOnce([
      {
        ProjectID: 1,
        PendingPhotoFolderRename: JSON.stringify({
          from: "Jaipur_AMC 2026",
          to: "Jaipur_AMC 2027",
        }),
      },
    ]);
    mockHasFiles.mockImplementation((label: string) => label === "Jaipur_AMC 2027");

    await drainLegacyPendingPhotoFolderRenames();

    expect(warnSpy).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(1, null);
    warnSpy.mockRestore();
  });

  it("does not throw when a single marker lookup fails", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));

    await expect(drainLegacyPendingPhotoFolderRenames()).resolves.toBeUndefined();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("does not touch anything when there are no markers", async () => {
    mockGet.mockResolvedValueOnce([]);

    await drainLegacyPendingPhotoFolderRenames();

    expect(mockSet).not.toHaveBeenCalled();
  });
});
