//frontend\src\database\repositories\InspectionEditSessionState.ts
//
// In-memory state for the staged edit-session boundary. InspectionEditSession
// orchestrates the lifecycle (activate/discard/commit); this module is the
// pure state leaf that sits BELOW the repositories: it holds no database
// access and imports no repositories at runtime, so the write-path
// repositories (InspectionValueRepository, InspectionRepository,
// DeviceRecordsRepository) and the read-only InspectionProgressService can
// observe the session without forming an import cycle back to
// InspectionEditSession.
//
// While a session is active (an existing inspection screen is open), every
// inspection-related write the UI triggers during editing is captured here in
// memory instead of being written to the database:
//
//   - field values                    (InspectionValues)
//   - Pole ID changes                 (Inspections.PoleID + pole_id field)
//   - device record edits             (DeviceRecords)
//
// Nothing is persisted until InspectionEditSession.commit() flushes the
// staged edits to the database. Pressing Back or Cancel calls
// InspectionEditSession.discard(), which drops the staged edits without
// touching the database. NEW inspections are NOT covered by a session: they
// keep their current immediate/debounced autosave behaviour.

import type { DeviceRecord } from "./DeviceRecordsRepository";

export interface PendingRename {
  oldPoleId: string;
  newPoleId: string;
  renameFiles: boolean;
  updateReports: boolean;
}

export class InspectionEditSessionState {
  private static activeInspectionId: number | null = null;
  private static fieldValues = new Map<number, string>();
  private static stagedPoleId: string | null = null;
  private static pendingRename: PendingRename | null = null;
  private static deviceRecords = new Map<string, DeviceRecord>();
  private static committing = false;

  static isActive(inspectionId: number | null): boolean {
    return (
      !this.committing &&
      inspectionId != null &&
      this.activeInspectionId === inspectionId
    );
  }

  static hasActiveSession(): boolean {
    return this.activeInspectionId != null;
  }

  static getActiveInspectionId(): number | null {
    return this.activeInspectionId;
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

  static getStagedDeviceRecords(): DeviceRecord[] {
    return [...this.deviceRecords.values()];
  }

  static getStagedPoleId(): string | null {
    return this.stagedPoleId;
  }

  static getPendingRename(): PendingRename | null {
    return this.pendingRename;
  }

  /**
   * Masks the session from the repositories while commit() flushes staged
   * writes so they are persisted directly (never re-captured).
   */
  static setCommitting(value: boolean): void {
    this.committing = value;
  }

  static clear(): void {
    this.fieldValues.clear();
    this.stagedPoleId = null;
    this.pendingRename = null;
    this.deviceRecords.clear();
  }
}

export default InspectionEditSessionState;