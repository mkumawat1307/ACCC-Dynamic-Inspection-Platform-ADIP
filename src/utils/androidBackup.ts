import { NativeModules, Platform } from "react-native";
import { logger } from "@/src/utils/logger";

export function requestAndroidBackup(): void {
  if (Platform.OS !== "android") return;
  const module = NativeModules.AndroidBackup;
  if (!module?.requestBackup) {
    logger.warn("[androidBackup] AndroidBackup native module not available — skipping");
    return;
  }
  try {
    module.requestBackup();
  } catch (e) {
    logger.warn("[androidBackup] requestBackup() call failed:", e);
  }
}