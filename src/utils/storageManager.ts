import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TREE_URI_KEY = "accc_saf_tree_uri";
const ACCC_DIR_KEY = "accc_dir_v2";
const DCIM_URI = "content://com.android.externalstorage.documents/tree/primary%3ADCIM";

export async function ensureTreeUri(): Promise<string> {
  AsyncStorage.removeItem("accc_saf_accc_dir").catch(() => {});

  const saved = await AsyncStorage.getItem(TREE_URI_KEY);
  if (saved) return saved;

  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(DCIM_URI);
  if (!permission.granted) {
    throw new Error("SAF permission denied");
  }

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
  let acccDir = await verifyDir(ACCC_DIR_KEY);
  if (!acccDir) {
    acccDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, "ACCC Inspection");
    await AsyncStorage.setItem(ACCC_DIR_KEY, acccDir);
  }
  return acccDir;
}

export async function getProjectDir(
  treeUri: string,
  projectLabel: string
): Promise<string> {
  const acccDir = await resolveInspectionRootDir(treeUri);

  const projDirKey = `proj_dir_${projectLabel}`;
  let projDir = await verifyDir(projDirKey);
  if (!projDir) {
    projDir = await FileSystem.StorageAccessFramework.makeDirectoryAsync(acccDir, projectLabel);
    await AsyncStorage.setItem(projDirKey, projDir);
  }

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
