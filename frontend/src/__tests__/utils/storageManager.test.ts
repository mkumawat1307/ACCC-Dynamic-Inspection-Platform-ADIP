import { Platform } from "react-native";
import { downloadStorage } from "@/src/utils/downloadStorage";
import {
  ROOT_DIR_NAME,
  ensureDownloadRoot,
  getProjectDir,
  writePhoto,
  deletePhoto,
} from "@/src/utils/storageManager";

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn(),
    writeBase64: jest.fn(),
    writeUtf8: jest.fn(),
    readBase64: jest.fn(),
    deleteFile: jest.fn(),
    findFile: jest.fn(),
  },
}));

function installLogSpy(): jest.SpyInstance {
  return jest.spyOn(console, "log").mockImplementation(() => {});
}

function logLines(spy: jest.SpyInstance): string[] {
  return spy.mock.calls.map((args) => args.join(" "));
}

function expectLogLine(lines: string[], fragment: string): void {
  expect(lines.some((l) => l.includes(fragment))).toBe(true);
}

beforeEach(() => {
  jest.clearAllMocks();
  (downloadStorage.hasFiles as jest.Mock).mockResolvedValue(false);
  (downloadStorage.writeBase64 as jest.Mock).mockResolvedValue("content://media/photo.jpg");
  (downloadStorage.deleteFile as jest.Mock).mockResolvedValue(true);
});

describe("ensureDownloadRoot", () => {
  it("logs permissionGranted, downloadExists and rootCreated when the root folder is new", async () => {
    const logSpy = installLogSpy();

    await ensureDownloadRoot();

    const lines = logLines(logSpy);
    expectLogLine(lines, "[Storage] permissionGranted=");
    expectLogLine(lines, "[Storage] downloadExists path=Download");
    expectLogLine(lines, `[Storage] rootCreated path=Download/${ROOT_DIR_NAME}`);
    expect(downloadStorage.hasFiles).toHaveBeenCalledWith("");
  });

  it("logs rootExists when the root folder already contains files", async () => {
    (downloadStorage.hasFiles as jest.Mock).mockResolvedValue(true);
    const logSpy = installLogSpy();

    await ensureDownloadRoot();

    const lines = logLines(logSpy);
    expectLogLine(lines, `[Storage] rootExists path=Download/${ROOT_DIR_NAME}`);
    expect(lines.some((l) => l.includes("[Storage] rootCreated"))).toBe(false);
  });

  it("skips the permission dialog on API >= 29", async () => {
    const platformSpy = jest.replaceProperty(Platform, "OS", "android");
    const logSpy = installLogSpy();
    try {
      await ensureDownloadRoot();
      const lines = logLines(logSpy);
      expectLogLine(lines, "[Storage] permissionGranted=true (MediaStore, no permission required)");
    } finally {
      platformSpy.restore();
    }
  });
});

describe("getProjectDir", () => {
  it("returns the relative project label and logs projectCreated when the folder is new", async () => {
    const logSpy = installLogSpy();

    const dir = await getProjectDir("New Delhi_Project Alpha");

    const lines = logLines(logSpy);
    expect(dir).toBe("New Delhi_Project Alpha");
    expectLogLine(lines, `[Storage] projectCreated path=Download/${ROOT_DIR_NAME}/New Delhi_Project Alpha`);
    expect(downloadStorage.hasFiles).toHaveBeenCalledWith("New Delhi_Project Alpha");
  });

  it("logs projectExists when the project folder already has files", async () => {
    (downloadStorage.hasFiles as jest.Mock).mockResolvedValue(true);
    const logSpy = installLogSpy();

    await getProjectDir("Mumbai_Project Beta");

    const lines = logLines(logSpy);
    expectLogLine(lines, `[Storage] projectExists path=Download/${ROOT_DIR_NAME}/Mumbai_Project Beta`);
    expect(lines.some((l) => l.includes("[Storage] projectCreated"))).toBe(false);
  });

  it("ensures the download root before checking the project folder", async () => {
    await getProjectDir("New Delhi_Project Alpha");

    const hasFilesCalls = (downloadStorage.hasFiles as jest.Mock).mock.calls;
    expect(hasFilesCalls[0]).toEqual([""]);
    expect(hasFilesCalls[1]).toEqual(["New Delhi_Project Alpha"]);
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
