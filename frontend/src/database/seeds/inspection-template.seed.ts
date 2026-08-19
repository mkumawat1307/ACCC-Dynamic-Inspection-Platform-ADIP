// src/database/seeds/inspection-template.seed.ts

import { getDatabase } from "../db";

export async function seedInspectionTemplate() {

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM InspectionTemplates;
    `);

    if ((existing?.Count ?? 0) > 0) {
        return;
    }

    await db.runAsync(
        `
        INSERT INTO InspectionTemplates
        (
            TemplateName,
            Description,
            IsDefault
        )
        VALUES
        (
            ?, ?, ?
        );
        `,
        [
            "ACCC Dynamic Inspection Platform",
            "Default ACCC Dynamic Inspection Template",
            1
        ]
    );

}
