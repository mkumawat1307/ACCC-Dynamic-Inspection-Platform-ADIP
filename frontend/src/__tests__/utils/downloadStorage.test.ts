jest.mock("react-native/Libraries/Utilities/Platform", () => {
  const platform = {
    OS: "android",
    Version: 33,
    select: (spec: Record<string, unknown>) => spec.android ?? spec.default,
  };
  return { ...platform, default: platform };
});

jest.mock("@/modules/download-storage/src", () => {
  const native = {
    androidApiLevel: 33,
    renameFile: jest.fn().mockResolvedValue("content://media/renamed.jpg"),
    hasFiles: jest.fn().mockResolvedValue(false),
    ensureFolder: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://media/new.jpg"),
    writeUtf8: jest.fn().mockResolvedValue("content://media/new.txt"),
    readBase64: jest.fn().mockResolvedValue("base64"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
    getRelativePath: jest.fn().mockResolvedValue(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    ),
  };
  return {
    getDownloadStorageNative: jest.fn(() => native),
  };
});

import { getDownloadStorageNative } from "@/modules/download-storage/src";
import { downloadStorage } from "@/src/utils/downloadStorage";

describe("downloadStorage.renameFile", () => {
  it("forwards the uri and new file name to the native module", async () => {
    const native = getDownloadStorageNative()!;

    const result = await downloadStorage.renameFile(
      "content://media/sik001.jpg",
      "Sikar_SIK101_14AUG2026_112948.jpg"
    );

    expect(native.renameFile).toHaveBeenCalledWith(
      "content://media/sik001.jpg",
      "Sikar_SIK101_14AUG2026_112948.jpg"
    );
    expect(result).toBe("content://media/renamed.jpg");
  });

  it("returns null when the native module reports a missing file", async () => {
    const native = getDownloadStorageNative()!;
    (native.renameFile as jest.Mock).mockResolvedValueOnce(null);

    const result = await downloadStorage.renameFile("content://media/gone.jpg", "new.jpg");

    expect(result).toBeNull();
  });
});

describe("downloadStorage.getRelativePath", () => {
  it("forwards the content uri to the native module", async () => {
    const native = getDownloadStorageNative()!;

    const result = await downloadStorage.getRelativePath(
      "content://media/external_primary/downloads/123"
    );

    expect(native.getRelativePath).toHaveBeenCalledWith(
      "content://media/external_primary/downloads/123"
    );
    expect(result).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
  });

  it("returns null when the native module reports no relative path", async () => {
    const native = getDownloadStorageNative()!;
    (native.getRelativePath as jest.Mock).mockResolvedValueOnce(null);

    const result = await downloadStorage.getRelativePath(
      "content://media/external_primary/downloads/999"
    );

    expect(result).toBeNull();
  });
});
