import { Platform } from "react-native";
import { downloadStorage } from "@/src/utils/downloadStorage";
import {
  ROOT_DIR_NAME,
  ensureRootFolder,
  ensureProjectFolder,
  writePhoto,
  deletePhoto,
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
  (downloadStorage.ensureFolder as jest.Mock).mockResolvedValue(false);
  (downloadStorage.writeBase64 as jest.Mock).mockResolvedValue("content://media/photo.jpg");
  (downloadStorage.deleteFile as jest.Mock).mockResolvedValue(true);
});

describe("ensureRootFolder", () => {
  it("logs permissionGranted, ensureRoot start/exists/ready when the root folder is new", async () => {
    const logSpy = installLogSpy();

    await ensureRootFolder();

    const lines = logLines(logSpy);
    expectLogLine(lines, "[Storage] permissionGranted=");
    expectLogLine(lines, "[Storage] ensureRoot start");
    expectLogLine(lines, `[Storage] ensureRoot exists=false`);
    expectLogLine(lines, "[Storage] ensureRoot ready");
    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("");
  });

  it("logs ensureRoot exists=true when the root folder already exists", async () => {
    (downloadStorage.ensureFolder as jest.Mock).mockResolvedValue(true);
    const logSpy = installLogSpy();

    await ensureRootFolder();

    const lines = logLines(logSpy);
    expectLogLine(lines, "[Storage] ensureRoot start");
    expectLogLine(lines, `[Storage] ensureRoot exists=true`);
    expectLogLine(lines, "[Storage] ensureRoot ready");
    expect(lines.some((l) => l.includes("ensureRoot exists=false"))).toBe(false);
  });

  it("skips the permission dialog on API >= 29", async () => {
    const platformSpy = jest.replaceProperty(Platform, "OS", "android");
    const logSpy = installLogSpy();
    try {
      await ensureRootFolder();
      const lines = logLines(logSpy);
      expectLogLine(lines, "[Storage] permissionGranted=true (MediaStore, no permission required)");
    } finally {
      platformSpy.restore();
    }
  });
});

describe("ensureProjectFolder", () => {
  it("logs ensureProject and exists=false when the project folder is new", async () => {
    const logSpy = installLogSpy();

    await ensureProjectFolder("New Delhi_Project Alpha");

    const lines = logLines(logSpy);
    expectLogLine(lines, `[Storage] ensureProject=New Delhi_Project Alpha`);
    expectLogLine(lines, `[Storage] ensureProject exists=false`);
    expectLogLine(lines, "[Storage] ensureProject ready");
    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("New Delhi_Project Alpha");
  });

  it("logs ensureProject exists=true when the project folder already has files", async () => {
    (downloadStorage.ensureFolder as jest.Mock).mockResolvedValue(true);
    const logSpy = installLogSpy();

    await ensureProjectFolder("Mumbai_Project Beta");

    const lines = logLines(logSpy);
    expectLogLine(lines, `[Storage] ensureProject=Mumbai_Project Beta`);
    expectLogLine(lines, `[Storage] ensureProject exists=true`);
    expectLogLine(lines, "[Storage] ensureProject ready");
    expect(lines.some((l) => l.includes("ensureProject exists=false"))).toBe(false);
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
