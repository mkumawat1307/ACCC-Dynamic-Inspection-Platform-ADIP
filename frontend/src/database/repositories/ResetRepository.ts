import { getDatabase } from "../db";
import {
  FACTORY_SECTIONS,
  FACTORY_DEVICE_TYPES,
  FACTORY_DEVICE_FIELDS,
  FACTORY_DEVICE_OPTIONS,
  LOCKED_SECTION_KEYS,
} from "../seeds/factory-config";
import { poleInspectionFields } from "../seeds/pole-inspection-data";
import { fieldOptions } from "../seeds/field-options.data";

const DEFAULT_SECTION_KEYS = FACTORY_SECTIONS.map((s) => s.key);

export class ResetRepository {
  static async performReset(): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      // Locked sections are exempt from reset entirely: their section rows,
      // fields, and field options are never modified.
      const lockedSectionRows = await db.getAllAsync<{ SectionID: number }>(
        `SELECT SectionID FROM InspectionSections WHERE SectionKey IN (?, ?, ?)`,
        [...LOCKED_SECTION_KEYS]
      );
      const lockedSectionIds = lockedSectionRows.map((r) => r.SectionID);
      const lockedFieldRows = lockedSectionIds.length
        ? await db.getAllAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE SectionID IN (${lockedSectionIds.map(() => "?").join(",")})`,
            lockedSectionIds
          )
        : [];
      const lockedFieldIds = lockedFieldRows.map((r) => r.FieldID);
      const lockedFieldKeySet = new Set(
        poleInspectionFields.filter((f) => LOCKED_SECTION_KEYS.has(f.SectionKey)).map((f) => f.FieldKey)
      );

      // 1. Deactivate all non-default sections
      await db.runAsync(
        `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE IsDefault = 0`
      );

      // 2. Deactivate all fields not in canonical list, skipping locked sections
      const defaultFieldKeys = poleInspectionFields.map((f) => f.FieldKey);
      const fieldPlaceholders = defaultFieldKeys.map(() => "?").join(",");
      if (lockedSectionIds.length > 0) {
        const lockedSectionPlaceholders = lockedSectionIds.map(() => "?").join(",");
        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey NOT IN (${fieldPlaceholders}) AND SectionID NOT IN (${lockedSectionPlaceholders})`,
          [...defaultFieldKeys, ...lockedSectionIds]
        );
      } else {
        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey NOT IN (${fieldPlaceholders})`,
          defaultFieldKeys
        );
      }

      // 3. Deactivate non-default device types/options
      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE DeviceType NOT IN (?, ?)`,
        FACTORY_DEVICE_TYPES
      );
      await db.runAsync(
        `UPDATE DeviceOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE DeviceType NOT IN (?, ?)`,
        FACTORY_DEVICE_TYPES
      );
      await db.runAsync(
        `DELETE FROM ProjectDeviceTypes WHERE DeviceType NOT IN (?, ?)`,
        FACTORY_DEVICE_TYPES
      );

      // 4. Reconcile duplicate sections: consolidate to one canonical row per SectionKey
      //    For each canonical SectionKey, find all rows (active or inactive) and keep only one.
      for (const key of DEFAULT_SECTION_KEYS) {
        if (LOCKED_SECTION_KEYS.has(key)) continue;

        const allSections = await db.getAllAsync<{ SectionID: number; IsDefault: number }>(
          `SELECT SectionID, IsDefault FROM InspectionSections WHERE SectionKey = ? ORDER BY IsDefault DESC, SectionID ASC`,
          [key]
        );

        if (allSections.length <= 1) continue;

        const canonical = allSections[0];
        const duplicates = allSections.slice(1);

        for (const dup of duplicates) {
          // Move any fields from duplicate section to canonical
          await db.runAsync(
            `UPDATE InspectionFields SET SectionID = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionID = ?`,
            [canonical.SectionID, dup.SectionID]
          );
          // Delete duplicate section
          await db.runAsync(
            `DELETE FROM InspectionSections WHERE SectionID = ?`,
            [dup.SectionID]
          );
        }
      }

      // 5. Reconcile duplicate fields: consolidate to one canonical row per FieldKey
      //    Remap InspectionValues from duplicate FieldIDs to canonical, then delete duplicates.
      for (const field of poleInspectionFields) {
        if (LOCKED_SECTION_KEYS.has(field.SectionKey)) continue;

        const allFields = await db.getAllAsync<{ FieldID: number; SectionID: number; IsActive: number }>(
          `SELECT FieldID, SectionID, IsActive FROM InspectionFields WHERE FieldKey = ? ORDER BY IsActive DESC, FieldID ASC`,
          [field.FieldKey]
        );

        if (allFields.length <= 1) continue;

        const canonical = allFields[0];
        const duplicates = allFields.slice(1);

        for (const dup of duplicates) {
          // Remap InspectionValues referencing duplicate to canonical
          await db.runAsync(
            `UPDATE InspectionValues SET FieldID = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID = ?`,
            [canonical.FieldID, dup.FieldID]
          );
          // Delete duplicate FieldOptions
          await db.runAsync(
            `DELETE FROM FieldOptions WHERE FieldID = ?`,
            [dup.FieldID]
          );
          // Delete duplicate field
          await db.runAsync(
            `DELETE FROM InspectionFields WHERE FieldID = ?`,
            [dup.FieldID]
          );
        }
      }

      // 6. Reconstruct or restore canonical default sections.
      //    A missing default section row is re-created; an existing one is restored.
      //    Locked sections are never reconstructed or modified.
      const defaultTemplate = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      const defaultTemplateId = defaultTemplate?.TemplateID ?? 1;

      for (let i = 0; i < FACTORY_SECTIONS.length; i++) {
        const section = FACTORY_SECTIONS[i];
        if (LOCKED_SECTION_KEYS.has(section.key)) continue;

        const existingSections = await db.getAllAsync<{ SectionID: number }>(
          `SELECT SectionID FROM InspectionSections WHERE SectionKey = ? AND IsDefault = 1 LIMIT 1`,
          [section.key]
        );

        if (existingSections.length === 0) {
          await db.runAsync(
            `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
            [defaultTemplateId, section.name, section.key, section.description, section.icon, i + 1, section.repeatable]
          );
        } else {
          await db.runAsync(
            `UPDATE InspectionSections SET SectionName = ?, Description = ?, Icon = ?, DisplayOrder = ?, IsRepeatable = ?, IsVisible = 1, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionKey = ? AND IsDefault = 1`,
            [section.name, section.description, section.icon, i + 1, section.repeatable, section.key]
          );
        }
      }

      const sectionKeyToId = await db.getAllAsync<{ SectionKey: string; SectionID: number }>(
        `SELECT SectionKey, SectionID FROM InspectionSections WHERE IsDefault = 1`
      );
      const sectionIdMap = new Map(sectionKeyToId.map((r) => [r.SectionKey, r.SectionID]));

      // 7. Reconstruct or restore canonical default fields.
      //    A missing default field row is re-created; an existing one is restored.
      //    Fields inside locked sections are never reconstructed or modified.
      for (const field of poleInspectionFields) {
        if (LOCKED_SECTION_KEYS.has(field.SectionKey)) continue;

        const sectionId = sectionIdMap.get(field.SectionKey);
        if (!sectionId) continue;

        const existingFields = await db.getAllAsync<{ FieldID: number }>(
          `SELECT FieldID, IsActive FROM InspectionFields WHERE FieldKey = ? LIMIT 1`,
          [field.FieldKey]
        );

        if (existingFields.length === 0) {
          await db.runAsync(
            `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue, HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly, IsSystemField, DataSourceType, DataSource, Width, Icon, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              sectionId, field.FieldName, field.FieldKey, field.FieldType,
              field.Placeholder ?? null, field.DefaultValue ?? null, field.HelpText ?? null,
              field.ValidationRule ?? null, field.DisplayOrder, field.IsRequired, field.IsVisible,
              field.IsReadOnly, field.IsSystemField, field.DataSourceType ?? null,
              field.DataSource ?? null, field.Width, field.Icon ?? null,
            ]
          );
        } else {
          await db.runAsync(
            `UPDATE InspectionFields SET SectionID = ?, FieldName = ?, FieldType = ?, Placeholder = ?, DefaultValue = ?, HelpText = ?, ValidationRule = ?, DisplayOrder = ?, IsRequired = ?, IsVisible = ?, IsReadOnly = ?, Width = ?, Icon = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = ?`,
            [
              sectionId, field.FieldName, field.FieldType, field.Placeholder,
              field.DefaultValue, field.HelpText, field.ValidationRule, field.DisplayOrder,
              field.IsRequired, field.IsVisible, field.IsReadOnly, field.Width, field.Icon,
              field.FieldKey,
            ]
          );
        }
      }

      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
         WHERE DeviceType IN (?, ?)`,
        FACTORY_DEVICE_TYPES
      );

      for (const df of FACTORY_DEVICE_FIELDS) {
        const existingDfd = await db.getAllAsync<{ FieldDefID: number }>(
          `SELECT FieldDefID FROM DeviceFieldDefinitions WHERE DeviceType = ? AND FieldName = ? LIMIT 1`,
          [df.DeviceType, df.FieldName]
        );

        if (existingDfd.length === 0) {
          await db.runAsync(
            `INSERT INTO DeviceFieldDefinitions (DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder, IsVisible, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
            [df.DeviceType, df.FieldName, df.Label, df.FieldType, df.IsRequired, df.DisplayOrder]
          );
        } else {
          await db.runAsync(
            `UPDATE DeviceFieldDefinitions SET Label = ?, FieldType = ?, IsRequired = ?, DisplayOrder = ?, IsVisible = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE DeviceType = ? AND FieldName = ?`,
            [df.Label, df.FieldType, df.IsRequired, df.DisplayOrder, df.DeviceType, df.FieldName]
          );
        }
      }

      await db.runAsync(
        `UPDATE DeviceOptions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
         WHERE DeviceType IN (?, ?)`,
        FACTORY_DEVICE_TYPES
      );

      for (const opt of FACTORY_DEVICE_OPTIONS) {
        const existingOpt = await db.getAllAsync<{ OptionID: number }>(
          `SELECT OptionID FROM DeviceOptions WHERE DeviceType = ? AND FieldName = ? AND OptionValue = ? LIMIT 1`,
          [opt.DeviceType, opt.FieldName, opt.OptionValue]
        );

        if (existingOpt.length === 0) {
          await db.runAsync(
            `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [opt.DeviceType, opt.FieldName, opt.OptionLabel, opt.OptionValue, opt.DisplayOrder]
          );
        } else {
          await db.runAsync(
            `UPDATE DeviceOptions SET OptionLabel = ?, OptionValue = ?, DisplayOrder = ?, IsDefault = 0, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE DeviceType = ? AND FieldName = ? AND OptionValue = ?`,
            [opt.OptionLabel, opt.OptionValue, opt.DisplayOrder, opt.DeviceType, opt.FieldName, opt.OptionValue]
          );
        }
      }

      // 9. Soft-deactivate every field option (except those belonging to locked sections' fields),
      //    then reactivate the canonical seed options in place.
      //    Historical rows are preserved (IsActive = 0) so existing inspections can still render
      //    deleted custom options; the repositories exclude inactive rows for new inspections.
      if (lockedFieldIds.length > 0) {
        const lockedFieldPlaceholders = lockedFieldIds.map(() => "?").join(",");
        await db.runAsync(
          `UPDATE FieldOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID NOT IN (${lockedFieldPlaceholders})`,
          lockedFieldIds
        );
      } else {
        await db.runAsync(
          `UPDATE FieldOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP`
        );
      }

      for (const opt of fieldOptions) {
        if (lockedFieldKeySet.has(opt.FieldKey)) continue;

        const field = await db.getFirstAsync<{ FieldID: number }>(
          `SELECT FieldID FROM InspectionFields WHERE FieldKey = ?`,
          [opt.FieldKey]
        );
        if (!field) continue;

        const existing = await db.getAllAsync<{ OptionValue: string }>(
          `SELECT OptionValue FROM FieldOptions WHERE FieldID = ?`,
          [field.FieldID]
        );
        const existingValues = new Set(existing.map((o) => o.OptionValue));

        if (existingValues.has(opt.OptionValue)) {
          await db.runAsync(
            `UPDATE FieldOptions SET OptionLabel = ?, OptionValue = ?, DisplayOrder = ?, IsDefault = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID = ? AND OptionValue = ?`,
            [opt.OptionLabel, opt.OptionValue, opt.DisplayOrder, opt.IsDefault ?? 0, field.FieldID, opt.OptionValue]
          );
        } else {
          await db.runAsync(
            `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [field.FieldID, opt.OptionLabel, opt.OptionValue, opt.DisplayOrder, opt.IsDefault ?? 0]
          );
        }
      }

      for (const dt of FACTORY_DEVICE_TYPES) {
        await db.runAsync(
          `INSERT OR IGNORE INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES (?, 1)`,
          [dt]
        );
      }
    });
  }
}