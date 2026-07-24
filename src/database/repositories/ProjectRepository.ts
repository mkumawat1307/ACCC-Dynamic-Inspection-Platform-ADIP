//frontend\src\database\repositories\ProjectRepository.ts
import { getDatabase } from "../db";
import { Project } from "@/src/models/Project";


export class ProjectRepository {
  static async getProjects(): Promise<Project[]> {
    const db = await getDatabase();

    return await db.getAllAsync<Project>(
      `
    SELECT
        p.ProjectID,
        p.ProjectName,
        p.DistrictID,
        dv.DivisionName,
        d.DistrictName,
        p.Block,
        p.Client,
        p.Description,
        p.CreatedAt,
        p.UpdatedAt
    FROM Projects p
    INNER JOIN Districts d
        ON p.DistrictID = d.DistrictID
    INNER JOIN Divisions dv
        ON d.DivisionID = dv.DivisionID
    ORDER BY p.CreatedAt DESC;
      `
    );
  }
static async getProjectById(projectId: number): Promise<Project | null> {
  const db = await getDatabase();

  const project = await db.getFirstAsync<Project>(
    `
    SELECT
        p.ProjectID,
        p.ProjectName,
        p.DistrictID,
        d.DistrictName,
        dv.DivisionName,
        p.Block,
        p.Client,
        p.Description,
        p.CreatedAt,
        p.UpdatedAt
    FROM Projects p
    INNER JOIN Districts d
        ON p.DistrictID = d.DistrictID
    INNER JOIN Divisions dv
        ON d.DivisionID = dv.DivisionID
    WHERE p.ProjectID = ?;
    `,
    [projectId]
  );

  return project ?? null;
}
  static async createProject(data: {
  projectName: string;
  districtId: number;
  block?: string;
  client?: string;
  description?: string;
}
): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `
    INSERT INTO Projects (
      ProjectName,
      DistrictID,
      Block,
      Client,
      Description
    )
    VALUES (?, ?, ?, ?, ?);
    `,
[
  data.projectName,
  data.districtId,
  data.block ?? null,
  data.client ?? null,
  data.description ?? null,
]
  );

  return result.lastInsertRowId as number;

}

static async deleteProject(projectId: number): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {

    // Delete Photos
    await db.runAsync(
      `
      DELETE FROM Photos
      WHERE InspectionID IN (
        SELECT InspectionID
        FROM Inspections
        WHERE ProjectID = ?
      );
      `,
      [projectId]
    );

    // Delete Cameras
    await db.runAsync(
      `
      DELETE FROM Cameras
      WHERE InspectionID IN (
        SELECT InspectionID
        FROM Inspections
        WHERE ProjectID = ?
      );
      `,
      [projectId]
    );

    // Delete Switches
    await db.runAsync(
      `
      DELETE FROM Switches
      WHERE InspectionID IN (
        SELECT InspectionID
        FROM Inspections
        WHERE ProjectID = ?
      );
      `,
      [projectId]
    );

    // Delete Values
    await db.runAsync(
      `
      DELETE FROM InspectionValues
      WHERE InspectionID IN (
        SELECT InspectionID
        FROM Inspections
        WHERE ProjectID = ?
      );
      `,
      [projectId]
    );

    // Delete Inspections
    await db.runAsync(
      `
      DELETE FROM Inspections
      WHERE ProjectID = ?;
      `,
      [projectId]
    );

    // Delete Project
    await db.runAsync(
      `
      DELETE FROM Projects
      WHERE ProjectID = ?;
      `,
      [projectId]
    );

  });
}
}