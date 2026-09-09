//frontend\src\database\repositories\InspectionFieldRepository.ts
import { getDatabase } from "../db";
import { InspectionField } from "@/src/models/InspectionField";
import InspectionValueRepository from "./InspectionValueRepository";

export interface FieldOption {
  OptionID: number;
  FieldID: number;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
  IsDefault: number;
  IsActive?: number;
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
    sectionId: number,
    inspectionId?: number
  ): Promise<InspectionField[]> {
    const db = await getDatabase();

    const base = await db.getAllAsync<InspectionField>(
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

    if (inspectionId == null) {
      return base;
    }

    const valueRows = await db.getAllAsync<{ FieldID: number }>(
      `SELECT FieldID FROM InspectionValues WHERE InspectionID = ?`,
      [inspectionId]
    );
    if (valueRows.length === 0) {
      return base;
    }
    const valueFieldIds = [...new Set(valueRows.map((r) => r.FieldID))];

    const placeholders = valueFieldIds.map(() => "?").join(",");
    const hidden = await db.getAllAsync<InspectionField>(
      `SELECT FieldID, SectionID, FieldName, FieldKey, FieldType,
              Placeholder, DefaultValue, HelpText, ValidationRule,
              DisplayOrder, IsRequired, IsVisible, IsActive
       FROM InspectionFields
       WHERE SectionID = ? AND FieldID IN (${placeholders});`,
      [sectionId, ...valueFieldIds]
    );

    const merged = [...base];
    const present = new Set(base.map((f) => f.FieldID));
    for (const field of hidden) {
      if (!present.has(field.FieldID)) {
        merged.push(field);
      }
    }
    return merged.sort((a, b) => a.DisplayOrder - b.DisplayOrder);
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
        AND IsActive = 1
      ORDER BY DisplayOrder;
      `,
      [fieldId]
    );
  }

  static async getFieldOptionsBySection(sectionId: number, inspectionId?: number): Promise<Map<number, FieldOption[]>> {
    const db = await getDatabase();

    const fieldIds = new Set<number>();
    const activeFieldIds = new Set<number>();
    const activeFields = await db.getAllAsync<{ FieldID: number }>(
      `SELECT FieldID FROM InspectionFields WHERE SectionID = ? AND IsActive = 1`,
      [sectionId]
    );
    for (const f of activeFields) {
      fieldIds.add(f.FieldID);
      activeFieldIds.add(f.FieldID);
    }

    if (inspectionId != null) {
      const valueRows = await db.getAllAsync<{ FieldID: number }>(
        `SELECT FieldID FROM InspectionValues WHERE InspectionID = ?`,
        [inspectionId]
      );
      if (valueRows.length > 0) {
        const valueFieldIds = [...new Set(valueRows.map((r) => r.FieldID))];
        const placeholders = valueFieldIds.map(() => "?").join(",");
        const hidden = await db.getAllAsync<{ FieldID: number }>(
          `SELECT FieldID FROM InspectionFields WHERE SectionID = ? AND FieldID IN (${placeholders})`,
          [sectionId, ...valueFieldIds]
        );
        for (const f of hidden) fieldIds.add(f.FieldID);
      }
    }

    if (fieldIds.size === 0) return new Map();
    const ids = [...fieldIds];
    const placeholders = ids.map(() => "?").join(",");
    const rows = await db.getAllAsync<FieldOption>(
      `SELECT OptionID, FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive
       FROM FieldOptions
       WHERE FieldID IN (${placeholders})${inspectionId == null ? " AND IsActive = 1" : ""}
       ORDER BY DisplayOrder;`,
      ids
    );

    const savedByField = new Map<number, Set<string>>();
    if (inspectionId != null) {
      const valueRows = await db.getAllAsync<{ FieldID: number; FieldValue: string }>(
        `SELECT FieldID, FieldValue FROM InspectionValues WHERE InspectionID = ? AND FieldID IN (${placeholders})`,
        [inspectionId, ...ids]
      );
      for (const v of valueRows) {
        if (v.FieldValue == null || v.FieldValue === "") continue;
        let set = savedByField.get(v.FieldID);
        if (!set) {
          set = new Set();
          savedByField.set(v.FieldID, set);
        }
        set.add(v.FieldValue);
      }
    }

    const map = new Map<number, FieldOption[]>();
    for (const row of rows) {
      if (inspectionId != null && !activeFieldIds.has(row.FieldID)) {
        const existing = map.get(row.FieldID);
        if (existing) {
          existing.push(row);
        } else {
          map.set(row.FieldID, [row]);
        }
        continue;
      }
      if (inspectionId != null && row.IsActive !== 1 && !savedByField.get(row.FieldID)?.has(row.OptionValue)) {
        continue;
      }
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

  static async getDefaultTemplateFields(): Promise<InspectionField[]> {
    const db = await getDatabase();
    return await db.getAllAsync<InspectionField>(
      `SELECT f.FieldID, f.SectionID, f.FieldName, f.FieldKey, f.FieldType,
              f.Placeholder, f.DefaultValue, f.HelpText, f.ValidationRule,
              f.DisplayOrder, f.IsRequired, f.IsVisible, f.IsActive
       FROM InspectionFields f
       INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
       INNER JOIN InspectionTemplates t ON s.TemplateID = t.TemplateID
       WHERE t.IsDefault = 1
         AND s.IsActive = 1
         AND f.IsActive = 1
         AND f.IsVisible = 1
       ORDER BY s.DisplayOrder ASC, f.DisplayOrder ASC;`,
      []
    );
  }

  static async getFieldOptionsByFieldIds(fieldIds: number[]): Promise<Map<number, FieldOption[]>> {
    if (fieldIds.length === 0) return new Map();
    const db = await getDatabase();
    const placeholders = fieldIds.map(() => "?").join(",");
    const rows = await db.getAllAsync<FieldOption>(
      `SELECT OptionID, FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault
       FROM FieldOptions
       WHERE FieldID IN (${placeholders}) AND IsActive = 1
       ORDER BY DisplayOrder;`,
      fieldIds
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

  /**
   * Apply configured "Default Selection" values for every active, visible field
   * of the default template, independent of any UI section being mounted or
   * expanded. Value precedence (matches SectionRenderer.loadSection): saved
   * value wins; otherwise the IsDefault FieldOption; otherwise the field's
   * DefaultValue. A value is only persisted when there is no existing saved
   * value and the resolved default is non-empty, so existing user data is never
   * overwritten and fields without a Default Selection stay empty.
   *
   * This only applies to NEW inspections. When `existing` is true (editing an
   * already-created inspection) no defaults are applied or persisted — the
   * persisted InspectionValue is authoritative, a missing value stays empty,
   * and opening an existing inspection never creates InspectionValues.
   */
  static async applyDefaultSelections(
    inspectionId: number,
    existing = false
  ): Promise<void> {
    if (existing) return;

    const fields = await this.getDefaultTemplateFields();
    if (fields.length === 0) return;

    const saved = await InspectionValueRepository.getValuesByInspection(inspectionId);
    const savedMap = new Map<number, string>();
    for (const sv of saved) {
      savedMap.set(sv.FieldID, sv.FieldValue ?? "");
    }

    const optionsByField = await this.getFieldOptionsByFieldIds(
      fields.map((f) => f.FieldID)
    );

    for (const field of fields) {
      if (savedMap.has(field.FieldID)) continue;

      const type = field.FieldType.toUpperCase();
      let defaultOptionValue: string | undefined;
      if (type === "DROPDOWN" || type === "PROJECT_DROPDOWN") {
        const list = optionsByField.get(field.FieldID) ?? [];
        defaultOptionValue = list.find((o) => o.IsDefault === 1)?.OptionValue;
      }

      const resolved = defaultOptionValue ?? field.DefaultValue ?? "";
      if (resolved) {
        await InspectionValueRepository.saveValue(
          inspectionId,
          field.FieldID,
          resolved
        );
      }
    }
  }

}
