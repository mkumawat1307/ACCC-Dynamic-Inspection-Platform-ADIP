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

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("Captured-photo cross-project isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db = await dbModule.getDatabase();
    return { dbModule, db };
  }

  it("does not leak a captured photo from Project A into Project B", async () => {
    const { dbModule, db: dbA } = await openProject(PROJECT_A);
    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "photo_a.jpg",
      FilePath: "file:///mock/tmp/photo_a.jpg",
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

    const inAAfter = await dbA.getAllAsync<{ PhotoID: number }>(
      "SELECT PhotoID FROM Photos WHERE InspectionID = 1"
    );
    expect(inAAfter).toHaveLength(1);

    await dbModule.clearActiveProject();
  });
});
