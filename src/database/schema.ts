// src/database/schema.ts

import { getDatabase, getGlobalDatabase } from "./db";

// Global DB tables
import { createDivisionsTable } from "./tables/divisions.table";
import { createDistrictsTable } from "./tables/districts.table";
import { createBlocksTable } from "./tables/blocks.table";
import { createProjectsTable } from "./tables/projects.table";

// Project DB tables
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
import { createDeviceOptionsTable } from "./tables/device-options.table";
import { createDeviceFieldDefinitionsTable } from "./tables/device-field-definitions.table";
import { createDeviceRecordsTable } from "./tables/device-records.table";
import { createProjectDeviceTypesTable } from "./tables/project-device-types.table";

export async function createGlobalSchema() {
    console.log("📄 [schema] createGlobalSchema() — START");

    const db = await getGlobalDatabase();
    console.log("[schema] Got global DB handle");

    console.log("[schema] Creating Divisions table...");
    await db.execAsync(createDivisionsTable);
    console.log("[schema] Divisions table done");

    console.log("[schema] Creating Districts table...");
    await db.execAsync(createDistrictsTable);
    console.log("[schema] Districts table done");

    console.log("[schema] Creating Blocks table...");
    await db.execAsync(createBlocksTable);
    console.log("[schema] Blocks table done");

    console.log("[schema] Creating Projects table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS Projects (
            ProjectID INTEGER PRIMARY KEY AUTOINCREMENT,
            ProjectName TEXT NOT NULL,
            DistrictID INTEGER NOT NULL,
            Block TEXT,
            Client TEXT,
            Description TEXT,
            InspectorName TEXT,
            DBPath TEXT,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (DistrictID)
                REFERENCES Districts(DistrictID)
        );
    `);
    console.log("[schema] Projects table done");

    // Migration: Add DBPath column to existing Projects table
    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN DBPath TEXT;`);
        console.log("[schema] Migration: DBPath column added to Projects");
    } catch {
        console.log("[schema] Migration: DBPath column already exists (ok)");
    }

    // Migration: Add IsActive column to existing Divisions table
    try {
        await db.execAsync(`ALTER TABLE Divisions ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
        console.log("[schema] Migration: IsActive column added to Divisions");
    } catch {
        console.log("[schema] Migration: IsActive column already exists in Divisions (ok)");
    }

    // Migration: Add IsActive column to existing Districts table
    try {
        await db.execAsync(`ALTER TABLE Districts ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
        console.log("[schema] Migration: IsActive column added to Districts");
    } catch {
        console.log("[schema] Migration: IsActive column already exists in Districts (ok)");
    }

    console.log("✅ [schema] createGlobalSchema() — END");
}

export async function createProjectSchema() {
    console.log("📄 [schema] createProjectSchema() — START");

    const db = await getDatabase();
    console.log("[schema] Got project DB handle");

    console.log("[schema] Creating inspection templates table...");
    await db.execAsync(createInspectionTemplatesTable);

    console.log("[schema] Creating inspection sections table...");
    await db.execAsync(createInspectionSectionsTable);

    console.log("[schema] Creating inspection fields table...");
    await db.execAsync(createInspectionFieldsTable);

    console.log("[schema] Creating field options table...");
    await db.execAsync(createFieldOptionsTable);

    console.log("[schema] Creating repeatable groups table...");
    await db.execAsync(createRepeatableGroupsTable);

    console.log("[schema] Creating repeatable group fields table...");
    await db.execAsync(createRepeatableGroupFieldsTable);

    console.log("[schema] Creating inspections table...");
    await db.execAsync(createInspectionsTable);

    console.log("[schema] Creating inspection values table...");
    await db.execAsync(createInspectionValuesTable);

    console.log("[schema] Creating repeatable records table...");
    await db.execAsync(createRepeatableRecordsTable);

    console.log("[schema] Creating repeatable values table...");
    await db.execAsync(createRepeatableValuesTable);

    console.log("[schema] Creating cameras table...");
    await db.execAsync(createCamerasTable);

    console.log("[schema] Creating switches table...");
    await db.execAsync(createSwitchesTable);

    console.log("[schema] Creating photos table...");
    await db.execAsync(createPhotosTable);

    console.log("[schema] Creating DeviceOptions table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS DeviceOptions (
            OptionID INTEGER PRIMARY KEY AUTOINCREMENT,
            TemplateID INTEGER NOT NULL DEFAULT 1,
            DeviceType TEXT NOT NULL,
            FieldName TEXT NOT NULL,
            OptionLabel TEXT NOT NULL,
            OptionValue TEXT NOT NULL,
            DisplayOrder INTEGER NOT NULL DEFAULT 1,
            IsActive INTEGER NOT NULL DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("[schema] Creating DeviceFieldDefinitions table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS DeviceFieldDefinitions (
            FieldDefID INTEGER PRIMARY KEY AUTOINCREMENT,
            TemplateID INTEGER NOT NULL DEFAULT 1,
            DeviceType TEXT NOT NULL,
            FieldName TEXT NOT NULL,
            Label TEXT NOT NULL,
            FieldType TEXT NOT NULL DEFAULT 'text',
            IsRequired INTEGER DEFAULT 0,
            DisplayOrder INTEGER NOT NULL DEFAULT 0,
            IsActive INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(TemplateID, DeviceType, FieldName)
        );
    `);

    console.log("[schema] Creating device records table...");
    await db.execAsync(createDeviceRecordsTable);

    console.log("[schema] Creating ProjectDeviceTypes table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ProjectDeviceTypes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            DeviceType TEXT NOT NULL,
            IsActive INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(DeviceType)
        );
    `);

    console.log("✅ [schema] createProjectSchema() — END");
}

export async function createSchema() {
    console.log("[schema] createSchema() — START");

    const db = await getDatabase();

    const tables = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const tableNames = tables.map(t => t.name);
    console.log("[schema] createSchema — existing tables:", JSON.stringify(tableNames));

    if (tableNames.includes("Divisions")) {
        console.log("[schema] createSchema — detected global DB (has Divisions)");
        await createGlobalSchema();
    } else {
        console.log("[schema] createSchema — detected project DB (no Divisions)");
        await createProjectSchema();
    }

    console.log("[schema] createSchema() — END");
}