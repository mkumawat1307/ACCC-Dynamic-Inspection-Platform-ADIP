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

    // Phase 13 — Canonical template migration
    // Section rename: Junction Box and Cabling → Junction Box and Power Cable
    try {
        await db.runAsync(
            `UPDATE InspectionSections SET SectionName = 'Junction Box and Power Cable',
             Description = 'JB Details and Power Cable Details',
             UpdatedAt = CURRENT_TIMESTAMP
             WHERE SectionName = 'Junction Box and Cabling'`
        );
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — junction box section rename failed (non-fatal):", e);
    }

    // Field key rename: cable_length → power_cable_length + type change to number
    try {
        const cableField = await db.getFirstAsync<{ FieldID: number; FieldType: string }>(
            `SELECT FieldID, FieldType FROM InspectionFields WHERE FieldKey = 'cable_length' LIMIT 1`
        );
        if (cableField) {
            if (cableField.FieldType !== "number") {
                await db.runAsync(
                    `UPDATE InspectionFields SET FieldType = 'number', UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'cable_length'`
                );
            }
            await db.runAsync(
                `UPDATE InspectionFields SET FieldKey = 'power_cable_length', UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'cable_length'`
            );
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — cable_length rename failed (non-fatal):", e);
    }

    // earthing_voltage type change to number
    try {
        const voltageField = await db.getFirstAsync<{ FieldType: string }>(
            `SELECT FieldType FROM InspectionFields WHERE FieldKey = 'earthing_voltage' AND FieldType != 'number' LIMIT 1`
        );
        if (voltageField) {
            await db.runAsync(
                `UPDATE InspectionFields SET FieldType = 'number', UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = 'earthing_voltage'`
            );
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — earthing_voltage type migration failed (non-fatal):", e);
    }

    // pole_avail option labels: Yes→Installed, No→Not Installed
    try {
        const poleAvailField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_avail' LIMIT 1`
        );
        if (poleAvailField) {
            await db.runAsync(
                `UPDATE FieldOptions SET OptionLabel = 'Installed', UpdatedAt = CURRENT_TIMESTAMP
                 WHERE FieldID = ? AND OptionValue = 'Yes' AND OptionLabel != 'Installed'`,
                [poleAvailField.FieldID]
            );
            await db.runAsync(
                `UPDATE FieldOptions SET OptionLabel = 'Not Installed', UpdatedAt = CURRENT_TIMESTAMP
                 WHERE FieldID = ? AND OptionValue = 'No' AND OptionLabel != 'Not Installed'`,
                [poleAvailField.FieldID]
            );
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — pole_avail label migration failed (non-fatal):", e);
    }

    // pole_status option labels and order update
    try {
        const poleStatusField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_status' LIMIT 1`
        );
        if (poleStatusField) {
            const poleStatusUpdates: Array<[string, string, string, number]> = [
                ["VMS", "VMS Live", "VMS", 1],
                ["Local", "Local Live", "Local", 2],
                ["Non-Live", "Non-Live", "Non-Live", 3],
                ["Not Verified", "Not Verified", "Not Verified", 4],
                ["In Stock", "Stock", "In Stock", 5],
                ["Dismantled", "Dismantled", "Dismantled", 6],
            ];
            for (const [oldLabel, newLabel, value, order] of poleStatusUpdates) {
                await db.runAsync(
                    `UPDATE FieldOptions SET OptionLabel = ?, DisplayOrder = ?, UpdatedAt = CURRENT_TIMESTAMP
                     WHERE FieldID = ? AND OptionValue = ? AND OptionLabel = ?`,
                    [newLabel, order, poleStatusField.FieldID, value, oldLabel]
                );
            }
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — pole_status option migration failed (non-fatal):", e);
    }

    // Add missing field options: cable_status +Damage, meter_power_status +Tapping, foundation_cond +Not Installed
    try {
        // cable_status: add Damage option
        const cableStatusField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'cable_status' LIMIT 1`
        );
        if (cableStatusField) {
            const existingDamage = await db.getFirstAsync<{ c: number }>(
                `SELECT COUNT(*) as c FROM FieldOptions WHERE FieldID = ? AND OptionValue = 'Damage'`,
                [cableStatusField.FieldID]
            );
            if (existingDamage && existingDamage.c === 0) {
                await db.runAsync(
                    `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
                     VALUES (?, 'Damage', 'Damage', 5, 0, 1)`,
                    [cableStatusField.FieldID]
                );
            }
        }

        // meter_power_status: add Tapping option
        const meterPowerField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'meter_power_status' LIMIT 1`
        );
        if (meterPowerField) {
            const existingTapping = await db.getFirstAsync<{ c: number }>(
                `SELECT COUNT(*) as c FROM FieldOptions WHERE FieldID = ? AND OptionValue = 'Tapping'`,
                [meterPowerField.FieldID]
            );
            if (existingTapping && existingTapping.c === 0) {
                await db.runAsync(
                    `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
                     VALUES (?, 'Tapping', 'Tapping', 3, 0, 1)`,
                    [meterPowerField.FieldID]
                );
            }
        }

        // foundation_cond: add Not Installed option
        const foundationField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'foundation_cond' LIMIT 1`
        );
        if (foundationField) {
            const existingNotInstalled = await db.getFirstAsync<{ c: number }>(
                `SELECT COUNT(*) as c FROM FieldOptions WHERE FieldID = ? AND OptionValue = 'Not Installed'`,
                [foundationField.FieldID]
            );
            if (existingNotInstalled && existingNotInstalled.c === 0) {
                await db.runAsync(
                    `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
                     VALUES (?, 'Not Installed', 'Not Installed', 5, 0, 1)`,
                    [foundationField.FieldID]
                );
            }
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — add missing field options failed (non-fatal):", e);
    }

    // Remove connectivity_type "Local" option (deactivate, don't delete historical data)
    try {
        const connectivityField = await db.getFirstAsync<{ FieldID: number }>(
            `SELECT FieldID FROM InspectionFields WHERE FieldKey = 'connectivity_type' LIMIT 1`
        );
        if (connectivityField) {
            await db.runAsync(
                `UPDATE FieldOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
                 WHERE FieldID = ? AND OptionValue = 'Local' AND IsActive = 1`,
                [connectivityField.FieldID]
            );
        }
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — remove connectivity Local failed (non-fatal):", e);
    }

    // Device options: add missing options for existing installs
    try {
        // CameraType: add 4K, Box Reliance, Dome, PCR Camera
        const cameraTypeOptions = [
            { Label: "4K", Value: "4K", Order: 1 },
            { Label: "Box Reliance", Value: "Box Reliance", Order: 3 },
            { Label: "Dome", Value: "Dome", Order: 5 },
            { Label: "PCR Camera", Value: "PCR Camera", Order: 7 },
        ];
        for (const opt of cameraTypeOptions) {
            const exists = await db.getFirstAsync<{ c: number }>(
                `SELECT COUNT(*) as c FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'CameraType' AND OptionValue = ?`,
                [opt.Value]
            );
            if (exists && exists.c === 0) {
                await db.runAsync(
                    `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
                     VALUES ('Camera', 'CameraType', ?, ?, ?, 1)`,
                    [opt.Label, opt.Value, opt.Order]
                );
            }
        }

        // CameraMake: add Hikvision/Reliance, Others
        const cameraMakeOptions = [
            { Label: "Hikvision/Reliance", Value: "Hikvision/Reliance", Order: 3 },
            { Label: "Others", Value: "Others", Order: 7 },
        ];
        for (const opt of cameraMakeOptions) {
            const exists = await db.getFirstAsync<{ c: number }>(
                `SELECT COUNT(*) as c FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'CameraMake' AND OptionValue = ?`,
                [opt.Value]
            );
            if (exists && exists.c === 0) {
                await db.runAsync(
                    `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
                     VALUES ('Camera', 'CameraMake', ?, ?, ?, 1)`,
                    [opt.Label, opt.Value, opt.Order]
                );
            }
        }

        // SDCardCapacity: add Not Installed
        const sdExists = await db.getFirstAsync<{ c: number }>(
            `SELECT COUNT(*) as c FROM DeviceOptions WHERE DeviceType = 'Camera' AND FieldName = 'SDCardCapacity' AND OptionValue = 'Not Installed'`
        );
        if (sdExists && sdExists.c === 0) {
            await db.runAsync(
                `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
                 VALUES ('Camera', 'SDCardCapacity', 'Not Installed', 'Not Installed', 4, 1)`
            );
        }

        // SwitchType: add 16-Port
        const switchTypeExists = await db.getFirstAsync<{ c: number }>(
            `SELECT COUNT(*) as c FROM DeviceOptions WHERE DeviceType = 'Switch' AND FieldName = 'SwitchType' AND OptionValue = '16-Port'`
        );
        if (switchTypeExists && switchTypeExists.c === 0) {
            await db.runAsync(
                `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
                 VALUES ('Switch', 'SwitchType', '16-Port', '16-Port', 3, 1)`
            );
        }

        // CameraStatus: update labels VMS→VMS Live, Local→Local Live
        await db.runAsync(
            `UPDATE DeviceOptions SET OptionLabel = 'VMS Live', UpdatedAt = CURRENT_TIMESTAMP
             WHERE DeviceType = 'Camera' AND FieldName = 'CameraStatus' AND OptionLabel = 'VMS' AND OptionValue = 'VMS'`
        );
        await db.runAsync(
            `UPDATE DeviceOptions SET OptionLabel = 'Local Live', UpdatedAt = CURRENT_TIMESTAMP
             WHERE DeviceType = 'Camera' AND FieldName = 'CameraStatus' AND OptionLabel = 'Local' AND OptionValue = 'Local'`
        );

        // SwitchStatus: update labels VMS→VMS Live, Local→Local Live
        await db.runAsync(
            `UPDATE DeviceOptions SET OptionLabel = 'VMS Live', UpdatedAt = CURRENT_TIMESTAMP
             WHERE DeviceType = 'Switch' AND FieldName = 'SwitchStatus' AND OptionLabel = 'VMS' AND OptionValue = 'VMS'`
        );
        await db.runAsync(
            `UPDATE DeviceOptions SET OptionLabel = 'Local Live', UpdatedAt = CURRENT_TIMESTAMP
             WHERE DeviceType = 'Switch' AND FieldName = 'SwitchStatus' AND OptionLabel = 'Local' AND OptionValue = 'Local'`
        );

        // SwitchMake: update Allied → Allied Telesis (label only)
        await db.runAsync(
            `UPDATE DeviceOptions SET OptionLabel = 'Allied Telesis', UpdatedAt = CURRENT_TIMESTAMP
             WHERE DeviceType = 'Switch' AND FieldName = 'SwitchMake' AND OptionValue = 'Allied'`
        );
    } catch (e) {
        logger.warn("[schema] migrateProjectSchema — device options migration failed (non-fatal):", e);
    }
}
