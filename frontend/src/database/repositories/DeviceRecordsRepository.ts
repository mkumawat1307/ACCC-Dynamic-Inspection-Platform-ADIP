import { getActiveProjectPath, getDatabase } from "../db";
import { InspectionEditSession } from "./InspectionEditSession";
import { logger } from "@/src/utils/logger";

export interface DeviceRecord {
  RecordID?: number;
  InspectionID: number;
  DeviceType: string;
  DeviceLabel?: string;
  DeviceNo: number;
  DeviceData: string | null;
  DisplayOrder: number;
  IsActive: number;
}

export class DeviceRecordsRepository {
  private static saveRegistry: Map<
    string,
    {
      record: DeviceRecord;
      timer: ReturnType<typeof setTimeout>;
      onPersisted?: (recordId: number) => void;
    }
  > = new Map();

  private static getSaveKey(record: DeviceRecord): string {
    return record.RecordID != null
      ? String(record.RecordID)
      : `${record.DeviceType}:${record.DeviceNo}`;
  }

  static async scheduleDeviceRecordSave(
    record: DeviceRecord,
    debounceMs: number = 500,
    onPersisted?: (recordId: number) => void
  ): Promise<void> {
    // Editing an existing inspection: defer to the edit session so device
    // edits are only persisted on an explicit Save, never on Back/Cancel.
    if (InspectionEditSession.isActive(record.InspectionID)) {
      InspectionEditSession.stageDeviceRecord(record);
      return;
    }

    const key = this.getSaveKey(record);
    const existing = this.saveRegistry.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const timer = setTimeout(async () => {
      this.saveRegistry.delete(key);
      await this.persist(record, onPersisted);
    }, debounceMs);
    this.saveRegistry.set(key, { record, timer, onPersisted });
  }

  static async flushPendingDeviceSaves(): Promise<void> {
    const entries = [...this.saveRegistry.values()];
    for (const entry of entries) {
      clearTimeout(entry.timer);
    }
    this.saveRegistry.clear();

    if (entries.length === 0) return;

    await Promise.all(
      entries.map(({ record, onPersisted }) => {
        return this.persist(record, onPersisted);
      })
    );
  }

  static cancelPendingSaves(deviceType?: string, maxDeviceNo?: number): void {
    for (const [key, entry] of this.saveRegistry) {
      if (deviceType == null || entry.record.DeviceType === deviceType) {
        if (maxDeviceNo == null || entry.record.DeviceNo > maxDeviceNo) {
          clearTimeout(entry.timer);
          this.saveRegistry.delete(key);
        }
      }
    }
  }

  private static async persist(
    record: DeviceRecord,
    onPersisted?: (recordId: number) => void
  ): Promise<void> {
    const startDbPath = getActiveProjectPath();
    if (record.RecordID != null) {
      await this.update(record);
      return;
    }
    const db = await getDatabase();
    const existing = await db.getAllAsync<{ RecordID: number }>(
      `SELECT RecordID FROM DeviceRecords
       WHERE InspectionID = ? AND DeviceType = ? AND DeviceNo = ? AND IsActive = 1
       LIMIT 1`,
      [record.InspectionID, record.DeviceType, record.DeviceNo]
    );
    if (getActiveProjectPath() !== startDbPath) {
      logger.warn("[DeviceRecords] Project switched during device save; skipping persist", {
        inspectionId: record.InspectionID,
        deviceType: record.DeviceType,
        deviceNo: record.DeviceNo,
        active: getActiveProjectPath(),
        expected: startDbPath,
      });
      return;
    }
    if (existing[0]) {
      record.RecordID = existing[0].RecordID;
      await this.update(record);
      onPersisted?.(existing[0].RecordID);
    } else {
      const newId = await this.create(record);
      record.RecordID = newId;
      onPersisted?.(newId);
    }
  }

  static async getByInspection(inspectionId: number, deviceType: string): Promise<DeviceRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<DeviceRecord>(
      `SELECT * FROM DeviceRecords
       WHERE InspectionID = ? AND DeviceType = ? AND IsActive = 1
       ORDER BY DeviceNo`,
      [inspectionId, deviceType]
    );
  }

  static async getByInspectionAll(inspectionId: number): Promise<DeviceRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<DeviceRecord>(
      `SELECT * FROM DeviceRecords
       WHERE InspectionID = ? AND IsActive = 1
       ORDER BY DeviceType, DeviceNo`,
      [inspectionId]
    );
  }

  static async create(record: DeviceRecord): Promise<number> {
    const db = await getDatabase();
    const result = await db.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceLabel, DeviceNo, DeviceData, DisplayOrder)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.InspectionID,
        record.DeviceType,
        record.DeviceLabel ?? null,
        record.DeviceNo,
        record.DeviceData ?? null,
        record.DisplayOrder,
      ]
    );
    return result.lastInsertRowId;
  }

  static async update(record: DeviceRecord): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceRecords
       SET DeviceLabel = ?, DeviceData = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE RecordID = ?`,
      [record.DeviceLabel ?? null, record.DeviceData ?? null, record.RecordID!]
    );
  }

  static async save(record: DeviceRecord): Promise<number> {
    if (record.RecordID) {
      await DeviceRecordsRepository.update(record);
      return record.RecordID;
    } else {
      const newId = await DeviceRecordsRepository.create(record);
      return newId;
    }
  }

  static async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceRecords SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE RecordID = ?`,
      [id]
    );
  }

  static async deleteByInspection(inspectionId: number, deviceType: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM DeviceRecords WHERE InspectionID = ? AND DeviceType = ?`,
      [inspectionId, deviceType]
    );
  }

  static async deactivateBeyond(inspectionId: number, deviceType: string, deviceNo: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceRecords
       SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
       WHERE InspectionID = ? AND DeviceType = ? AND DeviceNo > ?`,
      [inspectionId, deviceType, deviceNo]
    );
  }

  static async restorePendingDeactivatedRecords(
    inspectionId: number,
    deviceType: string,
    maxDeviceNo: number
  ): Promise<DeviceRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<DeviceRecord>(
      `SELECT * FROM DeviceRecords
       WHERE InspectionID = ? AND DeviceType = ? AND IsActive = 0 AND DeviceNo <= ?
       ORDER BY DeviceNo`,
      [inspectionId, deviceType, maxDeviceNo]
    );
    for (const row of rows) {
      await db.runAsync(
        `UPDATE DeviceRecords SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE RecordID = ?`,
        [row.RecordID!]
      );
    }
    const result = rows.map((r) => ({ ...r, IsActive: 1 }));
    return result;
  }

  static async saveMultiple(inspectionId: number, deviceType: string, records: DeviceRecord[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM DeviceRecords WHERE InspectionID = ? AND DeviceType = ?`,
        [inspectionId, deviceType]
      );
      for (const record of records) {
        await db.runAsync(
          `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceLabel, DeviceNo, DeviceData, DisplayOrder)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            inspectionId,
            deviceType,
            record.DeviceLabel ?? null,
            record.DeviceNo,
            record.DeviceData ?? null,
            record.DisplayOrder,
          ]
        );
      }
    });
  }
}

export default DeviceRecordsRepository;