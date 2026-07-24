// src/database/repositories/InspectionRepository.ts

import { getDatabase } from "../db";

export interface InspectionSection {
  SectionID: number;
  SectionName: string;
  SectionKey: string;
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
        SectionKey,
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
console.log(
  "NEW INSPECTION CREATED:",
  result.lastInsertRowId
);

return result.lastInsertRowId as number;
}

static async saveFieldValue(
  inspectionId: number,
  fieldId: number,
  value: string
) {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ ValueID: number }>(
    `
    SELECT ValueID
    FROM InspectionValues
    WHERE InspectionID = ?
      AND FieldID = ?
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
        FieldID,
        FieldValue
      )
      VALUES (?, ?, ?)
      `,
      [inspectionId, fieldId, value]
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

static async validateInspection(
  inspectionId: number
): Promise<{
  valid: boolean;
  missingFields: string[];
}> {
  const db = await getDatabase();

  const requiredFields = await db.getAllAsync<{
    FieldKey: string;
    FieldName: string;
    DefaultValue: string | null;
  }>(
    `
    SELECT
      FieldKey,
      FieldName,
      DefaultValue
    FROM InspectionFields
    WHERE IsRequired = 1
      AND IsActive = 1
      AND IsVisible = 1
    `
  );

  const values = await this.getInspectionValues(inspectionId);

const missingFields: string[] = [];

const autoFilledFields = [
  "date",
  "division",
  "district",
];

for (const field of requiredFields) {

  // Skip fields filled automatically by the app
  if (autoFilledFields.includes(field.FieldKey)) {
    continue;
  }

  const value = values[field.FieldKey];

  if (!value || value.trim() === "") {
    missingFields.push(field.FieldName);
  }
}

return {
  valid: missingFields.length === 0,
  missingFields,
};
}
static async updateInspectionStatus(
  inspectionId: number,
  status: string
) {
  const db = await getDatabase();

  await db.runAsync(
    `
    UPDATE Inspections
    SET
      Status = ?,
      UpdatedAt = CURRENT_TIMESTAMP
    WHERE InspectionID = ?
    `,
    [status, inspectionId]
  );
}

static async getInspectionByPoleId(
  poleId: string
): Promise<{
  InspectionID: number;
  PoleID: string;
  Status: string;
} | null> {
  const db = await getDatabase();

  return await db.getFirstAsync(
    `
    SELECT
      InspectionID,
      PoleID,
      Status
    FROM Inspections
    WHERE LOWER(TRIM(PoleID)) = LOWER(TRIM(?))
    ORDER BY InspectionID DESC
    LIMIT 1
    `,
    [poleId]
  );
}

static async getInspectionPoleId(
  inspectionId: number
): Promise<string> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ PoleID: string }>(
    `
    SELECT PoleID
    FROM Inspections
    WHERE InspectionID = ?
    `,
    [inspectionId]
  );

  return row?.PoleID ?? "";
}

static async getInspectionProjectId(
  inspectionId: number
): Promise<number | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ ProjectID: number }>(
    `
    SELECT ProjectID
    FROM Inspections
    WHERE InspectionID = ?
    `,
    [inspectionId]
  );

  return row?.ProjectID ?? null;
}

static async deleteInspection(
  inspectionId: number
) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {

    await db.runAsync(
      `
      DELETE FROM Photos
      WHERE InspectionID = ?
      `,
      [inspectionId]
    );

    await db.runAsync(
      `
      DELETE FROM Cameras
      WHERE InspectionID = ?
      `,
      [inspectionId]
    );

    await db.runAsync(
      `
      DELETE FROM Switches
      WHERE InspectionID = ?
      `,
      [inspectionId]
    );

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

  });
}

static async deleteMultipleInspections(
  inspectionIds: number[]
) {
  for (const id of inspectionIds) {
    await this.deleteInspection(id);
  }
}
}