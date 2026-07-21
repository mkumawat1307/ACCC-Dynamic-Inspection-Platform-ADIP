// src/database/repositories/InspectionRepository.ts

import { getDatabase } from "../db";

export interface InspectionSection {
  SectionID: number;
  SectionName: string;
  DisplayOrder: number;
}

export interface InspectionField {
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
  IsActive: number;

  CreatedAt: string;
  UpdatedAt: string;
}

export class InspectionRepository {
  static async getSections(): Promise<InspectionSection[]> {
    const db = await getDatabase();

    return await db.getAllAsync<InspectionSection>(`
      SELECT
        SectionID,
        SectionName,
        DisplayOrder
      FROM InspectionSections
      WHERE IsActive = 1
      ORDER BY DisplayOrder;
    `);
  }
static async getFieldsBySection(
  sectionId: number
): Promise<InspectionField[]> {
  const db = await getDatabase();

 return await db.getAllAsync<InspectionField>(
    `
    SELECT *
    FROM InspectionFields
    WHERE SectionID = ?
      AND IsActive = 1
      AND IsVisible = 1
    ORDER BY DisplayOrder ASC
    `,
    [sectionId]
  );
}
static async createInspection(
  projectId: number,
  districtId: number | null,
  inspectionDate: string
): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `
    INSERT INTO Inspections (
      ProjectID,
      DistrictID,
      PoleID,
      InspectionDate,
      Status
    )
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      projectId,
      districtId,
      "",
      inspectionDate,
      "Draft",
    ]
  );

  return result.lastInsertRowId as number;
}

static async saveFieldValue(
  inspectionId: number,
  fieldKey: string,
  value: string
) {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ ValueID: number }>(
    `
    SELECT ValueID
    FROM InspectionValues
    WHERE InspectionID = ?
      AND FieldKey = ?
    `,
    [inspectionId, fieldKey]
  );

  if (existing) {
    await db.runAsync(
      `
      UPDATE InspectionValues
      SET
        Value = ?,
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE ValueID = ?
      `,
      [value, existing.ValueID]
    );
  } else {
    await db.runAsync(
      `
      INSERT INTO InspectionValues
      (
        InspectionID,
        FieldKey,
        Value
      )
      VALUES (?, ?, ?)
      `,
      [inspectionId, fieldKey, value]
    );
  }
}

static async updateInspectionPoleId(
  inspectionId: number,
  poleId: string
) {
  const db = await getDatabase();

  await db.runAsync(
    `
    UPDATE Inspections
    SET
      PoleID = ?,
      UpdatedAt = CURRENT_TIMESTAMP
    WHERE InspectionID = ?
    `,
    [poleId, inspectionId]
  );
}

static async getInspectionValues(
  inspectionId: number
): Promise<Record<string, string>> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    FieldKey: string;
    Value: string;
  }>(
    `
    SELECT FieldKey, Value
    FROM InspectionValues
    WHERE InspectionID = ?
    `,
    [inspectionId]
  );

  const values: Record<string, string> = {};

  rows.forEach((row) => {
    values[row.FieldKey] = row.Value ?? "";
  });

  return values;
}
static async deleteInspection(
  inspectionId: number
) {
  const db = await getDatabase();

  await db.runAsync(
    `
    DELETE FROM InspectionValues
    WHERE InspectionID = ?
    `,
    [inspectionId]
  );

  await db.runAsync(
    `
    DELETE FROM Inspections
    WHERE InspectionID = ?
    `,
    [inspectionId]
  );
}

static async deleteMultipleInspections(
  inspectionIds: number[]
) {
  for (const id of inspectionIds) {
    await this.deleteInspection(id);
  }
}
}