import { getDatabase } from "../db";
import { FACTORY_DEVICE_FIELDS } from "./factory-config";

export async function seedDeviceFieldDefinitions() {
  const db = await getDatabase();

  const count = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM DeviceFieldDefinitions`
  );
  if (count && count.c > 0) return;

  await db.withTransactionAsync(async () => {
    for (const f of FACTORY_DEVICE_FIELDS) {
      await db.runAsync(
        `INSERT INTO DeviceFieldDefinitions (DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.DeviceType, f.FieldName, f.Label, f.FieldType, f.IsRequired, f.DisplayOrder]
      );
    }
  });
}

