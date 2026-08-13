import { getDatabase, SqlValue } from "../db";

export interface FieldOption {
  OptionID: number;
  FieldID: number;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
  IsDefault: number;
  IsActive: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export class FieldOptionRepository {
  static async getByField(fieldId: number): Promise<FieldOption[]> {
    const db = await getDatabase();
    return db.getAllAsync<FieldOption>(
      `SELECT * FROM FieldOptions
       WHERE FieldID = ? AND IsActive = 1
       ORDER BY DisplayOrder`,
      [fieldId]
    );
  }

  static async getById(id: number): Promise<FieldOption | null> {
    const db = await getDatabase();
    return db.getFirstAsync<FieldOption>(
      `SELECT * FROM FieldOptions WHERE OptionID = ?`,
      [id]
    );
  }

  static async create(data: {
    FieldID: number;
    OptionLabel: string;
    OptionValue: string;
    DisplayOrder?: number;
    IsDefault?: number;
  }): Promise<number> {
    const db = await getDatabase();

    const maxOrder = await db.getFirstAsync<{ Max: number }>(
      `SELECT COALESCE(MAX(DisplayOrder), 0) as Max
       FROM FieldOptions WHERE FieldID = ?`,
      [data.FieldID]
    );

    const result = await db.runAsync(
      `INSERT INTO FieldOptions
       (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        data.FieldID,
        data.OptionLabel,
        data.OptionValue,
        data.DisplayOrder ?? ((maxOrder?.Max ?? 0) + 1),
        data.IsDefault ?? 0,
      ]
    );
    return result.lastInsertRowId;
  }

  static async update(
    id: number,
    data: {
      OptionLabel?: string;
      OptionValue?: string;
      DisplayOrder?: number;
      IsDefault?: number;
    }
  ): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (data.OptionLabel !== undefined) { fields.push("OptionLabel = ?"); values.push(data.OptionLabel); }
    if (data.OptionValue !== undefined) { fields.push("OptionValue = ?"); values.push(data.OptionValue); }
    if (data.DisplayOrder !== undefined) { fields.push("DisplayOrder = ?"); values.push(data.DisplayOrder); }
    if (data.IsDefault !== undefined) { fields.push("IsDefault = ?"); values.push(data.IsDefault); }

    if (fields.length === 0) return;

    fields.push("UpdatedAt = CURRENT_TIMESTAMP");
    values.push(id);

    await db.runAsync(
      `UPDATE FieldOptions SET ${fields.join(", ")} WHERE OptionID = ?`,
      values
    );
  }

  static async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE FieldOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE OptionID = ?`,
      [id]
    );
  }

  static async hardDelete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM FieldOptions WHERE OptionID = ?`, [id]);
  }

  static async reorder(options: { OptionID: number; DisplayOrder: number }[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const option of options) {
        await db.runAsync(
          `UPDATE FieldOptions SET DisplayOrder = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE OptionID = ?`,
          [option.DisplayOrder, option.OptionID]
        );
      }
    });
  }

  static async deleteByField(fieldId: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE FieldOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID = ?`,
      [fieldId]
    );
  }

  static async getByFieldKey(fieldKey: string): Promise<FieldOption[]> {
    const db = await getDatabase();
    return db.getAllAsync<FieldOption>(
      `SELECT fo.* FROM FieldOptions fo
       JOIN InspectionFields if2 ON fo.FieldID = if2.FieldID
       WHERE if2.FieldKey = ? AND fo.IsActive = 1
       ORDER BY fo.DisplayOrder`,
      [fieldKey]
    );
  }
}
