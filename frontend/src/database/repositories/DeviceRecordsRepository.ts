import { getDatabase } from "../db";

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

class DeviceRecordsRepository {
  async getByInspection(inspectionId: number, deviceType: string): Promise<DeviceRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<DeviceRecord>(
      `SELECT * FROM DeviceRecords
       WHERE InspectionID = ? AND DeviceType = ? AND IsActive = 1
       ORDER BY DeviceNo`,
      [inspectionId, deviceType]
    );
  }

  async getByInspectionAll(inspectionId: number): Promise<DeviceRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<DeviceRecord>(
      `SELECT * FROM DeviceRecords
       WHERE InspectionID = ? AND IsActive = 1
       ORDER BY DeviceType, DeviceNo`,
      [inspectionId]
    );
  }

  async create(record: DeviceRecord): Promise<number> {
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

  async update(record: DeviceRecord): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceRecords
       SET DeviceLabel = ?, DeviceData = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE RecordID = ?`,
      [record.DeviceLabel ?? null, record.DeviceData ?? null, record.RecordID!]
    );
  }

  async save(record: DeviceRecord): Promise<number> {
    if (record.RecordID) {
      await this.update(record);
      return record.RecordID;
    }
    return await this.create(record);
  }

  async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceRecords SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE RecordID = ?`,
      [id]
    );
  }

  async deleteByInspection(inspectionId: number, deviceType: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM DeviceRecords WHERE InspectionID = ? AND DeviceType = ?`,
      [inspectionId, deviceType]
    );
  }

  async saveMultiple(inspectionId: number, deviceType: string, records: DeviceRecord[]): Promise<void> {
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

export default new DeviceRecordsRepository();
