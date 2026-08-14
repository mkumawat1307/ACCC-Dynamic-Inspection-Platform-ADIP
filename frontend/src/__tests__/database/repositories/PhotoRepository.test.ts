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

  it("remaps file paths for multiple photos and persists the changes", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default as typeof import("@/src/database/repositories/PhotoRepository").default;

    const photoA = {
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_a.jpg",
      FilePath: "file:///tmp/pole_a.jpg",
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    };
    const photoB = {
      ...photoA,
      FileName: "pole_b.jpg",
      FilePath: "file:///tmp/pole_b.jpg",
    };

    await PhotoRepository.create(photoA);
    await PhotoRepository.create(photoB);

    const updated = await PhotoRepository.remapFilePaths({
      "file:///tmp/pole_a.jpg": "content://mock/pole_a.jpg",
      "file:///tmp/pole_b.jpg": "content://mock/pole_b.jpg",
    });
    expect(updated).toBe(2);

    const list = await PhotoRepository.getByInspection(1);
    const paths = list.map((p) => p.FilePath).sort();
    expect(paths).toEqual(["content://mock/pole_a.jpg", "content://mock/pole_b.jpg"]);

    await dbModule.clearActiveProject();
  });

  it("returns 0 when no photo matches the old path", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_c.jpg",
      FilePath: "file:///tmp/pole_c.jpg",
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });

    const updated = await PhotoRepository.remapFilePaths({
      "file:///tmp/nonexistent.jpg": "content://mock/moved.jpg",
    });
    expect(updated).toBe(0);

    await dbModule.clearActiveProject();
  });

  it("returns 0 and does not error for an empty map", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;
    await expect(PhotoRepository.remapFilePaths({})).resolves.toBe(0);
    await dbModule.clearActiveProject();
  });

  it("updates the file name and path of a photo together", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "Sikar_SIK001_14AUG2026_112948.jpg",
      FilePath: "content://media/sik001.jpg",
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });

    await PhotoRepository.updateFileNameAndPath(
      photoId,
      "Sikar_SIK101_14AUG2026_112948.jpg",
      "content://media/sik101.jpg"
    );

    const updated = await PhotoRepository.getById(photoId);
    expect(updated?.FileName).toBe("Sikar_SIK101_14AUG2026_112948.jpg");
    expect(updated?.FilePath).toBe("content://media/sik101.jpg");
    expect(updated?.Latitude).toBe(34.05);
    expect(updated?.CapturedAt).toBe("2026-08-04T10:00:00.000Z");

    await dbModule.clearActiveProject();
  });
});
