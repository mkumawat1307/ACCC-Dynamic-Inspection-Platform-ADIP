//frontend\src\database\repositories\PoleRenameService.ts
import { getDatabase } from "../db";
import type { SQLiteDatabase } from "expo-sqlite";
import PhotoRepository from "./PhotoRepository";
import { InspectionRepository } from "./InspectionRepository";
import { Photo } from "@/src/models/Photo";
import { downloadStorage } from "@/src/utils/downloadStorage";
import { renamePoleTokenInFileName } from "@/src/components/inspection/photoUtils";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import { logger } from "@/src/utils/logger";

export interface PoleRenameOptions {
  renameFiles: boolean;
  updateReports: boolean;
}

export interface PoleRenameResult {
  renamedFiles: number;
  updatedRecords: number;
  missingFiles: number;
  duplicate?: boolean;
  duplicatePoleId?: string;
}

export interface PendingRename {
  photo: Photo;
  newFileName: string;
  newFilePath: string;
}

export interface PreparedPoleRename {
  duplicatePoleId?: string;
  renames: PendingRename[];
  missingFiles: number;
}

export class PoleRenameService {

  static async prepareRename(
    inspectionId: number,
    oldPoleId: string,
    newPoleId: string,
    options: PoleRenameOptions
  ): Promise<PreparedPoleRename> {

    const trimmedNewPoleId = newPoleId.trim();

    if (trimmedNewPoleId.length > 0) {
      const existing = await InspectionRepository.getInspectionByPoleId(trimmedNewPoleId);
      if (existing && existing.InspectionID !== inspectionId) {
        return { duplicatePoleId: trimmedNewPoleId, renames: [], missingFiles: 0 };
      }
    }

    const photos = await PhotoRepository.getByInspection(inspectionId);

    const renames: PendingRename[] = [];
    let missingFiles = 0;

    if (options.renameFiles) {
      for (const photo of photos) {
        const newFileName = renamePoleTokenInFileName(photo.FileName, oldPoleId, trimmedNewPoleId);
        if (!newFileName) {
          logger.warn(`[PoleRename] skipped no token photo=${photo.PhotoID} old=${photo.FileName}`);
          continue;
        }
        try {
          const newFilePath = await downloadStorage.renameFile(photo.FilePath, newFileName);
          if (newFilePath === null) {
            logger.warn(`[PoleRename] photoMissing photo=${photo.PhotoID}`);
            missingFiles++;
            continue;
          }
          renames.push({ photo, newFileName, newFilePath });
        } catch (error) {
          logger.error(`[PoleRename] renameFailed photo=${photo.PhotoID} old=${photo.FileName}:`, error);
        }
      }
    }

    return { renames, missingFiles };
  }

  static async writeRenameInTransaction(
    db: SQLiteDatabase,
    inspectionId: number,
    oldPoleId: string,
    newPoleId: string,
    options: PoleRenameOptions,
    renames: PendingRename[]
  ): Promise<void> {

    const trimmedNewPoleId = newPoleId.trim();

    await db.runAsync(
      `UPDATE Inspections SET PoleID = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE InspectionID = ?`,
      [trimmedNewPoleId, inspectionId]
    );

    if (options.updateReports) {
      const poleIdField = await db.getFirstAsync<{ FieldID: number }>(
        `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_id' LIMIT 1`
      );
      if (poleIdField) {
        await db.runAsync(
          `INSERT INTO InspectionValues
           (
             InspectionID,
             FieldID,
             FieldValue
           )
           VALUES
           (?, ?, ?)
           ON CONFLICT(InspectionID, FieldID)
           DO UPDATE SET
             FieldValue = excluded.FieldValue,
             UpdatedAt = CURRENT_TIMESTAMP;`,
          [inspectionId, poleIdField.FieldID, trimmedNewPoleId]
        );
      }
    }

    for (const pending of renames) {
      await db.runAsync(
        `UPDATE Photos SET FileName = ?, FilePath = ? WHERE PhotoID = ?`,
        [pending.newFileName, pending.newFilePath, pending.photo.PhotoID!]
      );
    }

    await db.runAsync(
      `INSERT INTO InspectionPoleIdHistory (InspectionID, OldPoleId, NewPoleId) VALUES (?, ?, ?)`,
      [inspectionId, oldPoleId, trimmedNewPoleId]
    );
  }

  static async reverseFileRenames(renames: PendingRename[]): Promise<void> {
    for (const pending of [...renames].reverse()) {
      try {
        await downloadStorage.renameFile(pending.newFilePath, pending.photo.FileName);
      } catch (reverseError) {
        logger.error(`[PoleRename] reverseRenameFailed photo=${pending.photo.PhotoID}:`, reverseError);
      }
    }
  }

  static async renamePoleId(
    inspectionId: number,
    oldPoleId: string,
    newPoleId: string,
    options: PoleRenameOptions
  ): Promise<PoleRenameResult> {

    const trimmedNewPoleId = newPoleId.trim();

    const db = await getDatabase();
    const projectId = await InspectionRepository.getInspectionProjectId(inspectionId);

    const prepared = await this.prepareRename(inspectionId, oldPoleId, newPoleId, options);
    if (prepared.duplicatePoleId) {
      return {
        renamedFiles: 0,
        updatedRecords: 0,
        missingFiles: 0,
        duplicate: true,
        duplicatePoleId: prepared.duplicatePoleId,
      };
    }

    try {
      await db.withTransactionAsync(async () => {
        await this.writeRenameInTransaction(
          db,
          inspectionId,
          oldPoleId,
          trimmedNewPoleId,
          options,
          prepared.renames
        );
      });
    } catch (error) {
      logger.error(`[PoleRename] dbUpdateFailed reversing ${prepared.renames.length} file rename(s):`, error);
      await this.reverseFileRenames(prepared.renames);
      throw error;
    }

    InspectionDataBus.emitInspectionsChanged(projectId ?? 0);

    return {
      renamedFiles: prepared.renames.length,
      updatedRecords: prepared.renames.length,
      missingFiles: prepared.missingFiles,
    };
  }

}
