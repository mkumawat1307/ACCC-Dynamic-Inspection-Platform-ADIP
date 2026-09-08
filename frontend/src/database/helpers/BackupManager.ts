import * as FileSystem from "expo-file-system/legacy";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  closeAllDatabases,
  getActiveProjectPath,
  getDatabase,
  getGlobalDatabase,
  GLOBAL_DATABASE_NAME,
  openProjectDbForBackup,
  setActiveProject,
} from "../db";
import { listProjectFolders } from "./ProjectDBManager";
import {
  BACKUP_FILE_NAME,
  buildBackupDisplayPath,
  zipBase64,
  unzipBase64,
  isZipBytes,
} from "@/src/utils/backupZip";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { logger } from "@/src/utils/logger";
import { ensureRootFolder } from "@/src/utils/storageManager";
import { downloadStorage } from "@/src/utils/downloadStorage";

export interface BackupResult {
  ok: boolean;
  message: string;
  path?: string;
}

const BASE64_CHUNK_SIZE = 0x8000;

const RESTORE_ENTRY_RE =
  /^(SQLite\/accc_global\.db(-wal|-shm)?|Projects\/[^/]+\/inspection\.db(-wal|-shm)?)$/;

const RESTORE_STAGING_DIR = `${FileSystem.cacheDirectory}accc_restore/`;
const RESTORE_EXTRACT_DIR = `${RESTORE_STAGING_DIR}extract/`;
const RESTORE_OLD_DIR = `${RESTORE_STAGING_DIR}old/`;

const SQLITE_MAGIC_HEADER = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74,
  0x20, 0x33, 0x00,
]);

function hasSqliteMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC_HEADER.length) return false;
  for (let i = 0; i < SQLITE_MAGIC_HEADER.length; i += 1) {
    if (bytes[i] !== SQLITE_MAGIC_HEADER[i]) return false;
  }
  return true;
}

function projectFolderFromPath(dbPath: string): string | null {
  const m = dbPath.match(/\/Projects\/([^/]+)\/inspection\.db$/);
  return m ? m[1] : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

let snapshotCounter = 0;

let backupInProgress = false;

async function restoreActiveDatabase(): Promise<void> {
  await getDatabase();
}

function nextSnapshotUri(): string {
  const cache = FileSystem.cacheDirectory ?? "";
  const cacheDir = cache.endsWith("/") ? cache : `${cache}/`;
  snapshotCounter += 1;
  return `${cacheDir}accc_backup_${Date.now()}_${snapshotCounter}_${Math.floor(
    Math.random() * 0xffffff
  )}.db`;
}

function toSqlStringLiteral(path: string): string {
  return `'${path.replace(/'/g, "''")}'`;
}

async function readSnapshotBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function snapshotDatabase(
  db: SQLiteDatabase,
  label: string
): Promise<Uint8Array> {
  if (await db.isInTransactionAsync()) {
    throw new Error(`Cannot back up ${label}: a write transaction is in progress`);
  }
  const snapshotUri = nextSnapshotUri();
  const nativePath = snapshotUri.replace(/^file:\/\//, "");
  try {
    await db.execAsync(`VACUUM INTO ${toSqlStringLiteral(nativePath)}`);
    return await readSnapshotBytes(snapshotUri);
  } finally {
    await FileSystem.deleteAsync(snapshotUri, { idempotent: true }).catch(() => {});
  }
}

export async function backupNow(): Promise<BackupResult> {
  if (backupInProgress) {
    return { ok: false, message: "Backup already in progress" };
  }
  backupInProgress = true;
  try {
    await ensureRootFolder();
    const files: Record<string, Uint8Array> = {};

    const globalDb = await getGlobalDatabase();
    files[`SQLite/${GLOBAL_DATABASE_NAME}`] = await snapshotDatabase(
      globalDb,
      "the global database"
    );

    const folders = await listProjectFolders();
    for (const folder of folders) {
      const projectDbPath = `${FileSystem.documentDirectory}Projects/${folder}/inspection.db`;
      const info = await FileSystem.getInfoAsync(projectDbPath);
      if (!info.exists) {
        throw new Error(`Project database is missing: ${projectDbPath}`);
      }
      const projectDb = await openProjectDbForBackup(projectDbPath);
      files[`Projects/${folder}/inspection.db`] = await snapshotDatabase(
        projectDb,
        `project "${folder}"`
      );
    }

    const zip = await zipBase64(files);
    await downloadStorage.writeBase64("", BACKUP_FILE_NAME, "application/zip", zip);
    return { ok: true, message: "Backup created", path: buildBackupDisplayPath() };
  } catch (e) {
    logger.error("[BackupManager] backupNow failed:", e);
    return { ok: false, message: String(e) };
  } finally {
    backupInProgress = false;
    await restoreActiveDatabase().catch(() => {});
  }
}

export async function findBackupFile(): Promise<string | null> {
  try {
    await ensureRootFolder();
    return await downloadStorage.findFile("", BACKUP_FILE_NAME);
  } catch {
    return null;
  }
}

export async function validateBackupFile(
  fileUri: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const b64 = await downloadStorage.readBase64(fileUri);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!isZipBytes(bytes)) {
      return { ok: false, message: "Not a valid ACCC backup file" };
    }
    const entries = await unzipBase64(b64);
    return { ok: true, message: `Found ${Object.keys(entries).length} file(s)` };
  } catch {
    return { ok: false, message: "Not a valid ACCC backup file" };
  }
}

async function restoreEntries(entries: Record<string, Uint8Array>): Promise<void> {
  for (const [relPath, bytes] of Object.entries(entries)) {
    if (!relPath.endsWith(".db")) continue;
    if (!hasSqliteMagicHeader(bytes)) {
      throw new Error(`Backup entry is not a valid SQLite database: ${relPath}`);
    }
  }

  const restoredBases = new Set<string>();
  const restoredFolders = new Set<string>();
  for (const relPath of Object.keys(entries)) {
    const m = relPath.match(/^(.*\.db)(-wal|-shm)?$/);
    if (m) restoredBases.add(m[1]);
    const f = relPath.match(/^Projects\/([^/]+)\//);
    if (f) restoredFolders.add(f[1]);
  }

  await FileSystem.deleteAsync(RESTORE_STAGING_DIR, { idempotent: true }).catch(() => {});
  await FileSystem.makeDirectoryAsync(RESTORE_EXTRACT_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(RESTORE_OLD_DIR, { intermediates: true });

  for (const [relPath, bytes] of Object.entries(entries)) {
    const target = `${RESTORE_EXTRACT_DIR}${relPath}`;
    await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf("/")), {
      intermediates: true,
    });
    await FileSystem.writeAsStringAsync(target, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const onDiskFolders = await listProjectFolders();
  await closeAllDatabases();

  let placed: string[] = [];
  const preserved: { from: string; to: string }[] = [];

  try {
    for (const base of restoredBases) {
      for (const suffix of ["", "-wal", "-shm"]) {
        const rel = base + suffix;
        const live = `${FileSystem.documentDirectory}${rel}`;
        const info = await FileSystem.getInfoAsync(live);
        if (!info.exists) continue;
        const old = `${RESTORE_OLD_DIR}${rel}`;
        await FileSystem.makeDirectoryAsync(old.slice(0, old.lastIndexOf("/")), {
          intermediates: true,
        });
        await FileSystem.moveAsync({ from: live, to: old });
        preserved.push({ from: live, to: old });
      }
    }

    await FileSystem.makeDirectoryAsync(`${RESTORE_OLD_DIR}Projects/`, {
      intermediates: true,
    });
    for (const folder of onDiskFolders) {
      if (restoredFolders.has(folder)) continue;
      const live = `${FileSystem.documentDirectory}Projects/${folder}/`;
      const old = `${RESTORE_OLD_DIR}Projects/${folder}/`;
      await FileSystem.moveAsync({ from: live, to: old });
      preserved.push({ from: live, to: old });
    }

    for (const relPath of Object.keys(entries)) {
      const live = `${FileSystem.documentDirectory}${relPath}`;
      await FileSystem.makeDirectoryAsync(live.slice(0, live.lastIndexOf("/")), {
        intermediates: true,
      });
      await FileSystem.moveAsync({ from: `${RESTORE_EXTRACT_DIR}${relPath}`, to: live });
      placed.push(live);
    }

    await FileSystem.deleteAsync(RESTORE_STAGING_DIR, { idempotent: true }).catch(() => {});
  } catch (e) {
    for (const live of placed) {
      await FileSystem.deleteAsync(live, { idempotent: true }).catch(() => {});
    }
    for (let i = preserved.length - 1; i >= 0; i -= 1) {
      const entry = preserved[i];
      await FileSystem.moveAsync({ from: entry.to, to: entry.from }).catch(() => {});
    }
    await FileSystem.deleteAsync(RESTORE_STAGING_DIR, { idempotent: true }).catch(() => {});
    throw e;
  }
}

function validateRestoreEntries(entries: Record<string, Uint8Array>): {
  ok: boolean;
  message?: string;
} {
  const entryNames = Object.keys(entries);

  for (const name of entryNames) {
    if (!RESTORE_ENTRY_RE.test(name) || name.includes("..") || name.includes("\\")) {
      return { ok: false, message: `Backup contains an invalid entry: ${name}` };
    }
  }

  const hasGlobalDb = entryNames.includes(`SQLite/${GLOBAL_DATABASE_NAME}`);
  if (!hasGlobalDb) {
    return {
      ok: false,
      message: "Backup is missing the global database (SQLite/accc_global.db)",
    };
  }

  const projectFolders = new Set<string>();
  for (const name of entryNames) {
    const m = name.match(/^Projects\/([^/]+)\/inspection\.db$/);
    if (m) projectFolders.add(m[1]);
  }
  for (const name of entryNames) {
    const m = name.match(/^Projects\/([^/]+)\//);
    if (m && !projectFolders.has(m[1])) {
      return {
        ok: false,
        message: `Project folder "${m[1]}" is missing inspection.db`,
      };
    }
  }

  return { ok: true };
}

async function reloadAfterRestore(): Promise<number> {
  await getGlobalDatabase();
  const projects = await ProjectRepository.getProjects();
  return projects.length;
}

async function performRestore(entries: Record<string, Uint8Array>): Promise<BackupResult> {
  const structure = validateRestoreEntries(entries);
  if (!structure.ok) return { ok: false, message: structure.message ?? "Invalid backup" };

  const restoredFolders = new Set<string>();
  for (const relPath of Object.keys(entries)) {
    const m = relPath.match(/^Projects\/([^/]+)\//);
    if (m) restoredFolders.add(m[1]);
  }

  const activePath = getActiveProjectPath();

  try {
    await restoreEntries(entries);
  } catch (e) {
    if (activePath) {
      await setActiveProject(activePath).catch(() => {});
    }
    logger.error("[BackupManager] restore failed:", e);
    return { ok: false, message: String(e) };
  }

  try {
    const count = await reloadAfterRestore();
    if (activePath) {
      const folder = projectFolderFromPath(activePath);
      if (folder && restoredFolders.has(folder)) {
        await setActiveProject(activePath);
      }
    }
    return { ok: true, message: `Restore completed. ${count} project(s) loaded.` };
  } catch (e) {
    logger.error("[BackupManager] reload after restore failed:", e);
    return { ok: false, message: String(e) };
  }
}

export async function restoreBackup(
  onConfirm: () => Promise<boolean>
): Promise<BackupResult> {
  try {
    const fileUri = await findBackupFile();
    if (!fileUri) {
      return { ok: false, message: `No backup found at ${buildBackupDisplayPath()}` };
    }
    const validated = await validateBackupFile(fileUri);
    if (!validated.ok) return { ok: false, message: validated.message };
    const confirmed = await onConfirm();
    if (!confirmed) return { ok: false, message: "Restore cancelled" };

    const b64 = await downloadStorage.readBase64(fileUri);
    const entries = await unzipBase64(b64);

    return await performRestore(entries);
  } catch (e) {
    logger.error("[BackupManager] restoreBackup failed:", e);
    return { ok: false, message: String(e) };
  }
}

export async function restoreBackupFromUri(
  selectedUri: string,
  onConfirm: () => Promise<boolean>
): Promise<BackupResult> {
  try {
    // Android's ZIP file picker returns content:// URIs that the legacy
    // FileSystem cannot always stat. Always copy them to a local temp file
    // first, then validate the temp file (a reliable file:// path).
    let sourceUri = selectedUri;
    if (selectedUri.startsWith("content://")) {
      sourceUri = `${FileSystem.cacheDirectory}${BACKUP_FILE_NAME}`;
      try {
        await FileSystem.copyAsync({ from: selectedUri, to: sourceUri });
      } catch (e) {
        const message = `Failed to copy selected file: ${String(e)}`;
        return { ok: false, message };
      }
      const cacheInfo = await FileSystem.getInfoAsync(sourceUri);
      if (!cacheInfo.exists) {
        const message = "Failed to copy selected file to cache";
        return { ok: false, message };
      }
    } else {
      const selectedInfo = await FileSystem.getInfoAsync(selectedUri);
      if (!selectedInfo.exists) {
        const message = "Selected file does not exist";
        return { ok: false, message };
      }
    }

    const b64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!isZipBytes(bytes)) {
      const message = "Not a valid ACCC backup file";
      return { ok: false, message };
    }

    const confirmed = await onConfirm();
    if (!confirmed) {
      const message = "Restore cancelled";
      return { ok: false, message };
    }

    const entries = await unzipBase64(b64);

    return await performRestore(entries);
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
