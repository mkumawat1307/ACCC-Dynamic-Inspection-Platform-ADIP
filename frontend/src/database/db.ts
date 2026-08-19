import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";

import { logger } from "@/src/utils/logger";
export type SqlValue = string | number | null | boolean;

export const GLOBAL_DATABASE_NAME = "accc_global.db";

let database: SQLite.SQLiteDatabase | null = null;
let activeProjectPath: string | null = null;
let currentDbTarget: string | null = null;

function cleanPath(dbPath: string): string {
  return dbPath.replace(/^file:\/\//, "");
}

async function closeCurrentDb(): Promise<void> {
  if (!database) return;
  const old = database;
  database = null;
  currentDbTarget = null;
  try {
    await old.closeAsync();
  } catch {
  }
}

async function ensureGlobalDb(): Promise<SQLite.SQLiteDatabase> {
  if (currentDbTarget === GLOBAL_DATABASE_NAME && database) {
    return database;
  }
  if (activeProjectPath) {
    logger.warn(`[db.ts] ensureGlobalDb — switching away from active project DB`);
  }
  await closeCurrentDb();
  database = await SQLite.openDatabaseAsync(GLOBAL_DATABASE_NAME);
  currentDbTarget = GLOBAL_DATABASE_NAME;
  try {
    await database.execAsync(`PRAGMA journal_mode = DELETE;`);
    await database.execAsync(`PRAGMA foreign_keys = ON;`);
    await database.execAsync(`PRAGMA synchronous = NORMAL;`);
  } catch {
  }
  return database;
}

async function migrateLegacyProjectDb(dbPath: string): Promise<void> {
  try {
    const cleaned = cleanPath(dbPath);
    const projectName = cleaned
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .slice(-2, -1)[0];
    if (!projectName) return;
    const legacyDir = `file://${SQLite.defaultDatabaseDirectory}/Projects/${projectName}`;
    const info = await FileSystem.getInfoAsync(legacyDir);
    if (!info.exists) return;
    const entries = await FileSystem.readDirectoryAsync(legacyDir);
    const dbFiles = entries.filter(
      (f) => f === "inspection.db" || f.startsWith("inspection.db-")
    );
    if (dbFiles.length === 0) return;
    const targetDir = `file://${cleaned.replace(/\/[^/]+$/, "")}`;
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
    for (const f of dbFiles) {
      await FileSystem.moveAsync({ from: `${legacyDir}/${f}`, to: `${targetDir}/${f}` });
    }
  } catch {
    // legacy migration skipped — non-fatal
  }
}

async function ensureProjectDb(dbPath: string): Promise<SQLite.SQLiteDatabase> {
  const cp = cleanPath(dbPath);
  if (currentDbTarget === cp && database) {
    return database;
  }
  await closeCurrentDb();
  await migrateLegacyProjectDb(cp);
  database = await SQLite.openDatabaseAsync(cp, undefined, "");
  currentDbTarget = cp;
  try {
    await database.execAsync(`PRAGMA journal_mode = WAL;`);
    await database.execAsync(`PRAGMA foreign_keys = ON;`);
    await database.execAsync(`PRAGMA synchronous = NORMAL;`);
  } catch {
  }
  return database;
}

export async function getGlobalDatabase(): Promise<SQLite.SQLiteDatabase> {
  return ensureGlobalDb();
}

export async function setActiveProject(dbPath: string): Promise<void> {
  activeProjectPath = dbPath;
  await ensureProjectDb(dbPath);
}

export async function clearActiveProject(): Promise<void> {
  activeProjectPath = null;
  await ensureGlobalDb();
}

export async function closeAllDatabases(): Promise<void> {
  activeProjectPath = null;
  await closeCurrentDb();
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (activeProjectPath) {
    return ensureProjectDb(activeProjectPath);
  }
  return ensureGlobalDb();
}
