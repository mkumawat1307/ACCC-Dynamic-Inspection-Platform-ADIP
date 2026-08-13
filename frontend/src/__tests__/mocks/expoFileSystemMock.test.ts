import {
  EncodingType,
  StorageAccessFramework,
  __resetFsState,
  __setPermissionGranted,
} from "expo-file-system/legacy";

jest.mock("expo-file-system/legacy", () =>
  jest.requireActual("../../../__mocks__/expo-file-system")
);

async function requestTreeUri(): Promise<string> {
  const permission =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("SAF permission not granted");
  }
  return permission.directoryUri;
}

describe("expo-file-system/legacy manual mock", () => {
  beforeEach(() => {
    __resetFsState();
  });

  it("builds a SAF tree and reads back names and content", async () => {
    const treeUri = await requestTreeUri();

    const acccDir = await StorageAccessFramework.makeDirectoryAsync(
      treeUri,
      "ACCC Inspection"
    );
    expect(acccDir).toBe(`${treeUri.replace(/\/$/, "")}/ACCC Inspection`);

    const blockDir = await StorageAccessFramework.makeDirectoryAsync(
      acccDir,
      "New Delhi_Block A"
    );
    expect(blockDir).toBe(`${acccDir}/New Delhi_Block A`);

    const fileUri = await StorageAccessFramework.createFileAsync(
      blockDir,
      "photo_a.jpg",
      "image/jpeg"
    );
    expect(fileUri).toBe(`${blockDir}/photo_a.jpg`);

    await StorageAccessFramework.writeAsStringAsync(
      fileUri,
      "aGVsbG8=",
      { encoding: EncodingType.Base64 }
    );

    await expect(
      StorageAccessFramework.readDirectoryAsync(treeUri)
    ).resolves.toEqual(["ACCC Inspection"]);
    await expect(
      StorageAccessFramework.readDirectoryAsync(blockDir)
    ).resolves.toEqual(["photo_a.jpg"]);
    await expect(
      StorageAccessFramework.readAsStringAsync(fileUri)
    ).resolves.toBe("aGVsbG8=");
  });

  it("deletes a project directory recursively", async () => {
    const treeUri = await requestTreeUri();
    const acccDir = await StorageAccessFramework.makeDirectoryAsync(
      treeUri,
      "ACCC Inspection"
    );
    const blockDir = await StorageAccessFramework.makeDirectoryAsync(
      acccDir,
      "New Delhi_Block A"
    );
    const fileUri = await StorageAccessFramework.createFileAsync(
      blockDir,
      "photo_a.jpg",
      "image/jpeg"
    );

    await StorageAccessFramework.deleteAsync(acccDir);

    await expect(
      StorageAccessFramework.readDirectoryAsync(treeUri)
    ).resolves.toEqual([]);
    await expect(
      StorageAccessFramework.readAsStringAsync(fileUri)
    ).rejects.toThrow("File not found");
  });

  it("honors the granted flag", async () => {
    __setPermissionGranted(false);

    const permission =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();

    expect(permission.granted).toBe(false);
  });

  it("rejects readDirectoryAsync on a missing directory", async () => {
    await expect(
      StorageAccessFramework.readDirectoryAsync("content://mock/missing/")
    ).rejects.toThrow("Directory not found");
  });
});
