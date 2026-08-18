// frontend/src/database/seed.ts

import { getGlobalDatabase } from "./db";
import { seedDivisions } from "./seeds/division.seed";

import { logger } from "@/src/utils/logger";

export async function seedGlobalDatabase() {
    logger.debug("[seed] seedGlobalDatabase() — START");

    await getGlobalDatabase();

    await seedDivisions();
    logger.info("✅ Seed completed");
}

