// frontend/src/database/seed.ts

import { getDatabase } from "./db";
import { seedDivisions } from "./seeds/division.seed";
import { seedInspectionTemplate } from "./seeds/inspection-template.seed";
import { seedInspectionSections } from "./seeds/inspection-sections.seed";
import { seedInspectionFields } from "./seeds/inspection-fields.seed";
import { seedFieldOptions } from "./seeds/field-options.seed";
import { seedRepeatableGroups } from "./seeds/repeatable-groups.seed";
import { seedRepeatableGroupFields } from "./seeds/repeatable-group-fields.seed";

export async function seedDatabase() {
    console.log("🌱 Starting Database Seed...");

    // Ensure the DB is ready
    await getDatabase();

    await seedDivisions();
    await seedInspectionTemplate();
    await seedInspectionSections();
    await seedInspectionFields();
    await seedFieldOptions();
    await seedRepeatableGroups();
    await seedRepeatableGroupFields();

    console.log("✅ Database Seed Completed.");
}