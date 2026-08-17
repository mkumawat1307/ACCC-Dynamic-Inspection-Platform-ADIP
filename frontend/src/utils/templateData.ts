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
  templates: TemplateExportTemplate[];
  projectDeviceTypes: string[];
}

export interface TemplateExportTemplate {
  TemplateName: string;
  Description: string | null;
  IsDefault: number;
  sections: TemplateExportSection[];
  deviceTypes: TemplateExportDeviceType[];
  deviceOptions: TemplateExportDeviceOption[];
}

export interface TemplateExportSection {
  SectionName: string;
  SectionKey: string;
  Description: string | null;
  Icon: string | null;
  DisplayOrder: number;
  IsRepeatable: number;
  IsVisible: number;
  fields: TemplateExportField[];
}

export interface TemplateExportField {
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
  IsSystemField: number;
  Width: number;
  options: { OptionLabel: string; OptionValue: string; DisplayOrder: number; IsDefault: number }[];
}

export interface TemplateExportDeviceType {
  DeviceType: string;
  FieldName: string;
  Label: string;
  FieldType: string;
  IsRequired: number;
  DisplayOrder: number;
  Placeholder?: string | null;
  IsVisible?: number;
}

export interface TemplateExportDeviceOption {
  DeviceType: string;
  FieldName: string;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
}

export interface TemplateImportSummary {
  templateCount: number;
  sectionCount: number;
  fieldCount: number;
  deviceTypeCount: number;
  deviceOptionCount: number;
}

export interface ParsedTemplateFile {
  data: TemplateExportData;
  summary: TemplateImportSummary;
}

export async function buildTemplateExportData(): Promise<{
  data: TemplateExportData;
  summary: TemplateImportSummary;
} | null> {
  const db = await getDatabase();

  const templates = await db.getAllAsync<{
    TemplateID: number;
    TemplateName: string;
    Description: string | null;
    IsDefault: number;
    IsActive: number;
  }>(
    `SELECT TemplateID, TemplateName, Description, IsDefault, IsActive
     FROM InspectionTemplates ORDER BY TemplateID`
  );

  const activeTemplates = templates.filter((t) => t.IsActive === 1);
  if (activeTemplates.length === 0) return null;

  const exportTemplates: TemplateExportTemplate[] = [];
  let sectionCount = 0;
  let fieldCount = 0;
  let deviceTypeCount = 0;
  let deviceOptionCount = 0;

  for (const template of activeTemplates) {
    const sections = await db.getAllAsync<{
      SectionID: number;
      SectionName: string;
      SectionKey: string;
      Description: string | null;
      Icon: string | null;
      DisplayOrder: number;
      IsRepeatable: number;
      IsVisible: number;
    }>(
      `SELECT SectionID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible
       FROM InspectionSections WHERE TemplateID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
      [template.TemplateID]
    );

    const exportSections: TemplateExportSection[] = [];

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
        IsSystemField: number;
        Width: number;
      }>(
        `SELECT FieldID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
                HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly,
                IsSystemField, Width
         FROM InspectionFields WHERE SectionID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
        [section.SectionID]
      );

      const exportFields: TemplateExportSection["fields"] = [];

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
          IsSystemField: field.IsSystemField,
          Width: field.Width,
          options,
        });
        fieldCount++;
      }

      exportSections.push({
        SectionName: section.SectionName,
        SectionKey: section.SectionKey,
        Description: section.Description,
        Icon: section.Icon,
        DisplayOrder: section.DisplayOrder,
        IsRepeatable: section.IsRepeatable,
        IsVisible: section.IsVisible,
        fields: exportFields,
      });
      sectionCount++;
    }

    const deviceTypes = await db.getAllAsync<{
      DeviceType: string;
      FieldName: string;
      Label: string;
      FieldType: string;
      IsRequired: number;
      DisplayOrder: number;
      Placeholder: string | null;
      IsVisible: number;
    }>(
      `SELECT DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, Placeholder
       FROM DeviceFieldDefinitions WHERE TemplateID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
      [template.TemplateID]
    );

    const deviceOptions = await db.getAllAsync<{
      DeviceType: string;
      FieldName: string;
      OptionLabel: string;
      OptionValue: string;
      DisplayOrder: number;
    }>(
      `SELECT DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder
       FROM DeviceOptions WHERE TemplateID = ? AND IsActive = 1 ORDER BY FieldName, DisplayOrder`,
      [template.TemplateID]
    );

    deviceTypeCount += deviceTypes.length;
    deviceOptionCount += deviceOptions.length;

    exportTemplates.push({
      TemplateName: template.TemplateName,
      Description: template.Description,
      IsDefault: template.IsDefault,
      sections: exportSections,
      deviceTypes,
      deviceOptions,
    });
  }

  const projectDeviceTypes = (
    await db.getAllAsync<{ DeviceType: string }>(
      `SELECT DeviceType FROM ProjectDeviceTypes WHERE IsActive = 1`
    )
  ).map((r) => r.DeviceType);

  const exportData: TemplateExportData = {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: exportTemplates,
    projectDeviceTypes,
  };

  return {
    data: exportData,
    summary: {
      templateCount: activeTemplates.length,
      sectionCount,
      fieldCount,
      deviceTypeCount,
      deviceOptionCount,
    },
  };
}

function computeImportSummary(templates: TemplateExportTemplate[]): TemplateImportSummary {
  let sectionCount = 0;
  let fieldCount = 0;
  let deviceTypeCount = 0;
  let deviceOptionCount = 0;
  for (const t of templates) {
    deviceTypeCount += t.deviceTypes?.length ?? 0;
    deviceOptionCount += t.deviceOptions?.length ?? 0;
    for (const s of t.sections ?? []) {
      sectionCount++;
      fieldCount += s.fields?.length ?? 0;
    }
  }
  return {
    templateCount: templates.length,
    sectionCount,
    fieldCount,
    deviceTypeCount,
    deviceOptionCount,
  };
}

export async function pickAndParseTemplate(): Promise<
  | { status: "canceled" }
  | { status: "error"; message: string }
  | { status: "ready"; parsed: ParsedTemplateFile; fileName: string }
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) {
    return { status: "canceled" };
  }

  const asset = result.assets[0];
  const fileUri = asset.uri;
  const fileName = asset.name ?? fileUri;
  logger.info("[TemplateRestore] fileSelected=" + fileName);
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    return { status: "error", message: "Invalid JSON file." };
  }

  const templates: TemplateExportTemplate[] = [];
  let projectDeviceTypes: string[] = [];

  if (Array.isArray(raw.templates) && raw.templates.length > 0) {
    for (const t of raw.templates as TemplateExportTemplate[]) {
      if (!t.TemplateName || !Array.isArray(t.sections)) {
        return { status: "error", message: `Template "${t.TemplateName ?? "?"}" is missing sections.` };
      }
      templates.push({
        ...t,
        deviceTypes: Array.isArray(t.deviceTypes) ? t.deviceTypes : [],
        deviceOptions: Array.isArray(t.deviceOptions) ? t.deviceOptions : [],
      });
    }
    projectDeviceTypes = Array.isArray(raw.projectDeviceTypes)
      ? (raw.projectDeviceTypes as string[])
      : [];
  } else if (raw.template && Array.isArray(raw.sections)) {
    const legacy = raw as unknown as {
      template: { TemplateName: string; Description: string | null };
      sections: TemplateExportSection[];
    };
    if (!legacy.template.TemplateName) {
      return { status: "error", message: "Template missing valid TemplateName." };
    }
    templates.push({
      TemplateName: legacy.template.TemplateName,
      Description: legacy.template.Description ?? null,
      IsDefault: 1,
      sections: legacy.sections,
      deviceTypes: [],
      deviceOptions: [],
    });
    projectDeviceTypes = [];
  } else {
    return { status: "error", message: "Invalid template format." };
  }

  const validFieldTypes = VALID_FIELD_TYPES.map((t) => t.toUpperCase());
  for (let si = 0; si < templates.length; si++) {
    const sections = templates[si].sections;
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      if (!section.SectionName || !section.SectionKey) {
        return { status: "error", message: `Section ${sIdx + 1} missing SectionName or SectionKey.` };
      }
      if (!Array.isArray(section.fields)) {
        return { status: "error", message: `Section "${section.SectionName}" missing fields array.` };
      }
      for (let fi = 0; fi < section.fields.length; fi++) {
        const field = section.fields[fi];
        if (!field.FieldName || !field.FieldKey || !field.FieldType) {
          return { status: "error", message: `Field ${fi + 1} in section "${section.SectionName}" missing required property (FieldName, FieldKey, or FieldType).` };
        }
        if (!validFieldTypes.includes(field.FieldType.toUpperCase())) {
          return { status: "error", message: `Field "${field.FieldName}" has invalid FieldType "${field.FieldType}". Valid types: ${VALID_FIELD_TYPES.join(", ")}` };
        }
        if (Array.isArray(field.options)) {
          for (const opt of field.options) {
            if (!opt.OptionLabel || opt.OptionValue === undefined) {
              return { status: "error", message: `Option in field "${field.FieldName}" missing OptionLabel or OptionValue.` };
            }
          }
        }
      }
    }
  }

  const data: TemplateExportData = {
    version: String(raw.version ?? "2.0"),
    exportedAt: String(raw.exportedAt ?? new Date().toISOString()),
    templates,
    projectDeviceTypes,
  };

  return { status: "ready", parsed: { data, summary: computeImportSummary(templates) }, fileName };
}

export async function applyTemplateImport(data: TemplateExportData): Promise<{ success: boolean; message: string }> {
  const db = await getDatabase();

  try {
    await db.withTransactionAsync(async () => {
      const templateIdByName = new Map<string, number>();

      for (const template of data.templates) {
        const existing = await db.getFirstAsync<{ TemplateID: number }>(
          `SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?`,
          [template.TemplateName]
        );
        let templateId: number;
        if (existing) {
          templateId = existing.TemplateID;
          await db.runAsync(
            `UPDATE InspectionTemplates SET Description = ?, IsDefault = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE TemplateID = ?`,
            [template.Description ?? null, template.IsDefault, templateId]
          );
          await db.runAsync(`UPDATE InspectionSections SET IsActive = 0 WHERE TemplateID = ?`, [templateId]);
        } else {
          const result = await db.runAsync(
            `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault, IsActive)
             VALUES (?, ?, ?, 1)`,
            [template.TemplateName, template.Description ?? null, template.IsDefault]
          );
          templateId = result.lastInsertRowId;
        }
        templateIdByName.set(template.TemplateName, templateId);

        for (const section of template.sections) {
          const sectionResult = await db.runAsync(
            `INSERT INTO InspectionSections
             (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
            [
              templateId,
              section.SectionName,
              section.SectionKey,
              section.Description ?? null,
              section.Icon ?? null,
              section.DisplayOrder,
              section.IsRepeatable,
              section.IsVisible ?? 1,
            ]
          );
          const sectionId = sectionResult.lastInsertRowId;

          for (const field of section.fields) {
            const fieldResult = await db.runAsync(
              `INSERT INTO InspectionFields
               (SectionID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
                HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly,
                IsSystemField, Width, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
                field.IsSystemField ?? 0,
                field.Width ?? 12,
              ]
            );
            const fieldId = fieldResult.lastInsertRowId;

            for (const option of field.options) {
              await db.runAsync(
                `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [fieldId, option.OptionLabel, option.OptionValue, option.DisplayOrder, option.IsDefault ?? 0]
              );
            }
          }
        }

        for (const deviceType of template.deviceTypes) {
          const existingDef = await db.getFirstAsync<{ FieldDefID: number }>(
            `SELECT FieldDefID FROM DeviceFieldDefinitions
             WHERE TemplateID = ? AND DeviceType = ? AND FieldName = ?`,
            [templateId, deviceType.DeviceType, deviceType.FieldName]
          );
          if (existingDef) {
            await db.runAsync(
              `UPDATE DeviceFieldDefinitions SET Label = ?, FieldType = ?, IsRequired = ?, IsVisible = ?, DisplayOrder = ?, Placeholder = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldDefID = ?`,
              [deviceType.Label, deviceType.FieldType, deviceType.IsRequired, deviceType.IsVisible ?? 1, deviceType.DisplayOrder, deviceType.Placeholder ?? null, existingDef.FieldDefID]
            );
          } else {
            await db.runAsync(
              `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, Placeholder, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [templateId, deviceType.DeviceType, deviceType.FieldName, deviceType.Label, deviceType.FieldType, deviceType.IsRequired, deviceType.IsVisible ?? 1, deviceType.DisplayOrder, deviceType.Placeholder ?? null]
            );
          }
        }

        for (const option of template.deviceOptions) {
          const existingOpt = await db.getFirstAsync<{ OptionID: number }>(
            `SELECT OptionID FROM DeviceOptions
             WHERE TemplateID = ? AND DeviceType = ? AND FieldName = ? AND OptionLabel = ?`,
            [templateId, option.DeviceType, option.FieldName, option.OptionLabel]
          );
          if (existingOpt) {
            await db.runAsync(
              `UPDATE DeviceOptions SET OptionValue = ?, DisplayOrder = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE OptionID = ?`,
              [option.OptionValue, option.DisplayOrder, existingOpt.OptionID]
            );
          } else {
            await db.runAsync(
              `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, 1)`,
              [templateId, option.DeviceType, option.FieldName, option.OptionLabel, option.OptionValue, option.DisplayOrder]
            );
          }
        }
      }

      await db.runAsync(`UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE TemplateID NOT IN (SELECT TemplateID FROM InspectionTemplates WHERE IsActive = 1)`);
      await db.runAsync(`UPDATE DeviceOptions SET IsActive = 0 WHERE TemplateID NOT IN (SELECT TemplateID FROM InspectionTemplates WHERE IsActive = 1)`);

      await db.runAsync(`UPDATE ProjectDeviceTypes SET IsActive = 0`);
      for (const deviceType of data.projectDeviceTypes) {
        const existing = await db.getFirstAsync<{ ID: number }>(
          `SELECT ID FROM ProjectDeviceTypes WHERE DeviceType = ?`,
          [deviceType]
        );
        if (existing) {
          await db.runAsync(`UPDATE ProjectDeviceTypes SET IsActive = 1 WHERE ID = ?`, [existing.ID]);
        } else {
          await db.runAsync(`INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES (?, 1)`, [deviceType]);
        }
      }
    });

    const summary = computeImportSummary(data.templates);
    return {
      success: true,
      message: `Template imported with ${summary.templateCount} template(s), ${summary.sectionCount} section(s), ${summary.fieldCount} field(s).`,
    };
  } catch (error) {
    logger.error("Import error:", error);
    return { success: false, message: "Failed to import template. " + (error as Error).message };
  }
}

