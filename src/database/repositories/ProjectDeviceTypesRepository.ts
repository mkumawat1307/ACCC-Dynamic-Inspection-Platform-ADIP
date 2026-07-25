import { getDatabase } from "../db";

class ProjectDeviceTypesRepository {
  async getEnabledTypes(projectId: number): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ DeviceType: string }>(
      `SELECT DeviceType FROM ProjectDeviceTypes
       WHERE ProjectID = ? AND IsActive = 1`,
      [projectId]
    );
    return rows.map((r) => r.DeviceType);
  }

  async isEnabled(projectId: number, deviceType: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM ProjectDeviceTypes
       WHERE ProjectID = ? AND DeviceType = ? AND IsActive = 1`,
      [projectId, deviceType]
    );
    return (row?.c ?? 0) > 0;
  }

  async enable(projectId: number, deviceType: string): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ ID: number }>(
      `SELECT ID FROM ProjectDeviceTypes WHERE ProjectID = ? AND DeviceType = ?`,
      [projectId, deviceType]
    );
    if (existing) {
      await db.runAsync(
        `UPDATE ProjectDeviceTypes SET IsActive = 1 WHERE ID = ?`,
        [existing.ID]
      );
    } else {
      await db.runAsync(
        `INSERT INTO ProjectDeviceTypes (ProjectID, DeviceType) VALUES (?, ?)`,
        [projectId, deviceType]
      );
    }
  }

  async disable(projectId: number, deviceType: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE ProjectDeviceTypes SET IsActive = 0 WHERE ProjectID = ? AND DeviceType = ?`,
      [projectId, deviceType]
    );
  }

  async toggle(projectId: number, deviceType: string): Promise<boolean> {
    const isOn = await this.isEnabled(projectId, deviceType);
    if (isOn) {
      await this.disable(projectId, deviceType);
      return false;
    } else {
      await this.enable(projectId, deviceType);
      return true;
    }
  }
}

export default new ProjectDeviceTypesRepository();
