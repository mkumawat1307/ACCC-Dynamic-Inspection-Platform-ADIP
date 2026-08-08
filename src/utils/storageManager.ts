import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/src/utils/logger";

const TREE_URI_KEY = "accc_saf_tree_uri";
const ACCC_DIR_KEY = "accc_dir_v2";
const DCIM_URI = "content://com.android.externalstorage.documents/tree/primary%3ADCIM";

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

export async function ensureTreeUri(): Promise<string> {
  if (cachedTreeUri) {
    lastTreeUriCacheHit = true;
    logger.debug("[Perf] saf treeUriCacheHit");
    return cachedTreeUri;
  }
  lastTreeUriCacheHit = false;

  AsyncStorage.removeItem("accc_saf_accc_dir").catch(() => {});

  const saved = await AsyncStorage.getItem(TREE_URI_KEY);
  if (saved) {
    cachedTreeUri = saved;
    return saved;
  }

  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(DCIM_URI);
  if (!permission.granted) {
    throw new Error("SAF permission denied");
  }

  cachedTreeUri = permission.directoryUri;
  await AsyncStorage.setItem(TREE_URI_KEY, permission.directoryUri);
  return permission.directoryUri;
}

function childName(uri: string): string {
  const raw = uri.slice(uri.lastIndexOf("/") + 1);
  const decoded = decodeURIComponent(raw);
  return decoded.slice(decoded.lastIndexOf("/") + 1);
}

async function findChildDir(parentUri: string, name: string): Promise<string | null> {
  let children: string[];
  try {
    children = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
  } catch {
    return null;
  }
  for (const child of children) {
    if (childName(child) === name) {
      return child.startsWith(parentUri) ? child : `${parentUri}/${child}`;
    }
  }
  return null;
}

async function persistCache(cacheKey: string, uri: string): Promise<void> {
  await AsyncStorage.setItem(cacheKey, uri);
  logger.debug("[Folder] cache updated");
}

export async function resolveInspectionRootDir(treeUri: string): Promise<string> {
  const cached = cachedAcccDir ?? (await AsyncStorage.getItem(ACCC_DIR_KEY));
  if (cached) {
    logger.debug("[Folder] cache hit, validating");
  }

  const existing = await findChildDir(treeUri, "ACCC Inspection");
  if (existing) {
    if (cachedAcccDir !== existing) {
      await persistCache(ACCC_DIR_KEY, existing);
    }
    cachedAcccDir = existing;
    return existing;
  }

  if (cached) {
    logger.debug("[Folder] inspection root missing, dropping stale cache");
    AsyncStorage.removeItem(ACCC_DIR_KEY).catch(() => {});
    cachedAcccDir = null;
  }

  logger.debug("[Folder] recreating inspection root");
  const created = await FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, "ACCC Inspection");
  await persistCache(ACCC_DIR_KEY, created);
  cachedAcccDir = created;
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
    logger.debug("[Folder] cache hit, validating");
  }

  const existing = await findChildDir(acccDir, projectLabel);
  if (existing) {
    logger.debug("[Folder] project folder exists");
    await AsyncStorage.setItem(projDirKey, existing);
    cachedProjectDirs.set(projectLabel, existing);
    lastProjectDirCacheHit = true;
    return existing;
  }

  if (cached) {
    logger.debug("[Folder] project folder missing");
    await AsyncStorage.removeItem(projDirKey).catch(() => {});
    cachedProjectDirs.delete(projectLabel);
    lastProjectDirCacheHit = false;
  }

  logger.debug("[Folder] recreating project folder");
  const created = await FileSystem.StorageAccessFramework.makeDirectoryAsync(acccDir, projectLabel);
  await AsyncStorage.setItem(projDirKey, created);
  cachedProjectDirs.set(projectLabel, created);
  logger.debug("[Folder] cache updated");
  lastProjectDirCacheHit = false;
  return created;
}

export async function writePhoto(
  projectDirUri: string,
  fileName: string,
  base64data: string
): Promise<string> {
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
