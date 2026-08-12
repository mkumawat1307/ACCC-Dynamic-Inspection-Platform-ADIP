import * as FileSystem from "expo-file-system/legacy";
import { closeAllDatabases, GLOBAL_DATABASE_NAME } from "../db";
import { listProjectFolders } from "./ProjectDBManager";
import {
  BACKUP_DIR_NAME,
  BACKUP_FILE_NAME,
  buildBackupDisplayPath,
  zipBase64,
  unzipBase64,
  isZipBytes,
} from "@/src/utils/backupZip";
import { logger } from "@/src/utils/logger";

export interface BackupResult {
  ok: boolean;
  message: string;
  path?: string;
}

export const DOWNLOAD_TREE_URI =
  "content://com.android.externalstorage.documents/tree/primary%3ADownload";

export async function getGlobalDbFilePath(): Promise<string> {
  return `${FileSystem.documentDirectory}SQLite/${GLOBAL_DATABASE_NAME}`;
}

async function ensureBackupDirUri(treeUri: string): Promise<string> {
  const names = await FileSystem.StorageAccessFramework.readDirectoryAsync(treeUri);
  if (names.includes(BACKUP_DIR_NAME)) return `${treeUri}/${BACKUP_DIR_NAME}`;
  return FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, BACKUP_DIR_NAME);
}

async function collectDbFiles(): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const globalBase = `SQLite/${GLOBAL_DATABASE_NAME}`;
  const globalRels = [globalBase, `${globalBase}-wal`, `${globalBase}-shm`];
  for (const rel of globalRels) {
    try {
      const b64 = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}${rel}`,
        { encoding: FileSystem.EncodingType.Base64 }
      );
      files[rel] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      // global DB / sidecar absent — skip, non-fatal
    }
  }
  const folders = await listProjectFolders();
  for (const folder of folders) {
    const rels = [
      `Projects/${folder}/inspection.db`,
      `Projects/${folder}/inspection.db-wal`,
      `Projects/${folder}/inspection.db-shm`,
    ];
    for (const rel of rels) {
      try {
        const b64 = await FileSystem.readAsStringAsync(
          `${FileSystem.documentDirectory}${rel}`,
          { encoding: FileSystem.EncodingType.Base64 }
        );
        files[rel] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        // sidecar/file absent — skip
      }
    }
  }
  return files;
}

export async function backupNow(): Promise<BackupResult> {
  try {
    const permission =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
        DOWNLOAD_TREE_URI
      );
    if (!permission.granted) {
      return { ok: false, message: "Storage permission denied" };
    }
    const dirUri = await ensureBackupDirUri(permission.directoryUri);
    const existingUri = `${dirUri}/${BACKUP_FILE_NAME}`;
    const existing = await FileSystem.getInfoAsync(existingUri);
    if (existing.exists) {
      await FileSystem.StorageAccessFramework.deleteAsync(existingUri);
    }
    const files = await collectDbFiles();
    const zip = await zipBase64(files);
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      dirUri,
      BACKUP_FILE_NAME,
      "application/zip"
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(
      fileUri,
      zip,
      { encoding: FileSystem.EncodingType.Base64 }
    );
    logger.info(`[BackupManager] Backup created at ${buildBackupDisplayPath()}`);
    return { ok: true, message: "Backup created", path: buildBackupDisplayPath() };
  } catch (e) {
    logger.error("[BackupManager] backupNow failed:", e);
    return { ok: false, message: String(e) };
  }
}

export async function findBackupFile(): Promise<string | null> {
  try {
    const permission =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
        DOWNLOAD_TREE_URI
      );
    if (!permission.granted) return null;
    const dirUri = await ensureBackupDirUri(permission.directoryUri);
    const names = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
    if (!names.includes(BACKUP_FILE_NAME)) return null;
    return `${dirUri}/${BACKUP_FILE_NAME}`;
  } catch {
    return null;
  }
}

export async function validateBackupFile(
  fileUri: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const b64 = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
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

    const b64 = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const entries = await unzipBase64(b64);

    await closeAllDatabases();

    const restoredFolders = new Set<string>();
    for (const [relPath, bytes] of Object.entries(entries)) {
      const target = `${FileSystem.documentDirectory}${relPath}`;
      const parent = target.slice(0, target.lastIndexOf("/"));
      await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
      const outB64 = btoa(String.fromCharCode(...bytes));
      await FileSystem.writeAsStringAsync(target, outB64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const m = relPath.match(/^Projects\/([^/]+)\//);
      if (m) restoredFolders.add(m[1]);
    }

    const onDisk = await listProjectFolders();
    for (const folder of onDisk) {
      if (!restoredFolders.has(folder)) {
        await FileSystem.deleteAsync(`${FileSystem.documentDirectory}Projects/${folder}/`);
      }
    }

    logger.info("[BackupManager] Restore completed.");
    return { ok: true, message: "Restore completed. Reloading data." };
  } catch (e) {
    logger.error("[BackupManager] restoreBackup failed:", e);
    return { ok: false, message: String(e) };
  }
}