// src/database/seeds/inspection-template.seed.ts

import { getDatabase } from "../db";

export async function seedInspectionTemplate() {

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM InspectionTemplates;
    `);

    if ((existing?.Count ?? 0) > 0) {
        console.log("✅ Inspection Template already seeded.");
        return;
    }

    console.log("🌱 Seeding Default Inspection Template...");

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
            "ACCC Pole Inspection",
            "Default ACCC Pole Inspection Template",
            1
        ]
    );

    console.log("✅ Inspection Template Seeded.");
}