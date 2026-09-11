import { getDatabase } from "../db";

export interface ProjectDeviceType {
  ID?: number;
  DeviceType: string;
  IsActive: number;
  IsRequired?: number;
}

class ProjectDeviceTypesRepository {
  async getActive(): Promise<ProjectDeviceType[]> {
    const db = await getDatabase();
    return db.getAllAsync<ProjectDeviceType>(
      `SELECT DeviceType, IsActive, IsRequired FROM ProjectDeviceTypes WHERE IsActive = 1 ORDER BY DeviceType`
    );
  }

  async getRequired(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ DeviceType: string }>(
      `SELECT DeviceType FROM ProjectDeviceTypes WHERE IsActive = 1 AND IsRequired = 1 ORDER BY DeviceType`
    );
    return rows.map((r) => r.DeviceType);
  }

  async setRequired(deviceType: string, isRequired: boolean): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ ID: number }>(
      `SELECT ID FROM ProjectDeviceTypes WHERE DeviceType = ? LIMIT 1`,
      [deviceType]
    );
    if (existing) {
      await db.runAsync(
        `UPDATE ProjectDeviceTypes SET IsRequired = ?, IsActive = 1 WHERE ID = ?`,
        [isRequired ? 1 : 0, existing.ID]
      );
    } else {
      await db.runAsync(
        `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES (?, 1, ?)`,
        [deviceType, isRequired ? 1 : 0]
      );
    }
  }
}

export default new ProjectDeviceTypesRepository();