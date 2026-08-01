//frontend\src\database\DatabaseService.ts
import { createGlobalSchema } from "./schema";
import { getGlobalDatabase } from "./db";
import { seedGlobalDatabase } from "./seed";
import { logger } from "@/src/utils/logger";

let initializing = false;
let initError: string | null = null;

export function getInitError(): string | null {
  return initError;
}

export async function initializeDatabase() {
  if (initializing) {
    logger.info("[DatabaseService] initializeDatabase() — already in progress, skipping");
    return;
  }
  initializing = true;
  initError = null;

  logger.info("[DatabaseService] initializeDatabase() — START");

  try {
    await getGlobalDatabase();

    await createGlobalSchema();

    await seedGlobalDatabase();

    const db = await getGlobalDatabase();
    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );

    logger.info("📋 [DatabaseService] Global Database Tables:", JSON.stringify(tables));
    logger.info("✅ [DatabaseService] Database initialized.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    initError = msg;
    logger.error("❌ [DatabaseService] Global Database Error", e);
    throw e;
  } finally {
    initializing = false;
  }

  logger.info("[DatabaseService] initializeDatabase() — END");
}
