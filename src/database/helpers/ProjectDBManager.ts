// src/database/helpers/ProjectDBManager.ts

import * as FileSystem from "expo-file-system/legacy";
import {
  setActiveProject,
  clearActiveProject,
  getDatabase,
} from "../db";
import { logger } from "@/src/utils/logger";
import { createProjectSchema } from "../schema";
import { seedInspectionTemplate } from "../seeds/inspection-template.seed";
import { seedInspectionSections } from "../seeds/inspection-sections.seed";
import { seedInspectionFields } from "../seeds/inspection-fields.seed";
import { seedFieldOptions } from "../seeds/field-options.seed";
import { seedRepeatableGroups } from "../seeds/repeatable-groups.seed";
import { seedRepeatableGroupFields } from "../seeds/repeatable-group-fields.seed";
import { seedDeviceOptions } from "../seeds/device-options.seed";
import { seedDeviceFieldDefinitions } from "../seeds/device-field-definitions.seed";

const PROJECTS_FOLDER = "Projects";

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