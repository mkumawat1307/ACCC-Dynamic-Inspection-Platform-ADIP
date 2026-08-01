import { getDatabase, SqlValue } from "../db";

export interface Template {
  TemplateID: number;
  TemplateName: string;
  Description: string | null;
  Version: number;
  IsDefault: number;
  IsActive: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export class TemplateRepository {
  static async getAll(): Promise<Template[]> {
    const db = await getDatabase();
    return db.getAllAsync<Template>(
      `SELECT * FROM InspectionTemplates WHERE IsActive = 1 ORDER BY TemplateName`
    );
  }

  static async getById(id: number): Promise<Template | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Template>(
      `SELECT * FROM InspectionTemplates WHERE TemplateID = ?`,
      [id]
    );
  }

  static async getDefault(): Promise<Template | null> {
    const db = await getDatabase();
    return db.getFirstAsync<Template>(
      `SELECT * FROM InspectionTemplates WHERE IsDefault = 1 AND IsActive = 1 LIMIT 1`
    );
  }

  static async create(data: {
    TemplateName: string;
    Description?: string;
    Version?: number;
    IsDefault?: number;
  }): Promise<number> {
    const db = await getDatabase();
    const result = await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, Version, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, 1)`,
      [
        data.TemplateName,
        data.Description ?? null,
        data.Version ?? 1,
        data.IsDefault ?? 0,
      ]
    );
    return result.lastInsertRowId;
  }

  static async update(
    id: number,
    data: {
      TemplateName?: string;
      Description?: string;
      Version?: number;
      IsDefault?: number;
    }
  ): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (data.TemplateName !== undefined) {
      fields.push("TemplateName = ?");
      values.push(data.TemplateName);
    }
    if (data.Description !== undefined) {
      fields.push("Description = ?");
      values.push(data.Description);
    }
    if (data.Version !== undefined) {
      fields.push("Version = ?");
      values.push(data.Version);
    }
    if (data.IsDefault !== undefined) {
      fields.push("IsDefault = ?");
      values.push(data.IsDefault);
    }

    if (fields.length === 0) return;

    fields.push("UpdatedAt = CURRENT_TIMESTAMP");
    values.push(id);

    await db.runAsync(
      `UPDATE InspectionTemplates SET ${fields.join(", ")} WHERE TemplateID = ?`,
      values
    );
  }

  static async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE InspectionTemplates SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE TemplateID = ?`,
      [id]
    );
  }

  static async hardDelete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM InspectionTemplates WHERE TemplateID = ?`, [id]);
  }

  static async getSectionCount(templateId: number): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ Count: number }>(
      `SELECT COUNT(*) as Count FROM InspectionSections WHERE TemplateID = ?`,
      [templateId]
    );
    return result?.Count ?? 0;
  }

  static async hasInspections(templateId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ Count: number }>(
      `SELECT COUNT(*) as Count FROM Inspections WHERE TemplateID = ?`,
      [templateId]
    );
    return (result?.Count ?? 0) > 0;
  }
}
