import { getGlobalDatabase } from "../db";
import { Project } from "@/src/models/Project";
import * as FileSystem from "expo-file-system/legacy";

export class ProjectRepository {
  static async getProjects(): Promise<Project[]> {
    console.log("[ProjectRepository] getProjects() — START");
    const db = await getGlobalDatabase();
    console.log("[ProjectRepository] Got global DB handle");

    const projects = await db.getAllAsync<Project>(
      `
    SELECT
        p.ProjectID,
        p.ProjectName,
        p.DistrictID,
        p.DBPath,
        dv.DivisionName,
        d.DistrictName,
        p.Block,
        p.Client,
        p.Description,
        p.InspectorName,
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
    console.log(`[ProjectRepository] getProjects() — returned ${projects.length} projects`);
    console.log(`[ProjectRepository] getProjects() — END`);
    return projects;
  }

static async getProjectById(projectId: number): Promise<Project | null> {
  console.log(`[ProjectRepository] getProjectById(${projectId}) — START`);
  const db = await getGlobalDatabase();
  console.log(`[ProjectRepository] Got global DB handle`);

  const project = await db.getFirstAsync<Project>(
    `
    SELECT
        p.ProjectID,
        p.ProjectName,
        p.DistrictID,
        p.DBPath,
        d.DistrictName,
        dv.DivisionName,
        p.Block,
        p.Client,
        p.Description,
        p.InspectorName,
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

  console.log(`[ProjectRepository] getProjectById() — ${project ? "found" : "not found"}`);
  console.log(`[ProjectRepository] getProjectById() — END`);
  return project ?? null;
}

  static async createProject(data: {
  projectName: string;
  districtId: number;
  dbPath: string;
  block?: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}
): Promise<number> {
  console.log(`[ProjectRepository] createProject(name="${data.projectName}", districtId=${data.districtId}) — START`);
  const db = await getGlobalDatabase();
  console.log(`[ProjectRepository] Got global DB handle`);

  const result = await db.runAsync(
    `
    INSERT INTO Projects (
      ProjectName,
      DistrictID,
      DBPath,
      Block,
      Client,
      Description,
      InspectorName
    )
    VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
[
  data.projectName,
  data.districtId,
  data.dbPath,
  data.block ?? null,
  data.client ?? null,
  data.description ?? null,
  data.inspectorName ?? null,
]
  );

  const newId = result.lastInsertRowId as number;
  console.log(`[ProjectRepository] createProject() — inserted with ID ${newId}`);
  console.log(`[ProjectRepository] createProject() — END`);
  return newId;
}

static async updateProject(
  projectId: number,
  data: {
    projectName: string;
    districtId: number;
    block?: string;
    client?: string;
    description?: string;
    inspectorName?: string;
  }
): Promise<void> {
  console.log(`[ProjectRepository] updateProject(${projectId}) — START`);
  const db = await getGlobalDatabase();
  console.log(`[ProjectRepository] Got global DB handle`);

  await db.runAsync(
    `
    UPDATE Projects SET
      ProjectName = ?,
      DistrictID = ?,
      Block = ?,
      Client = ?,
      Description = ?,
      InspectorName = ?,
      UpdatedAt = CURRENT_TIMESTAMP
    WHERE ProjectID = ?
    `,
    [
      data.projectName,
      data.districtId,
      data.block ?? null,
      data.client ?? null,
      data.description ?? null,
      data.inspectorName ?? null,
      projectId,
    ]
  );
  console.log(`[ProjectRepository] updateProject() — END`);
}

static async cloneProject(
  sourceProjectId: number,
  newName: string
): Promise<number> {
  console.log(`[ProjectRepository] cloneProject(sourceId=${sourceProjectId}, newName="${newName}") — START`);
  const db = await getGlobalDatabase();
  console.log(`[ProjectRepository] Got global DB handle`);

  const source = await this.getProjectById(sourceProjectId);
  if (!source) {
    console.log(`[ProjectRepository] cloneProject() — source not found, returning 0`);
    return 0;
  }

  const result = await db.runAsync(
    `INSERT INTO Projects (ProjectName, DistrictID, Block, Client, Description, InspectorName)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [newName, source.DistrictID, source.Block ?? null, source.Client ?? null, source.Description ?? null, source.InspectorName ?? null]
  );

  const newId = result.lastInsertRowId as number;
  console.log(`[ProjectRepository] cloneProject() — cloned with ID ${newId}`);
  console.log(`[ProjectRepository] cloneProject() — END`);
  return newId;
}

static async deleteProject(projectId: number): Promise<void> {
  console.log(`[ProjectRepository] deleteProject(${projectId}) — START`);
  const db = await getGlobalDatabase();
  console.log(`[ProjectRepository] Got global DB handle`);

  await db.runAsync(
    `DELETE FROM Projects WHERE ProjectID = ?;`,
    [projectId]
  );
  console.log(`[ProjectRepository] deleteProject() — END`);
}
}
