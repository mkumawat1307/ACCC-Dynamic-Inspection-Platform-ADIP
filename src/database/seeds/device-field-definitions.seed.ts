import { getDatabase } from "../db";

import { logger } from "@/src/utils/logger";
export async function seedDeviceFieldDefinitions() {
  const db = await getDatabase();

  const count = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM DeviceFieldDefinitions`
  );
  if (count && count.c > 0) return;

  const fields = [
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

  await db.withTransactionAsync(async () => {
    for (const f of fields) {
      await db.runAsync(
        `INSERT INTO DeviceFieldDefinitions (DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.DeviceType, f.FieldName, f.Label, f.FieldType, f.IsRequired, f.DisplayOrder]
      );
    }
  });

  logger.info("✅ Seeded DeviceFieldDefinitions");
}

