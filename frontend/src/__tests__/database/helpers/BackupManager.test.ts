jest.mock("@/src/database/db", () => ({
  GLOBAL_DATABASE_NAME: "accc_global.db",
  closeAllDatabases: jest.fn().mockResolvedValue(undefined),
  getGlobalDatabase: jest.fn().mockResolvedValue(undefined),
  setActiveProject: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/database/helpers/ProjectDBManager", () => ({
  listProjectFolders: jest.fn().mockResolvedValue(["Alpha", "Beta"]),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockFsEntries = new Map<string, { type: "file" | "dir"; content: string }>();

jest.mock("expo-file-system/legacy", () => {
  const StorageAccessFramework = {
    requestDirectoryPermissionsAsync: jest.fn(async () => {
      if (!mockFsEntries.has("content://mock/tree")) {
        mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
      }
      return { granted: true, directoryUri: "content://mock/tree" };
    }),
    readDirectoryAsync: jest.fn(async (dirUri: string) => {
      const entry = mockFsEntries.get(dirUri);
      if (entry === undefined || entry.type !== "dir") {
        throw new Error(`Directory not found: ${dirUri}`);
      }
      const names: string[] = [];
      for (const key of mockFsEntries.keys()) {
        if (key.startsWith(dirUri + "/")) {
          const name = key.slice(dirUri.length + 1).split("/")[0];
          if (name.length > 0 && !names.includes(name)) names.push(name);
        }
      }
      return names;
    }),
    makeDirectoryAsync: jest.fn(async (parentUri: string, dirName: string) => {
      const parent = mockFsEntries.get(parentUri);
      if (parent === undefined || parent.type !== "dir") {
        throw new Error(`Directory not found: ${parentUri}`);
      }
      const uri = `${parentUri}/${dirName}`;
      mockFsEntries.set(uri, { type: "dir", content: "" });
      return uri;
    }),
    createFileAsync: jest.fn(async (parentUri: string, fileName: string) => {
      const parent = mockFsEntries.get(parentUri);
      if (parent === undefined || parent.type !== "dir") {
        throw new Error(`Directory not found: ${parentUri}`);
      }
      const uri = `${parentUri}/${fileName}`;
      if (mockFsEntries.has(uri)) {
        throw new Error(`File already exists: ${uri}`);
      }
      mockFsEntries.set(uri, { type: "file", content: "" });
      return uri;
    }),
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
    deleteAsync: jest.fn(async (fileUri: string) => {
      mockFsEntries.delete(fileUri);
      for (const key of Array.from(mockFsEntries.keys())) {
        if (key.startsWith(fileUri) && key !== fileUri) mockFsEntries.delete(key);
      }
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
  };

  return {
    documentDirectory: "file:///mock/documents/",
    cacheDirectory: "file:///mock/cache/",
    EncodingType: { UTF8: "utf8", Base64: "base64" },
    writeAsStringAsync: StorageAccessFramework.writeAsStringAsync,
    readAsStringAsync: StorageAccessFramework.readAsStringAsync,
    getInfoAsync: StorageAccessFramework.getInfoAsync,
    makeDirectoryAsync: jest.fn(async (dirUri: string) => {
      if (!mockFsEntries.has(dirUri)) mockFsEntries.set(dirUri, { type: "dir", content: "" });
    }),
    deleteAsync: StorageAccessFramework.deleteAsync,
    readDirectoryAsync: jest.fn(async () => []),
    StorageAccessFramework,
    __resetFsState: () => mockFsEntries.clear(),
  };
});

import { closeAllDatabases } from "@/src/database/db";
import { listProjectFolders } from "@/src/database/helpers/ProjectDBManager";
import * as FileSystem from "expo-file-system/legacy";
import { unzipBase64, isZipBytes } from "@/src/utils/backupZip";
import { resetStorageCaches } from "@/src/utils/storageManager";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DOC = "file:///mock/documents/";

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

describe("BackupManager backupNow", () => {
  let BackupManager: typeof import("@/src/database/helpers/BackupManager");

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsEntries.clear();
    resetStorageCaches();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (AsyncStorage.removeItem as jest.Mock).mockClear();
    (FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock).mockImplementation(async () => {
      if (!mockFsEntries.has("content://mock/tree")) {
        mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
      }
      return { granted: true, directoryUri: "content://mock/tree" };
    });
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

    const zipUri = "content://mock/tree/ACCC Dynamic Inspection/accc_backup.zip";
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(zipUri);
    const entries = await unzipBase64(written);

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

  it("includes global DB sidecars when present", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("SQLite/accc_global.db-wal", "GLOBAL-WAL");
    seedSidecar("SQLite/accc_global.db-shm", "GLOBAL-SHM");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    const result = await BackupManager.backupNow();
    expect(result.ok).toBe(true);

    const zipUri = "content://mock/tree/ACCC Dynamic Inspection/accc_backup.zip";
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(zipUri);
    const entries = await unzipBase64(written);

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

  it("returns an error message when SAF permission is denied", async () => {
    (FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      directoryUri: "",
    });

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("permission");
  });

  it("succeeds when the global DB file is absent", async () => {
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    const zipUri = "content://mock/tree/ACCC Dynamic Inspection/accc_backup.zip";
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(zipUri);
    const entries = await unzipBase64(written);
    expect(entries["SQLite/accc_global.db"]).toBeUndefined();
    expect(entries["Projects/Alpha/inspection.db"]).toBeDefined();
  });

  it("writes a real zip that satisfies isZipBytes", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");

    await BackupManager.backupNow();

    const zipUri = "content://mock/tree/ACCC Dynamic Inspection/accc_backup.zip";
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(zipUri);
    const bytes = Uint8Array.from(atob(written), (c) => c.charCodeAt(0));
    expect(isZipBytes(bytes)).toBe(true);
  });

  it("overwrites an existing backup file", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    const backupDirUri = "content://mock/tree/ACCC Dynamic Inspection";
    mockFsEntries.set(backupDirUri, { type: "dir", content: "" });
    const existingUri = `${backupDirUri}/accc_backup.zip`;
    mockFsEntries.set(existingUri, { type: "file", content: "OLD" });

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(existingUri);
    expect(written).not.toBe("OLD");
  });

  it("creates the ACCC root under a granted SAF directory and writes the backup there", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    const grantedUri = "content://mock/tree/ACCC Dynamic Inspection";
    mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
    mockFsEntries.set(grantedUri, { type: "dir", content: "" });
    (FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      directoryUri: grantedUri,
    });

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(FileSystem.StorageAccessFramework.makeDirectoryAsync).toHaveBeenCalledWith(
      grantedUri,
      "ACCC Dynamic Inspection"
    );
    const zipUri = `${grantedUri}/ACCC Dynamic Inspection/accc_backup.zip`;
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(zipUri);
    const entries = await unzipBase64(written);
    expect(entries["SQLite/accc_global.db"]).toBeDefined();
  });

  it("reuses a valid persisted backup tree uri without requesting the picker", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    const backupDirUri = "content://mock/tree/ACCC Dynamic Inspection";
    mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
    mockFsEntries.set(backupDirUri, { type: "dir", content: "" });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("content://mock/tree");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
    const zipUri = `${backupDirUri}/accc_backup.zip`;
    const written = await FileSystem.StorageAccessFramework.readAsStringAsync(zipUri);
    expect(written).toBeTruthy();
  });

  it("requests the picker again when the persisted uri is invalid", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("content://stale/tree");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("accc_saf_tree_uri");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "accc_saf_tree_uri",
      expect.stringContaining("content://mock/tree")
    );
  });

  it("requests the picker when no uri is persisted", async () => {
    seedGlobalDb("GLOBAL");
    seedSidecar("Projects/Alpha/inspection.db", "ALPHA-DB");
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "accc_saf_tree_uri",
      expect.stringContaining("content://mock/tree")
    );
  });
});

describe("BackupManager restore", () => {
  let BackupManager: typeof import("@/src/database/helpers/BackupManager");
  const BACKUP_URI = "content://mock/tree/ACCC Dynamic Inspection/accc_backup.zip";
  const BACKUP_DIR_URI = "content://mock/tree/ACCC Dynamic Inspection";

  async function seedBackupZip(entries: Record<string, number[]>): Promise<void> {
    const files: Record<string, Uint8Array> = {};
    for (const [name, nums] of Object.entries(entries)) {
      files[name] = Uint8Array.from(nums);
    }
    const { zipBase64 } = require("@/src/utils/backupZip");
    mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
    mockFsEntries.set(BACKUP_DIR_URI, { type: "dir", content: "" });
    mockFsEntries.set(BACKUP_URI, { type: "file", content: await zipBase64(files) });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsEntries.clear();
    resetStorageCaches();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (AsyncStorage.removeItem as jest.Mock).mockClear();
    (FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock).mockImplementation(async () => {
      if (!mockFsEntries.has("content://mock/tree")) {
        mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
      }
      return { granted: true, directoryUri: "content://mock/tree" };
    });
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
    mockFsEntries.set("content://mock/tree", { type: "dir", content: "" });
    mockFsEntries.set(BACKUP_DIR_URI, { type: "dir", content: "" });
    mockFsEntries.set(BACKUP_URI, { type: "file", content: "not-a-zip" });

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