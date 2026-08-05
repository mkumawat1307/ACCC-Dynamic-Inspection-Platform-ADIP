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

describe("Photo folder remap cross-project isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db = await dbModule.getDatabase();
    return { dbModule, db };
  }

  it("does not leak or remap a Project A photo while Project B is active", async () => {
    const { dbModule, db: dbA } = await openProject(PROJECT_A);
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
    expect(photoId).toBeGreaterThan(0);

    const inA = await dbA.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inA).toHaveLength(1);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);
    const inB = await dbB.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inB).toHaveLength(0);

    const bByInspection = await PhotoRepository.getByInspection(1);
    expect(bByInspection).toHaveLength(0);

    const changed = await PhotoRepository.remapFilePaths({
      [PHOTO_A_PATH]: PHOTO_A_NEW_PATH,
    });
    expect(changed).toBe(0);

    const aAfter = await dbA.getAllAsync<{ PhotoID: number; FilePath: string }>(
      "SELECT PhotoID, FilePath FROM Photos WHERE InspectionID = 1"
    );
    expect(aAfter).toHaveLength(1);
    expect(aAfter[0].FilePath).toBe(PHOTO_A_PATH);

    await dbModule.clearActiveProject();
  });

  it("does not call getGlobalDatabase during the remap flow", async () => {
    const { dbModule } = await openProject(PROJECT_A);
    const globalSpy = jest.spyOn(dbModule, "getGlobalDatabase");
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const changed = await PhotoRepository.remapFilePaths({
      [PHOTO_A_PATH]: PHOTO_A_NEW_PATH,
    });

    expect(changed).toBe(0);
    expect(globalSpy).not.toHaveBeenCalled();

    globalSpy.mockRestore();
    await dbModule.clearActiveProject();
  });
});
