//frontend\src\database\repositories\InspectionFieldRepository.ts
import { getDatabase } from "../db";
import { InspectionField } from "@/src/models/InspectionField";

export interface FieldOption {
  OptionID: number;
  FieldID: number;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
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
      SELECT OptionID, FieldID, OptionLabel, OptionValue, DisplayOrder
      FROM FieldOptions
      WHERE FieldID = ?
      ORDER BY DisplayOrder;
      `,
      [fieldId]
    );
}

}
