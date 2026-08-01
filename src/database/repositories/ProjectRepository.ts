import { getGlobalDatabase } from "../db";
import { logger } from "@/src/utils/logger";
import { Project } from "@/src/models/Project";
import { getProjectDbPath } from "../helpers/ProjectDBManager";


export class ProjectRepository {
  static async getProjects(): Promise<Project[]> {
    logger.info("[ProjectRepository] getProjects() — START");
    const db = await getGlobalDatabase();
    logger.info("[ProjectRepository] Got global DB handle");

    const projects = await db.getAllAsync<Project>(
      `
    SELECT
        p.ProjectID,
        p.ProjectName,
        p.DistrictID,
        p.DBPath,
        p.SAFPath,
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
    logger.info(`[ProjectRepository] getProjects() — returned ${projects.length} projects`);
    logger.info(`[ProjectRepository] getProjects() — END`);
    return projects;
  }

static async getProjectById(projectId: number): Promise<Project | null> {
  logger.info(`[ProjectRepository] getProjectById(${projectId}) — START`);
  const db = await getGlobalDatabase();
  logger.info(`[ProjectRepository] Got global DB handle`);

  const project = await db.getFirstAsync<Project>(
    `
    SELECT
        p.ProjectID,
        p.ProjectName,
        p.DistrictID,
        p.DBPath,
        p.SAFPath,
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

  logger.info(`[ProjectRepository] getProjectById() — ${project ? "found" : "not found"}`);
  logger.info(`[ProjectRepository] getProjectById() — END`);
  return project ?? null;
}

  static async createProject(data: {
  projectName: string;
  districtId: number;
  dbPath: string;
  safPath: string;
  block?: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}
): Promise<number> {
  logger.info(`[ProjectRepository] createProject(name="${data.projectName}", districtId=${data.districtId}) — START`);
  const db = await getGlobalDatabase();
  logger.info(`[ProjectRepository] Got global DB handle`);

  const result = await db.runAsync(
    `
    INSERT INTO Projects (
      ProjectName,
      DistrictID,
      DBPath,
      SAFPath,
      Block,
      Client,
      Description,
      InspectorName
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `,
[
  data.projectName,
  data.districtId,
  data.dbPath,
  data.safPath,
  data.block ?? null,
  data.client ?? null,
  data.description ?? null,
  data.inspectorName ?? null,
]
  );

  const newId = result.lastInsertRowId as number;
  logger.info(`[ProjectRepository] createProject() — inserted with ID ${newId}`);
  logger.info(`[ProjectRepository] createProject() — END`);
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
  logger.info(`[ProjectRepository] updateProject(${projectId}) — START`);
  const db = await getGlobalDatabase();
  logger.info(`[ProjectRepository] Got global DB handle`);

  const fields: string[] = [
    `ProjectName = ?`,
    `DistrictID = ?`,
  ];
  const values: (string | number | null)[] = [
    data.projectName,
    data.districtId,
  ];

  if (data.block !== undefined) {
    fields.push(`Block = ?`);
    values.push(data.block);
  }
  if (data.client !== undefined) {
    fields.push(`Client = ?`);
    values.push(data.client);
  }
  if (data.description !== undefined) {
    fields.push(`Description = ?`);
    values.push(data.description);
  }
  if (data.inspectorName !== undefined) {
    fields.push(`InspectorName = ?`);
    values.push(data.inspectorName);
  }

  fields.push(`UpdatedAt = CURRENT_TIMESTAMP`);
  values.push(projectId);

  await db.runAsync(
    `UPDATE Projects SET ${fields.join(", ")} WHERE ProjectID = ?`,
    values
  );
  logger.info(`[ProjectRepository] updateProject() — END`);
}

static async cloneProject(
  sourceProjectId: number,
  newName: string
): Promise<number> {
  logger.info(`[ProjectRepository] cloneProject(sourceId=${sourceProjectId}, newName="${newName}") — START`);
  const db = await getGlobalDatabase();
  logger.info(`[ProjectRepository] Got global DB handle`);

  const source = await this.getProjectById(sourceProjectId);
  if (!source) {
    logger.info(`[ProjectRepository] cloneProject() — source not found, returning 0`);
    return 0;
  }

  const dbPath = getProjectDbPath(newName);

  const result = await db.runAsync(
    `INSERT INTO Projects (ProjectName, DistrictID, Block, Client, Description, InspectorName, DBPath, SAFPath)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newName, source.DistrictID, source.Block ?? null, source.Client ?? null, source.Description ?? null, source.InspectorName ?? null, dbPath, source.SAFPath ?? null]
  );

  const newId = result.lastInsertRowId as number;
  logger.info(`[ProjectRepository] cloneProject() — cloned with ID ${newId}, DBPath ${dbPath}`);
  logger.info(`[ProjectRepository] cloneProject() — END`);
  return newId;
}

static async deleteProject(projectId: number): Promise<void> {
  logger.info(`[ProjectRepository] deleteProject(${projectId}) — START`);
  const db = await getGlobalDatabase();
  logger.info(`[ProjectRepository] Got global DB handle`);

  await db.runAsync(
    `DELETE FROM Projects WHERE ProjectID = ?;`,
    [projectId]
  );
  logger.info(`[ProjectRepository] deleteProject() — END`);
}
}

