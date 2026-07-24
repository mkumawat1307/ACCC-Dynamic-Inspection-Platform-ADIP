//frontend\src\database\repositories\DashboardRepository.ts
import { getDatabase } from "../db";

export interface DashboardStats {
  totalInspections: number;
  completedInspections: number;
  draftInspections: number;
}

export class DashboardRepository {
  static async getDashboardStats(
    projectId: number
  ): Promise<DashboardStats> {
    const db = await getDatabase();

    const total =
      (await db.getFirstAsync<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM Inspections
        WHERE ProjectID = ?;
        `,
        [projectId]
      ))?.count ?? 0;

    const completed =
      (await db.getFirstAsync<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM Inspections
        WHERE ProjectID = ?
        AND Status='Completed';
        `,
        [projectId]
      ))?.count ?? 0;

    const draft =
      (await db.getFirstAsync<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM Inspections
        WHERE ProjectID = ?
        AND Status='Draft';
        `,
        [projectId]
      ))?.count ?? 0;

    return {
      totalInspections: total,
      completedInspections: completed,
      draftInspections: draft,
    };
  }
}