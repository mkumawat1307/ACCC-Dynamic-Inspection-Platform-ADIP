import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EncodingType,
  StorageAccessFramework,
  __resetFsState,
  __setPermissionGranted,
} from "expo-file-system/legacy";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Project } from "@/src/models/Project";
import { migrateProjectPhotoFolder } from "@/src/utils/folderManager";
import { resetStorageCaches } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";

jest.mock("expo-file-system/legacy", () =>
  jest.requireActual("../../../__mocks__/expo-file-system")
);
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireMock("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: {
    remapFilePaths: jest.fn(
      async (m: Record<string, string>) => Object.keys(m).length
    ),
  },
}));

const remapMock = PhotoRepository.remapFilePaths as jest.Mock<
  Promise<number>,
  [Record<string, string>]
>;

let warnSpy: jest.SpyInstance;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    ProjectID: 1,
    ProjectName: "Project Alpha",
    DistrictID: 1,
    DBPath: null,
    SAFPath: null,
    DistrictName: "New Delhi",
    DivisionName: "Division",
    Block: null,
    Client: null,
    Description: null,
    InspectorName: null,
    CreatedAt: "2024-06-15T10:30:00",
    UpdatedAt: "2024-06-15T10:30:00",
    ...overrides,
  };
}

async function acccRootUri(): Promise<string> {
  const permission =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("SAF permission not granted");
  }
  return StorageAccessFramework.makeDirectoryAsync(
    permission.directoryUri,
    "ACCC Dynamic Inspection"
  );
}

async function canonicalDirUri(): Promise<string> {
  const rootUri = await acccRootUri();
  return `${rootUri}/New Delhi_Project Alpha`;
}

async function seedProjectFolder(
  label: string,
  files: string[] = []
): Promise<string> {
  const rootUri = await acccRootUri();
  const dir = await StorageAccessFramework.makeDirectoryAsync(rootUri, label);
  for (const name of files) {
    const fileUri = await StorageAccessFramework.createFileAsync(
      dir,
      name,
      "image/jpeg"
    );
    await StorageAccessFramework.writeAsStringAsync(fileUri, `data:${name}`, {
      encoding: EncodingType.Base64,
    });
  }
  await AsyncStorage.setItem(`proj_dir_${label}`, dir);
  return dir;
}

beforeEach(async () => {
  __resetFsState();
  await AsyncStorage.clear();
  resetStorageCaches();
  remapMock.mockClear();
  warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("migrateProjectPhotoFolder", () => {
  it("returns zeros when only the canonical folder exists", async () => {
    const canonicalDir = await seedProjectFolder("New Delhi_Project Alpha", [
      "already.jpg",
    ]);

    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 0, updatedRows: 0, legacyFoldersRemoved: 0 });
    expect(remapMock).not.toHaveBeenCalled();
    await expect(
      StorageAccessFramework.readDirectoryAsync(canonicalDir)
    ).resolves.toEqual(["already.jpg"]);
  });

  it("migrates the project-only legacy folder into the canonical folder", async () => {
    const legacyDir = await seedProjectFolder("Project Alpha", [
      "a.jpg",
      "b.jpg",
    ]);
    const canonicalDir = await canonicalDirUri();

    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 2, updatedRows: 2, legacyFoldersRemoved: 1 });
    expect(remapMock).toHaveBeenCalledTimes(1);
    const uriMap = remapMock.mock.calls[0][0];
    expect(Object.keys(uriMap).sort()).toEqual(
      ["a.jpg", "b.jpg"].map((n) => `${legacyDir}/${n}`).sort()
    );
    for (const name of ["a.jpg", "b.jpg"]) {
      expect(uriMap[`${legacyDir}/${name}`]).toBe(`${canonicalDir}/${name}`);
    }
    await expect(
      StorageAccessFramework.readDirectoryAsync(canonicalDir)
    ).resolves.toEqual(expect.arrayContaining(["a.jpg", "b.jpg"]));
    await expect(
      StorageAccessFramework.readDirectoryAsync(legacyDir)
    ).rejects.toThrow();
    expect(await AsyncStorage.getItem("proj_dir_Project Alpha")).toBeNull();
  });

  it("migrates the stripped legacy folder into the canonical folder", async () => {
    const legacyDir = await seedProjectFolder("NewDelhi_ProjectAlpha", [
      "photo.jpg",
    ]);
    const canonicalDir = await canonicalDirUri();

    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 1, updatedRows: 1, legacyFoldersRemoved: 1 });
    expect(remapMock).toHaveBeenCalledTimes(1);
    await expect(
      StorageAccessFramework.readDirectoryAsync(canonicalDir)
    ).resolves.toEqual(["photo.jpg"]);
    await expect(
      StorageAccessFramework.readDirectoryAsync(legacyDir)
    ).rejects.toThrow();
  });

  it("merges both legacy folders into one canonical folder with a single remap", async () => {
    const strippedDir = await seedProjectFolder("NewDelhi_ProjectAlpha", [
      "s1.jpg",
    ]);
    const projectOnlyDir = await seedProjectFolder("Project Alpha", [
      "p1.jpg",
      "p2.jpg",
    ]);
    const canonicalDir = await canonicalDirUri();

    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 3, updatedRows: 3, legacyFoldersRemoved: 2 });
    expect(remapMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(remapMock.mock.calls[0][0])).toHaveLength(3);
    await expect(
      StorageAccessFramework.readDirectoryAsync(canonicalDir)
    ).resolves.toEqual(expect.arrayContaining(["s1.jpg", "p1.jpg", "p2.jpg"]));
    await expect(
      StorageAccessFramework.readDirectoryAsync(strippedDir)
    ).rejects.toThrow();
    await expect(
      StorageAccessFramework.readDirectoryAsync(projectOnlyDir)
    ).rejects.toThrow();
  });

  it("skips files already present in the canonical folder", async () => {
    const canonicalDir = await seedProjectFolder("New Delhi_Project Alpha", [
      "a.jpg",
    ]);
    const legacyDir = await seedProjectFolder("Project Alpha", [
      "a.jpg",
      "b.jpg",
    ]);

    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 1, updatedRows: 1, legacyFoldersRemoved: 1 });
    expect(remapMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(remapMock.mock.calls[0][0])).toEqual([
      `${legacyDir}/b.jpg`,
    ]);
    expect(remapMock.mock.calls[0][0][`${legacyDir}/b.jpg`]).toBe(
      `${canonicalDir}/b.jpg`
    );
    await expect(
      StorageAccessFramework.readAsStringAsync(`${canonicalDir}/a.jpg`, {
        encoding: EncodingType.Base64,
      })
    ).resolves.toBe("data:a.jpg");
    await expect(
      StorageAccessFramework.readDirectoryAsync(canonicalDir)
    ).resolves.toEqual(expect.arrayContaining(["a.jpg", "b.jpg"]));
  });

  it("aborts a folder migration and keeps the legacy folder when a copy fails", async () => {
    const legacyDir = await seedProjectFolder("Project Alpha", [
      "a.jpg",
      "b.jpg",
    ]);
    jest
      .spyOn(StorageAccessFramework, "writeAsStringAsync")
      .mockRejectedValueOnce(new Error("copy failed"));

    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 0, updatedRows: 0, legacyFoldersRemoved: 0 });
    expect(remapMock).not.toHaveBeenCalled();
    await expect(
      StorageAccessFramework.readDirectoryAsync(legacyDir)
    ).resolves.toEqual(expect.arrayContaining(["a.jpg", "b.jpg"]));
  });

  it("skips when another migration is already in flight", async () => {
    let resolvePerm:
      | ((value: { granted: boolean; directoryUri: string }) => void)
      | undefined;
    const deferred = new Promise<{ granted: boolean; directoryUri: string }>(
      (res) => {
        resolvePerm = res;
      }
    );
    jest
      .spyOn(StorageAccessFramework, "requestDirectoryPermissionsAsync")
      .mockReturnValue(deferred);

    const first = migrateProjectPhotoFolder(makeProject());
    const result = await migrateProjectPhotoFolder(makeProject());

    expect(result).toEqual({ migratedFiles: 0, updatedRows: 0, legacyFoldersRemoved: 0 });
    expect(warnSpy).toHaveBeenCalledWith(
      "[FolderManager] Another migration already in flight, skipping"
    );
    expect(remapMock).not.toHaveBeenCalled();

    resolvePerm?.({ granted: false, directoryUri: "" });
    await expect(first).rejects.toThrow("Storage permission denied");
  });

  it("rejects when SAF permission is revoked", async () => {
    __setPermissionGranted(false);

    await expect(migrateProjectPhotoFolder(makeProject())).rejects.toThrow(
      "Storage permission denied"
    );
    expect(remapMock).not.toHaveBeenCalled();
  });
});
