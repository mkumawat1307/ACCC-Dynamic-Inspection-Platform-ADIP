jest.mock("expo-sqlite");

const PROJECT = "/mock/documents/Projects/ProjectX/inspection.db";

describe("PhotoRepository", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("creates, reads by id, lists, updates path, and deletes a photo", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_a.jpg",
      FilePath: "file:///tmp/pole_a.jpg",
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });
    expect(photoId).toBeGreaterThan(0);

    const created = await PhotoRepository.getById(photoId);
    expect(created?.FileName).toBe("pole_a.jpg");
    expect(created?.Latitude).toBe(34.05);

    await PhotoRepository.updateFilePath(photoId, "content://mock/pole_a.jpg");
    const updated = await PhotoRepository.getById(photoId);
    expect(updated?.FilePath).toBe("content://mock/pole_a.jpg");

    const list = await PhotoRepository.getByInspection(1);
    expect(list).toHaveLength(1);

    await PhotoRepository.delete(photoId);
    expect(await PhotoRepository.getById(photoId)).toBeNull();

    await dbModule.clearActiveProject();
  });

  it("returns null for a nonexistent photo", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;
    expect(await PhotoRepository.getById(999)).toBeNull();
    await dbModule.clearActiveProject();
  });
});
