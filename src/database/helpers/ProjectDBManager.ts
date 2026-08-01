// src/database/helpers/ProjectDBManager.ts

import * as FileSystem from "expo-file-system/legacy";
import {
  setActiveProject,
  clearActiveProject,
  getDatabase,
} from "../db";
import { logger } from "@/src/utils/logger";
import { createProjectSchema, migrateProjectSchema } from "../schema";
import { seedInspectionTemplate } from "../seeds/inspection-template.seed";
import { seedInspectionSections } from "../seeds/inspection-sections.seed";
import { seedInspectionFields } from "../seeds/inspection-fields.seed";
import { seedFieldOptions } from "../seeds/field-options.seed";
import { seedRepeatableGroups } from "../seeds/repeatable-groups.seed";
import { seedRepeatableGroupFields } from "../seeds/repeatable-group-fields.seed";
import { seedDeviceOptions } from "../seeds/device-options.seed";
import { seedDeviceFieldDefinitions } from "../seeds/device-field-definitions.seed";

const PROJECTS_FOLDER = "Projects";

const SETTINGS_TABLES = [
  "InspectionTemplates",
  "InspectionSections",
  "InspectionFields",
  "FieldOptions",
  "RepeatableGroups",
  "RepeatableGroupFields",
  "DeviceOptions",
  "DeviceFieldDefinitions",
  "ProjectDeviceTypes",
] as const;

const INSPECTION_DATA_TABLES = [
  "InspectionValues",
  "RepeatableRecords",
  "RepeatableValues",
  "Cameras",
  "Switches",
  "Photos",
  "DeviceRecords",
] as const;

const DATA_TABLE_ID_COLUMNS: Record<string, string> = {
  InspectionValues: "ValueID",
  RepeatableRecords: "RecordID",
  RepeatableValues: "ValueID",
  Cameras: "CameraID",
  Switches: "SwitchID",
  Photos: "PhotoID",
  DeviceRecords: "RecordID",
};

type SettingsRow = Record<string, unknown>;

function getProjectsBasePath(): string {
  return `${FileSystem.documentDirectory}${PROJECTS_FOLDER}/`;
}

export function getProjectDbPath(projectName: string): string {
  const safeName = projectName.replace(/[<>:"/\\|?*]/g, "_");
  return `${getProjectsBasePath()}${safeName}/inspection.db`;
}

export function getProjectFolderPath(projectName: string): string {
  const safeName = projectName.replace(/[<>:"/\\|?*]/g, "_");
  return `${getProjectsBasePath()}${safeName}/`;
}

export async function createProjectDb(
  projectName: string,
  projectDbPath: string
): Promise<void> {
  logger.info("[ProjectDBManager] createProjectDb — START");

  const folderPath = projectDbPath.replace(/inspection\.db$/, "");
  await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });

  await setActiveProject(projectDbPath);

  await createProjectSchema();

  await seedInspectionTemplate();
  await seedInspectionSections();
  await seedInspectionFields();
  await seedFieldOptions();
  await seedRepeatableGroups();
  await seedRepeatableGroupFields();
  await seedDeviceOptions();
  await seedDeviceFieldDefinitions();

  await clearActiveProject();

  logger.info(`✅ [ProjectDBManager] Project created: ${projectName}`);
}

export async function cloneProjectDb(
  sourceDbPath: string,
  projectName: string,
  projectDbPath: string,
  newProjectId: number
): Promise<void> {
  logger.info("[ProjectDBManager] cloneProjectDb — START");

  const settings: Partial<
    Record<(typeof SETTINGS_TABLES)[number], SettingsRow[]>
  > = {};
  const inspectionData: Partial<
    Record<(typeof INSPECTION_DATA_TABLES)[number], SettingsRow[]>
  > = {};

  await setActiveProject(sourceDbPath);
  const sourceDb = await getDatabase();
  for (const table of SETTINGS_TABLES) {
    const rows = await sourceDb.getAllAsync<SettingsRow>(
      `SELECT * FROM ${table}`
    );
    settings[table] = rows;
  }

  const sourceInspections = await sourceDb.getAllAsync<SettingsRow>(
    `SELECT * FROM Inspections`
  );
  for (const table of INSPECTION_DATA_TABLES) {
    const rows = await sourceDb.getAllAsync<SettingsRow>(
      `SELECT * FROM ${table}`
    );
    inspectionData[table] = rows;
  }
  await clearActiveProject();

  const folderPath = projectDbPath.replace(/inspection\.db$/, "");
  await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });

  await setActiveProject(projectDbPath);
  await createProjectSchema();

  const newDb = await getDatabase();
  for (const table of SETTINGS_TABLES) {
    const rows = settings[table];
    if (!rows || rows.length === 0) continue;
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => "?").join(", ");
      const values = cols.map((c) => row[c] as string | number | null);
      await newDb.runAsync(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
        values
      );
    }
  }

  const inspectionIdMap = new Map<number, number>();
  for (const row of sourceInspections) {
    const cols = Object.keys(row).filter(
      (c) => c !== "InspectionID" && c !== "ProjectID"
    );
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((c) => row[c] as string | number | null);
    const result = await newDb.runAsync(
      `INSERT INTO Inspections (${cols.join(", ")}, ProjectID) VALUES (${placeholders}, ?)`,
      [...values, newProjectId]
    );
    const oldId = row.InspectionID;
    if (typeof oldId === "number") {
      inspectionIdMap.set(oldId, result.lastInsertRowId as number);
    }
  }

  const recordIdMap = new Map<number, number>();
  for (const table of INSPECTION_DATA_TABLES) {
    const rows = inspectionData[table];
    if (!rows || rows.length === 0) continue;
    const idColumn = DATA_TABLE_ID_COLUMNS[table];
    const remap: Record<string, Map<number, number>> = table === "RepeatableValues"
      ? { RecordID: recordIdMap }
      : { InspectionID: inspectionIdMap };
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => c !== idColumn);
      const placeholders = cols.map(() => "?").join(", ");
      const values = cols.map((c) => {
        const value = row[c];
        const map = remap[c];
        if (map && typeof value === "number") {
          return map.get(value) ?? value;
        }
        return value as string | number | null;
      });
      const result = await newDb.runAsync(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
        values
      );
      const oldId = row[idColumn];
      if (table === "RepeatableRecords" && typeof oldId === "number") {
        recordIdMap.set(oldId, result.lastInsertRowId as number);
      }
    }
  }

  await clearActiveProject();

  logger.info(`✅ [ProjectDBManager] Project cloned: ${projectName}`);
}

export async function openProjectDb(dbPath: string): Promise<void> {
  logger.info("[ProjectDBManager] openProjectDb — START");
  await setActiveProject(dbPath);

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='InspectionTemplates'"
  );
  if (!row || row.cnt === 0) {
    await clearActiveProject();
    throw new Error(`Project database is empty or missing schema: ${dbPath}`);
  }

  logger.info("[ProjectDBManager] openProjectDb — valid");

  await migrateProjectSchema();

  logger.info("[ProjectDBManager] openProjectDb — migrations applied");
}

export async function deleteProjectDb(dbPath: string): Promise<void> {
  logger.info("[ProjectDBManager] deleteProjectDb — START");
  if (dbPath) {
    const folderPath = dbPath.replace(/inspection\.db$/, "");
    await FileSystem.deleteAsync(folderPath);
  }
  logger.info("[ProjectDBManager] deleteProjectDb — END");
}

export async function deleteProjectFolder(projectName: string): Promise<void> {
  logger.info("[ProjectDBManager] deleteProjectFolder — START");
  const folderPath = getProjectFolderPath(projectName);
  await FileSystem.deleteAsync(folderPath);
  logger.info("[ProjectDBManager] deleteProjectFolder — END");
}

export async function listProjectFolders(): Promise<string[]> {
  logger.info("[ProjectDBManager] listProjectFolders — START");

  try {
    await FileSystem.makeDirectoryAsync(getProjectsBasePath(), { intermediates: true });
  } catch (e) {
    logger.info("[ProjectDBManager] Ensuring projects folder (non-fatal):", e);
  }

  let items: string[];
  try {
    items = await FileSystem.readDirectoryAsync(getProjectsBasePath());
  } catch (e) {
    logger.info("[ProjectDBManager] readDirectoryAsync failed:", e);
    return [];
  }

  const result = items.filter((item) => !item.startsWith("."));
  logger.info("[ProjectDBManager] Returning", result.length, "project folders");
  logger.info("[ProjectDBManager] listProjectFolders — END");
  return result;
}