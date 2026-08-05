import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Project } from "@/src/models/Project";
import {
  canonicalProjectLabel,
  legacyProjectOnlyLabel,
  legacyStrippedLabel,
} from "@/src/utils/folderNaming";
import { logger } from "@/src/utils/logger";
import {
  ensureTreeUri,
  getProjectDir,
  resolveInspectionRootDir,
} from "@/src/utils/storageManager";

const inFlightMigrations = new Set<number>();

export interface MigrationResult {
  migratedFiles: number;
  updatedRows: number;
  legacyFoldersRemoved: number;
}

interface LegacyFolderResult {
  migratedFiles: number;
  folderRemoved: boolean;
}

const ZERO_RESULT: MigrationResult = {
  migratedFiles: 0,
  updatedRows: 0,
  legacyFoldersRemoved: 0,
};

export async function migrateProjectPhotoFolder(
  project: Project
): Promise<MigrationResult> {
  if (inFlightMigrations.size > 0) {
    logger.warn("[FolderManager] Another migration already in flight, skipping");
    return { ...ZERO_RESULT };
  }

  inFlightMigrations.add(project.ProjectID);
  try {
    return await runMigration(project);
  } finally {
    inFlightMigrations.delete(project.ProjectID);
  }
}

async function runMigration(project: Project): Promise<MigrationResult> {
  const canonical = canonicalProjectLabel(project);
  const stripped = legacyStrippedLabel(project);
  const projectOnly = legacyProjectOnlyLabel(project);

  const treeUri = await ensureTreeUri();
  const canonicalDir = await getProjectDir(treeUri, canonical);

  const candidates = [...new Set([stripped, projectOnly])].filter(
    (label) => label !== canonical
  );

  const uriMap: Record<string, string> = {};
  let migratedFiles = 0;
  let legacyFoldersRemoved = 0;

  for (const label of candidates) {
    const result = await migrateLegacyFolder(treeUri, canonicalDir, label, uriMap);
    migratedFiles += result.migratedFiles;
    if (result.folderRemoved) legacyFoldersRemoved += 1;
  }

  let updatedRows = 0;
  if (Object.keys(uriMap).length > 0) {
    updatedRows = await PhotoRepository.remapFilePaths(uriMap);
  }

  return { migratedFiles, updatedRows, legacyFoldersRemoved };
}

async function migrateLegacyFolder(
  treeUri: string,
  canonicalDir: string,
  legacyLabel: string,
  uriMap: Record<string, string>
): Promise<LegacyFolderResult> {
  const legacyDir = await resolveLegacyDir(treeUri, legacyLabel);
  if (!legacyDir) {
    return { migratedFiles: 0, folderRemoved: false };
  }

  const canonicalNames =
    await FileSystem.StorageAccessFramework.readDirectoryAsync(canonicalDir);
  const legacyNames =
    await FileSystem.StorageAccessFramework.readDirectoryAsync(legacyDir);

  const canonicalSet = new Set(canonicalNames);
  let migratedFiles = 0;

  for (const name of legacyNames) {
    if (canonicalSet.has(name)) continue;
    try {
      const oldFile = `${legacyDir}/${name}`;
      const newFile = await FileSystem.StorageAccessFramework.createFileAsync(
        canonicalDir,
        name,
        "image/jpeg"
      );
      const data = await FileSystem.StorageAccessFramework.readAsStringAsync(
        oldFile,
        { encoding: FileSystem.EncodingType.Base64 }
      );
      await FileSystem.StorageAccessFramework.writeAsStringAsync(newFile, data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      uriMap[oldFile] = newFile;
      migratedFiles += 1;
    } catch (error) {
      logger.warn("[FolderManager] Failed to copy file:", name, error);
      return { migratedFiles, folderRemoved: false };
    }
  }

  try {
    await FileSystem.StorageAccessFramework.deleteAsync(legacyDir);
  } catch (error) {
    logger.warn("[FolderManager] Failed to delete legacy folder:", legacyDir, error);
    return { migratedFiles, folderRemoved: false };
  }

  await AsyncStorage.removeItem(`proj_dir_${legacyLabel}`);
  return { migratedFiles, folderRemoved: true };
}

async function resolveLegacyDir(
  treeUri: string,
  label: string
): Promise<string | null> {
  const cacheKey = `proj_dir_${label}`;
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) {
    try {
      await FileSystem.StorageAccessFramework.readDirectoryAsync(cached);
      return cached;
    } catch {
      await AsyncStorage.removeItem(cacheKey);
    }
  }

  try {
    const rootDir = await resolveInspectionRootDir(treeUri);
    const names = await FileSystem.StorageAccessFramework.readDirectoryAsync(rootDir);
    if (names.includes(label)) {
      return `${rootDir}/${label}`;
    }
  } catch {
    return null;
  }
  return null;
}
