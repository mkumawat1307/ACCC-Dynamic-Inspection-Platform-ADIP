import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/src/utils/logger";

const TREE_URI_KEY = "accc_saf_tree_uri";
const ACCC_DIR_KEY = "accc_dir_v2";
const STORAGE_INIT_KEY = "accc_storage_init_done";
const DOWNLOAD_URI = "content://com.android.externalstorage.documents/tree/primary%3ADownload";
const ROOT_DIR_NAME = "ACCC Dynamic Inspection";

let cachedTreeUri: string | null = null;
let cachedAcccDir: string | null = null;
const cachedProjectDirs = new Map<string, string>();

let lastTreeUriCacheHit = false;
let lastProjectDirCacheHit = false;

export function resetStorageCaches(): void {
  cachedTreeUri = null;
  cachedAcccDir = null;
  cachedProjectDirs.clear();
}

export function getSafCacheState(): { treeUriHit: boolean; projectDirHit: boolean } {
  return { treeUriHit: lastTreeUriCacheHit, projectDirHit: lastProjectDirCacheHit };
}

async function testWritable(uri: string): Promise<boolean> {
  try {
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    const testDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(uri, ".accc_write_test");
    await FileSystem.StorageAccessFramework.deleteAsync(testDir);
    return true;
  } catch {
    return false;
  }
}

export function joinSafUri(parentUri: string, childName: string): string {
  // Remove trailing slash from parent
  const parent = parentUri.endsWith("/") ? parentUri.slice(0, -1) : parentUri;
  // Remove leading slash from child
  const child = childName.startsWith("/") ? childName.slice(1) : childName;
  // Join with single slash
  return parent + "/" + child;
}

export async function findChildDir(parentUri: string, name: string): Promise<string | null> {
  let children: string[];
  try {
    children = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
  } catch {
    return null;
  }
  for (const child of children) {
    const childName = child.slice(child.lastIndexOf("/") + 1);
    if (childName === name) {
      if (child.startsWith(parentUri)) {
        return child;
      }
      // Use normalized URI construction
      return joinSafUri(parentUri, childName);
    }
  }
  return null;
}

async function persistCache(cacheKey: string, uri: string): Promise<void> {
  await AsyncStorage.setItem(cacheKey, uri);
  logger.debug("[Storage:saf] cache updated");
}

export async function ensureTreeUri(): Promise<string> {
  if (cachedTreeUri) {
    lastTreeUriCacheHit = true;
    logger.debug("[Perf] saf treeUriCacheHit");
    return cachedTreeUri;
  }
  lastTreeUriCacheHit = false;

  // Check if we have a persisted URI
  const saved = await AsyncStorage.getItem(TREE_URI_KEY);
  if (saved) {
    logger.debug("[Storage:saf] persisted=" + saved);
    const writable = await testWritable(saved);
    logger.debug("[Storage:saf] valid=" + writable);
    if (writable) {
      cachedTreeUri = saved;
      logger.debug("[Storage:saf] selected=" + saved);
      return saved;
    }
    logger.debug("[Storage:saf] clearing invalid uri");
    await AsyncStorage.removeItem(TREE_URI_KEY).catch(() => {});
  }

  // Request permission on first use
  logger.info("[Storage:saf] requesting");
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(DOWNLOAD_URI);
  logger.info("[Storage:saf] granted=" + permission.granted);
  if (!permission.granted) {
    throw new Error("Storage permission denied");
  }

  // Validate the granted URI
  logger.debug("[Storage:saf] testing=" + permission.directoryUri);
  const writable = await testWritable(permission.directoryUri);
  logger.debug("[Storage:saf] valid=" + writable);
  if (!writable) {
    throw new Error("Selected directory is not writable");
  }

  // Persist the granted URI
  cachedTreeUri = permission.directoryUri;
  await AsyncStorage.setItem(TREE_URI_KEY, permission.directoryUri);
  logger.info("[Storage:saf] selected=" + permission.directoryUri);

  // Create the root folder automatically using SAF API
  logger.debug("[Storage:saf] creating root folder via SAF");
  const rootFolder = await FileSystem.StorageAccessFramework.makeDirectoryAsync(permission.directoryUri, ROOT_DIR_NAME);
  await persistCache(ACCC_DIR_KEY, rootFolder);
  cachedAcccDir = rootFolder;
  logger.info("[Storage:create] path=" + rootFolder);

  return permission.directoryUri;
}

export async function resolveInspectionRootDir(treeUri: string): Promise<string> {
  const cached = cachedAcccDir ?? (await AsyncStorage.getItem(ACCC_DIR_KEY));
  if (cached) {
    logger.debug("[Storage:saf] root cache hit, validating");
  }

  const existing = await findChildDir(treeUri, ROOT_DIR_NAME);
  if (existing) {
    if (cachedAcccDir !== existing) {
      await persistCache(ACCC_DIR_KEY, existing);
    }
    cachedAcccDir = existing;
    logger.info("[Storage:check] path=" + existing);
    return existing;
  }

  if (cached) {
    logger.debug("[Storage:saf] root missing, dropping stale cache");
    await AsyncStorage.removeItem(ACCC_DIR_KEY).catch(() => {});
    cachedAcccDir = null;
  }

  logger.debug("[Storage:saf] recreating root");
  const created = await FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, ROOT_DIR_NAME);
  await persistCache(ACCC_DIR_KEY, created);
  cachedAcccDir = created;
  logger.info("[Storage:create] path=" + created);
  return created;
}

export async function getProjectDir(
  treeUri: string,
  projectLabel: string
): Promise<string> {
  const acccDir = await resolveInspectionRootDir(treeUri);
  const projDirKey = `proj_dir_${projectLabel}`;

  const cached = cachedProjectDirs.get(projectLabel) ?? (await AsyncStorage.getItem(projDirKey));
  if (cached) {
    logger.debug("[Storage:saf] project cache hit, validating");
  }

  logger.debug("[Storage:check] path=" + acccDir + "/" + projectLabel);
  const existing = await findChildDir(acccDir, projectLabel);
  if (existing) {
    logger.debug("[Storage:saf] project folder exists");
    await AsyncStorage.setItem(projDirKey, existing);
    cachedProjectDirs.set(projectLabel, existing);
    lastProjectDirCacheHit = true;
    logger.info("[Storage:photo] path=" + existing);
    return existing;
  }

  if (cached) {
    logger.debug("[Storage:saf] project folder missing");
    await AsyncStorage.removeItem(projDirKey).catch(() => {});
    cachedProjectDirs.delete(projectLabel);
    lastProjectDirCacheHit = false;
  }

  logger.debug("[Storage:saf] creating project folder");
  const created = await FileSystem.StorageAccessFramework.makeDirectoryAsync(acccDir, projectLabel);
  await AsyncStorage.setItem(projDirKey, created);
  cachedProjectDirs.set(projectLabel, created);
  logger.info("[Storage:create] path=" + created);
  logger.info("[Storage:photo] path=" + created);
  lastProjectDirCacheHit = false;
  return created;
}

export async function writePhoto(
  projectDirUri: string,
  fileName: string,
  base64data: string
): Promise<string> {
  logger.info("[Storage:photo] path=" + projectDirUri + "/" + fileName);
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    projectDirUri, fileName, "image/jpeg"
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, base64data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

export async function deletePhoto(fileUri: string): Promise<void> {
  try {
    await FileSystem.StorageAccessFramework.deleteAsync(fileUri);
  } catch {}
}

export async function initializeStorage(): Promise<string> {
  const alreadyDone = await AsyncStorage.getItem(STORAGE_INIT_KEY);
  logger.info("[Storage:init] firstRun=" + (alreadyDone === "true" ? "false" : "true"));

  const treeUri = await ensureTreeUri();
  const rootDir = await resolveInspectionRootDir(treeUri);

  if (alreadyDone !== "true") {
    logger.info("[Storage:init] rootCreated=" + rootDir);
    await AsyncStorage.setItem(STORAGE_INIT_KEY, "true");
  }

  return rootDir;
}