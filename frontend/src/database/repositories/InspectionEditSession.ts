//frontend\src\database\repositories\InspectionEditSession.ts
//
// Staged-persistence boundary for editing an EXISTING inspection.
//
// While a session is active (an existing inspection screen is open), every
// inspection-related write that the UI triggers during editing is captured in
// memory (see InspectionEditSessionState) instead of being written to the
// database:
//
//   - section/renderer field values  (InspectionValues)
//   - Pole ID changes                (Inspections.PoleID + pole_id field)
//   - device record edits            (DeviceRecords)
//
// Nothing is persisted until the user explicitly Saves/Completes, at which
// point commit() flushes the staged edits to the database. Pressing Back or
// Cancel calls discard(), which drops the staged edits without touching the
// database — unsaved changes are never written.
//
// NEW inspections are NOT covered by a session: they keep their current
// immediate/debounced autosave behaviour.

import InspectionValueRepository from "./InspectionValueRepository";
import { InspectionRepository } from "./InspectionRepository";
import { DeviceRecordsRepository, DeviceRecord } from "./DeviceRecordsRepository";
import { InspectionEditSessionState } from "./InspectionEditSessionState";
import { PoleRenameService } from "./PoleRenameService";
import type { PendingRename } from "./InspectionEditSessionState";
import type { PendingRename as PoleRenameItem } from "./PoleRenameService";
import { getDatabase } from "../db";
import { logger } from "@/src/utils/logger";

export class InspectionEditSession {
  static isActive(inspectionId: number | null): boolean {
    return InspectionEditSessionState.isActive(inspectionId);
  }

  static hasActiveSession(): boolean {
    return InspectionEditSessionState.hasActiveSession();
  }

  /**
   * Begin (or switch to) an edit session for the given existing inspection.
   * Any edits staged for a different inspection are discarded first.
   */
  static activate(inspectionId: number): void {
    InspectionEditSessionState.activate(inspectionId);
  }

  static deactivate(): void {
    InspectionEditSessionState.deactivate();
  }

  static stageFieldValue(fieldId: number, value: string | null): void {
    InspectionEditSessionState.stageFieldValue(fieldId, value);
  }

  static stagePoleId(value: string): void {
    InspectionEditSessionState.stagePoleId(value);
  }

  static stagePendingRename(pending: PendingRename | null): void {
    InspectionEditSessionState.stagePendingRename(pending);
  }

  static stageDeviceRecord(record: DeviceRecord): void {
    InspectionEditSessionState.stageDeviceRecord(record);
  }

  static getStagedFieldValues(): Map<number, string> {
    return InspectionEditSessionState.getStagedFieldValues();
  }

  static getStagedDeviceRecords(): DeviceRecord[] {
    return InspectionEditSessionState.getStagedDeviceRecords();
  }

  static getStagedPoleId(): string | null {
    return InspectionEditSessionState.getStagedPoleId();
  }

  /**
   * Persist every staged edit to the database in one transaction. The session
   * stays active while committing (flushing writes to the database with no
   * re-capture), and is only deactivated after the transaction commits. On any
   * failure the transaction rolls back and the session is kept intact so the
   * staged edits can be retried.
   */
  static async commit(): Promise<boolean> {
    if (InspectionEditSessionState.getActiveInspectionId() == null) return true;

    const inspectionId = InspectionEditSessionState.getActiveInspectionId()!;
    const fieldValues = InspectionEditSessionState.getStagedFieldValues();
    const stagedPoleId = InspectionEditSessionState.getStagedPoleId();
    const pendingRename = InspectionEditSessionState.getPendingRename();
    const devices = InspectionEditSessionState.getStagedDeviceRecords();

    InspectionEditSessionState.setCommitting(true);

    let pendingFileRenames: PoleRenameItem[] = [];

    try {
      const db = await getDatabase();

      let duplicate = false;
      await db.withTransactionAsync(async () => {
        if (pendingRename) {
          const identity =
            pendingRename.oldDistrict !== undefined ||
            pendingRename.oldBlock !== undefined ||
            pendingRename.newDistrict !== undefined ||
            pendingRename.newBlock !== undefined
              ? {
                  oldDistrict: pendingRename.oldDistrict ?? "",
                  oldBlock: pendingRename.oldBlock ?? "",
                  newDistrict: pendingRename.newDistrict ?? "",
                  newBlock: pendingRename.newBlock ?? "",
                }
              : undefined;
          const prepared = await PoleRenameService.prepareRename(
            inspectionId,
            pendingRename.oldPoleId,
            pendingRename.newPoleId,
            {
              renameFiles: pendingRename.renameFiles,
              updateReports: pendingRename.updateReports,
            },
            identity
          );
          if (prepared.duplicatePoleId) {
            duplicate = true;
            return;
          }
          pendingFileRenames = prepared.renames;
          await PoleRenameService.writeRenameInTransaction(
            db,
            inspectionId,
            pendingRename.oldPoleId,
            pendingRename.newPoleId,
            {
              renameFiles: pendingRename.renameFiles,
              updateReports: pendingRename.updateReports,
            },
            prepared.renames,
            identity
          );
        } else if (stagedPoleId != null) {
          await InspectionRepository.saveFieldValue(
            inspectionId,
            await this.resolvePoleIdFieldId(inspectionId),
            stagedPoleId
          );
          await InspectionRepository.updateInspectionPoleId(
            inspectionId,
            stagedPoleId
          );
        }

        for (const [fieldId, value] of fieldValues) {
          await InspectionValueRepository.saveValue(
            inspectionId,
            fieldId,
            value
          );
        }

        for (const record of devices) {
          await DeviceRecordsRepository.save(record);
        }
      });

      if (duplicate) return false;

      InspectionEditSessionState.deactivate();
      return true;
    } catch (error) {
      logger.error("[InspectionEditSession] commit failed:", error);
      if (pendingFileRenames.length > 0) {
        await PoleRenameService.reverseFileRenames(pendingFileRenames);
      }
      return false;
    } finally {
      InspectionEditSessionState.setCommitting(false);
    }
  }

  static async resolvePoleIdFieldId(
    inspectionId: number
  ): Promise<number> {
    const { default: InspectionFieldRepository } = await import(
      "./InspectionFieldRepository"
    );
    const fields = await InspectionFieldRepository.getDefaultTemplateFields();
    const pole = fields.find((f) => f.FieldKey === "pole_id");
    if (pole) return pole.FieldID;

    const db = await (await import("../db")).getDatabase();
    const row = await db.getFirstAsync<{ FieldID: number }>(
      `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_id' ORDER BY FieldID LIMIT 1`,
      []
    );
    return row?.FieldID ?? -1;
  }

  /**
   * Discard every staged edit without writing anything to the database.
   */
  static async discard(): Promise<void> {
    if (InspectionEditSessionState.hasActiveSession()) {
      DeviceRecordsRepository.cancelPendingSaves();
    }
    InspectionEditSessionState.deactivate();
  }
}