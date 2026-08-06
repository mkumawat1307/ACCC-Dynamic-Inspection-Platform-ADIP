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

async function verifyDir(cacheKey: string): Promise<string | null> {
  const uri = await AsyncStorage.getItem(cacheKey);
  if (!uri) return null;
  try {
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    return uri;
  } catch {
    await AsyncStorage.removeItem(cacheKey);
    return null;
  }
}

export async function resolveInspectionRootDir(treeUri: string): Promise<string> {
  if (cachedAcccDir) {
    logger.debug("[Perf] saf acccDirCacheHit");
    return cachedAcccDir;
  }

  let acccDir = await verifyDir(ACCC_DIR_KEY);
  if (!acccDir) {
    acccDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, "ACCC Inspection");
    await AsyncStorage.setItem(ACCC_DIR_KEY, acccDir);
  }
  cachedAcccDir = acccDir;
  return acccDir;
}

export async function getProjectDir(
  treeUri: string,
  projectLabel: string
): Promise<string> {
  const cachedProjDir = cachedProjectDirs.get(projectLabel);
  if (cachedProjDir) {
    lastProjectDirCacheHit = true;
    logger.debug("[Perf] saf projectDirCacheHit");
    return cachedProjDir;
  }
  lastProjectDirCacheHit = false;

  const acccDir = await resolveInspectionRootDir(treeUri);

  const projDirKey = `proj_dir_${projectLabel}`;
  let projDir = await verifyDir(projDirKey);
  if (!projDir) {
    projDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(acccDir, projectLabel);
    await AsyncStorage.setItem(projDirKey, projDir);
  }

  cachedProjectDirs.set(projectLabel, projDir);
  return projDir;
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
