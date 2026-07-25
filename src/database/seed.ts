// frontend/src/database/seed.ts

import { getDatabase, getGlobalDatabase } from "./db";
import { seedDivisions } from "./seeds/division.seed";
import { seedInspectionTemplate } from "./seeds/inspection-template.seed";
import { seedInspectionSections } from "./seeds/inspection-sections.seed";
import { seedInspectionFields } from "./seeds/inspection-fields.seed";
import { seedFieldOptions } from "./seeds/field-options.seed";
import { seedRepeatableGroups } from "./seeds/repeatable-groups.seed";
import { seedRepeatableGroupFields } from "./seeds/repeatable-group-fields.seed";
import { seedDeviceOptions } from "./seeds/device-options.seed";
import { seedDeviceFieldDefinitions } from "./seeds/device-field-definitions.seed";

export async function seedGlobalDatabase() {
    console.log("🌱 [seed] seedGlobalDatabase() — START");

    console.log("[seed] Calling getGlobalDatabase()...");
    const dbBefore = await getGlobalDatabase();
    console.log("[seed] getGlobalDatabase() returned handle");

    console.log("[seed] Calling seedDivisions()...");
    await seedDivisions();
    console.log("✅ [seed] seedGlobalDatabase() — END");
}

export async function seedProjectDatabase() {
    console.log("🌱 [seed] seedProjectDatabase() — START");
    await getDatabase();
    await seedInspectionTemplate();
    await seedInspectionSections();
    await seedInspectionFields();
    await seedFieldOptions();
    await seedRepeatableGroups();
    await seedRepeatableGroupFields();
    await seedDeviceOptions();
    await seedDeviceFieldDefinitions();
    console.log("✅ [seed] seedProjectDatabase() — END");
}

export async function seedDatabase() {
    await seedDivisions();
    await seedInspectionTemplate();
    await seedInspectionSections();
    await seedInspectionFields();
    await seedFieldOptions();
    await seedRepeatableGroups();
    await seedRepeatableGroupFields();
    await seedDeviceOptions();
    await seedDeviceFieldDefinitions();
}
