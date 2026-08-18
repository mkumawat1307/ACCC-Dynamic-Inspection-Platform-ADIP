import { PermissionsAndroid, Platform } from "react-native";
import { downloadStorage } from "@/src/utils/downloadStorage";

export const ROOT_DIR_NAME = "ACCC Dynamic Inspection";

export const PHOTO_ROOT_DISPLAY = `Download/${ROOT_DIR_NAME}`;

async function ensureLegacyWritePermission(): Promise<void> {
  if (Platform.OS !== "android" || downloadStorage.androidApiLevel < 0) {
    return;
  }
  if (downloadStorage.androidApiLevel >= 29) {
    return;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    {
      title: "Storage permission",
      message:
        "ACCC Dynamic Inspection stores photos and exports in your Downloads folder. Allow access to continue.",
      buttonPositive: "Allow",
      buttonNegative: "Deny",
    }
  );
  const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
  if (!ok) {
    throw new Error("Storage permission denied");
  }
}

export async function ensureRootFolder(): Promise<void> {
  await ensureLegacyWritePermission();
  await downloadStorage.ensureFolder("");
}

export async function ensureProjectFolder(projectLabel: string): Promise<void> {
  await ensureRootFolder();
  await downloadStorage.ensureFolder(projectLabel);
}

export async function writePhoto(
  projectLabel: string,
  fileName: string,
  base64data: string
): Promise<string> {
  return downloadStorage.writeBase64(projectLabel, fileName, "image/jpeg", base64data);
}

export async function deletePhoto(fileUri: string): Promise<void> {
  try {
    await downloadStorage.deleteFile(fileUri);
  } catch {
    // ignore delete errors — the file may already be gone
  }
}

export function buildPhotoFolderDisplayPath(projectLabel: string): string {
  const label = (projectLabel || "").trim();
  return label ? `${PHOTO_ROOT_DISPLAY}/${label}/` : `${PHOTO_ROOT_DISPLAY}/`;
}

export async function hasProjectFolderFiles(projectLabel: string): Promise<boolean> {
  return downloadStorage.hasFiles(projectLabel);
}
