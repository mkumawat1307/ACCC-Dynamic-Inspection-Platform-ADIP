import { getDatabase } from "../db";

export interface DeviceFieldDefinition {
  FieldDefID?: number;
  TemplateID?: number;
  DeviceType: string;
  FieldName: string;
  Label: string;
  FieldType: string;
  IsRequired: number;
  DisplayOrder: number;
  IsActive: number;
  Placeholder?: string | null;
  IsVisible?: number;
}

class DeviceFieldDefinitionsRepository {
  async getByDeviceType(
    deviceType: string,
    templateId?: number,
    includeInactive = false
  ): Promise<DeviceFieldDefinition[]> {
    const db = await getDatabase();
    if (templateId) {
      return db.getAllAsync<DeviceFieldDefinition>(
        `SELECT * FROM DeviceFieldDefinitions
         WHERE DeviceType = ? AND TemplateID = ?${includeInactive ? "" : " AND IsActive = 1"}
         ORDER BY DisplayOrder`,
        [deviceType, templateId]
      );
    }
    return db.getAllAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions
       WHERE DeviceType = ?${includeInactive ? "" : " AND IsActive = 1"}
       ORDER BY DisplayOrder`,
      [deviceType]
    );
  }

  async getAll(templateId?: number): Promise<DeviceFieldDefinition[]> {
    const db = await getDatabase();
    if (templateId) {
      return db.getAllAsync<DeviceFieldDefinition>(
        `SELECT * FROM DeviceFieldDefinitions
         WHERE TemplateID = ? AND IsActive = 1
         ORDER BY DeviceType, DisplayOrder`,
        [templateId]
      );
    }
    return db.getAllAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions
       WHERE IsActive = 1
       ORDER BY DeviceType, DisplayOrder`
    );
  }

  async getDeviceTypes(templateId?: number, includeInactive = false): Promise<string[]> {
    const db = await getDatabase();
    if (templateId) {
      const rows = await db.getAllAsync<{ DeviceType: string }>(
        `SELECT DeviceType FROM DeviceFieldDefinitions WHERE TemplateID = ?${includeInactive ? "" : " AND IsActive = 1"}`,
        [templateId]
      );
      return Array.from(new Set(rows.map((r) => r.DeviceType)));
    }
    const rows = await db.getAllAsync<{ DeviceType: string }>(
      `SELECT DeviceType FROM DeviceFieldDefinitions${includeInactive ? "" : " WHERE IsActive = 1"}`
    );
    return Array.from(new Set(rows.map((r) => r.DeviceType)));
  }

  /**
   * Whether an active device type with this name already exists, compared
   * case-insensitively after trimming whitespace. Only used for duplicate
   * detection — stored values are never modified.
   */
  async typeNameExists(deviceType: string, templateId?: number): Promise<boolean> {
    const types = await this.getDeviceTypes(templateId);
    const target = deviceType.trim().toLowerCase();
    return types.some((t) => t.trim().toLowerCase() === target);
  }

  async add(field: DeviceFieldDefinition, templateId?: number): Promise<number> {
    const db = await getDatabase();
    const tid = templateId ?? field.TemplateID ?? 1;

    const existing = await db.getFirstAsync<{ FieldDefID: number; IsActive: number }>(
      `SELECT FieldDefID, IsActive FROM DeviceFieldDefinitions
       WHERE TemplateID = ? AND DeviceType = ? AND FieldName = ? LIMIT 1`,
      [tid, field.DeviceType, field.FieldName]
    );

    if (existing) {
      if (existing.IsActive === 1) {
        throw new Error(
          `A field named "${field.FieldName}" already exists on device type "${field.DeviceType}".`
        );
      }
      await db.runAsync(
        `UPDATE DeviceFieldDefinitions
         SET Label = ?, FieldType = ?, IsRequired = ?, IsVisible = ?, DisplayOrder = ?, Placeholder = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
         WHERE FieldDefID = ?`,
        [field.Label, field.FieldType, field.IsRequired, field.IsVisible ?? 1, field.DisplayOrder, field.Placeholder ?? null, existing.FieldDefID]
      );
      return existing.FieldDefID;
    }

    const siblings = (await db.getAllAsync<{ FieldName: string }>(
      `SELECT FieldName FROM DeviceFieldDefinitions
       WHERE TemplateID = ? AND DeviceType = ? AND IsActive = 1`,
      [tid, field.DeviceType]
    )) ?? [];

    const targetName = field.FieldName.trim().toLowerCase();
    if (siblings.some((s) => s.FieldName.trim().toLowerCase() === targetName)) {
      throw new Error(
        `A field named "${field.FieldName}" already exists on device type "${field.DeviceType}".`
      );
    }

    const result = await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, Placeholder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tid,
        field.DeviceType,
        field.FieldName,
        field.Label,
        field.FieldType,
        field.IsRequired,
        field.IsVisible ?? 1,
        field.DisplayOrder,
        field.Placeholder ?? null,
      ]
    );
    return result.lastInsertRowId;
  }

  async update(field: DeviceFieldDefinition): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceFieldDefinitions
       SET Label = ?, FieldType = ?, IsRequired = ?, IsVisible = ?, DisplayOrder = ?, Placeholder = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE FieldDefID = ?`,
      [field.Label, field.FieldType, field.IsRequired, field.IsVisible ?? 1, field.DisplayOrder, field.Placeholder ?? null, field.FieldDefID!]
    );
  }

  async delete(id: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE DeviceFieldDefinitions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldDefID = ?`,
      [id]
    );
  }

  async moveUp(id: number): Promise<void> {
    const db = await getDatabase();
    const current = await db.getFirstAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions WHERE FieldDefID = ?`,
      [id]
    );
    if (!current) return;

    const prev = await db.getFirstAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions
       WHERE DeviceType = ? AND TemplateID = ? AND IsActive = 1 AND DisplayOrder < ?
       ORDER BY DisplayOrder DESC LIMIT 1`,
      [current.DeviceType, current.TemplateID ?? 1, current.DisplayOrder]
    );
    if (!prev) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET DisplayOrder = ? WHERE FieldDefID = ?`,
        [prev.DisplayOrder, id]
      );
      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET DisplayOrder = ? WHERE FieldDefID = ?`,
        [current.DisplayOrder, prev.FieldDefID!]
      );
    });
  }

  async moveDown(id: number): Promise<void> {
    const db = await getDatabase();
    const current = await db.getFirstAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions WHERE FieldDefID = ?`,
      [id]
    );
    if (!current) return;

    const next = await db.getFirstAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions
       WHERE DeviceType = ? AND TemplateID = ? AND IsActive = 1 AND DisplayOrder > ?
       ORDER BY DisplayOrder ASC LIMIT 1`,
      [current.DeviceType, current.TemplateID ?? 1, current.DisplayOrder]
    );
    if (!next) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET DisplayOrder = ? WHERE FieldDefID = ?`,
        [next.DisplayOrder, id]
      );
      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET DisplayOrder = ? WHERE FieldDefID = ?`,
        [current.DisplayOrder, next.FieldDefID!]
      );
    });
  }

  async cloneAll(sourceTemplateId: number, targetTemplateId: number): Promise<void> {
    const db = await getDatabase();
    const fields = await db.getAllAsync<DeviceFieldDefinition>(
      `SELECT * FROM DeviceFieldDefinitions WHERE TemplateID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
      [sourceTemplateId]
    );
    for (const f of fields) {
      await db.runAsync(
        `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive, Placeholder)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [targetTemplateId, f.DeviceType, f.FieldName, f.Label, f.FieldType, f.IsRequired, f.IsVisible ?? 1, f.DisplayOrder, f.Placeholder ?? null]
      );
    }
  }
}

export default new DeviceFieldDefinitionsRepository();
