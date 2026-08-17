import { getDatabase, SqlValue } from "../db";

export interface Field {
  FieldID: number;
  SectionID: number;
  FieldName: string;
  FieldKey: string;
  FieldType: string;
  Placeholder: string | null;
  DefaultValue: string | null;
  HelpText: string | null;
  ValidationRule: string | null;
  DisplayOrder: number;
  IsRequired: number;
  IsVisible: number;
  IsReadOnly: number;
  IsSystemField: number;
  DataSourceType: string | null;
  DataSource: string | null;
  ParentFieldID: number | null;
  Width: number;
  Icon: string | null;
  IsActive: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export const FIELD_TYPES = [
  { value: "text", label: "Text Input" },
  { value: "number", label: "Numbers" },
  { value: "multiline", label: "Multiline Text" },
  { value: "dropdown", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "date_auto", label: "Date (Auto)" },
  { value: "time", label: "Time" },
  { value: "GPS", label: "GPS" },
  { value: "checkbox", label: "Checkbox" },
] as const;

export const CREATEABLE_FIELD_TYPES = [
  { value: "text", label: "Text Input" },
  { value: "number", label: "Numbers" },
  { value: "multiline", label: "Multiline Text" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
] as const;

export class FieldRepository {
  static async getBySection(sectionId: number): Promise<Field[]> {
    const db = await getDatabase();
    return db.getAllAsync<Field>(
      `SELECT * FROM InspectionFields
       WHERE SectionID = ? AND IsActive = 1
       ORDER BY DisplayOrder`,
      [sectionId]
    );
  }

  static async getById(id: number): Promise<Field | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Field>(
      `SELECT * FROM InspectionFields WHERE FieldID = ?`,
      [id]
    );
  }

  static async create(data: {
    SectionID: number;
    FieldName: string;
    FieldKey: string;
    FieldType: string;
    Placeholder?: string | null;
    DefaultValue?: string | null;
    HelpText?: string | null;
    ValidationRule?: string | null;
    DisplayOrder?: number;
    IsRequired?: number;
    IsVisible?: number;
    IsReadOnly?: number;
    IsSystemField?: number;
    DataSourceType?: string | null;
    DataSource?: string | null;
    Width?: number;
    Icon?: string | null;
  }): Promise<number> {
    const db = await getDatabase();

    const maxOrder = await db.getFirstAsync<{ Max: number }>(
      `SELECT COALESCE(MAX(DisplayOrder), 0) as Max
       FROM InspectionFields WHERE SectionID = ?`,
      [data.SectionID]
    );

    const result = await db.runAsync(
      `INSERT INTO InspectionFields
       (SectionID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
        HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly,
        IsSystemField, DataSourceType, DataSource, Width, Icon, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        data.SectionID,
        data.FieldName,
        data.FieldKey,
        data.FieldType,
        data.Placeholder ?? null,
        data.DefaultValue ?? null,
        data.HelpText ?? null,
        data.ValidationRule ?? null,
        data.DisplayOrder ?? ((maxOrder?.Max ?? 0) + 1),
        data.IsRequired ?? 0,
        data.IsVisible ?? 1,
        data.IsReadOnly ?? 0,
        data.IsSystemField ?? 0,
        data.DataSourceType ?? null,
        data.DataSource ?? null,
        data.Width ?? 12,
        data.Icon ?? null,
      ]
    );
    return result.lastInsertRowId;
  }

  static async update(
    id: number,
    data: {
      FieldName?: string;
      FieldKey?: string;
      FieldType?: string;
      Placeholder?: string | null;
      DefaultValue?: string | null;
      HelpText?: string | null;
      ValidationRule?: string | null;
      DisplayOrder?: number;
      IsRequired?: number;
      IsVisible?: number;
      IsReadOnly?: number;
      DataSourceType?: string | null;
      DataSource?: string | null;
      Width?: number;
      Icon?: string | null;
    }
  ): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (data.FieldName !== undefined) { fields.push("FieldName = ?"); values.push(data.FieldName); }
    if (data.FieldKey !== undefined) { fields.push("FieldKey = ?"); values.push(data.FieldKey); }
    if (data.FieldType !== undefined) { fields.push("FieldType = ?"); values.push(data.FieldType); }
    if (data.Placeholder !== undefined) { fields.push("Placeholder = ?"); values.push(data.Placeholder); }
    if (data.DefaultValue !== undefined) { fields.push("DefaultValue = ?"); values.push(data.DefaultValue); }
    if (data.HelpText !== undefined) { fields.push("HelpText = ?"); values.push(data.HelpText); }
    if (data.ValidationRule !== undefined) { fields.push("ValidationRule = ?"); values.push(data.ValidationRule); }
    if (data.DisplayOrder !== undefined) { fields.push("DisplayOrder = ?"); values.push(data.DisplayOrder); }
    if (data.IsRequired !== undefined) { fields.push("IsRequired = ?"); values.push(data.IsRequired); }
    if (data.IsVisible !== undefined) { fields.push("IsVisible = ?"); values.push(data.IsVisible); }
    if (data.IsReadOnly !== undefined) { fields.push("IsReadOnly = ?"); values.push(data.IsReadOnly); }
    if (data.DataSourceType !== undefined) { fields.push("DataSourceType = ?"); values.push(data.DataSourceType); }
    if (data.DataSource !== undefined) { fields.push("DataSource = ?"); values.push(data.DataSource); }
    if (data.Width !== undefined) { fields.push("Width = ?"); values.push(data.Width); }
    if (data.Icon !== undefined) { fields.push("Icon = ?"); values.push(data.Icon); }

    if (fields.length === 0) return;

    fields.push("UpdatedAt = CURRENT_TIMESTAMP");
    values.push(id);

    await db.runAsync(
      `UPDATE InspectionFields SET ${fields.join(", ")} WHERE FieldID = ?`,
      values
    );
  }

  static async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID = ?`,
      [id]
    );
  }

  static async hardDelete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM InspectionFields WHERE FieldID = ?`, [id]);
  }

  static async reorder(fields: { FieldID: number; DisplayOrder: number }[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const field of fields) {
        await db.runAsync(
          `UPDATE InspectionFields SET DisplayOrder = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID = ?`,
          [field.DisplayOrder, field.FieldID]
        );
      }
    });
  }

  static async hasValues(fieldId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ Count: number }>(
      `SELECT COUNT(*) as Count FROM InspectionValues WHERE FieldID = ?`,
      [fieldId]
    );
    return (result?.Count ?? 0) > 0;
  }

  static async keyExists(key: string, excludeId?: number): Promise<boolean> {
    const db = await getDatabase();
    let query = `SELECT COUNT(*) as Count FROM InspectionFields WHERE FieldKey = ?`;
    const params: SqlValue[] = [key];
    if (excludeId) {
      query += ` AND FieldID != ?`;
      params.push(excludeId);
    }
    const result = await db.getFirstAsync<{ Count: number }>(query, params);
    return (result?.Count ?? 0) > 0;
  }
}
