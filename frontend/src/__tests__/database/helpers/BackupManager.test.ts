jest.mock("@/src/database/db", () => ({
  GLOBAL_DATABASE_NAME: "accc_global.db",
  closeAllDatabases: jest.fn().mockResolvedValue(undefined),
  getGlobalDatabase: jest.fn().mockResolvedValue(undefined),
  setActiveProject: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/database/helpers/ProjectDBManager", () => ({
  listProjectFolders: jest.fn().mockResolvedValue(["Alpha", "Beta"]),
}));

const mockFsEntries = new Map<string, { type: "file" | "dir"; content: string }>();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn(async (fileUri: string, contents: string) => {
    const existing = mockFsEntries.get(fileUri);
    mockFsEntries.set(fileUri, {
      type: existing ? existing.type : "file",
      content: contents,
    });
  }),
  readAsStringAsync: jest.fn(async (fileUri: string) => {
    const entry = mockFsEntries.get(fileUri);
    if (entry === undefined) throw new Error(`File not found: ${fileUri}`);
    return entry.content;
  }),
  getInfoAsync: jest.fn(async (fileUri: string) => {
    const entry = mockFsEntries.get(fileUri);
    if (entry === undefined) return { exists: false, isDirectory: false };
    return {
      exists: true,
      isDirectory: entry.type === "dir",
      size: entry.content.length,
    };
  }),
  makeDirectoryAsync: jest.fn(async (dirUri: string) => {
    if (!mockFsEntries.has(dirUri)) mockFsEntries.set(dirUri, { type: "dir", content: "" });
  }),
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    const source = mockFsEntries.get(from);
    if (source === undefined) throw new Error(`File not found: ${from}`);
    mockFsEntries.set(to, { type: "file", content: source.content });
  }),
  deleteAsync: jest.fn(async (fileUri: string) => {
    mockFsEntries.delete(fileUri);
    for (const key of Array.from(mockFsEntries.keys())) {
      if (key.startsWith(fileUri) && key !== fileUri) mockFsEntries.delete(key);
    }
  }),
  readDirectoryAsync: jest.fn(async () => []),
  __resetFsState: () => mockFsEntries.clear(),
}));

const mockDownloadStore = new Map<string, string>();

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn(async (relativePath: string) => {
      const prefix = `Download/ACCC Dynamic Inspection/${relativePath ? relativePath + "/" : ""}`;
      for (const key of mockDownloadStore.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    }),
    writeBase64: jest.fn(
      async (relativePath: string, fileName: string, _mimeType: string, base64: string) => {
        const key = `Download/ACCC Dynamic Inspection/${relativePath ? relativePath + "/" : ""}${fileName}`;
        mockDownloadStore.set(key, base64);
        return `content://media/${key}`;
      }
    ),
    writeUtf8: jest.fn(
      async (relativePath: string, fileName: string, _mimeType: string, text: string) => {
        const key = `Download/ACCC Dynamic Inspection/${relativePath ? relativePath + "/" : ""}${fileName}`;
        mockDownloadStore.set(key, btoa(text));
        return `content://media/${key}`;
      }
    ),
    readBase64: jest.fn(async (uri: string) => {
      const key = uri.replace(/^content:\/\/media\//, "");
      const value = mockDownloadStore.get(key);
      if (value === undefined) throw new Error(`File not found: ${uri}`);
      return value;
    }),
    deleteFile: jest.fn(async (uri: string) =>
      mockDownloadStore.delete(uri.replace(/^content:\/\/media\//, ""))
    ),
    findFile: jest.fn(async (relativePath: string, fileName: string) => {
      const key = `Download/ACCC Dynamic Inspection/${relativePath ? relativePath + "/" : ""}${fileName}`;
      return mockDownloadStore.has(key) ? `content://media/${key}` : null;
    }),
  },
}));

import { closeAllDatabases } from "@/src/database/db";
import { listProjectFolders } from "@/src/database/helpers/ProjectDBManager";
import * as FileSystem from "expo-file-system/legacy";
import { unzipBase64, isZipBytes } from "@/src/utils/backupZip";
import { downloadStorage } from "@/src/utils/downloadStorage";

const DOC = "file:///mock/documents/";
const BACKUP_STORE_KEY = "Download/ACCC Dynamic Inspection/accc_backup.zip";
const BACKUP_URI = "content://media/Download/ACCC Dynamic Inspection/accc_backup.zip";

function toB64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function seedGlobalDb(winningText: string): void {
  mockFsEntries.set(`${DOC}SQLite/accc_global.db`, {
    type: "file",
    content: toB64(Array.from(winningText, (c) => c.charCodeAt(0))),
  });
}

function seedSidecar(rel: string, content: string): void {
  mockFsEntries.set(`${DOC}${rel}`, {
    type: "file",
    content: toB64(Array.from(content, (c) => c.charCodeAt(0))),
  });
}

function storedBackupB64(): string {
  const value = mockDownloadStore.get(BACKUP_STORE_KEY);
  if (value === undefined) throw new Error("No backup stored");
  return value;
}

describe("BackupManager backupNow", () => {
  let BackupManager: typeof import("@/src/database/helpers/BackupManager");

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsEntries.clear();
    mockDownloadStore.clear();
    (listProjectFolders as jest.Mock).mockResolvedValue(["Alpha", "Beta"]);
    BackupManager = require("@/src/database/helpers/BackupManager");
  });

  it("creates a zip from global + project DB files, databases stay open", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    seedSidecar("Projects/Alpha/inspection.db-wal", "ALPHA-WAL");
    seedSidecar("Projects/Beta/inspection.db", "BETA-DB");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Backup created");
    expect(closeAllDatabases).not.toHaveBeenCalled();

    const entries = await unzipBase64(storedBackupB64());

    expect(entries["SQLite/accc_global.db"]).toBeDefined();
    expect(Array.from(entries["SQLite/accc_global.db"])).toEqual(
      Array.from("GLOBAL", (c) => c.charCodeAt(0))
    );
    expect(Array.from(entries["Projects/Alpha/inspection.db"])).toEqual(
      Array.from("ALPHA-DB", (c) => c.charCodeAt(0))
    );
    expect(Array.from(entries["Projects/Alpha/inspection.db-wal"])).toEqual(
      Array.from("ALPHA-WAL", (c) => c.charCodeAt(0))
    );
    expect(Array.from(entries["Projects/Beta/inspection.db"])).toEqual(
      Array.from("BETA-DB", (c) => c.charCodeAt(0))
    );
    expect(entries["Projects/Beta/inspection.db-wal"]).toBeUndefined();
  });

  it("writes the backup zip straight to Download/ACCC Dynamic Inspection without a folder picker", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(downloadStorage.writeBase64).toHaveBeenCalledWith(
      "",
      "accc_backup.zip",
      "application/zip",
      expect.any(String)
    );
    expect(downloadStorage.hasFiles).toHaveBeenCalledWith("");
  });

  it("includes global DB sidecars when present", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("SQLite/accc_global.db-wal", "GLOBAL-WAL");
    seedSidecar("SQLite/accc_global.db-shm", "GLOBAL-SHM");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    const result = await BackupManager.backupNow();
    expect(result.ok).toBe(true);

    const entries = await unzipBase64(storedBackupB64());

    expect(Array.from(entries["SQLite/accc_global.db-wal"])).toEqual(
      Array.from("GLOBAL-WAL", (c) => c.charCodeAt(0))
    );
    expect(Array.from(entries["SQLite/accc_global.db-shm"])).toEqual(
      Array.from("GLOBAL-SHM", (c) => c.charCodeAt(0))
    );
  });

  it("does not call getGlobalDatabase or setActiveProject during backup", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    seedSidecar("Projects/Beta/inspection.db", "BETA-DB");

    const dbModule = require("@/src/database/db");
    await BackupManager.backupNow();

    expect(dbModule.getGlobalDatabase).not.toHaveBeenCalled();
    expect(dbModule.setActiveProject).not.toHaveBeenCalled();
  });

  it("returns an error message when the storage layer is unavailable", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    (downloadStorage.writeBase64 as jest.Mock).mockRejectedValueOnce(
      new Error("Storage permission denied")
    );

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("permission");
  });

  it("succeeds when the global DB file is absent", async () => {
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    const entries = await unzipBase64(storedBackupB64());
    expect(entries["SQLite/accc_global.db"]).toBeUndefined();
    expect(entries["Projects/Alpha/inspection.db"]).toBeDefined();
  });

  it("writes a real zip that satisfies isZipBytes", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    await BackupManager.backupNow();

    const bytes = Uint8Array.from(atob(storedBackupB64()), (c) => c.charCodeAt(0));
    expect(isZipBytes(bytes)).toBe(true);
  });

  it("overwrites an existing backup file", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    mockDownloadStore.set(BACKUP_STORE_KEY, "OLD");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(storedBackupB64()).not.toBe("OLD");
  });
});

describe("BackupManager restore", () => {
  let BackupManager: typeof import("@/src/database/helpers/BackupManager");

  async function seedBackupZip(entries: Record<string, number[]>): Promise<void> {
    const files: Record<string, Uint8Array> = {};
    for (const [name, nums] of Object.entries(entries)) {
      files[name] = Uint8Array.from(nums);
    }
    const { zipBase64 } = require("@/src/utils/backupZip");
    mockDownloadStore.set(BACKUP_STORE_KEY, await zipBase64(files));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsEntries.clear();
    mockDownloadStore.clear();
    (listProjectFolders as jest.Mock).mockResolvedValue(["Alpha", "Beta"]);
    BackupManager = require("@/src/database/helpers/BackupManager");
  });

  it("findBackupFile returns null when the backup file is absent", async () => {
    const uri = await BackupManager.findBackupFile();
    expect(uri).toBeNull();
  });

  it("findBackupFile returns the file URI when present", async () => {
    await seedBackupZip({ "SQLite/accc_global.db": [1, 2, 3] });
    const uri = await BackupManager.findBackupFile();
    expect(uri).toBe(BACKUP_URI);
  });

  it("validateBackupFile rejects a garbage file", async () => {
    mockDownloadStore.set(BACKUP_STORE_KEY, "not-a-zip");

    const result = await BackupManager.validateBackupFile(BACKUP_URI);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Not a valid");
  });

  it("validateBackupFile accepts a real zip", async () => {
    await seedBackupZip({ "SQLite/accc_global.db": [1, 2, 3] });
    const result = await BackupManager.validateBackupFile(BACKUP_URI);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("1 file");
  });

  it("restoreBackup aborts when onConfirm returns false and writes nothing", async () => {
    await seedBackupZip({ "SQLite/accc_global.db": [9] });
    const result = await BackupManager.restoreBackup(async () => false);
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("cancel");
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
  });

  it("restoreBackup extracts entries and closes DBs before writing", async () => {
    await seedBackupZip({
      "SQLite/accc_global.db": [1, 2, 3, 4],
      "Projects/Alpha/inspection.db": [9, 8, 7],
    });
    const dbModule = require("@/src/database/db");

    const result = await BackupManager.restoreBackup(async () => true);

    expect(result.ok).toBe(true);
    expect(dbModule.closeAllDatabases).toHaveBeenCalled();

    const globalB64 = await FileSystem.readAsStringAsync(`${DOC}SQLite/accc_global.db`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(Uint8Array.from(atob(globalB64), (c) => c.charCodeAt(0))).toEqual(
      new Uint8Array([1, 2, 3, 4])
    );

    const alphaB64 = await FileSystem.readAsStringAsync(
      `${DOC}Projects/Alpha/inspection.db`,
      { encoding: FileSystem.EncodingType.Base64 }
    );
    expect(Uint8Array.from(atob(alphaB64), (c) => c.charCodeAt(0))).toEqual(
      new Uint8Array([9, 8, 7])
    );
  });

  it("restoreBackup deletes project folders absent from the backup", async () => {
    await seedBackupZip({ "SQLite/accc_global.db": [5] });
    mockFsEntries.set(`${DOC}Projects/Gamma/inspection.db`, {
      type: "file",
      content: "GAMMA",
    });
    mockFsEntries.set(`${DOC}Projects/Gamma/inspection.db-wal`, {
      type: "file",
      content: "GAMMA-WAL",
    });
    (listProjectFolders as jest.Mock).mockResolvedValue(["Gamma"]);

    const result = await BackupManager.restoreBackup(async () => true);

    expect(result.ok).toBe(true);
    expect(mockFsEntries.has(`${DOC}Projects/Gamma/inspection.db`)).toBe(false);
    expect(mockFsEntries.has(`${DOC}Projects/Gamma/inspection.db-wal`)).toBe(false);
  });

  it("restoreBackup reports when the backup file is missing", async () => {
    const result = await BackupManager.restoreBackup(async () => true);
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("no backup found");
  });
});

describe("BackupManager restoreBackupFromUri", () => {
  let BackupManager: typeof import("@/src/database/helpers/BackupManager");

  const CONTENT_URI =
    "content://com.android.providers.downloads.documents/document/1021";
  const CACHE_URI = `${FileSystem.cacheDirectory}accc_backup.zip`;

  async function seedPickedZip(entries: Record<string, number[]>): Promise<void> {
    const files: Record<string, Uint8Array> = {};
    for (const [name, nums] of Object.entries(entries)) {
      files[name] = Uint8Array.from(nums);
    }
    const { zipBase64 } = require("@/src/utils/backupZip");
    mockFsEntries.set(CONTENT_URI, {
      type: "file",
      content: await zipBase64(files),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsEntries.clear();
    mockDownloadStore.clear();
    (listProjectFolders as jest.Mock).mockResolvedValue(["Alpha", "Beta"]);
    BackupManager = require("@/src/database/helpers/BackupManager");
  });

  it("logs the selected URI and fails when the picked file does not exist", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("does not exist");
    expect(logSpy).toHaveBeenCalledWith("[Import] selectedUri=" + CONTENT_URI);
    expect(logSpy).toHaveBeenCalledWith(
      "[Import] restoreFailed=Selected file does not exist"
    );
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("copies a content:// pick to cache, validates, and restores", async () => {
    await seedPickedZip({
      "SQLite/accc_global.db": [1, 2, 3, 4],
      "Projects/Alpha/inspection.db": [9, 8, 7],
    });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const dbModule = require("@/src/database/db");

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(true);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: CONTENT_URI,
      to: CACHE_URI,
    });
    expect(dbModule.closeAllDatabases).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("[Import] selectedUri=" + CONTENT_URI);
    expect(logSpy).toHaveBeenCalledWith("[Import] copiedToCache=" + CACHE_URI);
    expect(logSpy).toHaveBeenCalledWith("[Import] cacheExists=true");
    expect(logSpy).toHaveBeenCalledWith("[Import] restoreStart");
    expect(logSpy).toHaveBeenCalledWith("[Import] restoreSuccess");

    const globalB64 = await FileSystem.readAsStringAsync(`${DOC}SQLite/accc_global.db`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(Uint8Array.from(atob(globalB64), (c) => c.charCodeAt(0))).toEqual(
      new Uint8Array([1, 2, 3, 4])
    );
    logSpy.mockRestore();
  });

  it("restores directly from a file:// URI without copying", async () => {
    const localUri = "file:///mock/downloads/accc_backup.zip";
    const { zipBase64 } = require("@/src/utils/backupZip");
    mockFsEntries.set(localUri, {
      type: "file",
      content: await zipBase64({ "SQLite/accc_global.db": Uint8Array.from([7, 7]) }),
    });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await BackupManager.restoreBackupFromUri(localUri, async () => true);

    expect(result.ok).toBe(true);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("[Import] selectedUri=" + localUri);
    expect(logSpy).toHaveBeenCalledWith("[Import] restoreSuccess");
    logSpy.mockRestore();
  });

  it("rejects a picked file that is not a zip", async () => {
    mockFsEntries.set(CONTENT_URI, {
      type: "file",
      content: btoa("not-a-zip"),
    });

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Not a valid");
  });

  it("aborts when the user does not confirm and writes nothing", async () => {
    await seedPickedZip({ "SQLite/accc_global.db": [9] });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => false);

    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("cancel");
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("[Import] restoreFailed=Restore cancelled");
    logSpy.mockRestore();
  });
});
