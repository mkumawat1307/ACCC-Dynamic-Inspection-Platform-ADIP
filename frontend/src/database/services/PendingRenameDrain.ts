import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { hasProjectFolderFiles } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";

interface PendingRenameMarker {
  from: string;
  to: string;
}

export async function drainLegacyPendingPhotoFolderRenames(): Promise<void> {
  try {
    const pending = await ProjectRepository.getPendingPhotoFolderRenames();
    for (const row of pending) {
      try {
        const marker = parseMarker(row.PendingPhotoFolderRename);
        if (!marker) {
          await ProjectRepository.setPendingPhotoFolderRename(row.ProjectID, null);
          continue;
        }
        if (marker.from === marker.to) {
          await ProjectRepository.setPendingPhotoFolderRename(row.ProjectID, null);
          continue;
        }
        const filesInTo = await hasProjectFolderFiles(marker.to);
        if (filesInTo) {
          logger.warn(
            `[drain] Photos remain in legacy target folder "${marker.to}" for project #${row.ProjectID}; leaving files untouched and clearing pending marker`
          );
        }
        await ProjectRepository.setPendingPhotoFolderRename(row.ProjectID, null);
      } catch (err) {
        logger.warn(
          `[drain] Failed to resolve pending rename for project #${row.ProjectID}: ${String(err)}`
        );
      }
    }
  } catch (err) {
    logger.warn(`[drain] Failed to list pending photo-folder renames: ${String(err)}`);
  }
}

function parseMarker(raw: string | null): PendingRenameMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.from !== "string" ||
      typeof parsed.to !== "string"
    ) {
      return null;
    }
    return { from: parsed.from, to: parsed.to };
  } catch {
    return null;
  }
}
