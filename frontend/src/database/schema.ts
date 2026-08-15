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
import { createInspectionPoleIdHistoryTable } from "./tables/inspection-pole-id-history.table";
import { createDeviceRecordsTable } from "./tables/device-records.table";
import { createDashboardCardsTable } from "./tables/dashboard-cards.table";

import { DashboardCardRepository } from "./repositories/DashboardCardRepository";

import { buildProjectIdentity, detectProjectDuplicates } from "./projectIdentity";
import type { ProjectDuplicateGroup } from "./projectIdentity";

import { logger } from "@/src/utils/logger";

export async function createGlobalSchema() {
    logger.debug("📄 [schema] createGlobalSchema() — START");

    const db = await getGlobalDatabase();
    logger.debug("[schema] Got global DB handle");

    logger.debug("[schema] Creating Divisions table...");
    await db.execAsync(createDivisionsTable);
    logger.debug("[schema] Divisions table done");

    logger.debug("[schema] Creating Districts table...");
    await db.execAsync(createDistrictsTable);
    logger.debug("[schema] Districts table done");

    logger.debug("[schema] Creating Blocks table...");
    await db.execAsync(createBlocksTable);
    logger.debug("[schema] Blocks table done");

    logger.debug("[schema] Creating Projects table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS Projects (
            ProjectID INTEGER PRIMARY KEY AUTOINCREMENT,
            ProjectName TEXT NOT NULL,
            DistrictID INTEGER NOT NULL,
            DistrictKey TEXT,
            ProjectKey TEXT,
            Block TEXT,
            Client TEXT,
            Description TEXT,
            InspectorName TEXT,
            DBPath TEXT,
            PendingPhotoFolderRename TEXT,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (DistrictID)
                REFERENCES Districts(DistrictID)
        );
    `);
    logger.debug("[schema] Projects table done");

    // Migration: Add DBPath column to existing Projects table
    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN DBPath TEXT;`);
        logger.debug("[schema] Migration: DBPath column added to Projects");
    } catch {
        logger.debug("[schema] Migration: DBPath column already exists (ok)");
    }

    // Migration: Add SAFPath column to existing Projects table
    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN SAFPath TEXT;`);
        logger.debug("[schema] Migration: SAFPath column added to Projects");
    } catch {
        logger.debug("[schema] Migration: SAFPath column already exists (ok)");
    }

    // Migration: Add PendingPhotoFolderRename column to existing Projects table.
    // Holds the JSON crash-recovery marker while a photo folder rename is in
    // flight. NULL for all projects that are not mid-rename.
    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN PendingPhotoFolderRename TEXT;`);
        logger.debug("[schema] Migration: PendingPhotoFolderRename column added to Projects");
    } catch {
        logger.debug("[schema] Migration: PendingPhotoFolderRename column already exists (ok)");
    }

    // Migration: Add IsActive column to existing Divisions table
    try {
        await db.execAsync(`ALTER TABLE Divisions ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
        logger.debug("[schema] Migration: IsActive column added to Divisions");
    } catch {
        logger.debug("[schema] Migration: IsActive column already exists in Divisions (ok)");
    }

    // Migration: Add IsActive column to existing Districts table
    try {
        await db.execAsync(`ALTER TABLE Districts ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
        logger.debug("[schema] Migration: IsActive column added to Districts");
    } catch {
        logger.debug("[schema] Migration: IsActive column already exists in Districts (ok)");
    }

    logger.debug("✅ [schema] createGlobalSchema() — END");
}

export async function migrateProjectUniqueness(): Promise<ProjectDuplicateGroup[]> {
    logger.info("[schema] migrateProjectUniqueness() — START");

    const db = await getGlobalDatabase();

    const indexRow = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'index' AND name = 'uq_projects_district_project'`
    );
    if ((indexRow?.cnt ?? 0) > 0) {
        logger.info("[schema] migrateProjectUniqueness() — index already exists, done");
        return [];
    }

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN DistrictKey TEXT;`);
        logger.debug("[schema] Migration: DistrictKey column added to Projects");
    } catch {
        logger.debug("[schema] Migration: DistrictKey column already exists (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN ProjectKey TEXT;`);
        logger.debug("[schema] Migration: ProjectKey column added to Projects");
    } catch {
        logger.debug("[schema] Migration: ProjectKey column already exists (ok)");
    }

    const projects = await db.getAllAsync<{
        ProjectID: number;
        ProjectName: string;
        DistrictID: number;
        DBPath: string | null;
        DistrictKey: string | null;
        ProjectKey: string | null;
    }>(
        `SELECT ProjectID, ProjectName, DistrictID, DBPath, DistrictKey, ProjectKey FROM Projects`
    );

    const districts = await db.getAllAsync<{ DistrictID: number; DistrictName: string }>(
        `SELECT DistrictID, DistrictName FROM Districts`
    );

    const districtNameById = new Map(districts.map((d) => [d.DistrictID, d.DistrictName]));

    for (const project of projects) {
        if (project.DistrictKey && project.ProjectKey) continue;
        const districtName = districtNameById.get(project.DistrictID) ?? "";
        const { districtKey, projectKey } = buildProjectIdentity(districtName, project.ProjectName);
        await db.runAsync(
            `UPDATE Projects SET DistrictKey = ?, ProjectKey = ? WHERE ProjectID = ?`,
            [districtKey, projectKey, project.ProjectID]
        );
    }

    const backfilled = await db.getAllAsync<{
        ProjectID: number;
        ProjectName: string;
        DistrictID: number;
        DBPath: string | null;
    }>(`SELECT ProjectID, ProjectName, DistrictID, DBPath FROM Projects`);

    const duplicates = detectProjectDuplicates(backfilled, districts);
    if (duplicates.length > 0) {
        logger.warn(
            `[schema] migrateProjectUniqueness() — ${duplicates.length} duplicate group(s) found; UNIQUE index NOT created.`
        );
        for (const group of duplicates) {
            const members = group.members
                .map(
                    (m) =>
                        `id=${m.ProjectID} district=${m.DistrictName} project=${m.ProjectName} dbPath=${m.DBPath}`
                )
                .join(" | ");
            logger.warn(
                `[schema] duplicate group districtKey=${group.districtKey} projectKey=${group.projectKey}: ${members}`
            );
        }
        return duplicates;
    }

    await db.execAsync(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_district_project ON Projects(DistrictKey, ProjectKey)`
    );
    logger.info("[schema] migrateProjectUniqueness() — UNIQUE index created");
    logger.info("[schema] migrateProjectUniqueness() — END");
    return [];
}

export async function createProjectSchema() {
    logger.debug("📄 [schema] createProjectSchema() — START");

    const db = await getDatabase();
    logger.debug("[schema] Got project DB handle");

    logger.debug("[schema] Creating inspection templates table...");
    await db.execAsync(createInspectionTemplatesTable);

    logger.debug("[schema] Creating inspection sections table...");
    await db.execAsync(createInspectionSectionsTable);

    logger.debug("[schema] Creating inspection fields table...");
    await db.execAsync(createInspectionFieldsTable);

    logger.debug("[schema] Creating field options table...");
    await db.execAsync(createFieldOptionsTable);

    logger.debug("[schema] Creating repeatable groups table...");
    await db.execAsync(createRepeatableGroupsTable);

    logger.debug("[schema] Creating repeatable group fields table...");
    await db.execAsync(createRepeatableGroupFieldsTable);

    logger.debug("[schema] Creating inspections table...");
    await db.execAsync(createInspectionsTable);

    logger.debug("[schema] Creating inspection values table...");
    await db.execAsync(createInspectionValuesTable);

    logger.debug("[schema] Creating repeatable records table...");
    await db.execAsync(createRepeatableRecordsTable);

    logger.debug("[schema] Creating repeatable values table...");
    await db.execAsync(createRepeatableValuesTable);

    logger.debug("[schema] Creating cameras table...");
    await db.execAsync(createCamerasTable);

    logger.debug("[schema] Creating switches table...");
    await db.execAsync(createSwitchesTable);

    logger.debug("[schema] Creating photos table...");
    await db.execAsync(createPhotosTable);

    logger.debug("[schema] Creating inspection pole id history table...");
    await db.execAsync(createInspectionPoleIdHistoryTable);

    logger.debug("[schema] Creating DeviceOptions table...");
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

    logger.debug("[schema] Creating DeviceFieldDefinitions table...");
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

    logger.debug("[schema] Creating device records table...");
    await db.execAsync(createDeviceRecordsTable);

    logger.debug("[schema] Creating ProjectDeviceTypes table...");
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ProjectDeviceTypes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            DeviceType TEXT NOT NULL,
            IsActive INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(DeviceType)
        );
    `);

    logger.debug("[schema] Creating DashboardCards table...");
    await db.execAsync(createDashboardCardsTable);

    logger.debug("✅ [schema] createProjectSchema() — END");
}

export async function migrateProjectSchema(projectId: number) {
    logger.debug("[schema] migrateProjectSchema() — START");

    const db = await getDatabase();

    const remarksSection = await db.getFirstAsync<{ SectionID: number }>(
        `SELECT SectionID FROM InspectionSections WHERE SectionKey = 'remarks' LIMIT 1`
    );
    if (remarksSection) {
        logger.debug("[schema] migrateProjectSchema() — remarks section already exists (ok)");
    } else {
        const categorization = await db.getFirstAsync<{ SectionID: number; TemplateID: number; DisplayOrder: number }>(
            `SELECT SectionID, TemplateID, DisplayOrder FROM InspectionSections WHERE SectionKey = 'categorization' LIMIT 1`
        );
        if (!categorization) {
            logger.debug("[schema] migrateProjectSchema() — categorization section not found, skipping");
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
        const categorizeField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_category' LIMIT 1`
        );
        if (categorizeField) {
            await db.runAsync(
                `UPDATE InspectionSections SET IsActive = 0, IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionKey = 'categorization'`
            );
            await db.runAsync(
                `UPDATE InspectionFields SET IsActive = 0, IsDefault = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'pole_category'`
            );
            await db.runAsync(
                `UPDATE FieldOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldID IN (SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_category')`
            );
            logger.debug("[schema] Migration: Deactivated Categorization section (pole_category)");
        }
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — categorization deactivation failed (non-fatal):", e);
    }

    try {
        const switchField = await db.getFirstAsync<{ FieldID: number; IsRequired: number }>(
            `SELECT FieldID, IsRequired FROM InspectionFields WHERE FieldKey = 'switch_count' LIMIT 1`
        );
        if (switchField && switchField.IsRequired === 1) {
            await db.runAsync(
                `UPDATE InspectionFields SET IsRequired = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'switch_count'`
            );
            logger.debug("[schema] Migration: Switch Count is now optional");
        }
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — switch_count optional migration failed (non-fatal):", e);
    }

    try {
        const poleIdField = await db.getFirstAsync<{ FieldID: number; FieldName: string }>(
            `SELECT FieldID, FieldName FROM InspectionFields WHERE FieldKey = 'pole_id' AND FieldName = 'Pole ID' LIMIT 1`
        );
        if (poleIdField) {
            await db.runAsync(
                `UPDATE InspectionFields SET FieldName = 'Site ID', Placeholder = 'Enter Site ID', UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'pole_id'`
            );
            logger.debug("[schema] Migration: Renamed Pole ID field label to Site ID");
        }
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — pole_id label migration failed (non-fatal):", e);
    }

    try {
        await db.execAsync(createDashboardCardsTable);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — DashboardCards table creation failed (non-fatal):", e);
    }

    try {
        await db.execAsync(createInspectionPoleIdHistoryTable);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — InspectionPoleIdHistory table creation failed (non-fatal):", e);
    }

    try {
        await db.runAsync(`UPDATE DashboardCards SET ProjectID = ?`, [projectId]);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — DashboardCards ProjectID repair failed (non-fatal):", e);
    }

    try {
        await DashboardCardRepository.ensureDefaultCards(projectId);
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — ensureDefaultCards failed (non-fatal):", e);
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT;`);
        logger.debug("[schema] Migration: BreakdownField column added to DashboardCards");
    } catch {
        logger.debug("[schema] Migration: BreakdownField column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT;`);
        logger.debug("[schema] Migration: SectionLabel column added to DashboardCards");
    } catch {
        logger.debug("[schema] Migration: SectionLabel column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT;`);
        logger.debug("[schema] Migration: AggregateField column added to DashboardCards");
    } catch {
        logger.debug("[schema] Migration: AggregateField column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT;`);
        logger.debug("[schema] Migration: DeviceType column added to DashboardCards");
    } catch {
        logger.debug("[schema] Migration: DeviceType column already exists in DashboardCards (ok)");
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN CardMode TEXT NOT NULL DEFAULT 'entitycount';`);
        logger.debug("[schema] Migration: CardMode column added to DashboardCards");
    } catch {
        logger.debug("[schema] Migration: CardMode column already exists in DashboardCards (ok)");
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
        logger.debug("[schema] Migration: CardMode backfill complete for DashboardCards");
    } catch (e) {
        logger.info("[schema] migrateProjectSchema — CardMode backfill failed (non-fatal):", e);
    }

      try {
          await DashboardCardRepository.migrateDefaultCards(projectId);
      } catch (e) {
          logger.info("[schema] migrateProjectSchema \u2014 migrateDefaultCards failed (non-fatal):", e);
      }

      try {
          await DashboardCardRepository.migrateDeviceCards(projectId);
      } catch (e) {
          logger.info("[schema] migrateProjectSchema \u2014 migrateDeviceCards failed (non-fatal):", e);
      }

    // Migration: Add StoragePath column to existing Photos table.
    // Holds the immutable human-readable folder a photo was saved into.
    // NULL until lazily backfilled for photos captured before this migration.
    try {
        await db.execAsync(`ALTER TABLE Photos ADD COLUMN StoragePath TEXT;`);
        logger.debug("[schema] Migration: StoragePath column added to Photos");
    } catch {
        logger.debug("[schema] Migration: StoragePath column already exists in Photos (ok)");
    }

    logger.debug("✅ [schema] migrateProjectSchema() — END");
}
