import * as FileSystem from "expo-file-system/legacy";
import { deletePhoto as deleteStoredPhotoFile } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";

export async function deleteInspectionPhotoFiles(db: any, inspectionId: number): Promise<void> {
  const rows = (await db.getAllAsync(
    `SELECT FilePath FROM Photos WHERE InspectionID = ?`,
    [inspectionId]
  )) as { FilePath: string }[] | undefined;

  const paths = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.FilePath)
        .filter((p) => Boolean(p))
    ),
  ];

  for (const filePath of paths) {
    try {
      if (filePath.startsWith("content://")) {
        await deleteStoredPhotoFile(filePath);
      } else {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    } catch (error) {
      logger.warn(`[inspectionDataHelper] failed to delete photo file: ${filePath}`, error);
    }
  }
}

export async function deleteInspectionData(db: any, inspectionId: number) {
  await deleteInspectionPhotoFiles(db, inspectionId);
  await db.runAsync(`DELETE FROM Photos WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM Cameras WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM Switches WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM InspectionValues WHERE InspectionID = ?`, [inspectionId]);
  await db.runAsync(`DELETE FROM Inspections WHERE InspectionID = ?`, [inspectionId]);
}