import { PermissionsAndroid, Platform } from "react-native";
import { downloadStorage } from "@/src/utils/downloadStorage";
import { logger } from "@/src/utils/logger";

export const ROOT_DIR_NAME = "ACCC Dynamic Inspection";

async function ensureLegacyWritePermission(): Promise<void> {
  if (Platform.OS !== "android" || downloadStorage.androidApiLevel < 0) {
    logger.info("[Storage] permissionGranted=false (non-android)");
    return;
  }
  if (downloadStorage.androidApiLevel >= 29) {
    logger.info("[Storage] permissionGranted=true (MediaStore, no permission required)");
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
  logger.info(`[Storage] permissionGranted=${ok}`);
  if (!ok) {
    throw new Error("Storage permission denied");
  }
}

export async function ensureRootFolder(): Promise<void> {
  await ensureLegacyWritePermission();

  logger.info("[Storage] ensureRoot start");
  const existed = await downloadStorage.ensureFolder("");
  logger.info(`[Storage] ensureRoot exists=${existed}`);
  logger.info("[Storage] ensureRoot ready");
}

export async function ensureProjectFolder(projectLabel: string): Promise<void> {
  await ensureRootFolder();

  logger.info(`[Storage] ensureProject=${projectLabel}`);
  const existed = await downloadStorage.ensureFolder(projectLabel);
  logger.info(`[Storage] ensureProject exists=${existed}`);
  logger.info("[Storage] ensureProject ready");
}

export async function writePhoto(
  projectLabel: string,
  fileName: string,
  base64data: string
): Promise<string> {
  logger.info(`[Storage:photo] path=Download/${ROOT_DIR_NAME}/${projectLabel}/${fileName}`);
  return downloadStorage.writeBase64(projectLabel, fileName, "image/jpeg", base64data);
}

export async function deletePhoto(fileUri: string): Promise<void> {
  try {
    await downloadStorage.deleteFile(fileUri);
  } catch {
    // ignore delete errors — the file may already be gone
  }
}
