//frontend\src\database\seeds\field-options.seed.ts

import { getDatabase } from "../db";

import { fieldOptions } from "./field-options.data";

export async function seedFieldOptions() {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ Count: number }>(`
    SELECT COUNT(*) AS Count
    FROM FieldOptions;
  `);

  if ((existing?.Count ?? 0) > 0) {
    return;
  }

  await db.withTransactionAsync(async () => {
    for (const option of fieldOptions) {
      // Find the ID of the field that matches this FieldKey
      const field = await db.getFirstAsync<{ FieldID: number }>(`
        SELECT FieldID FROM InspectionFields WHERE FieldKey = ?;
      `, [option.FieldKey]);

      if (field) {
        await db.runAsync(
          `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault) VALUES (?, ?, ?, ?, ?);`,
          [field.FieldID, option.OptionLabel, option.OptionValue, option.DisplayOrder, option.IsDefault ?? 0]
        );
      }
    }
  });
}
