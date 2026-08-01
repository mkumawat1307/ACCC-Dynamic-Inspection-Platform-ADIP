import { getDatabase, SqlValue } from "../db";

export interface Section {
  SectionID: number;
  TemplateID: number;
  SectionName: string;
  SectionKey: string;
  Description: string | null;
  Icon: string | null;
  DisplayOrder: number;
  IsRepeatable: number;
  IsVisible: number;
  IsActive: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export class SectionRepository {
  static async getByTemplate(templateId: number): Promise<Section[]> {
    const db = await getDatabase();
    return db.getAllAsync<Section>(
      `SELECT * FROM InspectionSections
       WHERE TemplateID = ? AND IsActive = 1
       ORDER BY DisplayOrder`,
      [templateId]
    );
  }

  static async getById(id: number): Promise<Section | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Section>(
      `SELECT * FROM InspectionSections WHERE SectionID = ?`,
      [id]
    );
  }

  static async create(data: {
    TemplateID: number;
    SectionName: string;
    SectionKey: string;
    Description?: string;
    Icon?: string;
    DisplayOrder?: number;
    IsRepeatable?: number;
    IsVisible?: number;
  }): Promise<number> {
    const db = await getDatabase();

    const maxOrder = await db.getFirstAsync<{ Max: number }>(
      `SELECT COALESCE(MAX(DisplayOrder), 0) as Max
       FROM InspectionSections WHERE TemplateID = ?`,
      [data.TemplateID]
    );

    const result = await db.runAsync(
      `INSERT INTO InspectionSections
       (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        data.TemplateID,
        data.SectionName,
        data.SectionKey,
        data.Description ?? null,
        data.Icon ?? null,
        data.DisplayOrder ?? ((maxOrder?.Max ?? 0) + 1),
        data.IsRepeatable ?? 0,
        data.IsVisible ?? 1,
      ]
    );
    return result.lastInsertRowId;
  }

  static async update(
    id: number,
    data: {
      SectionName?: string;
      SectionKey?: string;
      Description?: string;
      Icon?: string;
      DisplayOrder?: number;
      IsRepeatable?: number;
      IsVisible?: number;
    }
  ): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (data.SectionName !== undefined) {
      fields.push("SectionName = ?");
      values.push(data.SectionName);
    }
    if (data.SectionKey !== undefined) {
      fields.push("SectionKey = ?");
      values.push(data.SectionKey);
    }
    if (data.Description !== undefined) {
      fields.push("Description = ?");
      values.push(data.Description);
    }
    if (data.Icon !== undefined) {
      fields.push("Icon = ?");
      values.push(data.Icon);
    }
    if (data.DisplayOrder !== undefined) {
      fields.push("DisplayOrder = ?");
      values.push(data.DisplayOrder);
    }
    if (data.IsRepeatable !== undefined) {
      fields.push("IsRepeatable = ?");
      values.push(data.IsRepeatable);
    }
    if (data.IsVisible !== undefined) {
      fields.push("IsVisible = ?");
      values.push(data.IsVisible);
    }

    if (fields.length === 0) return;

    fields.push("UpdatedAt = CURRENT_TIMESTAMP");
    values.push(id);

    await db.runAsync(
      `UPDATE InspectionSections SET ${fields.join(", ")} WHERE SectionID = ?`,
      values
    );
  }

  static async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionID = ?`,
      [id]
    );
  }

  static async hardDelete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM InspectionSections WHERE SectionID = ?`, [id]);
  }

  static async reorder(sections: { SectionID: number; DisplayOrder: number }[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const section of sections) {
        await db.runAsync(
          `UPDATE InspectionSections SET DisplayOrder = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionID = ?`,
          [section.DisplayOrder, section.SectionID]
        );
      }
    });
  }

  static async getFieldCount(sectionId: number): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ Count: number }>(
      `SELECT COUNT(*) as Count FROM InspectionFields WHERE SectionID = ?`,
      [sectionId]
    );
    return result?.Count ?? 0;
  }

  static async hasInspectionValues(sectionId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ Count: number }>(
      `SELECT COUNT(*) as Count
       FROM InspectionValues iv
       JOIN InspectionFields if2 ON iv.FieldID = if2.FieldID
       WHERE if2.SectionID = ?`,
      [sectionId]
    );
    return (result?.Count ?? 0) > 0;
  }
}
