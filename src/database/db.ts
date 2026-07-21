// src/database/db.ts

import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "accc_pole_inspection.db";

let database: SQLite.SQLiteDatabase | null = null;

/**
 * Returns a singleton SQLite database instance.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // Enable Foreign Keys
    await database.execAsync(`
      PRAGMA foreign_keys = ON;
    `);

    // Better performance
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
    `);

    // Faster writes
    await database.execAsync(`
      PRAGMA synchronous = NORMAL;
    `);
  }

  return database;
}