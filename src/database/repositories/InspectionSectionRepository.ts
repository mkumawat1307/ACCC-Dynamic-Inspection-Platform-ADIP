//frontend\src\database\repositories\InspectionSectionRepository.ts
import { getDatabase } from "../db";

export interface InspectionSection {
  SectionID: number;
  TemplateID: number;
  SectionName: string;
  DisplayOrder: number;
  IsVisible: number;
  IsActive: number;
}

export class InspectionSectionRepository {
  static async getSections(
    templateId: number = 1
  ): Promise<InspectionSection[]> {
    const db = await getDatabase();

    return await db.getAllAsync<InspectionSection>(
      `
      SELECT
        SectionID,
        TemplateID,
        SectionName,
        DisplayOrder,
        IsVisible,
        IsActive
      FROM InspectionSections
      WHERE TemplateID = ?
      ORDER BY DisplayOrder;
      `,
      [templateId]
    );
  }

  static async createSection(
    templateId: number,
    sectionName: string
  ) {
    const db = await getDatabase();

    const maxOrder =
      await db.getFirstAsync<{ MaxOrder: number }>(
        `
        SELECT
          COALESCE(MAX(DisplayOrder),0) AS MaxOrder
        FROM InspectionSections
        WHERE TemplateID = ?;
        `,
        [templateId]
      );

    await db.runAsync(
      `
      INSERT INTO InspectionSections
      (
        TemplateID,
        SectionName,
        DisplayOrder,
        IsVisible,
        IsActive
      )
      VALUES
      (?, ?, ?, 1, 1);
      `,
      [
        templateId,
        sectionName,
        (maxOrder?.MaxOrder ?? 0) + 1,
      ]
    );
  }

  static async renameSection(
    sectionId: number,
    sectionName: string
  ) {
    const db = await getDatabase();

    await db.runAsync(
      `
      UPDATE InspectionSections
      SET
        SectionName = ?,
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE SectionID = ?;
      `,
      [sectionName, sectionId]
    );
  }

  static async deleteSection(
    sectionId: number
  ) {
    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM InspectionSections
      WHERE SectionID = ?;
      `,
      [sectionId]
    );
  }

  static async toggleVisible(
    sectionId: number,
    visible: number
  ) {
    const db = await getDatabase();

    await db.runAsync(
      `
      UPDATE InspectionSections
      SET
        IsVisible = ?
      WHERE SectionID = ?;
      `,
      [visible, sectionId]
    );
  }
}