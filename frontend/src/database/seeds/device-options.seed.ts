import { getDatabase } from "../db";
import { FACTORY_DEVICE_OPTIONS } from "./factory-config";

export async function seedDeviceOptions() {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ Count: number }>(
    `SELECT COUNT(*) AS Count FROM DeviceOptions`
  );

  if ((existing?.Count ?? 0) > 0) {
    return;
  }

  await db.withTransactionAsync(async () => {
    for (const opt of FACTORY_DEVICE_OPTIONS) {
      await db.runAsync(
        `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder)
         VALUES (?, ?, ?, ?, ?)`,
        [opt.DeviceType, opt.FieldName, opt.OptionLabel, opt.OptionValue, opt.DisplayOrder]
      );
    }
  });
}

