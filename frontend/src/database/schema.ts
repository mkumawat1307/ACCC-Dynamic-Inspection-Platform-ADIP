// src/database/schema.ts

import { getDatabase, getGlobalDatabase } from "./db";

import { createDivisionsTable } from "./tables/divisions.table";
import { createDistrictsTable } from "./tables/districts.table";
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
    const db = await getGlobalDatabase();

    await db.execAsync(createDivisionsTable);
    await db.execAsync(createDistrictsTable);
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

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN DBPath TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN SAFPath TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN PendingPhotoFolderRename TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE Divisions ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE Districts ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1;`);
    } catch {
        // column already exists
    }
}

export async function migrateProjectUniqueness(): Promise<ProjectDuplicateGroup[]> {
    const db = await getGlobalDatabase();

    const indexRow = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'index' AND name = 'uq_projects_district_project'`
    );
    if ((indexRow?.cnt ?? 0) > 0) {
        return [];
    }

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN DistrictKey TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE Projects ADD COLUMN ProjectKey TEXT;`);
    } catch {
        // column already exists
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
    return [];
}

export async function createProjectSchema() {
    const db = await getDatabase();

    await db.execAsync(createInspectionTemplatesTable);
    await db.execAsync(createInspectionSectionsTable);
    await db.execAsync(createInspectionFieldsTable);
    await db.execAsync(createFieldOptionsTable);
    await db.execAsync(createRepeatableGroupsTable);
    await db.execAsync(createRepeatableGroupFieldsTable);
    await db.execAsync(createInspectionsTable);
    await db.execAsync(createInspectionValuesTable);
    await db.execAsync(createRepeatableRecordsTable);
    await db.execAsync(createRepeatableValuesTable);
    await db.execAsync(createCamerasTable);
    await db.execAsync(createSwitchesTable);
    await db.execAsync(createPhotosTable);
    await db.execAsync(createInspectionPoleIdHistoryTable);

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS DeviceOptions (
            OptionID INTEGER PRIMARY KEY AUTOINCREMENT,
            TemplateID INTEGER NOT NULL DEFAULT 1,
            DeviceType TEXT NOT NULL,
            FieldName TEXT NOT NULL,
            OptionLabel TEXT NOT NULL,
            OptionValue TEXT NOT NULL,
            DisplayOrder INTEGER NOT NULL DEFAULT 1,
            IsDefault INTEGER NOT NULL DEFAULT 0,
            IsActive INTEGER NOT NULL DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS DeviceFieldDefinitions (
            FieldDefID INTEGER PRIMARY KEY AUTOINCREMENT,
            TemplateID INTEGER NOT NULL DEFAULT 1,
            DeviceType TEXT NOT NULL,
            FieldName TEXT NOT NULL,
            Label TEXT NOT NULL,
            Placeholder TEXT,
            FieldType TEXT NOT NULL DEFAULT 'text',
            IsRequired INTEGER DEFAULT 0,
            IsVisible INTEGER DEFAULT 1,
            DisplayOrder INTEGER NOT NULL DEFAULT 0,
            IsActive INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(TemplateID, DeviceType, FieldName)
        );
    `);

    await db.execAsync(createDeviceRecordsTable);

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ProjectDeviceTypes (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            DeviceType TEXT NOT NULL,
            IsActive INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(DeviceType)
        );
    `);

    await db.execAsync(createDashboardCardsTable);
}

export async function migrateProjectSchema(projectId: number) {
    const db = await getDatabase();

    const remarksSection = await db.getFirstAsync<{ SectionID: number }>(
        `SELECT SectionID FROM InspectionSections WHERE SectionKey = 'remarks' LIMIT 1`
    );
    if (!remarksSection) {
        const categorization = await db.getFirstAsync<{ SectionID: number; TemplateID: number; DisplayOrder: number }>(
            `SELECT SectionID, TemplateID, DisplayOrder FROM InspectionSections WHERE SectionKey = 'categorization' LIMIT 1`
        );
        if (categorization) {
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
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — categorization deactivation failed (non-fatal):", e);
    }

    try {
        const switchField = await db.getFirstAsync<{ FieldID: number; IsRequired: number }>(
            `SELECT FieldID, IsRequired FROM InspectionFields WHERE FieldKey = 'switch_count' LIMIT 1`
        );
        if (switchField && switchField.IsRequired === 1) {
            await db.runAsync(
                `UPDATE InspectionFields SET IsRequired = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'switch_count'`
            );
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — switch_count optional migration failed (non-fatal):", e);
    }

    try {
        const poleIdField = await db.getFirstAsync<{ FieldID: number; FieldName: string }>(
            `SELECT FieldID, FieldName FROM InspectionFields WHERE FieldKey = 'pole_id' AND FieldName = 'Pole ID' LIMIT 1`
        );
        if (poleIdField) {
            await db.runAsync(
                `UPDATE InspectionFields SET FieldName = 'Site ID', Placeholder = 'Enter Site ID', UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'pole_id'`
            );
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — pole_id label migration failed (non-fatal):", e);
    }

    try {
        await db.execAsync(createDashboardCardsTable);
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — DashboardCards table creation failed (non-fatal):", e);
    }

    try {
        await db.execAsync(createInspectionPoleIdHistoryTable);
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — InspectionPoleIdHistory table creation failed (non-fatal):", e);
    }

    try {
        await db.runAsync(`UPDATE DashboardCards SET ProjectID = ?`, [projectId]);
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — DashboardCards ProjectID repair failed (non-fatal):", e);
    }

    try {
        await DashboardCardRepository.ensureDefaultCards(projectId);
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — ensureDefaultCards failed (non-fatal):", e);
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN BreakdownField TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN SectionLabel TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN AggregateField TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN DeviceType TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DashboardCards ADD COLUMN CardMode TEXT NOT NULL DEFAULT 'entitycount';`);
    } catch {
        // column already exists
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
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — CardMode backfill failed (non-fatal):", e);
    }

      try {
          await DashboardCardRepository.migrateDefaultCards(projectId);
      } catch (e) {
          logger.warn("[schema] migrateProjectSchema — migrateDefaultCards failed (non-fatal):", e);
      }

      try {
          await DashboardCardRepository.migrateDeviceCards(projectId);
      } catch (e) {
          logger.warn("[schema] migrateProjectSchema — migrateDeviceCards failed (non-fatal):", e);
      }

    try {
        await db.execAsync(`ALTER TABLE Photos ADD COLUMN StoragePath TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DeviceFieldDefinitions ADD COLUMN Placeholder TEXT;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DeviceFieldDefinitions ADD COLUMN IsVisible INTEGER NOT NULL DEFAULT 1;`);
    } catch {
        // column already exists
    }

    try {
        await db.execAsync(`ALTER TABLE DeviceOptions ADD COLUMN IsDefault INTEGER NOT NULL DEFAULT 0;`);
    } catch {
        // column already exists
    }
}
