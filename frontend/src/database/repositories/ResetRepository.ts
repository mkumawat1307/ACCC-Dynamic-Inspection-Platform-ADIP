import { getDatabase } from "../db";
import { logger } from "@/src/utils/logger";
import { poleInspectionFields } from "../seeds/pole-inspection-data";
import { fieldOptions } from "../seeds/field-options.data";

const DEFAULT_SECTION_KEYS = [
  "general_information", "pole_structure", "junction_box", "earthing",
  "meter", "connectivity", "camera_information", "switch_information",
  "remarks", "photos",
];

const DEFAULT_SECTION_PROPS: Record<string, {
  SectionName: string; Description: string; Icon: string;
  DisplayOrder: number; IsRepeatable: number;
}> = {
  general_information: { SectionName: "General Information", Description: "General inspection details", Icon: "information-circle", DisplayOrder: 1, IsRepeatable: 0 },
  pole_structure: { SectionName: "Pole Structure Details", Description: "Pole structure", Icon: "business", DisplayOrder: 2, IsRepeatable: 0 },
  junction_box: { SectionName: "Junction Box and Cabling", Description: "JB Details", Icon: "cube", DisplayOrder: 3, IsRepeatable: 0 },
  earthing: { SectionName: "Earthing Details", Description: "Earthing", Icon: "flash", DisplayOrder: 4, IsRepeatable: 0 },
  meter: { SectionName: "Metering Information", Description: "Meter", Icon: "speedometer", DisplayOrder: 5, IsRepeatable: 0 },
  connectivity: { SectionName: "Connectivity Information", Description: "Network", Icon: "wifi", DisplayOrder: 6, IsRepeatable: 0 },
  camera_information: { SectionName: "Camera Information", Description: "Camera", Icon: "camera", DisplayOrder: 7, IsRepeatable: 1 },
  switch_information: { SectionName: "Switch Information", Description: "Switch", Icon: "git-network", DisplayOrder: 8, IsRepeatable: 1 },
  remarks: { SectionName: "Remarks", Description: "Remarks", Icon: "note-text", DisplayOrder: 9, IsRepeatable: 0 },
  photos: { SectionName: "Photos", Description: "Photo Section", Icon: "images", DisplayOrder: 10, IsRepeatable: 0 },
};

const CANONICAL_DEVICE_FIELDS = [
  { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", FieldType: "dropdown", IsRequired: 1, DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraStatus", Label: "Camera Status", FieldType: "dropdown", IsRequired: 1, DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraMake", Label: "Camera Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraModel", Label: "Camera Model", FieldType: "text", IsRequired: 0, DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraIP", Label: "Camera IP", FieldType: "text", IsRequired: 0, DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraSerialNumber", Label: "Camera Serial Number", FieldType: "text", IsRequired: 0, DisplayOrder: 6 },
  { DeviceType: "Camera", FieldName: "CameraSI", Label: "Camera SI", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 7 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", Label: "SD Card Capacity", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 8 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", Label: "SD Card Status", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 9 },
  { DeviceType: "Switch", FieldName: "SwitchType", Label: "Switch Type", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", Label: "Switch Status", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchMake", Label: "Switch Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchModel", Label: "Switch Model", FieldType: "text", IsRequired: 0, DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchIP", Label: "Switch IP", FieldType: "text", IsRequired: 0, DisplayOrder: 5 },
  { DeviceType: "Switch", FieldName: "SwitchSerialNumber", Label: "Switch Serial Number", FieldType: "text", IsRequired: 0, DisplayOrder: 6 },
  { DeviceType: "Switch", FieldName: "SwitchSI", Label: "Switch SI", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 7 },
];

const CANONICAL_DEVICE_OPTIONS = [
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Bullet", OptionValue: "Bullet", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Box", OptionValue: "Box", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "PTZ", OptionValue: "PTZ", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "VMS", OptionValue: "VMS", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Local", OptionValue: "Local", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Non-Live", OptionValue: "Non-Live", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "In Stock", OptionValue: "In Stock", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Dismantled", OptionValue: "Dismantled", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 6 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Sparsh", OptionValue: "Sparsh", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Prama", OptionValue: "Prama", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Hikvision", OptionValue: "Hikvision", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "CP Plus", OptionValue: "CP Plus", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Secura", OptionValue: "Secura", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "Technosys (LSY)", OptionValue: "Technosys (LSY)", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (LSY)", OptionValue: "TCIL (LSY)", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (RC)", OptionValue: "TCIL (RC)", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (Smart City)", OptionValue: "TCIL (Smart City)", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TASL (Technosys)", OptionValue: "TASL (Technosys)", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "64 GB", OptionValue: "64 GB", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "128 GB", OptionValue: "128 GB", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "256 GB", OptionValue: "256 GB", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Working", OptionValue: "Working", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Not Working", OptionValue: "Not Working", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "4-Port", OptionValue: "4-Port", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "8-Port", OptionValue: "8-Port", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "VMS", OptionValue: "VMS", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Local", OptionValue: "Local", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Non-Live", OptionValue: "Non-Live", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "In Stock", OptionValue: "In Stock", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Dismantled", OptionValue: "Dismantled", DisplayOrder: 5 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 6 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "D-Link", OptionValue: "D-Link", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Cisco", OptionValue: "Cisco", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Allied", OptionValue: "Allied", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Tejas", OptionValue: "Tejas", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "Technosys (LSY)", OptionValue: "Technosys (LSY)", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (LSY)", OptionValue: "TCIL (LSY)", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (RC)", OptionValue: "TCIL (RC)", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (Smart City)", OptionValue: "TCIL (Smart City)", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TASL (Technosys)", OptionValue: "TASL (Technosys)", DisplayOrder: 5 },
];

const DEFAULT_DEVICE_TYPES = ["Camera", "Switch"];

export class ResetRepository {
  static async performReset(): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE IsDefault = 0`
      );

      const defaultFieldKeys = poleInspectionFields.map((f) => f.FieldKey);
      const fieldPlaceholders = defaultFieldKeys.map(() => "?").join(",");
      await db.runAsync(
        `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey NOT IN (${fieldPlaceholders})`,
        defaultFieldKeys
      );

      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE DeviceType NOT IN (?, ?)`,
        DEFAULT_DEVICE_TYPES
      );

      await db.runAsync(
        `UPDATE DeviceOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE DeviceType NOT IN (?, ?)`,
        DEFAULT_DEVICE_TYPES
      );

      await db.runAsync(
        `DELETE FROM ProjectDeviceTypes WHERE DeviceType NOT IN (?, ?)`,
        DEFAULT_DEVICE_TYPES
      );

      for (const key of DEFAULT_SECTION_KEYS) {
        const props = DEFAULT_SECTION_PROPS[key];
        await db.runAsync(
          `UPDATE InspectionSections
           SET SectionName = ?, Description = ?, Icon = ?, DisplayOrder = ?,
               IsRepeatable = ?, IsVisible = 1, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
           WHERE SectionKey = ? AND IsDefault = 1`,
          [props.SectionName, props.Description, props.Icon, props.DisplayOrder, props.IsRepeatable, key]
        );
      }

      const sectionKeyToId = await db.getAllAsync<{ SectionKey: string; SectionID: number }>(
        `SELECT SectionKey, SectionID FROM InspectionSections WHERE IsDefault = 1`
      );
      const sectionIdMap = new Map(sectionKeyToId.map((r) => [r.SectionKey, r.SectionID]));

      for (const field of poleInspectionFields) {
        const sectionId = sectionIdMap.get(field.SectionKey);
        if (!sectionId) continue;
        await db.runAsync(
          `UPDATE InspectionFields
           SET SectionID = ?, FieldName = ?, FieldType = ?, Placeholder = ?,
               DefaultValue = ?, HelpText = ?, ValidationRule = ?, DisplayOrder = ?,
               IsRequired = ?, IsVisible = ?, IsReadOnly = ?, Width = ?, Icon = ?,
               IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
           WHERE FieldKey = ?`,
          [
            sectionId, field.FieldName, field.FieldType, field.Placeholder,
            field.DefaultValue, field.HelpText, field.ValidationRule, field.DisplayOrder,
            field.IsRequired, field.IsVisible, field.IsReadOnly, field.Width, field.Icon,
            field.FieldKey,
          ]
        );
      }

      await db.runAsync(
        `UPDATE DeviceFieldDefinitions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
         WHERE DeviceType IN (?, ?)`,
        DEFAULT_DEVICE_TYPES
      );

      for (const df of CANONICAL_DEVICE_FIELDS) {
        await db.runAsync(
          `UPDATE DeviceFieldDefinitions
           SET Label = ?, FieldType = ?, IsRequired = ?, DisplayOrder = ?,
               IsVisible = 1, UpdatedAt = CURRENT_TIMESTAMP
           WHERE DeviceType = ? AND FieldName = ?`,
          [df.Label, df.FieldType, df.IsRequired, df.DisplayOrder, df.DeviceType, df.FieldName]
        );
      }

      await db.runAsync(
        `UPDATE DeviceOptions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
         WHERE DeviceType IN (?, ?)`,
        DEFAULT_DEVICE_TYPES
      );

      for (const opt of CANONICAL_DEVICE_OPTIONS) {
        await db.runAsync(
          `UPDATE DeviceOptions
           SET OptionLabel = ?, OptionValue = ?, DisplayOrder = ?,
               IsDefault = 0, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
           WHERE DeviceType = ? AND FieldName = ? AND OptionValue = ?`,
          [opt.OptionLabel, opt.OptionValue, opt.DisplayOrder, opt.DeviceType, opt.FieldName, opt.OptionValue]
        );
      }

      await db.runAsync(`DELETE FROM FieldOptions`);

      for (const opt of fieldOptions) {
        const field = await db.getFirstAsync<{ FieldID: number }>(
          `SELECT FieldID FROM InspectionFields WHERE FieldKey = ?`,
          [opt.FieldKey]
        );
        if (field) {
          await db.runAsync(
            `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault)
             VALUES (?, ?, ?, ?, ?)`,
            [field.FieldID, opt.OptionLabel, opt.OptionValue, opt.DisplayOrder, opt.IsDefault ?? 0]
          );
        }
      }

      for (const dt of DEFAULT_DEVICE_TYPES) {
        await db.runAsync(
          `INSERT OR IGNORE INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES (?, 1)`,
          [dt]
        );
      }
    });

    logger.info("Reset to Default completed successfully");
  }
}
