jest.mock("@/src/database/db", () => ({
  GLOBAL_DATABASE_NAME: "accc_global.db",
  closeAllDatabases: jest.fn().mockResolvedValue(undefined),
  getGlobalDatabase: jest.fn().mockResolvedValue(undefined),
  setActiveProject: jest.fn().mockResolvedValue(undefined),
  getDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/database/helpers/ProjectDBManager", () => ({
  listProjectFolders: jest.fn().mockResolvedValue(["Alpha", "Beta"]),
}));

jest.mock("@/src/database/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjects: jest.fn().mockResolvedValue([]),
  },
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
    ensureFolder: jest.fn(async (relativePath: string) => {
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

type DbHandle = {
  execAsync: jest.Mock;
  isInTransactionAsync: jest.Mock;
};

function makeDbHandle(snapshotPayload: string): DbHandle {
  return {
    execAsync: jest.fn(async (sql: string) => {
      const match = /^VACUUM INTO '([^']+)'$/.exec(sql);
      if (!match) throw new Error(`Unexpected SQL from handle: ${sql}`);
      const nativePath = match[1].replace(/''/g, "'");
      mockFsEntries.set(`file://${nativePath}`, {
        type: "file",
        content: toB64(Array.from(snapshotPayload, (c) => c.charCodeAt(0))),
      });
    }),
    isInTransactionAsync: jest.fn(async () => false),
  };
}

function storedBackupB64(): string {
  const value = mockDownloadStore.get(BACKUP_STORE_KEY);
  if (value === undefined) throw new Error("No backup stored");
  return value;
}

function storedBackupAbsent(): boolean {
  return !mockDownloadStore.has(BACKUP_STORE_KEY);
}

describe("BackupManager backupNow", () => {
  let BackupManager: typeof import("@/src/database/helpers/BackupManager");

  const projectHandles = new Map<string, DbHandle>();
  let globalHandle: DbHandle;
  let activeProjectPath: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFsEntries.clear();
    mockDownloadStore.clear();
    projectHandles.clear();
    activeProjectPath = null;

    globalHandle = makeDbHandle("GLOBAL-CONTENT");
    projectHandles.set(`${DOC}Projects/Alpha/inspection.db`, makeDbHandle("ALPHA-CONTENT"));
    projectHandles.set(`${DOC}Projects/Beta/inspection.db`, makeDbHandle("BETA-CONTENT"));
    mockFsEntries.set(`${DOC}Projects/Alpha/inspection.db`, { type: "file", content: "DUMMY" });
    mockFsEntries.set(`${DOC}Projects/Beta/inspection.db`, { type: "file", content: "DUMMY" });

    const dbModule = require("@/src/database/db");
    (dbModule.getGlobalDatabase as jest.Mock).mockResolvedValue(globalHandle);
    (dbModule.setActiveProject as jest.Mock).mockImplementation(
      async (projectDbPath: string) => {
        activeProjectPath = projectDbPath;
      }
    );
    (dbModule.getDatabase as jest.Mock).mockImplementation(async () => {
      if (activeProjectPath === null) throw new Error("No active project selected");
      const handle = projectHandles.get(activeProjectPath);
      if (!handle) throw new Error(`No handle for ${activeProjectPath}`);
      return handle;
    });

    (listProjectFolders as jest.Mock).mockResolvedValue(["Alpha", "Beta"]);
    BackupManager = require("@/src/database/helpers/BackupManager");
  });

  function snapshotTargets(): string[] {
    const handles = [globalHandle, ...Array.from(projectHandles.values())];
    return handles.flatMap((handle) =>
      handle.execAsync.mock.calls.map((call) => {
        const sql = call[0] as string;
        return sql.match(/^VACUUM INTO '([^']+)'$/)?.[1] ?? "";
      })
    );
  }

  it("creates a zip from live database snapshots and never includes WAL/SHM sidecars", async () => {
    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Backup created");
    expect(closeAllDatabases).not.toHaveBeenCalled();

    const entries = await unzipBase64(storedBackupB64());
    expect(Object.keys(entries).sort()).toEqual([
      "Projects/Alpha/inspection.db",
      "Projects/Beta/inspection.db",
      "SQLite/accc_global.db",
    ]);

    expect(Array.from(entries["SQLite/accc_global.db"])).toEqual(
      Array.from("GLOBAL-CONTENT", (c) => c.charCodeAt(0))
    );
    expect(Array.from(entries["Projects/Alpha/inspection.db"])).toEqual(
      Array.from("ALPHA-CONTENT", (c) => c.charCodeAt(0))
    );
    expect(Array.from(entries["Projects/Beta/inspection.db"])).toEqual(
      Array.from("BETA-CONTENT", (c) => c.charCodeAt(0))
    );
  });

  it("snapshots every live handle with VACUUM INTO and never reads project DB files", async () => {
    await BackupManager.backupNow();

    const dbModule = require("@/src/database/db");
    expect(dbModule.getGlobalDatabase).toHaveBeenCalledTimes(1);
    expect(dbModule.setActiveProject).toHaveBeenNthCalledWith(
      1,
      `${DOC}Projects/Alpha/inspection.db`
    );
    expect(dbModule.setActiveProject).toHaveBeenNthCalledWith(
      2,
      `${DOC}Projects/Beta/inspection.db`
    );
    expect(dbModule.getDatabase).toHaveBeenCalledTimes(2);

    const sqls = [globalHandle, ...Array.from(projectHandles.values())].flatMap((handle) =>
      handle.execAsync.mock.calls.map((call) => call[0] as string)
    );
    expect(sqls).toHaveLength(3);
    for (const sql of sqls) {
      expect(sql).toMatch(/^VACUUM INTO '\/mock\/cache\/accc_backup_[^']+\.db'$/);
    }

    const readPaths = (FileSystem.readAsStringAsync as jest.Mock).mock.calls.map(
      (call) => call[0] as string
    );
    expect(readPaths.some((p) => p.startsWith(`${DOC}SQLite`))).toBe(false);
    expect(readPaths.some((p) => p.startsWith(`${DOC}Projects`))).toBe(false);
  });

  it("isolates projects: each project entry contains only its own snapshot", async () => {
    await BackupManager.backupNow();

    function text(bytes: Uint8Array): string {
      return String.fromCharCode(...Array.from(bytes));
    }

    const entries = await unzipBase64(storedBackupB64());
    const alpha = text(entries["Projects/Alpha/inspection.db"]);
    const beta = text(entries["Projects/Beta/inspection.db"]);
    const global = text(entries["SQLite/accc_global.db"]);

    expect(alpha).toBe("ALPHA-CONTENT");
    expect(beta).toBe("BETA-CONTENT");
    expect(new Set([alpha, beta, global]).size).toBe(3);
  });

  it("uses a unique temp snapshot per database and cleans all temp files up", async () => {
    await BackupManager.backupNow();

    const targets = snapshotTargets();
    expect(new Set(targets).size).toBe(3);
    for (const key of mockFsEntries.keys()) {
      expect(key).not.toContain("accc_backup_");
    }
    for (const target of targets) {
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`file://${target}`, {
        idempotent: true,
      });
    }
  });

  it("takes the global snapshot from its live handle, not from the file on disk", async () => {
    mockFsEntries.set(`${DOC}SQLite/accc_global.db`, { type: "file", content: "OLD" });

    const result = await BackupManager.backupNow();
    expect(result.ok).toBe(true);

    const entries = await unzipBase64(storedBackupB64());
    expect(Array.from(entries["SQLite/accc_global.db"])).toEqual(
      Array.from("GLOBAL-CONTENT", (c) => c.charCodeAt(0))
    );
  });

  it("fails explicitly when a listed project folder is missing its inspection.db", async () => {
    (listProjectFolders as jest.Mock).mockResolvedValue(["Ghost"]);

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing");
    expect(storedBackupAbsent()).toBe(true);
    expect(downloadStorage.writeBase64).not.toHaveBeenCalled();
    const dbModule = require("@/src/database/db");
    expect(dbModule.setActiveProject).not.toHaveBeenCalled();
  });

  it("fails atomically when a snapshot fails — no backup and no temp files left behind", async () => {
    globalHandle.execAsync.mockRejectedValueOnce(new Error("VACUUM failed: disk I/O error"));

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("disk I/O error");
    expect(storedBackupAbsent()).toBe(true);
    expect(listProjectFolders).not.toHaveBeenCalled();
    expect(closeAllDatabases).not.toHaveBeenCalled();
    for (const key of mockFsEntries.keys()) {
      expect(key).not.toContain("accc_backup_");
    }
  });

  it("aborts when a database has a write transaction in progress", async () => {
    globalHandle.isInTransactionAsync.mockResolvedValueOnce(true);

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("transaction");
    expect(storedBackupAbsent()).toBe(true);
    expect(listProjectFolders).not.toHaveBeenCalled();
  });

  it("writes the backup zip straight to Download root without a folder picker", async () => {
    await BackupManager.backupNow();

    expect(downloadStorage.writeBase64).toHaveBeenCalledWith(
      "",
      "accc_backup.zip",
      "application/zip",
      expect.any(String)
    );
    expect(downloadStorage.ensureFolder).toHaveBeenCalledWith("");
  });

  it("returns an error message when the storage layer is unavailable", async () => {
    (downloadStorage.writeBase64 as jest.Mock).mockRejectedValueOnce(
      new Error("Storage permission denied")
    );

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("permission");
  });

  it("writes a real zip that satisfies isZipBytes", async () => {
    await BackupManager.backupNow();

    const bytes = Uint8Array.from(atob(storedBackupB64()), (c) => c.charCodeAt(0));
    expect(isZipBytes(bytes)).toBe(true);
  });

  it("overwrites an existing backup file", async () => {
    mockDownloadStore.set(BACKUP_STORE_KEY, "OLD");

    const result = await BackupManager.backupNow();

    expect(result.ok).toBe(true);
    expect(mockDownloadStore.has(BACKUP_STORE_KEY)).toBe(true);
    expect(mockDownloadStore.get(BACKUP_STORE_KEY)).not.toBe("OLD");
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

  it("fails when a picked file:// URI does not exist", async () => {
    const missingUri = "file:///mock/downloads/missing.zip";

    const result = await BackupManager.restoreBackupFromUri(missingUri, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("does not exist");
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it("fails when a content:// pick cannot be copied to temp", async () => {
    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Failed to copy selected file");
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: CONTENT_URI,
      to: CACHE_URI,
    });
  });

  it("copies a content:// pick to cache, validates, and restores", async () => {
    await seedPickedZip({
      "SQLite/accc_global.db": [1, 2, 3, 4],
      "Projects/Alpha/inspection.db": [9, 8, 7],
    });
    const dbModule = require("@/src/database/db");

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(true);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: CONTENT_URI,
      to: CACHE_URI,
    });
    expect(dbModule.closeAllDatabases).toHaveBeenCalled();

    const globalB64 = await FileSystem.readAsStringAsync(`${DOC}SQLite/accc_global.db`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(Uint8Array.from(atob(globalB64), (c) => c.charCodeAt(0))).toEqual(
      new Uint8Array([1, 2, 3, 4])
    );
  });

  it("restores directly from a file:// URI without copying", async () => {
    const localUri = "file:///mock/downloads/accc_backup.zip";
    const { zipBase64 } = require("@/src/utils/backupZip");
    mockFsEntries.set(localUri, {
      type: "file",
      content: await zipBase64({ "SQLite/accc_global.db": Uint8Array.from([7, 7]) }),
    });

    const result = await BackupManager.restoreBackupFromUri(localUri, async () => true);

    expect(result.ok).toBe(true);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
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
    logSpy.mockRestore();
  });

  it("rejects a zip without the global database before writing anything", async () => {
    await seedPickedZip({ "Projects/Alpha/inspection.db": [9, 8, 7] });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing the global database");
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
    expect(mockFsEntries.has(`${DOC}Projects/Alpha/inspection.db`)).toBe(false);
    logSpy.mockRestore();
  });

  it("rejects a project folder entry without inspection.db", async () => {
    await seedPickedZip({
      "SQLite/accc_global.db": [1, 2, 3, 4],
      "Projects/Alpha/inspection.db-wal": [9, 8, 7],
    });

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing inspection.db");
    expect(mockFsEntries.has(`${DOC}Projects/Alpha/inspection.db-wal`)).toBe(false);
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
  });

  it("rejects a zip with a path traversal entry before writing anything", async () => {
    await seedPickedZip({
      "SQLite/accc_global.db": [1, 2, 3],
      "../evil": [4],
    });

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("invalid entry");
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
    expect(mockFsEntries.has(`${DOC}evil`)).toBe(false);
  });

  it("rejects a zip with an entry outside the whitelist", async () => {
    await seedPickedZip({
      "SQLite/accc_global.db": [1, 2, 3],
      "shared_prefs/evil.xml": [4],
      "Projects/Beta/../../secret.db": [5],
    });

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("invalid entry");
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
    expect(mockFsEntries.has(`${DOC}shared_prefs/evil.xml`)).toBe(false);
  });

  it("rejects a zip with a backslash entry name", async () => {
    await seedPickedZip({
      "SQLite/accc_global.db": [1, 2, 3],
      "Projects\\Alpha\\inspection.db": [9, 8, 7],
    });

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("invalid entry");
    expect(mockFsEntries.has(`${DOC}SQLite/accc_global.db`)).toBe(false);
  });

  it("restores a large database file without stack overflows", async () => {
    const big = new Uint8Array(300000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    await seedPickedZip({
      "SQLite/accc_global.db": Array.from(big),
      "Projects/Alpha/inspection.db": [9, 8, 7],
    });

    const result = await BackupManager.restoreBackupFromUri(CONTENT_URI, async () => true);

    expect(result.ok).toBe(true);
    const stored = await FileSystem.readAsStringAsync(`${DOC}SQLite/accc_global.db`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const restored = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    expect(restored.length).toBe(big.length);
    expect(restored[123456]).toBe(big[123456]);
  });
});
