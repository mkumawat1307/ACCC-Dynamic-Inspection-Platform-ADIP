// src/database/helpers/ProjectDBManager.ts

import * as FileSystem from "expo-file-system/legacy";
import {
  setActiveProject,
  clearActiveProject,
  getDatabase,
} from "../db";
import { logger } from "@/src/utils/logger";
import { createProjectSchema, migrateProjectSchema } from "../schema";
import { buildProjectFolderLabel } from "@/src/utils/folderNaming";
import { buildIdentitySeed } from "../projectIdentity";
import { seedInspectionTemplate } from "../seeds/inspection-template.seed";
import { seedInspectionSections } from "../seeds/inspection-sections.seed";
import { seedInspectionFields } from "../seeds/inspection-fields.seed";
import { seedFieldOptions } from "../seeds/field-options.seed";
import { seedRepeatableGroups } from "../seeds/repeatable-groups.seed";
import { seedRepeatableGroupFields } from "../seeds/repeatable-group-fields.seed";
import { seedDeviceOptions } from "../seeds/device-options.seed";
import { seedDeviceFieldDefinitions } from "../seeds/device-field-definitions.seed";
import { seedDashboardCards } from "../seeds/dashboard-cards.seed";
import { InspectionRepository } from "../repositories/InspectionRepository";

const PROJECTS_FOLDER = "Projects";

export class ProjectFolderExistsError extends Error {
  constructor(path: string) {
    super(`Project DB already exists at ${path}`);
    this.name = "ProjectFolderExistsError";
  }
}

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
  "DashboardCards",
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

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

function folderIdentityHash(districtName: string, projectName: string): string {
  const seed = buildIdentitySeed(districtName, projectName);
  let hash = FNV1A_OFFSET_BASIS;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, FNV1A_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function getProjectDbPath(districtName: string, projectName: string): string {
  const label = buildProjectFolderLabel(districtName, projectName);
  const hash = folderIdentityHash(districtName, projectName);
  return `${getProjectsBasePath()}${label}_${hash}/inspection.db`;
}

export async function createProjectDb(
  projectName: string,
  projectDbPath: string,
  projectId: number
): Promise<void> {
  logger.debug("[ProjectDBManager] createProjectDb — START");

  const folderPath = projectDbPath.replace(/inspection\.db$/, "");
  const existing = await FileSystem.getInfoAsync(projectDbPath);
  if (existing.exists) {
    throw new ProjectFolderExistsError(projectDbPath);
  }
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
  await seedDashboardCards(projectId);

  await clearActiveProject();
  logger.info(`✅ [ProjectDBManager] Project created: ${projectName}`);
}

export async function cloneProjectDb(
  sourceDbPath: string,
  projectName: string,
  projectDbPath: string,
  newProjectId: number
): Promise<void> {
  logger.debug("[ProjectDBManager] cloneProjectDb — START");

  const settings: Partial<
    Record<(typeof SETTINGS_TABLES)[number], SettingsRow[]>
  > = {};
  const inspectionData: Partial<
    Record<(typeof INSPECTION_DATA_TABLES)[number], SettingsRow[]>
  > = {};

  let sourceInspections: SettingsRow[] = [];

  await setActiveProject(sourceDbPath);
  try {
    const sourceDb = await getDatabase();
    for (const table of SETTINGS_TABLES) {
      const rows = await sourceDb.getAllAsync<SettingsRow>(
        `SELECT * FROM ${table}`
      );
      settings[table] = rows;
    }

    sourceInspections = await sourceDb.getAllAsync<SettingsRow>(
      `SELECT * FROM Inspections`
    );
    for (const table of INSPECTION_DATA_TABLES) {
      const rows = await sourceDb.getAllAsync<SettingsRow>(
        `SELECT * FROM ${table}`
      );
      inspectionData[table] = rows;
    }
  } finally {
    await clearActiveProject();
  }

  const folderPath = projectDbPath.replace(/inspection\.db$/, "");
  const existing = await FileSystem.getInfoAsync(projectDbPath);
  if (existing.exists) {
    throw new ProjectFolderExistsError(projectDbPath);
  }
  await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });

  await setActiveProject(projectDbPath);
  try {
    const newDb = await getDatabase();
    await newDb.withTransactionAsync(async () => {
      await createProjectSchema();

      for (const table of [
        ...SETTINGS_TABLES,
        "Inspections",
        ...INSPECTION_DATA_TABLES,
      ]) {
        await newDb.runAsync(`DELETE FROM ${table}`);
      }

      const dashboardCards = (settings.DashboardCards ?? [])
        .slice()
        .sort((a, b) => (a.CardID as number) - (b.CardID as number));
      const seenCardKeys = new Set<string>();
      const dedupedDashboardCards: SettingsRow[] = [];
      for (const row of dashboardCards) {
        const key = row.CardKey as string;
        if (seenCardKeys.has(key)) continue;
        seenCardKeys.add(key);
        dedupedDashboardCards.push(row);
      }

      for (const table of SETTINGS_TABLES) {
        const rows =
          table === "DashboardCards"
            ? dedupedDashboardCards
            : (settings[table] ?? []);
        if (rows.length === 0) continue;
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

      await newDb.runAsync(`UPDATE DashboardCards SET ProjectID = ?`, [newProjectId]);

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
        const remap: Record<string, Map<number, number>> =
          table === "RepeatableValues"
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
    });
  } finally {
    await clearActiveProject();
  }
  logger.info(`✅ [ProjectDBManager] Project cloned: ${projectName}`);
}

export async function openProjectDb(dbPath: string, projectId: number): Promise<void> {
  logger.debug("[ProjectDBManager] openProjectDb — START");
  await setActiveProject(dbPath);

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='InspectionTemplates'"
  );
  if (!row || row.cnt === 0) {
    await clearActiveProject();
    throw new Error(`Project database is empty or missing schema: ${dbPath}`);
  }
  logger.debug("[ProjectDBManager] openProjectDb — valid");

  await migrateProjectSchema(projectId);
  logger.debug("[ProjectDBManager] openProjectDb — migrations applied");
  logger.info(`[ProjectDBManager] Project database opened: ${dbPath}`);
}

export async function updateProjectInspectorName(
  dbPath: string,
  inspectorName: string
): Promise<void> {
  await setActiveProject(dbPath);
  try {
    await InspectionRepository.updateInspectorNameForProject(inspectorName);
  } finally {
    await clearActiveProject();
  }
  logger.info(`[ProjectDBManager] Inspector name synced to inspections: ${dbPath}`);
}

export async function deleteProjectDb(dbPath: string): Promise<void> {
  logger.debug("[ProjectDBManager] deleteProjectDb — START");
  if (dbPath) {
    const folderPath = dbPath.replace(/inspection\.db$/, "");
    await FileSystem.deleteAsync(folderPath);
  }
  logger.debug("[ProjectDBManager] deleteProjectDb — END");
}

export async function listProjectFolders(): Promise<string[]> {
  logger.debug("[ProjectDBManager] listProjectFolders — START");

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
  logger.debug("[ProjectDBManager] Returning", result.length, "project folders");
  logger.debug("[ProjectDBManager] listProjectFolders — END");
  return result;
}
