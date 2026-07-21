import { getDatabase } from "../db";
import { InspectionField } from "@/src/models/InspectionField";

export default class InspectionFieldRepository {
  static async getFieldsBySection(
    sectionId: number
  ): Promise<InspectionField[]> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<InspectionField>(
      `
      SELECT
        FieldID,
        SectionID,
        FieldName,
        FieldKey,
        FieldType,
        Placeholder,
        DefaultValue,
        HelpText,
        ValidationRule,
        DisplayOrder,
        IsRequired,
        IsVisible,
        IsActive
      FROM InspectionFields
      WHERE
        SectionID = ?
        AND IsVisible = 1
        AND IsActive = 1
      ORDER BY DisplayOrder
      `,
      [sectionId]
    );

    return rows;
  }
}