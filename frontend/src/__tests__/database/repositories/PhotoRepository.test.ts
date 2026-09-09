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

    await PhotoRepository.updateFilePathAndStoragePath(
      photoId,
      "content://mock/pole_a.jpg",
      "Download/ACCC Dynamic Inspection/ProjectX/"
    );
    const updated = await PhotoRepository.getById(photoId);
    expect(updated?.FilePath).toBe("content://mock/pole_a.jpg");
    expect(updated?.StoragePath).toBe("Download/ACCC Dynamic Inspection/ProjectX/");

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

  describe("PhotoRepository.updateFilePathAndStoragePath", () => {
    it("updates FilePath and StoragePath for a photo", async () => {
      const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
      await dbModule.setActiveProject(PROJECT);
      const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

      const id = await PhotoRepository.create({
        InspectionID: 1,
        PhotoType: "Pole",
        FileName: "photo.jpg",
        FilePath: "",
        Latitude: null,
        Longitude: null,
        CapturedAt: null,
        Remarks: null,
      });

      await PhotoRepository.updateFilePathAndStoragePath(
        id,
        "content://media/Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/photo.jpg",
        "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
      );

      const saved = await PhotoRepository.getById(id);
      expect(saved!.FilePath).toBe(
        "content://media/Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/photo.jpg"
      );
      expect(saved!.StoragePath).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");

      await dbModule.clearActiveProject();
    });
  });

  describe("PhotoRepository.updateStoragePath", () => {
    it("updates only StoragePath", async () => {
      const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
      await dbModule.setActiveProject(PROJECT);
      const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

      const id = await PhotoRepository.create({
        InspectionID: 1,
        PhotoType: "Pole",
        FileName: "photo.jpg",
        FilePath: "content://media/downloads/1",
        Latitude: null,
        Longitude: null,
        CapturedAt: null,
        Remarks: null,
      });

      await PhotoRepository.updateStoragePath(id, "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");

      const saved = await PhotoRepository.getById(id);
      expect(saved!.StoragePath).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
      expect(saved!.FilePath).toBe("content://media/downloads/1");

      await dbModule.clearActiveProject();
    });
  });

  describe("PhotoRepository processing status", () => {
    it("creates a photo with ProcessingStatus captured", async () => {
      const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
      await dbModule.setActiveProject(PROJECT);
      const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

      const id = await PhotoRepository.create({
        InspectionID: 1,
        PhotoType: "Pole",
        FileName: "pole.jpg",
        FilePath: "file:///tmp/pole.jpg",
        Latitude: null,
        Longitude: null,
        CapturedAt: null,
        Remarks: null,
      });
      const created = await PhotoRepository.getById(id);
      expect(created?.ProcessingStatus).toBe("captured");

      await dbModule.clearActiveProject();
    });

    it("setProcessingStatus updates the status of a photo", async () => {
      const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
      await dbModule.setActiveProject(PROJECT);
      const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;

      const id = await PhotoRepository.create({
        InspectionID: 1,
        PhotoType: "Pole",
        FileName: "pole.jpg",
        FilePath: "file:///tmp/pole.jpg",
        Latitude: null,
        Longitude: null,
        CapturedAt: null,
        Remarks: null,
      });

      await PhotoRepository.setProcessingStatus(id, "failed");
      expect((await PhotoRepository.getById(id))?.ProcessingStatus).toBe("failed");

      await PhotoRepository.setProcessingStatus(id, "completed");
      expect((await PhotoRepository.getById(id))?.ProcessingStatus).toBe("completed");

      await dbModule.clearActiveProject();
    });

    it("getPhotosNeedingReconciliation queries both status and path conditions", async () => {
      const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
      await dbModule.setActiveProject(PROJECT);
      const db = await dbModule.getDatabase();
      const getAllSpy = jest.spyOn(db, "getAllAsync");

      const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;
      await PhotoRepository.getPhotosNeedingReconciliation();

      const sql = getAllSpy.mock.calls[0][0] as string;
      expect(sql).toContain("ProcessingStatus != 'completed'");
      expect(sql).toContain("FilePath NOT LIKE 'content://%'");

      getAllSpy.mockRestore();
      await dbModule.clearActiveProject();
    });

    it("getPhotosNeedingReconciliation picks the right rows on real SQLite", async () => {
      const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
      await dbModule.setActiveProject(PROJECT);
      const db = await dbModule.getDatabase();
      const getAllSpy = jest.spyOn(db, "getAllAsync");

      const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;
      await PhotoRepository.getPhotosNeedingReconciliation();
      const sql = getAllSpy.mock.calls[0][0] as string;
      getAllSpy.mockRestore();

      const { DatabaseSync } = require("node:sqlite");
      const real = new DatabaseSync(":memory:");
      real.exec(`
        CREATE TABLE Photos (
          PhotoID INTEGER PRIMARY KEY AUTOINCREMENT,
          InspectionID INTEGER NOT NULL,
          PhotoType TEXT,
          FileName TEXT NOT NULL,
          FilePath TEXT NOT NULL,
          Latitude REAL,
          Longitude REAL,
          CapturedAt TEXT,
          Remarks TEXT,
          StoragePath TEXT,
          ProcessingStatus TEXT NOT NULL DEFAULT 'completed',
          CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const insert = real.prepare(
        `INSERT INTO Photos (InspectionID, PhotoType, FileName, FilePath, ProcessingStatus)
         VALUES (?, ?, ?, ?, ?)`
      );
      insert.run(1, "Pole", "a.jpg", "content://media/x/a.jpg", "captured");
      insert.run(1, "Pole", "b.jpg", "content://media/x/b.jpg", "completed");
      insert.run(1, "Pole", "c.jpg", "file:///tmp/c.jpg", "failed");
      insert.run(1, "Pole", "d.jpg", "file:///tmp/d.jpg", "completed");
      insert.run(1, "Pole", "e.jpg", "content://media/x/e.jpg", "captured");

      const selected = real
        .prepare(sql)
        .all() as { FileName: string }[];
      expect(selected.map((r) => r.FileName).sort()).toEqual(
        ["a.jpg", "c.jpg", "d.jpg", "e.jpg"]
      );
      real.close();

      await dbModule.clearActiveProject();
    });
  });
});
