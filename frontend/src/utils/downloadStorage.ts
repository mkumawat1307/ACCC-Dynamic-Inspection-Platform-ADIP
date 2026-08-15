import { Platform } from "react-native";
import { getDownloadStorageNative, DownloadStorageNative } from "@/modules/download-storage/src";
import { logger } from "@/src/utils/logger";

export const ROOT_DIR_NAME = "ACCC Dynamic Inspection";

const native = getDownloadStorageNative();

function requireNative(): DownloadStorageNative {
  if (Platform.OS !== "android" || !native) {
    throw new Error("[Storage] DownloadStorage is unavailable on this platform");
  }
  return native;
}

export const downloadStorage = {
  get androidApiLevel(): number {
    return native ? native.androidApiLevel : -1;
  },

  async hasFiles(relativePath: string): Promise<boolean> {
    return requireNative().hasFiles(relativePath);
  },

  async ensureFolder(relativePath: string): Promise<boolean> {
    return requireNative().ensureFolder(relativePath);
  },

  async writeBase64(
    relativePath: string,
    fileName: string,
    mimeType: string,
    base64: string
  ): Promise<string> {
    const uri = await requireNative().writeBase64(relativePath, fileName, mimeType, base64);
    logger.info(`[Storage] fileSaved path=${uri}`);
    return uri;
  },

  async writeUtf8(
    relativePath: string,
    fileName: string,
    mimeType: string,
    text: string
  ): Promise<string> {
    const uri = await requireNative().writeUtf8(relativePath, fileName, mimeType, text);
    logger.info(`[Storage] fileSaved path=${uri}`);
    return uri;
  },

  async readBase64(uri: string): Promise<string> {
    return requireNative().readBase64(uri);
  },

  async deleteFile(uri: string): Promise<boolean> {
    return requireNative().deleteFile(uri);
  },

  async findFile(relativePath: string, fileName: string): Promise<string | null> {
    return requireNative().findFile(relativePath, fileName);
  },

  async renameFile(uri: string, newFileName: string): Promise<string | null> {
    const renamedUri = await requireNative().renameFile(uri, newFileName);
    logger.info(`[Storage] fileRenamed old=${uri} new=${renamedUri ?? "missing"}`);
    return renamedUri;
  },

  async getRelativePath(uri: string): Promise<string | null> {
    return requireNative().getRelativePath(uri);
  },
};
