import * as FileSystem from "expo-file-system/legacy";
import { Project } from "@/src/models/Project";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { photoStorageLabelForProject } from "@/src/utils/folderNaming";
import { buildPhotoFolderDisplayPath } from "@/src/utils/storageManager";
import { downloadStorage } from "@/src/utils/downloadStorage";
import { getActiveProjectPath } from "@/src/database/db";
import { logger } from "@/src/utils/logger";

export interface PhotoReconciliationResult {
  total: number;
  completed: number;
  retryable: number;
  failed: number;
}

const EMPTY_RESULT: PhotoReconciliationResult = {
  total: 0,
  completed: 0,
  retryable: 0,
  failed: 0,
};

export async function reconcileProjectPhotos(
  project: Project
): Promise<PhotoReconciliationResult> {
  const startDbPath = getActiveProjectPath();
  if (startDbPath === null || startDbPath !== project.DBPath) {
    logger.warn(
      "[Reconcile] aborted before start: active project DB changed. " +
        `Expected ${project.DBPath}, active ${String(startDbPath)}.`
    );
    return EMPTY_RESULT;
  }

  const label = photoStorageLabelForProject(project);
  const displayPath = buildPhotoFolderDisplayPath(label);

  const projectStillActive = (): boolean => {
    const activeDbPath = getActiveProjectPath();
    if (activeDbPath === null || activeDbPath !== project.DBPath) {
      logger.warn(
        "[Reconcile] aborted mid-reconcile: active project DB changed. " +
          `Expected ${project.DBPath}, active ${String(activeDbPath)}.`
      );
      return false;
    }
    return true;
  };

  if (!projectStillActive()) return EMPTY_RESULT;
  const photos = await PhotoRepository.getPhotosNeedingReconciliation();
  if (!projectStillActive()) return EMPTY_RESULT;

  const result: PhotoReconciliationResult = {
    total: photos.length,
    completed: 0,
    retryable: 0,
    failed: 0,
  };

  for (const photo of photos) {
    const photoId = photo.PhotoID;
    if (photoId == null) continue;

    try {
      const finalUri = await downloadStorage.findFile(label, photo.FileName);
      if (finalUri) {
        if (photo.FilePath !== finalUri) {
          if (!projectStillActive()) break;
          await PhotoRepository.updateFilePathAndStoragePath(photoId, finalUri, displayPath);
        }
        if (!photo.FilePath.startsWith("content://")) {
          try {
            await FileSystem.deleteAsync(photo.FilePath, { idempotent: true });
          } catch (e) {
            logger.warn("[Reconcile] temp cleanup failed:", photo.FilePath, e);
          }
        }
        if (photo.ProcessingStatus !== "completed") {
          if (!projectStillActive()) break;
          await PhotoRepository.setProcessingStatus(photoId, "completed");
        }
        result.completed++;
      } else if (photo.FilePath.startsWith("content://")) {
        if (!projectStillActive()) break;
        await PhotoRepository.setProcessingStatus(photoId, "failed");
        result.failed++;
      } else {
        const temp = await FileSystem.getInfoAsync(photo.FilePath).catch(() => null);
        if (temp && temp.exists) {
          if (!projectStillActive()) break;
          await PhotoRepository.setProcessingStatus(photoId, "captured");
          result.retryable++;
        } else {
          if (!projectStillActive()) break;
          await PhotoRepository.setProcessingStatus(photoId, "failed");
          result.failed++;
        }
      }
    } catch (e) {
      logger.warn("[Reconcile] processing failed for photo:", photoId, e);
    }
  }

  return result;
}