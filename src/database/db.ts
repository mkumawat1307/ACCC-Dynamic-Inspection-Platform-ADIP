import * as SQLite from "expo-sqlite";

const GLOBAL_DATABASE_NAME = "accc_global.db";

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
  } catch (e) {
    console.log(`[db.ts] closeCurrentDb — closeAsync failed (non-fatal):`, e);
  }
}

async function ensureGlobalDb(): Promise<SQLite.SQLiteDatabase> {
  if (currentDbTarget === GLOBAL_DATABASE_NAME && database) {
    return database;
  }
  if (activeProjectPath) {
    console.log(`[db.ts] ensureGlobalDb — WARN: activeProjectPath is set, switching away from project DB`, new Error().stack);
  } else {
    console.log(`[db.ts] ensureGlobalDb — opening global DB`, new Error().stack);
  }
  await closeCurrentDb();
  database = await SQLite.openDatabaseAsync(GLOBAL_DATABASE_NAME);
  currentDbTarget = GLOBAL_DATABASE_NAME;
  try {
    await database.execAsync(`PRAGMA journal_mode = DELETE;`);
    await database.execAsync(`PRAGMA foreign_keys = ON;`);
    await database.execAsync(`PRAGMA synchronous = NORMAL;`);
  } catch (e) {
    console.log(`[db.ts] ensureGlobalDb — PRAGMA failed (non-fatal):`, e);
  }
  return database;
}

async function ensureProjectDb(dbPath: string): Promise<SQLite.SQLiteDatabase> {
  const cp = cleanPath(dbPath);
  if (currentDbTarget === cp && database) {
    return database;
  }
  await closeCurrentDb();
  database = await SQLite.openDatabaseAsync(cp);
  currentDbTarget = cp;
  try {
    await database.execAsync(`PRAGMA journal_mode = WAL;`);
    await database.execAsync(`PRAGMA synchronous = NORMAL;`);
  } catch (e) {
    console.log(`[db.ts] ensureProjectDb — PRAGMA failed (non-fatal):`, e);
  }
  return database;
}

export async function getGlobalDatabase(): Promise<SQLite.SQLiteDatabase> {
  console.log(`[db.ts] getGlobalDatabase() — called`, new Error().stack);
  return ensureGlobalDb();
}

export async function setActiveProject(dbPath: string): Promise<void> {
  console.log(`[db.ts] setActiveProject() — setting project: ${dbPath}`);
  activeProjectPath = dbPath;
  await ensureProjectDb(dbPath);
}

export async function clearActiveProject(): Promise<void> {
  console.log(`[db.ts] clearActiveProject() — clearing`, new Error().stack);
  activeProjectPath = null;
  await ensureGlobalDb();
}

export function getActiveProjectPath(): string | null {
  return activeProjectPath;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (activeProjectPath) {
    return ensureProjectDb(activeProjectPath);
  }
  console.log(`[db.ts] getDatabase() — no active project, opening global DB`);
  return ensureGlobalDb();
}