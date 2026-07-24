//frontend\src\database\repositories\DistrictRepository.ts
import { getDatabase } from "../db";
import { District } from "@/src/models/District";

export class DistrictRepository {
  static async getAll(): Promise<District[]> {
    const db = await getDatabase();

    return await db.getAllAsync<District>(
      `
      SELECT
        DistrictID,
        DistrictName
      FROM Districts
      WHERE IsActive = 1
      ORDER BY DistrictName;
      `
    );
  }
}