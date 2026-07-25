//frontend\src\database\DatabaseService.ts
import { createGlobalSchema } from "./schema";
import { getGlobalDatabase } from "./db";
import { seedGlobalDatabase } from "./seed";

let initializing = false;
let initError: string | null = null;

export function getInitError(): string | null {
  return initError;
}

export async function initializeDatabase() {
  if (initializing) {
    console.log("[DatabaseService] initializeDatabase() — already in progress, skipping");
    return;
  }
  initializing = true;
  initError = null;

  console.log("📦 [DatabaseService] initializeDatabase() — START");

  try {
    console.log("[DatabaseService] Calling getGlobalDatabase()...");
    await getGlobalDatabase();
    console.log("[DatabaseService] getGlobalDatabase() done");

    console.log("[DatabaseService] Calling createGlobalSchema()...");
    await createGlobalSchema();
    console.log("[DatabaseService] createGlobalSchema() done");

    console.log("[DatabaseService] Calling seedGlobalDatabase()...");
    await seedGlobalDatabase();
    console.log("[DatabaseService] seedGlobalDatabase() done");

    console.log("[DatabaseService] Getting fresh handle for table list...");
    const db = await getGlobalDatabase();
    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );

    console.log("📋 [DatabaseService] Global Database Tables:", JSON.stringify(tables));
    console.log("✅ [DatabaseService] Database initialized.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    initError = msg;
    console.error("❌ [DatabaseService] Global Database Error", e);
    throw e;
  }

  initializing = false;
  console.log("[DatabaseService] initializeDatabase() — END");
}
