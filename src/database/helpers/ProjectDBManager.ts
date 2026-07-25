// src/database/helpers/ProjectDBManager.ts

import * as FileSystem from "expo-file-system/legacy";
import {
  setActiveProject,
  clearActiveProject,
  getDatabase,
} from "../db";
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
  console.log(`[ProjectDBManager] createProjectDb(name="${projectName}", path="${projectDbPath}") — START`);

  const folderPath = projectDbPath.replace(/inspection\.db$/, "");
  console.log(`[ProjectDBManager] Creating folder: "${folderPath}"`);
  await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });

  console.log(`[ProjectDBManager] Setting active project...`);
  await setActiveProject(projectDbPath);
  console.log(`[ProjectDBManager] Project DB opened`);

  console.log(`[ProjectDBManager] Creating project schema...`);
  await createProjectSchema();
  console.log(`[ProjectDBManager] createProjectSchema done`);

  console.log(`[ProjectDBManager] Seeding project data...`);
  await seedInspectionTemplate();
  await seedInspectionSections();
  await seedInspectionFields();
  await seedFieldOptions();
  await seedRepeatableGroups();
  await seedRepeatableGroupFields();
  await seedDeviceOptions();
  await seedDeviceFieldDefinitions();
  console.log(`[ProjectDBManager] Project seeding done`);

  console.log(`[ProjectDBManager] Calling clearActiveProject...`);
  await clearActiveProject();
  console.log(`[ProjectDBManager] clearActiveProject done`);

  console.log(`✅ [ProjectDBManager] Project created: ${projectName}`);
}

export async function openProjectDb(dbPath: string): Promise<void> {
  console.log(`[ProjectDBManager] openProjectDb(path="${dbPath}") — START`);
  await setActiveProject(dbPath);
  console.log(`[ProjectDBManager] DB opened, validating schema...`);

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='InspectionTemplates'"
  );
  if (!row || row.cnt === 0) {
    console.log(`[ProjectDBManager] Project DB has no project tables, clearing active`);
    await clearActiveProject();
    throw new Error(`Project database is empty or missing schema: ${dbPath}`);
  }

  console.log(`[ProjectDBManager] openProjectDb — valid`);
}

export async function deleteProjectDb(dbPath: string): Promise<void> {
  console.log(`[ProjectDBManager] deleteProjectDb(path="${dbPath}") — START`);
  if (dbPath) {
    const folderPath = dbPath.replace(/inspection\.db$/, "");
    try {
      console.log(`[ProjectDBManager] Deleting project folder...`);
      await FileSystem.deleteAsync(folderPath);
      console.log(`[ProjectDBManager] Deleted`);
    } catch (e) {
      console.log(`[ProjectDBManager] Delete failed (non-fatal):`, e);
    }
  }
  console.log(`[ProjectDBManager] deleteProjectDb — END`);
}

export async function deleteProjectFolder(projectName: string): Promise<void> {
  console.log(`[ProjectDBManager] deleteProjectFolder(name="${projectName}") — START`);
  const folderPath = getProjectFolderPath(projectName);
  try {
    console.log(`[ProjectDBManager] Deleting folder: "${folderPath}"`);
    await FileSystem.deleteAsync(folderPath);
  } catch (e) {
    console.log(`[ProjectDBManager] Delete folder failed (non-fatal):`, e);
  }
  console.log(`[ProjectDBManager] deleteProjectFolder — END`);
}

export async function listProjectFolders(): Promise<string[]> {
  console.log(`[ProjectDBManager] listProjectFolders() — START`);

  try {
    await FileSystem.makeDirectoryAsync(getProjectsBasePath(), { intermediates: true });
  } catch (e) {
    console.log(`[ProjectDBManager] Ensuring projects folder (non-fatal):`, e);
  }

  let items: string[];
  try {
    items = await FileSystem.readDirectoryAsync(getProjectsBasePath());
  } catch (e) {
    console.log(`[ProjectDBManager] readDirectoryAsync failed:`, e);
    return [];
  }
  console.log(`[ProjectDBManager] Found ${items.length} items in Projects folder`);

  const result = items.filter((item) => !item.startsWith("."));
  console.log(`[ProjectDBManager] Returning ${result.length} project folders`);
  console.log(`[ProjectDBManager] listProjectFolders() — END`);
  return result;
}