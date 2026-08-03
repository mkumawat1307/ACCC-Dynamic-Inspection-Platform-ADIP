// src/database/schema.ts

import { getDatabase, getGlobalDatabase } from "./db";

import { createDivisionsTable } from "./tables/divisions.table";
import { createDistrictsTable } from "./tables/districts.table";
import { createBlocksTable } from "./tables/blocks.table";
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
import { createDeviceRecordsTable } from "./tables/device-records.table";
import { createDashboardCardsTable } from "./tables/dashboard-cards.table";

import { DashboardCardRepository } from "./repositories/DashboardCardRepository";

import { logger } from "@/src/utils/logger";

export async function createGlobalSchema() {
    logger.info("📄 [schema] createGlobalSchema() — START");

    const db = await getGlobalDatabase();
    logger.info("[schema] Got global DB handle");

    logger.info("[schema] Creating Divisions table...");
    await db.execAsync(createDivisionsTable);
    logger.info("[schema] Divisions table done");

    logger.info("[schema] Creating Districts table...");
    await db.execAsync(createDistrictsTable);
    logger.info("[schema] Districts table done");

    logger.info("[schema] Creating Blocks table...");
    await db.execAsync(createBlocksTable);
    logger.info("[schema] Blocks table done");

    logger.info("[schema] Creating Projects table...");
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
    logger.info("[schema] Projects table done");

    // Migration: Add DBPath column to existing Projects table
    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN DBPath TEXT;`);
        logger.info("[schema] Migration: DBPath column added to Projects");
    } catch {
        logger.info("[schema] Migration: DBPath column already exists (ok)");
    }

    // Migration: Add SAFPath column to existing Projects table
    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN SAFPath TEXT;`);
        logger.info("[schema] Migration: SAFPath column added to Projects");
    } catch {
        logger.info("[schema] Migration: SAFPath column already exists (ok)");
    }

    // Migration: Add IsActive column to existing Divisions table
    try {
        await db.execAsync(`ALTER TABLE Divisions ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
        logger.info("[schema] Migration: IsActive column added to Divisions");
    } catch {
        logger.info("[schema] Migration: IsActive column already exists in Divisions (ok)");
    }

    // Migration: Add IsActive column to existing Districts table
    try {
        await db.execAsync(`ALTER TABLE Districts ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
        logger.info("[schema] Migration: IsActive column added to Districts");
    } catch {
        logger.info("[schema] Migration: IsActive column already exists in Districts (ok)");
    }

    logger.info("✅ [schema] createGlobalSchema() — END");
}

export async function createProjectSchema() {
    logger.info("📄 [schema] createProjectSchema() — START");

    const db = await getDatabase();
    logger.info("[schema] Got project DB handle");

    logger.info("[schema] Creating inspection templates table...");
    await db.execAsync(createInspectionTemplatesTable);

    logger.info("[schema] Creating inspection sections table...");
    await db.execAsync(createInspectionSectionsTable);

    logger.info("[schema] Creating inspection fields table...");
    await db.execAsync(createInspectionFieldsTable);

    logger.info("[schema] Creating field options table...");
    await db.execAsync(createFieldOptionsTable);

    logger.info("[schema] Creating repeatable groups table...");
    await db.execAsync(createRepeatableGroupsTable);

    logger.info("[schema] Creating repeatable group fields table...");
    await db.execAsync(createRepeatableGroupFieldsTable);

    logger.info("[schema] Creating inspections table...");
    await db.execAsync(createInspectionsTable);

    logger.info("[schema] Creating inspection values table...");
    await db.execAsync(createInspectionValuesTable);

    logger.info("[schema] Creating repeatable records table...");
    await db.execAsync(createRepeatableRecordsTable);

    logger.info("[schema] Creating repeatable values table...");
    await db.execAsync(createRepeatableValuesTable);

    logger.info("[schema] Creating cameras table...");
    await db.execAsync(createCamerasTable);

    logger.info("[schema] Creating switches table...");
    await db.execAsync(createSwitchesTable);

    logger.info("[schema] Creating photos table...");
    await db.execAsync(createPhotosTable);

    logger.info("[schema] Creating DeviceOptions table...");
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

    logger.info("[schema] Creating DeviceFieldDefinitions table...");
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

    logger.info("[schema] Creating device records table...");
    await db.execAsync(createDeviceRecordsTable);

    logger.info("[schema] Creating ProjectDeviceTypes table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ProjectDeviceTypes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            DeviceType TEXT NOT NULL,
            IsActive INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(DeviceType)
        );
    `);

    logger.info("[schema] Creating DashboardCards table...");
    await db.execAsync(createDashboardCardsTable);

    logger.info("✅ [schema] createProjectSchema() — END");
}

export async function migrateProjectSchema() {
    logger.info("[schema] migrateProjectSchema() — START");

    const db = await getDatabase();

    const remarksSection = await db.getFirstAsync<{ SectionID: number }>(
        `SELECT SectionID FROM InspectionSections WHERE SectionKey = 'remarks' LIMIT 1`
    );
    if (remarksSection) {
        logger.info("[schema] migrateProjectSchema() — remarks section already exists (ok)");
    } else {
        const categorization = await db.getFirstAsync<{ SectionID: number; TemplateID: number; DisplayOrder: number }>(
            `SELECT SectionID, TemplateID, DisplayOrder FROM InspectionSections WHERE SectionKey = 'categorization' LIMIT 1`
        );
        if (!categorization) {
            logger.info("[schema] migrateProjectSchema() — categorization section not found, skipping");
        } else {
            const result = await db.runAsync(
                `INSERT INTO InspectionSections
                 (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 1)`,
                [categorization.TemplateID, "Remarks", "remarks", "Remarks", "note-text", categorization.DisplayOrder + 1]
            );
            const remarksId = result.lastInsertRowId;

            await db.runAsync(
                `UPDATE InspectionFields SET SectionID = ? WHERE FieldKey = 'remarks' AND SectionID = ?`,
                [remarksId, categorization.SectionID]
            );

            await db.runAsync(
                `UPDATE InspectionSections SET SectionName = 'Categorization' WHERE SectionID = ?`,
                [categorization.SectionID]
            );
        }
    }

    try {
        await db.execAsync(createDashboardCardsTable);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — DashboardCards table creation failed (non-fatal):", e);
    }

    try {
        await DashboardCardRepository.ensureDefaultCards(1);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — ensureDefaultCards failed (non-fatal):", e);
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT;`);
        logger.info("[schema] Migration: BreakdownField column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: BreakdownField column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT;`);
        logger.info("[schema] Migration: SectionLabel column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: SectionLabel column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT;`);
        logger.info("[schema] Migration: AggregateField column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: AggregateField column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT;`);
        logger.info("[schema] Migration: DeviceType column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: DeviceType column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN CardMode TEXT NOT NULL DEFAULT 'entitycount';`);
        logger.info("[schema] Migration: CardMode column added to DashboardCards");
    } catch {
        logger.info("[schema] Migration: CardMode column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`
            UPDATE DashboardCards SET CardMode = 'sum'
            WHERE CardMode = 'entitycount' AND AggregateField IS NOT NULL AND AggregateField != '';
        `);
        await db.execAsync(`
            UPDATE DashboardCards SET CardMode = COALESCE((
                SELECT CASE
                    WHEN LOWER(f.FieldType) IN ('date', 'date_auto') THEN 'datebreakdown'
                    WHEN LOWER(f.FieldType) IN ('dropdown', 'switch', 'checkbox') THEN 'dropdown'
                    WHEN LOWER(f.FieldType) IN ('text', 'multiline') THEN 'fieldcount'
                    ELSE 'entitycount'
                END
                FROM InspectionFields f
                WHERE f.FieldKey = DashboardCards.BreakdownField
            ), 'entitycount')
            WHERE CardMode = 'entitycount' AND BreakdownField IS NOT NULL AND BreakdownField != '' AND AggregateField IS NULL;
        `);
        logger.info("[schema] Migration: CardMode backfill complete for DashboardCards");
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — CardMode backfill failed (non-fatal):", e);
    }

      try {
          await DashboardCardRepository.migrateDefaultCards(1);
      } catch (e) {
          logger.info("[schema] migrateProjectSchema \u2014 migrateDefaultCards failed (non-fatal):", e);
      }

      try {
          await DashboardCardRepository.migrateDeviceCards(1);
      } catch (e) {
          logger.info("[schema] migrateProjectSchema \u2014 migrateDeviceCards failed (non-fatal):", e);
      }

    logger.info("✅ [schema] migrateProjectSchema() — END");
}

export async function createSchema() {
    logger.info("[schema] createSchema() — START");

    const db = await getDatabase();

    const tables = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const tableNames = tables.map(t => t.name);
    logger.info("[schema] createSchema — existing tables:", JSON.stringify(tableNames));

    if (tableNames.includes("Divisions")) {
        logger.info("[schema] createSchema — detected global DB (has Divisions)");
        await createGlobalSchema();
    } else {
        logger.info("[schema] createSchema — detected project DB (no Divisions)");
        await createProjectSchema();
    }

    logger.info("[schema] createSchema() — END");
}
