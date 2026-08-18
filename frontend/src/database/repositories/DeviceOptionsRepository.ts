import { getDatabase } from "../db";

export interface DeviceOption {
  OptionID?: number;
  TemplateID?: number;
  DeviceType: string;
  FieldName: string;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
  IsDefault: number;
  IsActive: number;
}

export const DEVICE_FIELDS: Record<string, string> = {
  CameraType: "Camera Type",
  CameraStatus: "Camera Status",
  CameraMake: "Camera Make",
  CameraSI: "Camera SI",
  SDCardCapacity: "SD Card Capacity",
  SDCardStatus: "SD Card Status",
  SwitchType: "Switch Type",
  SwitchStatus: "Switch Status",
  SwitchMake: "Switch Make",
  SwitchSI: "Switch SI",
};

class DeviceOptionsRepository {
  async getAll(deviceType: string, templateId?: number): Promise<DeviceOption[]> {
    const db = await getDatabase();
    if (templateId) {
      return db.getAllAsync<DeviceOption>(
        `SELECT * FROM DeviceOptions
         WHERE DeviceType = ? AND TemplateID = ? AND IsActive = 1
         ORDER BY FieldName, DisplayOrder`,
        [deviceType, templateId]
      );
    }
    return db.getAllAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions
       WHERE DeviceType = ? AND IsActive = 1
       ORDER BY FieldName, DisplayOrder`,
      [deviceType]
    );
  }

  async getByField(
    deviceType: string,
    fieldName: string,
    templateId?: number
  ): Promise<DeviceOption[]> {
    const db = await getDatabase();
    if (templateId) {
      return db.getAllAsync<DeviceOption>(
        `SELECT * FROM DeviceOptions
         WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1
         ORDER BY DisplayOrder`,
        [deviceType, fieldName, templateId]
      );
    }
    return db.getAllAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions
       WHERE DeviceType = ? AND FieldName = ? AND IsActive = 1
       ORDER BY DisplayOrder`,
      [deviceType, fieldName]
    );
  }

  async getDropdownData(
    deviceType: string,
    fieldName: string,
    templateId?: number
  ): Promise<{ label: string; value: string; isDefault: number }[]> {
    const options = await this.getByField(deviceType, fieldName, templateId);
    return options.map((o) => ({ label: o.OptionLabel, value: o.OptionValue, isDefault: o.IsDefault }));
  }

  async getDefaultOption(
    deviceType: string,
    fieldName: string,
    templateId?: number
  ): Promise<string | null> {
    const options = await this.getByField(deviceType, fieldName, templateId);
    const def = options.find((o) => o.IsDefault === 1);
    return def?.OptionValue ?? null;
  }

  async add(option: DeviceOption, templateId?: number): Promise<number> {
    const db = await getDatabase();
    const tid = templateId ?? option.TemplateID ?? 1;
    const result = await db.runAsync(
      `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tid,
        option.DeviceType,
        option.FieldName,
        option.OptionLabel,
        option.OptionValue,
        option.DisplayOrder,
        option.IsDefault ?? 0,
      ]
    );

    if ((option.IsDefault ?? 0) === 1) {
      await db.runAsync(
        `UPDATE DeviceOptions SET IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP
         WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1 AND OptionID != ?`,
        [option.DeviceType, option.FieldName, tid, result.lastInsertRowId]
      );
    }

    return result.lastInsertRowId;
  }

  async update(option: DeviceOption): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceOptions
       SET OptionLabel = ?, OptionValue = ?, DisplayOrder = ?, IsDefault = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE OptionID = ?`,
      [option.OptionLabel, option.OptionValue, option.DisplayOrder, option.IsDefault ?? 0, option.OptionID!]
    );

    if (option.IsDefault === 1) {
      const tid = option.TemplateID ?? 1;
      await db.runAsync(
        `UPDATE DeviceOptions SET IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP
         WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1 AND OptionID != ?`,
        [option.DeviceType, option.FieldName, tid, option.OptionID!]
      );
    }
  }

  async setDefault(deviceType: string, fieldName: string, optionId: number, templateId?: number): Promise<void> {
    const db = await getDatabase();
    const tid = templateId ?? 1;
    await db.runAsync(
      `UPDATE DeviceOptions SET IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP
       WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1`,
      [deviceType, fieldName, tid]
    );
    await db.runAsync(
      `UPDATE DeviceOptions SET IsDefault = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE OptionID = ?`,
      [optionId]
    );
  }

  async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE OptionID = ?`,
      [id]
    );
  }

  async moveUp(id: number): Promise<void> {
    const db = await getDatabase();
    const current = await db.getFirstAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions WHERE OptionID = ?`,
      [id]
    );
    if (!current) return;

    const prev = await db.getFirstAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions
       WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1 AND DisplayOrder < ?
       ORDER BY DisplayOrder DESC LIMIT 1`,
      [current.DeviceType, current.FieldName, current.TemplateID ?? 1, current.DisplayOrder]
    );
    if (!prev) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE DeviceOptions SET DisplayOrder = ? WHERE OptionID = ?`,
        [prev.DisplayOrder, id]
      );
      await db.runAsync(
        `UPDATE DeviceOptions SET DisplayOrder = ? WHERE OptionID = ?`,
        [current.DisplayOrder, prev.OptionID!]
      );
    });
  }

  async moveDown(id: number): Promise<void> {
    const db = await getDatabase();
    const current = await db.getFirstAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions WHERE OptionID = ?`,
      [id]
    );
    if (!current) return;

    const next = await db.getFirstAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions
       WHERE DeviceType = ? AND FieldName = ? AND TemplateID = ? AND IsActive = 1 AND DisplayOrder > ?
       ORDER BY DisplayOrder ASC LIMIT 1`,
      [current.DeviceType, current.FieldName, current.TemplateID ?? 1, current.DisplayOrder]
    );
    if (!next) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE DeviceOptions SET DisplayOrder = ? WHERE OptionID = ?`,
        [next.DisplayOrder, id]
      );
      await db.runAsync(
        `UPDATE DeviceOptions SET DisplayOrder = ? WHERE OptionID = ?`,
        [current.DisplayOrder, next.OptionID!]
      );
    });
  }

  async cloneAll(sourceTemplateId: number, targetTemplateId: number): Promise<void> {
    const db = await getDatabase();
    const options = await db.getAllAsync<DeviceOption>(
      `SELECT * FROM DeviceOptions WHERE TemplateID = ? AND IsActive = 1 ORDER BY FieldName, DisplayOrder`,
      [sourceTemplateId]
    );
    for (const o of options) {
      await db.runAsync(
        `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
        [targetTemplateId, o.DeviceType, o.FieldName, o.OptionLabel, o.OptionValue, o.DisplayOrder]
      );
    }
  }
}

export default new DeviceOptionsRepository();
