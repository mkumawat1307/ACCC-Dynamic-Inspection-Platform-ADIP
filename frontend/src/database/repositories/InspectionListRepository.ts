//frontend\src\database\repositories\InspectionListRepository.ts
import { getDatabase } from "../db";
import { parseInspectionDate } from "../../utils/date";

export interface InspectionListItem {
  InspectionID: number;
  PoleID: string;
  Division: string | null;
  District: string | null;
  Block: string | null;
  InspectionDate: string;
  Status: string;
}

export class InspectionListRepository {

  static async getByProject(
    projectId: number,
    statuses: readonly string[]
  ): Promise<InspectionListItem[]> {

    const db = await getDatabase();

    const statusPlaces = statuses.map(() => "?").join(",");

    const rows = await db.getAllAsync<InspectionListItem>(
      `
      SELECT
          i.InspectionID,
          i.PoleID,
          i.InspectionDate,
          i.Status,
          (SELECT v.FieldValue FROM InspectionValues v
             JOIN InspectionFields f ON v.FieldID = f.FieldID
            WHERE v.InspectionID = i.InspectionID
              AND f.FieldKey = 'division'
            LIMIT 1) AS Division,
          (SELECT v.FieldValue FROM InspectionValues v
             JOIN InspectionFields f ON v.FieldID = f.FieldID
            WHERE v.InspectionID = i.InspectionID
              AND f.FieldKey = 'district'
            LIMIT 1) AS District,
          (SELECT v.FieldValue FROM InspectionValues v
             JOIN InspectionFields f ON v.FieldID = f.FieldID
            WHERE v.InspectionID = i.InspectionID
              AND f.FieldKey = 'block'
            LIMIT 1) AS Block
      FROM Inspections i
      WHERE i.ProjectID = ?
        AND i.Status IN (${statusPlaces})
      ORDER BY i.InspectionID DESC;
      `,
      [projectId, ...statuses]
    );

    return rows.sort((a, b) => {
      const tsA = parseInspectionDate(a.InspectionDate);
      const tsB = parseInspectionDate(b.InspectionDate);
      const safeA = Number.isNaN(tsA) ? -Infinity : tsA;
      const safeB = Number.isNaN(tsB) ? -Infinity : tsB;
      return safeB - safeA;
    });
  }

  static filterByQuery(items: InspectionListItem[], query: string): InspectionListItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.PoleID.toLowerCase().includes(q) ||
        (item.Division ?? "").toLowerCase().includes(q) ||
        (item.District ?? "").toLowerCase().includes(q) ||
        (item.Block ?? "").toLowerCase().includes(q)
    );
  }

}