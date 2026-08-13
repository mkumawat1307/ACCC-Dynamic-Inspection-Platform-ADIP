// src/database/seeds/repeatable-groups.seed.ts

import { getDatabase } from "../db";

import { logger } from "@/src/utils/logger";

export async function seedRepeatableGroups() {

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM RepeatableGroups;
    `);

    if ((existing?.Count ?? 0) > 0) {
        logger.info("âœ… Repeatable Groups already seeded.");
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

    const sections = await db.getAllAsync<{
        SectionID: number;
        SectionKey: string;
    }>(`
        SELECT SectionID, SectionKey
        FROM InspectionSections
        WHERE TemplateID = ?;
    `, [template.TemplateID]);

    const sectionMap = new Map(
        sections.map(section => [section.SectionKey, section.SectionID])
    );

    const groups = [
        {
            sectionKey: "camera_information",
            groupName: "Camera",
            displayName: "Camera",
            description: "Camera inspection details",
            countFieldKey: "camera_count",
            minCount: 0,
            maxCount: null,
            displayOrder: 1,
        },
        {
            sectionKey: "switch_information",
            groupName: "Switch",
            displayName: "Switch",
            description: "Switch inspection details",
            countFieldKey: "switch_count",
            minCount: 0,
            maxCount: null,
            displayOrder: 2,
        },
    ];

    logger.info("ðŸŒ± Seeding Repeatable Groups...");

    for (const group of groups) {

        const sectionID = sectionMap.get(group.sectionKey);

        if (!sectionID) {
            throw new Error(`Section not found: ${group.sectionKey}`);
        }

        await db.runAsync(
            `
            INSERT INTO RepeatableGroups
            (
                TemplateID,
                SectionID,
                GroupName,
                DisplayName,
                Description,
                CountFieldKey,
                MinCount,
                MaxCount,
                DisplayOrder,
                IsActive
            )
            VALUES
            (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
            );
            `,
            [
                template.TemplateID,
                sectionID,
                group.groupName,
                group.displayName,
                group.description,
                group.countFieldKey,
                group.minCount,
                group.maxCount,
                group.displayOrder,
            ]
        );
    }

    logger.info("âœ… Repeatable Groups Seeded.");

}
