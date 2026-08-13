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
    logger.debug("[DatabaseService] initializeDatabase() — already in progress, skipping");
    return;
  }
  initializing = true;
  initError = null;

  try {
    await getGlobalDatabase();

    await createGlobalSchema();
    logger.info("Global schema migrated");

    await seedGlobalDatabase();

    logger.info("✅ Database initialized");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    initError = msg;
    logger.error("❌ [DatabaseService] Global Database Error", e);
    throw e;
  } finally {
    initializing = false;
  }
}
