jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

const PROJECT_A = "/mock/documents/Projects/A_ProjectA/inspection.db";
const PROJECT_B = "/mock/documents/Projects/B_ProjectB/inspection.db";

const PHOTO_A_PATH = "content://mock/tree/ACCC Inspection/A_ProjectA/photo_a.jpg";
const PHOTO_A_NEW_PATH = "content://mock/tree/ACCC Inspection/A_ProjectA/new_a.jpg";

describe("StoragePath isolation (project-scoped)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db = await dbModule.getDatabase();
    return { dbModule, db };
  }

  it("does not copy StoragePath updates across projects", async () => {
    const { dbModule } = await openProject(PROJECT_A);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "photo_a.jpg",
      FilePath: PHOTO_A_PATH,
      Latitude: 34.05,
      Longitude: -118.25,
      CapturedAt: "2026-08-04T10:00:00.000Z",
      Remarks: null,
    });

    await PhotoRepository.updateStoragePath(
      photoId,
      "Download/ACCC Dynamic Inspection/B_ProjectB/"
    );
    expect((await PhotoRepository.getById(photoId))!.StoragePath).toBe(
      "Download/ACCC Dynamic Inspection/B_ProjectB/"
    );

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    const inB = await dbB.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inB).toHaveLength(0);

    await dbModule.clearActiveProject();

    const { db: dbA } = await openProject(PROJECT_A);
    const aAfter = await dbA.getAllAsync<{ PhotoID: number; StoragePath: string | null }>(
      "SELECT PhotoID, StoragePath FROM Photos WHERE InspectionID = 1"
    );
    expect(aAfter).toHaveLength(1);
    expect(aAfter[0].StoragePath).toBe("Download/ACCC Dynamic Inspection/B_ProjectB/");

    await dbModule.clearActiveProject();
  });

  it("keeps StoragePath per-photo within the same project (no cross-row bleed)", async () => {
    const { dbModule } = await openProject(PROJECT_A);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoA = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "a.jpg",
      FilePath: PHOTO_A_PATH,
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const photoB = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "b.jpg",
      FilePath: PHOTO_A_NEW_PATH,
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });

    await PhotoRepository.updateStoragePath(photoA, "Download/ACCC Dynamic Inspection/A_ProjectA/");

    const a = await PhotoRepository.getById(photoA);
    const b = await PhotoRepository.getById(photoB);
    expect(a!.StoragePath).toBe("Download/ACCC Dynamic Inspection/A_ProjectA/");
    expect(b!.StoragePath).toBeNull();

    await dbModule.clearActiveProject();
  });
});
