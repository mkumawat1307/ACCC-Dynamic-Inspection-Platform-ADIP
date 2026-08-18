import { Platform } from "react-native";
import { downloadStorage } from "@/src/utils/downloadStorage";
import {
  ROOT_DIR_NAME,
  ensureRootFolder,
  ensureProjectFolder,
  writePhoto,
  deletePhoto,
  buildPhotoFolderDisplayPath,
  hasProjectFolderFiles,
} from "@/src/utils/storageManager";

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn(),
    ensureFolder: jest.fn(),
    writeBase64: jest.fn(),
    writeUtf8: jest.fn(),
    readBase64: jest.fn(),
    deleteFile: jest.fn(),
    findFile: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (downloadStorage.ensureFolder as jest.Mock).mockResolvedValue(false);
  (downloadStorage.writeBase64 as jest.Mock).mockResolvedValue("content://media/photo.jpg");
  (downloadStorage.deleteFile as jest.Mock).mockResolvedValue(true);
});

describe("ensureRootFolder", () => {
  it("calls ensureRootFolder without error", async () => {
    await ensureRootFolder();

    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("");
  });

  it("calls ensureFolder without error when the root folder already exists", async () => {
    (downloadStorage.ensureFolder as jest.Mock).mockResolvedValue(true);

    await ensureRootFolder();

    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("");
  });

  it("skips the permission dialog on API >= 29", async () => {
    const platformSpy = jest.replaceProperty(Platform, "OS", "android");
    try {
      await ensureRootFolder();
      expect(downloadStorage.ensureFolder).toHaveBeenCalled();
    } finally {
      platformSpy.restore();
    }
  });
});

describe("ensureProjectFolder", () => {
  it("calls ensureFolder with the project label when the project folder is new", async () => {
    await ensureProjectFolder("New Delhi_Project Alpha");

    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("New Delhi_Project Alpha");
  });

  it("calls ensureFolder when the project folder already has files", async () => {
    (downloadStorage.ensureFolder as jest.Mock).mockResolvedValue(true);

    await ensureProjectFolder("Mumbai_Project Beta");

    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("Mumbai_Project Beta");
  });

  it("ensures the download root before checking the project folder", async () => {
    await ensureProjectFolder("New Delhi_Project Alpha");

    const ensureFolderCalls = (downloadStorage.ensureFolder as jest.Mock).mock.calls;
    expect(ensureFolderCalls[0]).toEqual([""]);
    expect(ensureFolderCalls[1]).toEqual(["New Delhi_Project Alpha"]);
  });
});

describe("writePhoto", () => {
  it("writes the photo as base64 image/jpeg into the project label folder", async () => {
    const uri = await writePhoto("New Delhi_Project Alpha", "photo.jpg", "BASE64");

    expect(uri).toBe("content://media/photo.jpg");
    expect(downloadStorage.writeBase64).toHaveBeenCalledWith(
      "New Delhi_Project Alpha",
      "photo.jpg",
      "image/jpeg",
      "BASE64"
    );
  });
});

describe("deletePhoto", () => {
  it("deletes the photo by URI", async () => {
    await deletePhoto("content://media/photo.jpg");

    expect(downloadStorage.deleteFile).toHaveBeenCalledWith("content://media/photo.jpg");
  });

  it("swallows delete errors", async () => {
    (downloadStorage.deleteFile as jest.Mock).mockRejectedValueOnce(new Error("gone"));

    await expect(deletePhoto("content://media/photo.jpg")).resolves.toBeUndefined();
  });
});

describe("photo folder helpers", () => {
  it("builds the display path for a project label", () => {
    expect(buildPhotoFolderDisplayPath("Jaipur_AMC 2026")).toBe(
      "Download/ACCC Dynamic Inspection/Jaipur_AMC 2026/"
    );
  });

  it("falls back to the root display path for an empty label", () => {
    expect(buildPhotoFolderDisplayPath("")).toBe("Download/ACCC Dynamic Inspection/");
  });

  it("hasProjectFolderFiles forwards to downloadStorage.hasFiles", async () => {
    (downloadStorage.hasFiles as jest.Mock).mockResolvedValueOnce(true);

    await expect(hasProjectFolderFiles("Jaipur_AMC 2026")).resolves.toBe(true);
    expect(downloadStorage.hasFiles).toHaveBeenCalledWith("Jaipur_AMC 2026");
  });
});

describe("removed photo-folder-rename surface", () => {
  it("no longer exposes moveProjectFolder or rename error classes", async () => {
    const storageManager = require("@/src/utils/storageManager");
    expect(storageManager.moveProjectFolder).toBeUndefined();
    expect(storageManager.PhotoFolderConflictError).toBeUndefined();
    expect(storageManager.PhotoFolderRenameError).toBeUndefined();
  });
});
