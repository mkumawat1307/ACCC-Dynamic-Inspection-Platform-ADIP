jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({
    exists: true,
    isDirectory: false,
    size: 100,
  }),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  getContentUriAsync: jest.fn().mockResolvedValue("content://mock/exported"),
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

import { Project } from "@/src/models/Project";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";

const PROJECT_A = "/mock/documents/Projects/Sikar_AMC 2026_1234abcd/inspection.db";
const PROJECT_B = "/mock/documents/Projects/Sikar_AMC 2027_5678efab/inspection.db";

const projectA = {
  ProjectID: 1,
  ProjectName: "AMC 2026",
  DistrictID: 1,
  DBPath: PROJECT_A,
  DistrictName: "Sikar",
  CreatedAt: "2026-01-01T00:00:00.000Z",
  UpdatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as Project;

const projectB = {
  ProjectID: 2,
  ProjectName: "AMC 2027",
  DistrictID: 1,
  DBPath: PROJECT_B,
  DistrictName: "Sikar",
  CreatedAt: "2026-01-01T00:00:00.000Z",
  UpdatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as Project;

const DISPLAY_A = "Download/ACCC Dynamic Inspection/Sikar_AMC 2026/";

describe("PhotoReconciliationService.reconcileProjectPhotos", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function openProject(dbPath: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const PhotoRepositoryClass = require("@/src/database/repositories/PhotoRepository")
      .default as typeof PhotoRepository;
    return { dbModule, PhotoRepository: PhotoRepositoryClass };
  }

  async function getDownloadStorageMock() {
    const { downloadStorage } = require("@/src/utils/downloadStorage") as {
      downloadStorage: { findFile: jest.Mock };
    };
    return downloadStorage.findFile;
  }

  async function getFileSystemMock() {
    return require("expo-file-system/legacy") as {
      deleteAsync: jest.Mock;
      getInfoAsync: jest.Mock;
    };
  }

  it("completes a retryable photo when its final file exists and updates paths and deletes the temp", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    const { reconcileProjectPhotos } = require("@/src/database/services/PhotoReconciliationService");
    const finalUri =
      "content://media/Download/ACCC Dynamic Inspection/Sikar_AMC 2026/pole_a.jpg";
    (await getDownloadStorageMock()).mockResolvedValue(finalUri);

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
    const planted = await PhotoRepository.getById(photoId);
    jest
      .spyOn(PhotoRepository, "getPhotosNeedingReconciliation")
      .mockResolvedValue([planted!]);

    const result = await reconcileProjectPhotos(projectA);

    expect(result).toEqual({ total: 1, completed: 1, retryable: 0, failed: 0 });
    const fs = await getFileSystemMock();
    expect(fs.deleteAsync).toHaveBeenCalledWith("file:///tmp/pole_a.jpg", {
      idempotent: true,
    });

    const saved = await PhotoRepository.getById(photoId);
    expect(saved?.FilePath).toBe(finalUri);
    expect(saved?.StoragePath).toBe(DISPLAY_A);
    expect(saved?.ProcessingStatus).toBe("completed");

    await dbModule.clearActiveProject();
  });

  it("does not rewrite or delete a final content photo whose path is already correct", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    const { reconcileProjectPhotos } = require("@/src/database/services/PhotoReconciliationService");
    const finalUri =
      "content://media/Download/ACCC Dynamic Inspection/Sikar_AMC 2026/pole_b.jpg";
    (await getDownloadStorageMock()).mockResolvedValue(finalUri);

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_b.jpg",
      FilePath: finalUri,
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const planted = await PhotoRepository.getById(photoId);
    jest
      .spyOn(PhotoRepository, "getPhotosNeedingReconciliation")
      .mockResolvedValue([planted!]);
    const fs = await getFileSystemMock();

    const result = await reconcileProjectPhotos(projectA);

    expect(result).toEqual({ total: 1, completed: 1, retryable: 0, failed: 0 });
    expect(fs.deleteAsync).not.toHaveBeenCalled();

    const saved = await PhotoRepository.getById(photoId);
    expect(saved?.FilePath).toBe(finalUri);
    expect(saved?.ProcessingStatus).toBe("completed");

    await dbModule.clearActiveProject();
  });

  it("marks a content photo with no final file as failed", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    const { reconcileProjectPhotos } = require("@/src/database/services/PhotoReconciliationService");
    (await getDownloadStorageMock()).mockResolvedValue(null);

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_c.jpg",
      FilePath: "content://media/Download/ACCC Dynamic Inspection/Sikar_AMC 2026/pole_c.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const planted = await PhotoRepository.getById(photoId);
    jest
      .spyOn(PhotoRepository, "getPhotosNeedingReconciliation")
      .mockResolvedValue([planted!]);
    const fs = await getFileSystemMock();

    const result = await reconcileProjectPhotos(projectA);

    expect(result).toEqual({ total: 1, completed: 0, retryable: 0, failed: 1 });
    expect(fs.deleteAsync).not.toHaveBeenCalled();
    expect((await PhotoRepository.getById(photoId))?.ProcessingStatus).toBe("failed");

    await dbModule.clearActiveProject();
  });

  it("keeps a temp photo retryable when the temp file still exists", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    const { reconcileProjectPhotos } = require("@/src/database/services/PhotoReconciliationService");
    (await getDownloadStorageMock()).mockResolvedValue(null);
    const fs = await getFileSystemMock();
    fs.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 123 });

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_d.jpg",
      FilePath: "file:///mock/cache/pole_d.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const planted = await PhotoRepository.getById(photoId);
    jest
      .spyOn(PhotoRepository, "getPhotosNeedingReconciliation")
      .mockResolvedValue([planted!]);

    const result = await reconcileProjectPhotos(projectA);

    expect(result).toEqual({ total: 1, completed: 0, retryable: 1, failed: 0 });
    expect(fs.getInfoAsync).toHaveBeenCalledWith("file:///mock/cache/pole_d.jpg");
    expect((await PhotoRepository.getById(photoId))?.ProcessingStatus).toBe("captured");

    await dbModule.clearActiveProject();
  });

  it("marks a temp photo as failed when the temp file is gone", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    const { reconcileProjectPhotos } = require("@/src/database/services/PhotoReconciliationService");
    (await getDownloadStorageMock()).mockResolvedValue(null);
    const fs = await getFileSystemMock();
    fs.getInfoAsync.mockResolvedValue({ exists: false, isDirectory: false, size: 0 });

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_e.jpg",
      FilePath: "file:///mock/cache/pole_e.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const planted = await PhotoRepository.getById(photoId);
    jest
      .spyOn(PhotoRepository, "getPhotosNeedingReconciliation")
      .mockResolvedValue([planted!]);

    const result = await reconcileProjectPhotos(projectA);

    expect(result).toEqual({ total: 1, completed: 0, retryable: 0, failed: 1 });
    expect((await PhotoRepository.getById(photoId))?.ProcessingStatus).toBe("failed");

    await dbModule.clearActiveProject();
  });

  it("does not reconcile photos from another project (per-project isolation)", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    (await getDownloadStorageMock()).mockResolvedValue(null);
    const fs = await getFileSystemMock();
    fs.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 123 });

    const photoInA = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "isolated.jpg",
      FilePath: "file:///mock/cache/isolated.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    expect((await PhotoRepository.getById(photoInA))?.ProcessingStatus).toBe(
      "captured"
    );

    await dbModule.clearActiveProject();

    const { PhotoRepository: PhotoRepositoryB } = await openProject(PROJECT_B);
    const { reconcileProjectPhotos: reconcileB } =
      require("@/src/database/services/PhotoReconciliationService") as {
        reconcileProjectPhotos: (p: Project) => Promise<{
          total: number;
          completed: number;
          retryable: number;
          failed: number;
        }>;
      };
    fs.getInfoAsync.mockClear();
    fs.deleteAsync.mockClear();

    const resultB = await reconcileB(projectB);

    expect(resultB).toEqual({ total: 0, completed: 0, retryable: 0, failed: 0 });
    expect(fs.getInfoAsync).not.toHaveBeenCalled();
    expect(fs.deleteAsync).not.toHaveBeenCalled();

    const photosInB = await PhotoRepositoryB.getById(photoInA);
    expect(photosInB).toBeNull();

    await dbModule.clearActiveProject();

    const { PhotoRepository: PhotoRepositoryAAfter } = await openProject(PROJECT_A);
    const after = await PhotoRepositoryAAfter.getById(photoInA);
    expect(after?.ProcessingStatus).toBe("captured");
    expect(after?.FilePath).toBe("file:///mock/cache/isolated.jpg");

    await dbModule.clearActiveProject();
  });

  it("does not write reconciled photos into another project when the project switches mid-reconcile", async () => {
    const { PhotoRepository, dbModule } = await openProject(PROJECT_A);
    const service = require("@/src/database/services/PhotoReconciliationService") as {
      reconcileProjectPhotos: (p: Project) => Promise<{
        total: number;
        completed: number;
        retryable: number;
        failed: number;
      }>;
    };
    const finalUri =
      "content://media/Download/ACCC Dynamic Inspection/Sikar_AMC 2026/pole_swap.jpg";

    let resolveFindFile!: (value: string | null) => void;
    const findFileGate = new Promise<string | null>((resolve) => {
      resolveFindFile = resolve;
    });
    const findFileMock = await getDownloadStorageMock();
    findFileMock.mockImplementation(() => findFileGate);

    const photoId = await PhotoRepository.create({
      InspectionID: 1,
      PhotoType: "Pole",
      FileName: "pole_swap.jpg",
      FilePath: "file:///mock/tmp/pole_swap.jpg",
      Latitude: null,
      Longitude: null,
      CapturedAt: null,
      Remarks: null,
    });
    const planted = await PhotoRepository.getById(photoId);
    jest
      .spyOn(PhotoRepository, "getPhotosNeedingReconciliation")
      .mockResolvedValue([planted!]);

    const reconcileP = service.reconcileProjectPhotos(projectA);
    await new Promise((r) => setTimeout(r, 0));

    await dbModule.clearActiveProject();

    const { PhotoRepository: PhotoRepositoryB } = await openProject(PROJECT_B);
    resolveFindFile(finalUri);

    const result = await reconcileP;

    expect(result).toEqual({ total: 1, completed: 0, retryable: 0, failed: 0 });
    expect(await PhotoRepositoryB.getById(photoId)).toBeNull();

    await dbModule.clearActiveProject();

    const { PhotoRepository: PhotoRepositoryAAfter } = await openProject(PROJECT_A);
    const after = await PhotoRepositoryAAfter.getById(photoId);
    expect(after?.ProcessingStatus).toBe("captured");
    expect(after?.FilePath).toBe("file:///mock/tmp/pole_swap.jpg");

    await dbModule.clearActiveProject();
  });
});