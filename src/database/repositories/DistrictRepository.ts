import { getGlobalDatabase } from "../db";
import { logger } from "@/src/utils/logger";
import { District } from "@/src/models/District";

export class DistrictRepository {
  static async getAll(): Promise<District[]> {
    logger.info("[DistrictRepository] getAll() — START");

    logger.info("[DistrictRepository] Calling getGlobalDatabase()...");
    const db = await getGlobalDatabase();
    logger.info("[DistrictRepository] Got DB handle");

    logger.info("[DistrictRepository] Executing SELECT districts...");
    const results = await db.getAllAsync<District>(
      `
      SELECT
        DistrictID,
        DistrictName
      FROM Districts
      ORDER BY DistrictName;
      `
    );

    logger.info(`[DistrictRepository] Query returned ${results.length} districts`);
    if (results.length > 0) {
      logger.info(`[DistrictRepository] First 3: ${JSON.stringify(results.slice(0, 3))}`);
    } else {
      logger.info("[DistrictRepository] WARNING: No districts found!");
    }

    logger.info("[DistrictRepository] getAll() — END");
    return results;
  }
}

