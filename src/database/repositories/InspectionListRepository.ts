//frontend\src\database\repositories\InspectionListRepository.ts
import { getDatabase } from "../db";

export interface InspectionListItem {
  InspectionID: number;
  PoleID: string;
  InspectionDate: string;
  Status: string;
}

export class InspectionListRepository {

  static async getByProject(
    projectId: number
  ): Promise<InspectionListItem[]> {

    const db = await getDatabase();

    return await db.getAllAsync<InspectionListItem>(
      `
      SELECT
          InspectionID,
          PoleID,
          InspectionDate,
          Status
      FROM Inspections
      WHERE ProjectID = ?
      ORDER BY InspectionDate DESC;
      `,
      [projectId]
    );
  }

}