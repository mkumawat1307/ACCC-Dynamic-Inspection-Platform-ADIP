jest.mock("expo-sqlite");
jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    renameFile: jest.fn(),
  },
}));

import { downloadStorage } from "@/src/utils/downloadStorage";

const PROJECT = "/mock/documents/Projects/PoleRename/inspection.db";

type MockDb = {
  runAsync: (sql: string, params?: unknown[]) => Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  withTransactionAsync: (fn: () => Promise<unknown>) => Promise<unknown>;
};

describe("PoleRenameService", () => {
  let dbModule: typeof import("@/src/database/db");
  let db: MockDb;
  let PoleRenameService: { renamePoleId: (i: number, o: string, n: string, o2: { renameFiles: boolean; updateReports: boolean }) => Promise<{ renamedFiles: number; updatedRecords: number; missingFiles: number }> };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  async function seedInspection(poleId: string): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, poleId, "2026-08-02", "Draft"]
    );
    return result.lastInsertRowId;
  }

  async function seedPoleIdField(): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "Site ID", "pole_id", "text", 1, 1, 1, 1]
    );
    return result.lastInsertRowId;
  }

  async function seedPhoto(inspectionId: number, fileName: string): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO Photos (InspectionID, PhotoType, FileName, FilePath, Latitude, Longitude, CapturedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inspectionId, "Pole", fileName, `content://media/${fileName}`, 27.6, 75.1, "2026-08-04T10:00:00.000Z"]
    );
    return result.lastInsertRowId;
  }

  beforeEach(async () => {
    dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(PROJECT);
    db = (await dbModule.getDatabase()) as MockDb;
    logger = require("@/src/utils/logger").logger;
    PoleRenameService = require("@/src/database/repositories/PoleRenameService").PoleRenameService;
    jest.spyOn(logger, "debug");
    jest.spyOn(logger, "warn");
    jest.spyOn(logger, "error");
    (downloadStorage.renameFile as jest.Mock).mockReset();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dbModule.clearActiveProject();
  });

  it("renames all photo files and updates inspections, photos, values and history", async () => {
    const inspectionId = await seedInspection("SIK001");
    const fieldId = await seedPoleIdField();
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_112948.jpg");
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_113000.jpg");

    (downloadStorage.renameFile as jest.Mock).mockImplementation(
      (uri: string, newFileName: string) => Promise.resolve(`content://media/renamed/${newFileName}`)
    );

    const result = await PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
      renameFiles: true,
      updateReports: true,
    });

    expect(result).toEqual({ renamedFiles: 2, updatedRecords: 2, missingFiles: 0 });
    expect(downloadStorage.renameFile).toHaveBeenCalledTimes(2);

    const inspection = await db.getFirstAsync<{ PoleID: string }>(
      "SELECT PoleID FROM Inspections WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(inspection?.PoleID).toBe("SIK101");

    const photos = await db.getAllAsync<{ FileName: string; FilePath: string }>(
      "SELECT FileName, FilePath FROM Photos WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(photos).toEqual([
      { FileName: "Sikar_SIK101_14AUG2026_112948.jpg", FilePath: "content://media/renamed/Sikar_SIK101_14AUG2026_112948.jpg" },
      { FileName: "Sikar_SIK101_14AUG2026_113000.jpg", FilePath: "content://media/renamed/Sikar_SIK101_14AUG2026_113000.jpg" },
    ]);

    const poleValue = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE FieldID = ?",
      [fieldId]
    );
    expect(poleValue).toEqual([{ FieldValue: "SIK101" }]);

    const history = await db.getAllAsync<{ OldPoleId: string; NewPoleId: string }>(
      "SELECT OldPoleId, NewPoleId FROM InspectionPoleIdHistory WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(history).toEqual([{ OldPoleId: "SIK001", NewPoleId: "SIK101" }]);

    expect(logger.debug).toHaveBeenCalledWith("[PoleRename] start old=SIK001 new=SIK101");
    expect(logger.debug).toHaveBeenCalledWith("[PoleRename] photosFound=2");
    expect(logger.debug).toHaveBeenCalledWith("[PoleRename] dbUpdated=2");
    expect(logger.debug).toHaveBeenCalledWith("[PoleRename] success");
  });

  it("skips missing photo files without failing the operation", async () => {
    const inspectionId = await seedInspection("SIK001");
    await seedPoleIdField();
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_112948.jpg");

    (downloadStorage.renameFile as jest.Mock).mockResolvedValue(null);

    const result = await PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
      renameFiles: true,
      updateReports: true,
    });

    expect(result).toEqual({ renamedFiles: 0, updatedRecords: 0, missingFiles: 1 });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[PoleRename] photoMissing"));

    const inspection = await db.getFirstAsync<{ PoleID: string }>(
      "SELECT PoleID FROM Inspections WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(inspection?.PoleID).toBe("SIK101");

    const history = await db.getAllAsync<{ NewPoleId: string }>(
      "SELECT NewPoleId FROM InspectionPoleIdHistory WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(history).toEqual([{ NewPoleId: "SIK101" }]);
  });

  it("continues past a failed rename and only records the successful ones", async () => {
    const inspectionId = await seedInspection("SIK001");
    await seedPoleIdField();
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_112948.jpg");
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_113000.jpg");

    (downloadStorage.renameFile as jest.Mock)
      .mockResolvedValueOnce("content://media/renamed/one.jpg")
      .mockRejectedValueOnce(new Error("rename failed"));

    const result = await PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
      renameFiles: true,
      updateReports: true,
    });

    expect(result).toEqual({ renamedFiles: 1, updatedRecords: 1, missingFiles: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("[PoleRename] renameFailed"),
      expect.any(Error)
    );

    const photos = await db.getAllAsync<{ FileName: string }>(
      "SELECT FileName FROM Photos WHERE InspectionID = ? ORDER BY PhotoID",
      [inspectionId]
    );
    expect(photos).toEqual([
      { FileName: "Sikar_SIK101_14AUG2026_112948.jpg" },
      { FileName: "Sikar_SIK001_14AUG2026_113000.jpg" },
    ]);
  });

  it("does not touch files or photo rows when renameFiles is off", async () => {
    const inspectionId = await seedInspection("SIK001");
    await seedPoleIdField();
    const photoId = await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_112948.jpg");

    const result = await PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
      renameFiles: false,
      updateReports: true,
    });

    expect(result).toEqual({ renamedFiles: 0, updatedRecords: 0, missingFiles: 0 });
    expect(downloadStorage.renameFile).not.toHaveBeenCalled();

    const inspection = await db.getFirstAsync<{ PoleID: string }>(
      "SELECT PoleID FROM Inspections WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(inspection?.PoleID).toBe("SIK101");

    const photo = await db.getFirstAsync<{ FileName: string }>(
      "SELECT FileName FROM Photos WHERE PhotoID = ?",
      [photoId]
    );
    expect(photo?.FileName).toBe("Sikar_SIK001_14AUG2026_112948.jpg");
  });

  it("does not update report values when updateReports is off", async () => {
    const inspectionId = await seedInspection("SIK001");
    const fieldId = await seedPoleIdField();
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_112948.jpg");
    await db.runAsync(
      `INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)`,
      [inspectionId, fieldId, "SIK001"]
    );

    (downloadStorage.renameFile as jest.Mock).mockImplementation(
      (uri: string, newFileName: string) => Promise.resolve(`content://media/renamed/${newFileName}`)
    );

    await PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
      renameFiles: true,
      updateReports: false,
    });

    const poleValue = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE FieldID = ?",
      [fieldId]
    );
    expect(poleValue).toEqual([{ FieldValue: "SIK001" }]);
  });

  it("reverses file renames and rethrows when the database transaction fails", async () => {
    const inspectionId = await seedInspection("SIK001");
    await seedPoleIdField();
    await seedPhoto(inspectionId, "Sikar_SIK001_14AUG2026_112948.jpg");

    (downloadStorage.renameFile as jest.Mock).mockImplementation(
      (uri: string, newFileName: string) => Promise.resolve(`content://media/renamed/${newFileName}`)
    );

    const originalWithTx = db.withTransactionAsync;
    db.withTransactionAsync = jest.fn().mockRejectedValue(new Error("db down"));

    await expect(
      PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
        renameFiles: true,
        updateReports: true,
      })
    ).rejects.toThrow("db down");

    expect(downloadStorage.renameFile).toHaveBeenCalledTimes(2);
    expect(downloadStorage.renameFile).toHaveBeenLastCalledWith(
      "content://media/renamed/Sikar_SIK101_14AUG2026_112948.jpg",
      "Sikar_SIK001_14AUG2026_112948.jpg"
    );

    const inspection = await db.getFirstAsync<{ PoleID: string }>(
      "SELECT PoleID FROM Inspections WHERE InspectionID = ?",
      [inspectionId]
    );
    expect(inspection?.PoleID).toBe("SIK001");

    db.withTransactionAsync = originalWithTx;
  });

  it("skips photos whose file name does not contain the old pole token", async () => {
    const inspectionId = await seedInspection("SIK001");
    await seedPoleIdField();
    await seedPhoto(inspectionId, "Sikar_OTHER_14AUG2026_112948.jpg");

    const result = await PoleRenameService.renamePoleId(inspectionId, "SIK001", "SIK101", {
      renameFiles: true,
      updateReports: true,
    });

    expect(result).toEqual({ renamedFiles: 0, updatedRecords: 0, missingFiles: 0 });
    expect(downloadStorage.renameFile).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[PoleRename] skipped no token"));
  });
});
