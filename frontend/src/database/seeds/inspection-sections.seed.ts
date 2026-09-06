// src/database/seeds/inspection-sections.seed.ts

import { getDatabase } from "../db";
import { FACTORY_SECTIONS } from "./factory-config";

export async function seedInspectionSections() {

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM InspectionSections;
    `);

    if ((existing?.Count ?? 0) > 0) {
        return;
    }

    const template = await db.getFirstAsync<{ TemplateID: number }>(`
        SELECT TemplateID
        FROM InspectionTemplates
        WHERE IsDefault = 1
        LIMIT 1;
    `);

    if (!template) {
        throw new Error("Default Inspection Template not found.");
    }

    for (let i = 0; i < FACTORY_SECTIONS.length; i++) {

        const section = FACTORY_SECTIONS[i];

        await db.runAsync(
            `
            INSERT INTO InspectionSections
            (
                TemplateID,
                SectionName,
                SectionKey,
                Description,
                Icon,
                DisplayOrder,
                IsRepeatable,
                IsVisible,
                IsDefault,
                IsActive
            )
            VALUES
            (
                ?, ?, ?, ?, ?, ?, ?, 1, 1, 1
            );
            `,
            [
                template.TemplateID,
                section.name,
                section.key,
                section.description,
                section.icon,
                i + 1,
                section.repeatable,
            ]
        );

    }

}

