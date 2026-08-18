import { getGlobalDatabase } from "../db";
import { District } from "@/src/models/District";

export class DistrictRepository {
  static async getAll(): Promise<District[]> {
    const db = await getGlobalDatabase();
    return await db.getAllAsync<District>(
      `
      SELECT
        DistrictID,
        DistrictName
      FROM Districts
      ORDER BY DistrictName;
      `
    );
  }
}

