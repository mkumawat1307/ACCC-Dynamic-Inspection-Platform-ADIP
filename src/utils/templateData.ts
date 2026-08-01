import * as Sharing from "expo-sharing";
import { logger } from "@/src/utils/logger";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { getDatabase } from "../database/db";

const VALID_FIELD_TYPES = ["text", "number", "multiline", "dropdown", "date", "date_auto", "time", "GPS", "checkbox", "switch", "device", "camera", "calculation"];

function normalizeFieldType(type: string): string {
  return VALID_FIELD_TYPES.find((t) => t.toUpperCase() === type.toUpperCase()) ?? type;
}

export interface TemplateExportData {
  version: string;
  exportedAt: string;
  template: {
    TemplateName: string;
    Description: string | null;
  };
  sections: {
    SectionName: string;
    SectionKey: string;
    Description: string | null;
    Icon: string | null;
    DisplayOrder: number;
    IsRepeatable: number;
    fields: {
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
      IsReadOnly: number;
      options: {
        OptionLabel: string;
        OptionValue: string;
        DisplayOrder: number;
        IsDefault: number;
      }[];
    }[];
  }[];
}

export async function exportDefaultTemplate(): Promise<boolean> {
  const db = await getDatabase();

  const template = await db.getFirstAsync<{ TemplateID: number; TemplateName: string; Description: string | null }>(
    `SELECT TemplateID, TemplateName, Description FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
  );

  if (!template) return false;

  const sections = await db.getAllAsync<{
    SectionID: number;
    SectionName: string;
    SectionKey: string;
    Description: string | null;
    Icon: string | null;
    DisplayOrder: number;
    IsRepeatable: number;
  }>(
    `SELECT SectionID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable
     FROM InspectionSections WHERE TemplateID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
    [template.TemplateID]
  );

  const exportSections: TemplateExportData["sections"] = [];

  for (const section of sections) {
    const fields = await db.getAllAsync<{
      FieldID: number;
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
      IsReadOnly: number;
    }>(
      `SELECT FieldID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
              HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly
       FROM InspectionFields WHERE SectionID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
      [section.SectionID]
    );

    const exportFields: TemplateExportData["sections"][0]["fields"] = [];

    for (const field of fields) {
      const options = await db.getAllAsync<{
        OptionLabel: string;
        OptionValue: string;
        DisplayOrder: number;
        IsDefault: number;
      }>(
        `SELECT OptionLabel, OptionValue, DisplayOrder, IsDefault
         FROM FieldOptions WHERE FieldID = ? ORDER BY DisplayOrder`,
        [field.FieldID]
      );

      exportFields.push({
        FieldName: field.FieldName,
        FieldKey: field.FieldKey,
        FieldType: field.FieldType,
        Placeholder: field.Placeholder,
        DefaultValue: field.DefaultValue,
        HelpText: field.HelpText,
        ValidationRule: field.ValidationRule,
        DisplayOrder: field.DisplayOrder,
        IsRequired: field.IsRequired,
        IsVisible: field.IsVisible,
        IsReadOnly: field.IsReadOnly,
        options,
      });
    }

    exportSections.push({
      SectionName: section.SectionName,
      SectionKey: section.SectionKey,
      Description: section.Description,
      Icon: section.Icon,
      DisplayOrder: section.DisplayOrder,
      IsRepeatable: section.IsRepeatable,
      fields: exportFields,
    });
  }

  const exportData: TemplateExportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    template: {
      TemplateName: template.TemplateName,
      Description: template.Description,
    },
    sections: exportSections,
  };

  const json = JSON.stringify(exportData, null, 2);
  const fileName = `template_${template.TemplateName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
  const fileUri = FileSystem.documentDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Export Inspection Template",
      UTI: "public.json",
    });
    return true;
  }

  return false;
}

export async function importTemplate(): Promise<{ success: boolean; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) {
    return { success: false, message: "No file selected." };
  }

  const fileUri = result.assets[0].uri;
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  let data: TemplateExportData;
  try {
    data = JSON.parse(content);
  } catch {
    return { success: false, message: "Invalid JSON file." };
  }

  if (!data.template || !data.sections || !Array.isArray(data.sections)) {
    return { success: false, message: "Invalid template format." };
  }

  const validFieldTypes = VALID_FIELD_TYPES.map((t) => t.toUpperCase());
  const isValidFieldType = (type: string) => validFieldTypes.includes(type.toUpperCase());

  if (!data.template.TemplateName || typeof data.template.TemplateName !== "string") {
    return { success: false, message: "Template missing valid TemplateName." };
  }

  for (let si = 0; si < data.sections.length; si++) {
    const section = data.sections[si];
    if (!section.SectionName || !section.SectionKey) {
      return { success: false, message: `Section ${si + 1} missing SectionName or SectionKey.` };
    }
    if (!Array.isArray(section.fields)) {
      return { success: false, message: `Section "${section.SectionName}" missing fields array.` };
    }
    for (let fi = 0; fi < section.fields.length; fi++) {
      const field = section.fields[fi];
      if (!field.FieldName || !field.FieldKey || !field.FieldType) {
        return { success: false, message: `Field ${fi + 1} in section "${section.SectionName}" missing required property (FieldName, FieldKey, or FieldType).` };
      }
      if (!isValidFieldType(field.FieldType)) {
        return { success: false, message: `Field "${field.FieldName}" has invalid FieldType "${field.FieldType}". Valid types: ${VALID_FIELD_TYPES.join(", ")}` };
      }
      if (Array.isArray(field.options)) {
        for (let oi = 0; oi < field.options.length; oi++) {
          const opt = field.options[oi];
          if (!opt.OptionLabel || opt.OptionValue === undefined) {
            return { success: false, message: `Option ${oi + 1} in field "${field.FieldName}" missing OptionLabel or OptionValue.` };
          }
        }
      }
    }
  }

  const db = await getDatabase();

  try {
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault)
         VALUES (?, ?, 0)`,
        [data.template.TemplateName, data.template.Description ?? null]
      );
      const templateId = result.lastInsertRowId;

      for (const section of data.sections) {
        const sectionResult = await db.runAsync(
          `INSERT INTO InspectionSections
           (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1)`,
          [
            templateId,
            section.SectionName,
            section.SectionKey,
            section.Description ?? null,
            section.Icon ?? null,
            section.DisplayOrder,
            section.IsRepeatable,
          ]
        );
        const sectionId = sectionResult.lastInsertRowId;

        for (const field of section.fields) {
          const fieldResult = await db.runAsync(
            `INSERT INTO InspectionFields
             (SectionID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
              HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly,
              IsSystemField, Width, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 12, 1)`,
            [
              sectionId,
              field.FieldName,
              field.FieldKey,
              normalizeFieldType(field.FieldType),
              field.Placeholder ?? null,
              field.DefaultValue ?? null,
              field.HelpText ?? null,
              field.ValidationRule ?? null,
              field.DisplayOrder,
              field.IsRequired,
              field.IsVisible,
              field.IsReadOnly,
            ]
          );
          const fieldId = fieldResult.lastInsertRowId;

          for (const option of field.options) {
            await db.runAsync(
              `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault)
               VALUES (?, ?, ?, ?, ?)`,
              [fieldId, option.OptionLabel, option.OptionValue, option.DisplayOrder, option.IsDefault ?? 0]
            );
          }
        }
      }
    });

    return { success: true, message: `Template "${data.template.TemplateName}" imported with ${data.sections.length} sections.` };
  } catch (error) {
    logger.error("Import error:", error);
    return { success: false, message: "Failed to import template. " + (error as Error).message };
  }
}

