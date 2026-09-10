import type { SQLiteDatabase } from "expo-sqlite";

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
jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://mock/exported/file.jpg"),
    writeUtf8: jest.fn().mockResolvedValue("content://mock/exported/file.csv"),
    readBase64: jest.fn().mockResolvedValue("QUJD"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
  },
}));

const PROJECT = "/mock/documents/Projects/ProjectPhotoCleanup/inspection.db";

describe("Inspection deletion removes physical photo files", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(): Promise<SQLiteDatabase> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    const { createProjectSchema } = require("@/src/database/schema") as typeof import("@/src/database/schema");
    await createProjectSchema();
    return (await dbModule.getDatabase()) as SQLiteDatabase;
  }

  async function insertInspection(db: SQLiteDatabase, projectId = 1): Promise<number> {
    const res = await db.runAsync(
      `INSERT INTO Inspections (ProjectID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?)`,
      [projectId, `P-${projectId}`, "01-Jan-2026", "Draft"]
    );
    return res.lastInsertRowId as number;
  }

  async function insertPhoto(
    db: SQLiteDatabase,
    inspectionId: number,
    filePath: string,
    fileName?: string
  ): Promise<number> {
    const resolvedName = fileName ?? (filePath.split("/").pop() ?? "photo.jpg");
    const res = await db.runAsync(
      `INSERT INTO Photos (InspectionID, PhotoType, FileName, FilePath, ProcessingStatus) VALUES (?, ?, ?, ?, ?)`,
      [inspectionId, "pole", resolvedName, filePath, "completed"]
    );
    return res.lastInsertRowId as number;
  }

  function fileSystem() {
    return require("expo-file-system/legacy") as {
      deleteAsync: jest.Mock;
    };
  }

  function storedStorage() {
    return require("@/src/utils/downloadStorage") as {
      downloadStorage: { deleteFile: jest.Mock };
    };
  }

  function deletedFsPaths(): string[] {
    return fileSystem().deleteAsync.mock.calls.map((c) => c[0] as string);
  }

  function deletedContentPaths(): string[] {
    return storedStorage().downloadStorage.deleteFile.mock.calls.map((c) => c[0] as string);
  }

  async function remainingPhotoRows(db: SQLiteDatabase): Promise<unknown[]> {
    return (await db.getAllAsync("SELECT InspectionID, FilePath FROM Photos")) as unknown[];
  }

  it("deletes all physical photo files (SAF content URIs and absolute paths) plus Photo rows", async () => {
    const db = await openProject();
    const a = await insertInspection(db);
    const contentPath = "content://media/external/images/ADIP/a1.jpg";
    const absPath = "file:///mock/documents/Projects/ProjectPhotoCleanup/photos/a2.jpg";
    await insertPhoto(db, a, contentPath);
    await insertPhoto(db, a, absPath);

    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    await InspectionRepository.deleteInspection(a);

    expect(storedStorage().downloadStorage.deleteFile).toHaveBeenCalledWith(contentPath);
    expect(fileSystem().deleteAsync).toHaveBeenCalledWith(absPath, { idempotent: true });
    expect(deletedFsPaths()).toEqual([absPath]);
    expect(deletedContentPaths()).toEqual([contentPath]);
    expect(await remainingPhotoRows(db)).toHaveLength(0);
    const insp = await db.getFirstAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections WHERE InspectionID = ?",
      [a]
    );
    expect(insp).toBeNull();
  });

  it("leaves other inspections' photos and files untouched", async () => {
    const db = await openProject();
    const a = await insertInspection(db);
    const b = await insertInspection(db);
    await insertPhoto(db, a, "content://media/external/images/ADIP/a1.jpg");
    await insertPhoto(db, b, "content://media/external/images/ADIP/b1.jpg");
    await insertPhoto(db, b, "file:///mock/documents/Projects/ProjectPhotoCleanup/photos/b2.jpg");

    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    await InspectionRepository.deleteInspection(a);

    expect(deletedContentPaths()).toEqual(["content://media/external/images/ADIP/a1.jpg"]);
    expect(deletedFsPaths()).toEqual([]);
    expect(await remainingPhotoRows(db)).toEqual([
      { InspectionID: b, FilePath: "content://media/external/images/ADIP/b1.jpg" },
      { InspectionID: b, FilePath: "file:///mock/documents/Projects/ProjectPhotoCleanup/photos/b2.jpg" },
    ]);
  });

  it("succeeds when the inspection has no photos at all", async () => {
    const db = await openProject();
    const a = await insertInspection(db);
    const b = await insertInspection(db);
    await insertPhoto(db, b, "content://media/external/images/ADIP/b1.jpg");

    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    await InspectionRepository.deleteInspection(a);

    expect(deletedContentPaths()).toEqual([]);
    expect(deletedFsPaths()).toEqual([]);
    expect(await remainingPhotoRows(db)).toEqual([
      { InspectionID: b, FilePath: "content://media/external/images/ADIP/b1.jpg" },
    ]);
    const aRow = await db.getFirstAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections WHERE InspectionID = ?",
      [a]
    );
    expect(aRow).toBeNull();
  });

  it("tolerates already-missing or un-deletable photo files without failing the deletion", async () => {
    const db = await openProject();
    const a = await insertInspection(db);
    const contentPath = "content://media/external/images/ADIP/missing.jpg";
    const absPath = "file:///mock/documents/Projects/ProjectPhotoCleanup/photos/gone.jpg";
    await insertPhoto(db, a, contentPath);
    await insertPhoto(db, a, absPath);

    storedStorage().downloadStorage.deleteFile.mockRejectedValueOnce(new Error("SAF not found"));
    fileSystem().deleteAsync.mockRejectedValueOnce(new Error("ENOENT"));

    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    await expect(InspectionRepository.deleteInspection(a)).resolves.toBeUndefined();

    expect(await remainingPhotoRows(db)).toHaveLength(0);
    const aRow = await db.getFirstAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections WHERE InspectionID = ?",
      [a]
    );
    expect(aRow).toBeNull();
  });

  it("deleteMultipleInspections removes only the selected inspections' photo files", async () => {
    const db = await openProject();
    const a = await insertInspection(db);
    const b = await insertInspection(db);
    const c = await insertInspection(db);
    await insertPhoto(db, a, "content://media/external/images/ADIP/a1.jpg");
    await insertPhoto(db, b, "content://media/external/images/ADIP/b1.jpg");
    await insertPhoto(db, c, "file:///mock/documents/Projects/ProjectPhotoCleanup/photos/c1.jpg");

    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    await InspectionRepository.deleteMultipleInspections([a, c]);

    expect(deletedContentPaths()).toEqual(["content://media/external/images/ADIP/a1.jpg"]);
    expect(deletedFsPaths()).toEqual(["file:///mock/documents/Projects/ProjectPhotoCleanup/photos/c1.jpg"]);
    expect(await remainingPhotoRows(db)).toEqual([
      { InspectionID: b, FilePath: "content://media/external/images/ADIP/b1.jpg" },
    ]);
  });

  it("direct in-inspection photo deletion still deletes only that one photo", async () => {
    const db = await openProject();
    const a = await insertInspection(db);
    const p1Path = "content://media/external/images/ADIP/direct1.jpg";
    const p2Path = "content://media/external/images/ADIP/direct2.jpg";
    const p1 = await insertPhoto(db, a, p1Path);
    await insertPhoto(db, a, p2Path);

    const PhotoRepository = require("@/src/database/repositories/PhotoRepository").default;
    await PhotoRepository.delete(p1);

    expect(await remainingPhotoRows(db)).toEqual([
      { InspectionID: a, FilePath: p2Path },
    ]);
    const insp = await db.getFirstAsync<{ InspectionID: number }>(
      "SELECT InspectionID FROM Inspections WHERE InspectionID = ?",
      [a]
    );
    expect(insp).not.toBeNull();
    expect(storedStorage().downloadStorage.deleteFile).not.toHaveBeenCalled();
    expect(fileSystem().deleteAsync).not.toHaveBeenCalled();
  });
});