import * as FileSystem from "expo-file-system/legacy";
import { closeAllDatabases, GLOBAL_DATABASE_NAME } from "../db";
import { listProjectFolders } from "./ProjectDBManager";
import {
  BACKUP_FILE_NAME,
  buildBackupDisplayPath,
  zipBase64,
  unzipBase64,
  isZipBytes,
} from "@/src/utils/backupZip";
import { logger } from "@/src/utils/logger";
import { ensureRootFolder } from "@/src/utils/storageManager";
import { downloadStorage } from "@/src/utils/downloadStorage";

export interface BackupResult {
  ok: boolean;
  message: string;
  path?: string;
}

export async function getGlobalDbFilePath(): Promise<string> {
  return `${FileSystem.documentDirectory}SQLite/${GLOBAL_DATABASE_NAME}`;
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
    await ensureRootFolder();
    const files = await collectDbFiles();
    const zip = await zipBase64(files);
    const fileUri = await downloadStorage.writeBase64("", BACKUP_FILE_NAME, "application/zip", zip);
    logger.info("[Storage:backup] path=" + fileUri);
    logger.info(`[BackupManager] Backup created at ${buildBackupDisplayPath()}`);
    return { ok: true, message: "Backup created", path: buildBackupDisplayPath() };
  } catch (e) {
    logger.error("[BackupManager] backupNow failed:", e);
    return { ok: false, message: String(e) };
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

    await restoreEntries(entries);

    logger.info("[BackupManager] Restore completed.");
    return { ok: true, message: "Restore completed. Reloading data." };
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
    logger.info("[Import] selectedUri=" + selectedUri);

    const selectedInfo = await FileSystem.getInfoAsync(selectedUri);
    if (!selectedInfo.exists) {
      const message = "Selected file does not exist";
      logger.info("[Import] restoreFailed=" + message);
      return { ok: false, message };
    }

    let sourceUri = selectedUri;
    if (selectedUri.startsWith("content://")) {
      sourceUri = `${FileSystem.cacheDirectory}${BACKUP_FILE_NAME}`;
      await FileSystem.copyAsync({ from: selectedUri, to: sourceUri });
      logger.info("[Import] copiedToCache=" + sourceUri);
      const cacheInfo = await FileSystem.getInfoAsync(sourceUri);
      logger.info("[Import] cacheExists=" + String(cacheInfo.exists));
      if (!cacheInfo.exists) {
        const message = "Failed to copy selected file to cache";
        logger.info("[Import] restoreFailed=" + message);
        return { ok: false, message };
      }
    }

    const b64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!isZipBytes(bytes)) {
      const message = "Not a valid ACCC backup file";
      logger.info("[Import] restoreFailed=" + message);
      return { ok: false, message };
    }

    const confirmed = await onConfirm();
    if (!confirmed) {
      const message = "Restore cancelled";
      logger.info("[Import] restoreFailed=" + message);
      return { ok: false, message };
    }

    logger.info("[Import] restoreStart");
    const entries = await unzipBase64(b64);
    await restoreEntries(entries);

    logger.info("[Import] restoreSuccess");
    return { ok: true, message: "Restore completed. Reloading data." };
  } catch (e) {
    logger.info("[Import] restoreFailed=" + String(e));
    return { ok: false, message: String(e) };
  }
}
