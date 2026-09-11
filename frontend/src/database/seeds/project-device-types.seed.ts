import { getDatabase } from "../db";
import { FACTORY_DEVICE_TYPES, FACTORY_REQUIRED_DEVICE_TYPES } from "./factory-config";

export async function seedProjectDeviceTypes() {
  const db = await getDatabase();

  const count = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM ProjectDeviceTypes`
  );
  if (count && count.c > 0) return;

  await db.withTransactionAsync(async () => {
    for (const deviceType of FACTORY_DEVICE_TYPES) {
      const isRequired = FACTORY_REQUIRED_DEVICE_TYPES.includes(deviceType) ? 1 : 0;
      await db.runAsync(
        `INSERT OR IGNORE INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES (?, 1, ?)`,
        [deviceType, isRequired]
      );
    }
  });
}
