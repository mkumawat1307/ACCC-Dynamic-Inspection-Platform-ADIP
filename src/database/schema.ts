// src/database/schema.ts

import { getDatabase } from "./db";

import { createDivisionsTable } from "./tables/divisions.table";
import { createDistrictsTable } from "./tables/districts.table";
import { createBlocksTable } from "./tables/blocks.table";
import { createProjectsTable } from "./tables/projects.table";

import { createInspectionTemplatesTable } from "./tables/inspection-templates.table";
import { createInspectionSectionsTable } from "./tables/inspection-sections.table";
import { createInspectionFieldsTable } from "./tables/inspection-fields.table";
import { createFieldOptionsTable } from "./tables/field-options.table";

import { createRepeatableGroupsTable } from "./tables/repeatable-groups.table";
import { createRepeatableGroupFieldsTable } from "./tables/repeatable-group-fields.table";

import { createInspectionsTable } from "./tables/inspections.table";
import { createInspectionValuesTable } from "./tables/inspection-values.table";

import { createRepeatableRecordsTable } from "./tables/repeatable-records.table";
import { createRepeatableValuesTable } from "./tables/repeatable-values.table";

import { createCamerasTable } from "./tables/cameras.table";
import { createSwitchesTable } from "./tables/switches.table";
import { createPhotosTable } from "./tables/photos.table";

export async function createSchema() {
    console.log("📄 Creating database schema...");

    const db = await getDatabase();

    // Master Tables
    await db.execAsync(createDivisionsTable);
    await db.execAsync(createDistrictsTable);
    await db.execAsync(createBlocksTable);
    await db.execAsync(createProjectsTable);

    // Template Engine
    await db.execAsync(createInspectionTemplatesTable);
    await db.execAsync(createInspectionSectionsTable);
    await db.execAsync(createInspectionFieldsTable);
    await db.execAsync(createFieldOptionsTable);

    // Repeatable Engine
    await db.execAsync(createRepeatableGroupsTable);
    await db.execAsync(createRepeatableGroupFieldsTable);

    // Inspection Data
    await db.execAsync(createInspectionsTable);
    await db.execAsync(createInspectionValuesTable);

    // Repeatable Data
    await db.execAsync(createRepeatableRecordsTable);
    await db.execAsync(createRepeatableValuesTable);

    // Cameras
    await db.execAsync(createCamerasTable);

    // Switches
    await db.execAsync(createSwitchesTable);

    // Photos
    await db.execAsync(createPhotosTable);

    console.log("✅ Database schema created successfully.");
}