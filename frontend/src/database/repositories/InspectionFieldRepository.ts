//frontend\src\database\repositories\InspectionFieldRepository.ts
import { getDatabase } from "../db";
import { InspectionField } from "@/src/models/InspectionField";

export interface FieldOption {
  OptionID: number;
  FieldID: number;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
  IsDefault: number;
}

export default class InspectionFieldRepository {

  static async getInspectionValues(
    inspectionId: number
  ): Promise<Record<string, string>> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<{
      FieldKey: string;
      FieldValue: string;
    }>(
      `
      SELECT f.FieldKey, v.FieldValue
      FROM InspectionValues v
      JOIN InspectionFields f ON v.FieldID = f.FieldID
      WHERE v.InspectionID = ?
      `,
      [inspectionId]
    );

    const values: Record<string, string> = {};

    rows.forEach((row) => {
      values[row.FieldKey] = row.FieldValue ?? "";
    });

    return values;
  }

  static async getFieldsBySection(
    sectionId: number
  ): Promise<InspectionField[]> {
    const db = await getDatabase();

    return await db.getAllAsync<InspectionField>(
      `SELECT FieldID, SectionID, FieldName, FieldKey, FieldType,
              Placeholder, DefaultValue, HelpText, ValidationRule,
              DisplayOrder, IsRequired, IsVisible, IsActive
       FROM InspectionFields
       WHERE SectionID = ?
         AND IsActive = 1
         AND IsVisible = 1
       ORDER BY DisplayOrder;`,
      [sectionId]
    );
  }

  static async getFieldById(
    fieldId: number
  ): Promise<InspectionField | null> {
    const db = await getDatabase();

    const row =
      await db.getFirstAsync<InspectionField>(
        `
        SELECT *
        FROM InspectionFields
        WHERE FieldID = ?;
        `,
      [fieldId]
    );

    return row ?? null;
  }

  static async getFieldOptions(fieldId: number): Promise<FieldOption[]> {
    const db = await getDatabase();
    return await db.getAllAsync<FieldOption>(
      `
      SELECT OptionID, FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault
      FROM FieldOptions
      WHERE FieldID = ?
      ORDER BY DisplayOrder;
      `,
      [fieldId]
    );
  }

  static async getFieldOptionsBySection(sectionId: number): Promise<Map<number, FieldOption[]>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<FieldOption>(
      `SELECT fo.OptionID, fo.FieldID, fo.OptionLabel, fo.OptionValue, fo.DisplayOrder, fo.IsDefault
       FROM FieldOptions fo
       INNER JOIN InspectionFields f ON fo.FieldID = f.FieldID
       WHERE f.SectionID = ? AND f.IsActive = 1
       ORDER BY fo.DisplayOrder;`,
      [sectionId]
    );
    const map = new Map<number, FieldOption[]>();
    for (const row of rows) {
      const existing = map.get(row.FieldID);
      if (existing) {
        existing.push(row);
      } else {
        map.set(row.FieldID, [row]);
      }
    }
    return map;
  }

  static async getActiveTemplateFields(): Promise<{ FieldKey: string; FieldName: string }[]> {
    const db = await getDatabase();
    return await db.getAllAsync<{ FieldKey: string; FieldName: string }>(
      `SELECT f.FieldKey, f.FieldName
       FROM InspectionFields f
       INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
       INNER JOIN InspectionTemplates t ON s.TemplateID = t.TemplateID
       WHERE t.IsDefault = 1
         AND s.IsActive = 1
         AND f.IsActive = 1
       ORDER BY s.DisplayOrder ASC, f.DisplayOrder ASC;`,
      []
    );
  }

}
