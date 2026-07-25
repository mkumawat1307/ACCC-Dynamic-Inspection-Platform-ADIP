import { getGlobalDatabase } from "../db";
import { District } from "@/src/models/District";

export class DistrictRepository {
  static async getAll(): Promise<District[]> {
    console.log("[DistrictRepository] getAll() — START");

    console.log("[DistrictRepository] Calling getGlobalDatabase()...");
    const db = await getGlobalDatabase();
    console.log("[DistrictRepository] Got DB handle");

    console.log("[DistrictRepository] Executing SELECT districts...");
    const results = await db.getAllAsync<District>(
      `
      SELECT
        DistrictID,
        DistrictName
      FROM Districts
      ORDER BY DistrictName;
      `
    );

    console.log(`[DistrictRepository] Query returned ${results.length} districts`);
    if (results.length > 0) {
      console.log(`[DistrictRepository] First 3: ${JSON.stringify(results.slice(0, 3))}`);
    } else {
      console.log("[DistrictRepository] WARNING: No districts found!");
    }

    console.log("[DistrictRepository] getAll() — END");
    return results;
  }
}
