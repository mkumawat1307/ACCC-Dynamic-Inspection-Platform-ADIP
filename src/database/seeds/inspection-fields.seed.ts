// frontend/src/database/seeds/inspection-fields.seed.ts

import { getDatabase } from "../db";
import { poleInspectionFields as inspectionFields } from "./pole-inspection-data";

export async function seedInspectionFields() {

    const db = await getDatabase();

    // Migrate camera_count and switch_count from dropdown to number
    await db.runAsync(
`UPDATE InspectionFields SET FieldType = 'number', Placeholder = 'Enter count'
          WHERE FieldKey IN ('camera_count', 'switch_count') AND FieldType = 'dropdown';`
    );

    const existing = await db.getFirstAsync<{ Count: number }>(`
        SELECT COUNT(*) AS Count
        FROM InspectionFields;
    `);

    if ((existing?.Count ?? 0) > 0) {
        console.log("✅ Inspection Fields already seeded.");
        return;
    }

    // Load all sections once
    const sections = await db.getAllAsync<{
        SectionID: number;
        SectionKey: string;
    }>(`
        SELECT SectionID, SectionKey
        FROM InspectionSections;
    `);

    const sectionMap = new Map<string, number>(
        sections.map(section => [section.SectionKey, section.SectionID])
    );

    console.log("🌱 Seeding Inspection Fields...");

    await db.withTransactionAsync(async () => {

        for (const field of inspectionFields) {

            const sectionID = sectionMap.get(field.SectionKey);

            if (!sectionID) {
                throw new Error(
                    `Section '${field.SectionKey}' not found for field '${field.FieldName}'.`
                );
            }

            await db.runAsync(
                `
                INSERT INTO InspectionFields
                (
                    SectionID,
                    FieldName,
                    FieldKey,
                    FieldType,
                    Placeholder,
                    DefaultValue,
                    HelpText,
                    ValidationRule,
                    DisplayOrder,
                    IsRequired,
                    IsVisible,
                    IsReadOnly,
                    IsSystemField,
                    DataSourceType,
                    DataSource,
                    Width,
                    Icon,
                    IsActive
                )
                VALUES
                (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
                );
                `,
                [
                    sectionID,
                    field.FieldName,
                    field.FieldKey,
                    field.FieldType,
                    field.Placeholder ?? null,
                    field.DefaultValue ?? null,
                    field.HelpText ?? null,
                    field.ValidationRule ?? null,
                    field.DisplayOrder,
                    field.IsRequired,
                    field.IsVisible,
                    field.IsReadOnly,
                    field.IsSystemField,
                    field.DataSourceType ?? null,
                    field.DataSource ?? null,
                    field.Width,
                    field.Icon ?? null,
                ]
            );
        }

    });

    console.log("✅ Inspection Fields Seeded.");

}