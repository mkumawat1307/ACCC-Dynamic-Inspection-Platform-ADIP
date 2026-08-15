//frontend\src\database\DatabaseService.ts
import { createGlobalSchema, migrateProjectUniqueness } from "./schema";
import { getGlobalDatabase } from "./db";
import { seedGlobalDatabase } from "./seed";
import { drainLegacyPendingPhotoFolderRenames } from "@/src/database/services/PendingRenameDrain";
import { logger } from "@/src/utils/logger";
import type { ProjectDuplicateGroup } from "./projectIdentity";

let initializing = false;
let initError: string | null = null;
let projectDuplicates: ProjectDuplicateGroup[] = [];

export function getInitError(): string | null {
  return initError;
}

export function getProjectDuplicates(): ProjectDuplicateGroup[] {
  return projectDuplicates;
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

    projectDuplicates = await migrateProjectUniqueness();

    try {
      await drainLegacyPendingPhotoFolderRenames();
    } catch (e) {
      logger.error("❌ [DatabaseService] Pending photo-folder rename drain failed", e);
    }

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
