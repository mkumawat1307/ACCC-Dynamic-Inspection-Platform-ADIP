//frontend\src\database\repositories\InspectionValueRepository.ts
import { getDatabase } from "../db";
import { logger } from "@/src/utils/logger";
import { InspectionValue } from "@/src/models/InspectionValue";

export default class InspectionValueRepository {

  /**
   * Insert or Update a field value
   */
  static async saveValue(
    inspectionId: number,
    fieldId: number,
    value: string | null
  ): Promise<void> {

    const db = await getDatabase();

    const parents =
      await db.getFirstAsync<{ hasInspection: number | null; hasField: number | null }>(
        `
        SELECT
          (SELECT 1 FROM Inspections WHERE InspectionID = ?) AS hasInspection,
          (SELECT 1 FROM InspectionFields WHERE FieldID = ?) AS hasField;
        `,
        [inspectionId, fieldId]
      );

    if (!parents?.hasInspection || !parents?.hasField) {
      logger.warn(
        `[InspectionValueRepository.saveValue] skipped write: inspection ${inspectionId} or field ${fieldId} does not exist`
      );
      return;
    }

    const existing =
      await db.getFirstAsync<{ ValueID: number }>(
        `
        SELECT ValueID
        FROM InspectionValues
        WHERE InspectionID = ?
          AND FieldID = ?;
        `,
        [inspectionId, fieldId]
      );

    if (existing) {

      await db.runAsync(
        `
        UPDATE InspectionValues
        SET
          FieldValue = ?,
          UpdatedAt = CURRENT_TIMESTAMP
        WHERE ValueID = ?;
        `,
        [value, existing.ValueID]
      );

    } else {

      await db.runAsync(
        `
        INSERT INTO InspectionValues
        (
          InspectionID,
          FieldID,
          FieldValue
        )
        VALUES
        (?, ?, ?);
        `,
        [
          inspectionId,
          fieldId,
          value,
        ]
      );

    }

  }

  /**
   * Save multiple values
   */
  static async saveValues(
    inspectionId: number,
    values: {
      fieldId: number;
      value: string | null;
    }[]
  ): Promise<void> {

    for (const item of values) {

      await this.saveValue(
        inspectionId,
        item.fieldId,
        item.value
      );

    }

  }

  /**
   * Get one field value
   */
  static async getValue(
    inspectionId: number,
    fieldId: number
  ): Promise<InspectionValue | null> {

    const db = await getDatabase();

    const row =
      await db.getFirstAsync<InspectionValue>(
        `
        SELECT *
        FROM InspectionValues
        WHERE InspectionID = ?
          AND FieldID = ?;
        `,
        [
          inspectionId,
          fieldId,
        ]
      );

    return row ?? null;

  }

  /**
   * Get all values of one inspection
   */
  static async getValuesByInspection(
    inspectionId: number
  ): Promise<InspectionValue[]> {

    const db = await getDatabase();

    return await db.getAllAsync<InspectionValue>(
      `
      SELECT *
      FROM InspectionValues
      WHERE InspectionID = ?
      ORDER BY FieldID;
      `,
      [inspectionId]
    );

  }

  /**
   * Delete all values of one inspection
   */
  static async deleteByInspection(
    inspectionId: number
  ): Promise<void> {

    const db = await getDatabase();

    await db.runAsync(
      `
      DELETE FROM InspectionValues
      WHERE InspectionID = ?;
      `,
      [inspectionId]
    );

  }

}