// src/database/seeds/inspection-sections.seed.ts

import { getDatabase } from "../db";

export async function seedInspectionSections() {

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM InspectionSections;
    `);

    if ((existing?.Count ?? 0) > 0) {
        console.log("✅ Inspection Sections already seeded.");
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

    console.log("🌱 Seeding Inspection Sections...");

    const sections = [
        {
            key: "general_information",
            name: "General Information",
            description: "General inspection details",
            icon: "information-circle",
            repeatable: 0,
        },
        {
            key: "pole_structure",
            name: "Pole Structure Details",
            description: "Pole structure",
            icon: "business",
            repeatable: 0,
        },
        {
            key: "junction_box",
            name: "Junction Box and Cabling",
            description: "JB Details",
            icon: "cube",
            repeatable: 0,
        },
        {
            key: "earthing",
            name: "Earthing Details",
            description: "Earthing",
            icon: "flash",
            repeatable: 0,
        },
        {
            key: "meter",
            name: "Metering Information",
            description: "Meter",
            icon: "speedometer",
            repeatable: 0,
        },
        {
            key: "connectivity",
            name: "Connectivity Information",
            description: "Network",
            icon: "wifi",
            repeatable: 0,
        },
        {
            key: "camera_information",
            name: "Camera Information",
            description: "Camera",
            icon: "camera",
            repeatable: 1,
        },
        {
            key: "switch_information",
            name: "Switch Information",
            description: "Switch",
            icon: "git-network",
            repeatable: 1,
        },
        {
            key: "categorization",
            name: "Categorization and Remarks",
            description: "Remarks",
            icon: "document-text",
            repeatable: 0,
        },
        {
            key: "photos",
            name: "Photos",
            description: "Photo Section",
            icon: "images",
            repeatable: 0,
        },
    ];

    for (let i = 0; i < sections.length; i++) {

        const section = sections[i];

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

    console.log("✅ Inspection Sections Seeded.");

}
