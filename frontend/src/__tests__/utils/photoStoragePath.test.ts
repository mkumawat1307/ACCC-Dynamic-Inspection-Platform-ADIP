jest.mock("@/src/utils/storageManager", () => ({
  PHOTO_ROOT_DISPLAY: "Download/ACCC Dynamic Inspection",
}));
jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: { getRelativePath: jest.fn() },
}));

import { downloadStorage } from "@/src/utils/downloadStorage";
import {
  deriveStoragePathFromFilePath,
  resolvePhotoStoragePath,
} from "@/src/utils/photoStoragePath";
import { Photo } from "@/src/models/Photo";

function basePhoto(overrides: Partial<Photo>): Photo {
  return {
    InspectionID: 1,
    PhotoType: "Pole",
    FileName: "photo.jpg",
    FilePath: "",
    Latitude: null,
    Longitude: null,
    CapturedAt: null,
    Remarks: null,
    ...overrides,
  };
}

describe("deriveStoragePathFromFilePath", () => {
  it("extracts the project folder from a percent-encoded legacy file:// path", () => {
    expect(
      deriveStoragePathFromFilePath(
        "file:///storage/emulated/0/Download/ACCC%20Dynamic%20Inspection/Jaipur_AMC%202026/photo.jpg"
      )
    ).toBe("Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/");
  });

  it("handles an unencoded legacy file:// path", () => {
    expect(
      deriveStoragePathFromFilePath(
        "file:///storage/emulated/0/Download/ACCC Dynamic Inspection/Mumbai_Project Beta/photo.jpg"
      )
    ).toBe("Download/ACCC Dynamic Inspection/Mumbai_Project Beta/");
  });

  it("returns null for a path outside the download root", () => {
    expect(deriveStoragePathFromFilePath("file:///sdcard/Pictures/photo.jpg")).toBeNull();
  });

  it("returns null for a file:// path with no folder segment", () => {
    expect(
      deriveStoragePathFromFilePath(
        "file:///storage/emulated/0/Download/ACCC%20Dynamic%20Inspection/photo.jpg"
      )
    ).toBeNull();
  });

  it("returns null for non-file URIs", () => {
    expect(deriveStoragePathFromFilePath("content://media/downloads/123")).toBeNull();
  });
});

describe("resolvePhotoStoragePath", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the stored StoragePath when present", async () => {
    const photo = basePhoto({
      FilePath: "content://media/downloads/1",
      StoragePath: "Download/ACCC Dynamic Inspection/Old_Label/",
    });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBe(
      "Download/ACCC Dynamic Inspection/Old_Label/"
    );
    expect(downloadStorage.getRelativePath).not.toHaveBeenCalled();
  });

  it("derives a legacy file:// path when StoragePath is missing", async () => {
    const photo = basePhoto({
      FilePath:
        "file:///storage/emulated/0/Download/ACCC%20Dynamic%20Inspection/Jaipur_AMC%202026/photo.jpg",
    });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBe(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
    expect(downloadStorage.getRelativePath).not.toHaveBeenCalled();
  });

  it("looks up MediaStore RELATIVE_PATH for a content:// URI when StoragePath is missing", async () => {
    (downloadStorage.getRelativePath as jest.Mock).mockResolvedValueOnce(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
    const photo = basePhoto({ FilePath: "content://media/external_primary/downloads/123" });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBe(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
    expect(downloadStorage.getRelativePath).toHaveBeenCalledWith(
      "content://media/external_primary/downloads/123"
    );
  });

  it("returns null when the MediaStore lookup returns null (does not invent a location)", async () => {
    (downloadStorage.getRelativePath as jest.Mock).mockResolvedValueOnce(null);
    const photo = basePhoto({ FilePath: "content://media/external_primary/downloads/999" });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBeNull();
  });

  it("returns null for an unknown URI scheme", async () => {
    const photo = basePhoto({ FilePath: "https://example.com/photo.jpg" });
    await expect(resolvePhotoStoragePath(photo)).resolves.toBeNull();
    expect(downloadStorage.getRelativePath).not.toHaveBeenCalled();
  });
});
