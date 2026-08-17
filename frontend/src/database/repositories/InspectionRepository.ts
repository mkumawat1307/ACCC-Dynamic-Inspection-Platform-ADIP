// src/database/repositories/InspectionRepository.ts

import { getDatabase } from "../db";
import { logger } from "@/src/utils/logger";
import { InspectionSection, InspectionField } from "./InspectionTypes";
import { deleteInspectionData } from "./inspectionDataHelper";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import { requestAndroidBackup } from "@/src/utils/androidBackup";
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";

export function isFieldValueEmpty(type: string, value: string): boolean {
  switch (type) {
    case "text":
    case "multiline":
      return value.trim() === "";
    case "number":
      return value === "";
    case "dropdown":
      return value.trim() === "";
    case "checkbox":
      return value !== "1";
    case "switch":
      return value !== "1";
    default:
      return value.trim() === "";
  }
}

export const INSPECTION_FINAL_STATUSES = ["Completed", "Submitted"] as const;

export class InspectionRepository {
static async getSections(templateId?: number): Promise<InspectionSection[]> {
    const db = await getDatabase();

    if (!templateId) {
      const defaultTpl = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      templateId = defaultTpl?.TemplateID;
    }

    if (templateId) {
      return await db.getAllAsync<InspectionSection>(`
        SELECT
          SectionID,
          SectionName,
          SectionKey,
          DisplayOrder
        FROM InspectionSections
        WHERE IsActive = 1 AND TemplateID = ?
        ORDER BY CASE WHEN SectionKey = 'photos' THEN 2 WHEN SectionKey = 'remarks' THEN 1 ELSE 0 END, DisplayOrder;
      `, [templateId]);
    }
    return [];
  }

  static async countFinalInspections(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ Count: number }>(
      `SELECT COUNT(*) AS Count FROM Inspections WHERE Status IN ('Completed', 'Submitted')`
    );
    return row?.Count ?? 0;
  }

  static async getAllSections(templateId?: number): Promise<InspectionSection[]> {
    const db = await getDatabase();

    if (!templateId) {
      const defaultTpl = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      templateId = defaultTpl?.TemplateID;
    }

    if (templateId) {
      return await db.getAllAsync<InspectionSection>(`
        SELECT
          SectionID,
          SectionName,
          SectionKey,
          DisplayOrder
        FROM InspectionSections
        WHERE IsActive = 1 AND TemplateID = ?
        ORDER BY CASE WHEN SectionKey = 'photos' THEN 2 WHEN SectionKey = 'remarks' THEN 1 ELSE 0 END, DisplayOrder;
      `, [templateId]);
    }
    return [];
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

static async getFieldsByKey(
  sectionKey: string,
  templateId?: number
): Promise<InspectionField[]> {
  const db = await getDatabase();

  if (!templateId) {
    const defaultTpl = await db.getFirstAsync<{ TemplateID: number }>(
      `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
    );
    templateId = defaultTpl?.TemplateID;
  }

  if (templateId) {
    return await db.getAllAsync<InspectionField>(
      `
      SELECT f.*
      FROM InspectionFields f
      INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
      WHERE s.SectionKey = ?
        AND s.TemplateID = ?
        AND f.IsActive = 1
        AND f.IsVisible = 1
        AND s.IsActive = 1
      ORDER BY f.DisplayOrder ASC
      `,
      [sectionKey, templateId]
    );
  }

  return [];
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
  const newId = result.lastInsertRowId as number;
  InspectionDataBus.emitInspectionsChanged(projectId);
  return newId;
}

static async saveFieldValue(
  inspectionId: number,
  fieldId: number,
  value: string
) {
  const db = await getDatabase();

  const parents = await db.getFirstAsync<{ hasInspection: number | null; hasField: number | null }>(
    `
    SELECT
      (SELECT 1 FROM Inspections WHERE InspectionID = ?) AS hasInspection,
      (SELECT 1 FROM InspectionFields WHERE FieldID = ?) AS hasField
    `,
    [inspectionId, fieldId]
  );

  if (!parents?.hasInspection || !parents?.hasField) {
    logger.warn(
      `[InspectionRepository.saveFieldValue] skipped write: inspection ${inspectionId} or field ${fieldId} does not exist`
    );
    return;
  }

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

  const projectId = await this.getInspectionProjectId(inspectionId);
  InspectionDataBus.emitInspectionsChanged(projectId ?? 0);
}

static async updateInspectorNameForProject(
  inspectorName: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE InspectionValues
     SET FieldValue = ?, UpdatedAt = CURRENT_TIMESTAMP
     WHERE FieldID IN (
       SELECT FieldID
       FROM InspectionFields
       WHERE FieldKey = 'inspector_name'
     )`,
    [inspectorName]
  );
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

  const projectId = await this.getInspectionProjectId(inspectionId);
  InspectionDataBus.emitInspectionsChanged(projectId ?? 0);
}

static async updatePoleIdDirectSave(
  inspectionId: number,
  fieldId: number,
  poleId: string
) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await this.saveFieldValue(inspectionId, fieldId, poleId);
    await this.updateInspectionPoleId(inspectionId, poleId);
  });
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
      FieldType: string;
      DefaultValue: string | null;
    }>(
      `
      SELECT DISTINCT
        f.FieldKey,
        f.FieldName,
        f.FieldType,
        f.DefaultValue
      FROM InspectionFields f
      INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
      INNER JOIN Inspections i ON 1=1
      INNER JOIN InspectionTemplates t ON t.TemplateID = s.TemplateID
      WHERE f.IsRequired = 1
        AND f.IsActive = 1
        AND f.IsVisible = 1
        AND s.IsActive = 1
        AND t.IsDefault = 1
        AND i.InspectionID = ?
      GROUP BY f.FieldKey
      `,
      [inspectionId]
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

      if (isFieldValueEmpty(field.FieldType, value ?? "")) {
        missingFields.push(field.FieldName);
      }
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }

static async validateDeviceMandatory(
    inspectionId: number,
    templateId?: number
  ): Promise<{
    valid: boolean;
    missingFields: string[];
  }> {
    await DeviceRecordsRepository.flushPendingDeviceSaves();
    const db = await getDatabase();

    const templateClause = templateId
      ? "AND f.TemplateID = ?"
      : "AND f.TemplateID = (SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1)";
    const templateArgs = templateId ? [templateId] : [];

    // Required device field definitions per device type
    const requiredFields = await db.getAllAsync<{
      DeviceType: string;
      FieldName: string;
      Label: string;
      FieldType: string;
    }>(
      `
      SELECT
        f.DeviceType,
        f.FieldName,
        f.Label,
        f.FieldType
      FROM DeviceFieldDefinitions f
      WHERE f.IsRequired = 1
        AND f.IsActive = 1
        ${templateClause}
      ORDER BY f.DeviceType, f.DisplayOrder
    `,
      templateArgs
    );

    if (requiredFields.length === 0) {
      return { valid: true, missingFields: [] };
    }

    // Active device types for this template (to resolve {type}_count keys)
    const deviceTypes = await db.getAllAsync<{ DeviceType: string }>(
      `SELECT DISTINCT f.DeviceType FROM DeviceFieldDefinitions f WHERE f.IsActive = 1 ${templateClause}`,
      templateArgs
    );

    // Device counts come from {type}_count inspection fields (e.g. camera_count)
    const countFields = await db.getAllAsync<{ FieldKey: string }>(
      `SELECT DISTINCT f.FieldKey
       FROM InspectionFields f
       INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
       INNER JOIN InspectionTemplates t ON t.TemplateID = s.TemplateID
       WHERE f.IsActive = 1 AND t.IsDefault = 1 AND f.FieldKey LIKE '%_count'`
    );
    const values = await this.getInspectionValues(inspectionId);

    const counts: Record<string, number> = {};
    for (const row of countFields) {
      const match = row.FieldKey.match(/^(.+)_count$/);
      if (!match) continue;
      const type = deviceTypes.find(
        (t) =>
          t.DeviceType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count" ===
          row.FieldKey
      );
      if (type) {
        const count = Number(values[row.FieldKey] || "0");
        counts[type.DeviceType] = count > 0 ? count : 0;
      }
    }

    // Get all device records for this inspection
    const deviceRecords = await DeviceRecordsRepository.getByInspectionAll(inspectionId);
    const recordsByTypeNo: Record<string, Record<number, { DeviceData: string | null }>> = {};
    for (const record of deviceRecords) {
      recordsByTypeNo[record.DeviceType] = recordsByTypeNo[record.DeviceType] ?? {};
      recordsByTypeNo[record.DeviceType][record.DeviceNo] = record;
    }

    const fieldsByType: Record<string, typeof requiredFields> = {};
    for (const field of requiredFields) {
      fieldsByType[field.DeviceType] = fieldsByType[field.DeviceType] ?? [];
      fieldsByType[field.DeviceType].push(field);
    }

    const missingFields: string[] = [];

    // Validate every expected device (DeviceNo 1..count) per type with required fields,
    // including untouched devices that were never persisted.
    for (const [deviceType, fields] of Object.entries(fieldsByType)) {
      const count = counts[deviceType] ?? 0;
      for (let no = 1; no <= count; no++) {
        const record = recordsByTypeNo[deviceType]?.[no];
        let deviceData: Record<string, string | null> = {};
        if (record?.DeviceData) {
          try {
            deviceData = JSON.parse(record.DeviceData);
          } catch {
            // If JSON parsing fails, treat all fields as missing
            deviceData = {};
          }
        }

        for (const field of fields) {
          const value = deviceData[field.FieldName] ?? null;
          if (isFieldValueEmpty(field.FieldType, value ?? "")) {
            missingFields.push(`${deviceType} — ${field.Label} (Device ${no})`);
          }
        }
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

  const projectId = await this.getInspectionProjectId(inspectionId);
  InspectionDataBus.emitInspectionsChanged(projectId ?? 0);
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
  const projectId = (await this.getInspectionProjectId(inspectionId)) ?? 0;

  await db.withTransactionAsync(async () => {
    await deleteInspectionData(db, inspectionId);
  });

  InspectionDataBus.emitInspectionsChanged(projectId);

  requestAndroidBackup();
}

static async deleteMultipleInspections(
  inspectionIds: number[]
) {
  const db = await getDatabase();
  const firstId = inspectionIds[0];
  const projectId = firstId == null ? 0 : ((await this.getInspectionProjectId(firstId)) ?? 0);

  await db.withTransactionAsync(async () => {
    for (const id of inspectionIds) {
      await deleteInspectionData(db, id);
    }
  });

  InspectionDataBus.emitInspectionsChanged(projectId);

  requestAndroidBackup();
}
}