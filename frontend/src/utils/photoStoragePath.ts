import { PHOTO_ROOT_DISPLAY } from "@/src/utils/storageManager";
import { downloadStorage } from "@/src/utils/downloadStorage";
import { Photo } from "@/src/models/Photo";

export function deriveStoragePathFromFilePath(filePath: string): string | null {
  if (!filePath.startsWith("file://")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(filePath);
  } catch {
    decoded = filePath;
  }
  const marker = `${PHOTO_ROOT_DISPLAY}/`;
  const idx = decoded.indexOf(marker);
  if (idx < 0) return null;
  const rest = decoded.slice(idx + marker.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const label = rest.slice(0, slash);
  return label ? `${marker}${label}/` : null;
}

export async function resolvePhotoStoragePath(photo: Photo): Promise<string | null> {
  if (photo.StoragePath && photo.StoragePath.trim()) return photo.StoragePath;
  if (photo.FilePath.startsWith("file://")) {
    return deriveStoragePathFromFilePath(photo.FilePath);
  }
  if (photo.FilePath.startsWith("content://")) {
    const relative = await downloadStorage.getRelativePath(photo.FilePath);
    return relative && relative.trim() ? relative : null;
  }
  return null;
}
