import { requireNativeModule } from "expo-modules-core";

export interface DownloadStorageNative {
  readonly androidApiLevel: number;
  hasFiles(relativePath: string): Promise<boolean>;
  ensureFolder(relativePath: string): Promise<boolean>;
  writeBase64(
    relativePath: string,
    fileName: string,
    mimeType: string,
    base64: string
  ): Promise<string>;
  writeUtf8(
    relativePath: string,
    fileName: string,
    mimeType: string,
    text: string
  ): Promise<string>;
  readBase64(uri: string): Promise<string>;
  deleteFile(uri: string): Promise<boolean>;
  findFile(relativePath: string, fileName: string): Promise<string | null>;
}

let nativeModule: DownloadStorageNative | null = null;
try {
  const mod = requireNativeModule<DownloadStorageNative>("DownloadStorage");
  if (mod && typeof mod === "object") {
    nativeModule = mod;
  }
} catch {
  nativeModule = null;
}

export function getDownloadStorageNative(): DownloadStorageNative | null {
  return nativeModule;
}
