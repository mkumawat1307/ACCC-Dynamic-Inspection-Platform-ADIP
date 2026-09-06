//frontend\src\database\repositories\InspectionEditSession.ts
//
// Staged-persistence boundary for editing an EXISTING inspection.
//
// While a session is active (an existing inspection screen is open), every
// inspection-related write that the UI triggers during editing is captured in
// memory instead of being written to the database:
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
import { logger } from "@/src/utils/logger";

interface PendingRename {
  oldPoleId: string;
  newPoleId: string;
  renameFiles: boolean;
  updateReports: boolean;
}

export class InspectionEditSession {
  private static activeInspectionId: number | null = null;
  private static fieldValues = new Map<number, string>();
  private static stagedPoleId: string | null = null;
  private static pendingRename: PendingRename | null = null;
  private static deviceRecords = new Map<string, DeviceRecord>();

  static isActive(inspectionId: number | null): boolean {
    return inspectionId != null && this.activeInspectionId === inspectionId;
  }

  static hasActiveSession(): boolean {
    return this.activeInspectionId != null;
  }

  /**
   * Begin (or switch to) an edit session for the given existing inspection.
   * Any edits staged for a different inspection are discarded first.
   */
  static activate(inspectionId: number): void {
    if (
      this.activeInspectionId !== null &&
      this.activeInspectionId !== inspectionId
    ) {
      this.clear();
    }
    this.activeInspectionId = inspectionId;
  }

  static deactivate(): void {
    this.clear();
    this.activeInspectionId = null;
  }

  static stageFieldValue(fieldId: number, value: string | null): void {
    this.fieldValues.set(fieldId, value ?? "");
  }

  static stagePoleId(value: string): void {
    this.stagedPoleId = value;
  }

  static stagePendingRename(pending: PendingRename | null): void {
    this.pendingRename = pending;
  }

  static stageDeviceRecord(record: DeviceRecord): void {
    const key =
      record.RecordID != null
        ? `id:${record.RecordID}`
        : `new:${record.DeviceType}:${record.DeviceNo}`;
    this.deviceRecords.set(key, record);
  }

  static getStagedFieldValues(): Map<number, string> {
    return new Map(this.fieldValues);
  }

  static getStagedPoleId(): string | null {
    return this.stagedPoleId;
  }

  private static clear(): void {
    this.fieldValues.clear();
    this.stagedPoleId = null;
    this.pendingRename = null;
    this.deviceRecords.clear();
  }

  /**
   * Persist every staged edit to the database. The session is deactivated
   * first so the repository writes are not re-captured, then all staged field
   * values, the Pole ID/rename, and device records are written. Returns false
   * if a staged Pole ID rename is blocked by a duplicate (nothing is written).
   */
  static async commit(): Promise<boolean> {
    if (this.activeInspectionId == null) return true;

    const inspectionId = this.activeInspectionId;
    const fieldValues = new Map(this.fieldValues);
    const stagedPoleId = this.stagedPoleId;
    const pendingRename = this.pendingRename;
    const devices = [...this.deviceRecords.values()];

    // Deactivate first so the repository calls below are not captured again.
    this.clear();
    this.activeInspectionId = null;

    try {
      if (pendingRename) {
        const { PoleRenameService } = await import("./PoleRenameService");
        const result = await PoleRenameService.renamePoleId(
          inspectionId,
          pendingRename.oldPoleId,
          pendingRename.newPoleId,
          {
            renameFiles: pendingRename.renameFiles,
            updateReports: pendingRename.updateReports,
          }
        );
        if (result.duplicate) return false;
      } else if (stagedPoleId != null) {
        await InspectionRepository.updatePoleIdDirectSave(
          inspectionId,
          await this.resolvePoleIdFieldId(inspectionId),
          stagedPoleId
        );
      }

      for (const [fieldId, value] of fieldValues) {
        await InspectionValueRepository.saveValue(inspectionId, fieldId, value);
      }

      for (const record of devices) {
        await DeviceRecordsRepository.save(record);
      }

      return true;
    } catch (error) {
      logger.error("[InspectionEditSession] commit failed:", error);
      return false;
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
    if (this.activeInspectionId != null) {
      DeviceRecordsRepository.cancelPendingSaves();
    }
    this.clear();
    this.activeInspectionId = null;
  }
}
