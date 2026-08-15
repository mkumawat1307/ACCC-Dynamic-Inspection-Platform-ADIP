import { getGlobalDatabase } from "../db";
import { logger } from "@/src/utils/logger";
import { Project } from "@/src/models/Project";
import { getProjectDbPath } from "../helpers/ProjectDBManager";
import { buildProjectIdentity } from "../projectIdentity";

export class ProjectAlreadyExistsError extends Error {
  constructor(public readonly existingProjectId?: number) {
    super("A project with the same District and Project Name already exists.");
    this.name = "ProjectAlreadyExistsError";
  }
}

export function isUniqueConstraintError(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  return (
    err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (typeof err.message === "string" && /UNIQUE constraint failed/i.test(err.message))
  );
}


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
  safPath?: string | null;
  block?: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}
): Promise<number> {
  logger.info(`[ProjectRepository] createProject(name="${data.projectName}", districtId=${data.districtId}) — START`);
  const db = await getGlobalDatabase();
  logger.info(`[ProjectRepository] Got global DB handle`);

  const districtName = await this.getDistrictName(data.districtId);
  const { districtKey, projectKey } = buildProjectIdentity(districtName, data.projectName);

  const existingId = await this.findExistingByKeys(districtKey, projectKey);
  if (existingId !== null) {
    this.rejectDuplicate(existingId);
  }

  try {
    const result = await db.runAsync(
      `
    INSERT INTO Projects (
      ProjectName,
      DistrictID,
      DistrictKey,
      ProjectKey,
      DBPath,
      SAFPath,
      Block,
      Client,
      Description,
      InspectorName
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
[
  data.projectName,
  data.districtId,
  districtKey,
  projectKey,
  data.dbPath,
  data.safPath ?? null,
  data.block ?? null,
  data.client ?? null,
  data.description ?? null,
  data.inspectorName ?? null,
]
    );

    const newId = result.lastInsertRowId as number;
    logger.info(`[ProjectCreate] success projectId=${newId}`);
    logger.info(`[ProjectRepository] createProject() — END`);
    return newId;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      this.rejectDuplicate();
    }
    throw error;
  }
}

static async assertIdentityAvailable(
  districtId: number,
  projectName: string,
  excludeProjectId?: number
): Promise<void> {
  const districtName = await this.getDistrictName(districtId);
  const { districtKey, projectKey } = buildProjectIdentity(districtName, projectName);
  const existingId = await this.findExistingByKeys(districtKey, projectKey, excludeProjectId);
  if (existingId !== null) {
    this.rejectDuplicate(existingId);
  }
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

  const districtName = await this.getDistrictName(data.districtId);
  const { districtKey, projectKey } = buildProjectIdentity(districtName, data.projectName);

  const existingId = await this.findExistingByKeys(districtKey, projectKey, projectId);
  if (existingId !== null) {
    this.rejectDuplicate(existingId);
  }

  const fields: string[] = [
    `ProjectName = ?`,
    `DistrictID = ?`,
    `DistrictKey = ?`,
    `ProjectKey = ?`,
  ];
  const values: (string | number | null)[] = [
    data.projectName,
    data.districtId,
    districtKey,
    projectKey,
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

  try {
    await db.runAsync(
      `UPDATE Projects SET ${fields.join(", ")} WHERE ProjectID = ?`,
      values
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      this.rejectDuplicate();
    }
    throw error;
  }
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

  const districtName = source.DistrictName ?? "";
  const { districtKey, projectKey } = buildProjectIdentity(districtName, newName);

  const existingId = await this.findExistingByKeys(districtKey, projectKey);
  if (existingId !== null) {
    this.rejectDuplicate(existingId);
  }

  const dbPath = getProjectDbPath(districtName, newName);

  try {
    const result = await db.runAsync(
      `INSERT INTO Projects (ProjectName, DistrictID, DistrictKey, ProjectKey, Block, Client, Description, InspectorName, DBPath, SAFPath)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newName, source.DistrictID, districtKey, projectKey, source.Block ?? null, source.Client ?? null, source.Description ?? null, source.InspectorName ?? null, dbPath, source.SAFPath ?? null]
    );

    const newId = result.lastInsertRowId as number;
    logger.info(`[ProjectCreate] success projectId=${newId}`);
    logger.info(`[ProjectRepository] cloneProject() — cloned with ID ${newId}, DBPath ${dbPath}`);
    logger.info(`[ProjectRepository] cloneProject() — END`);
    return newId;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      this.rejectDuplicate();
    }
    throw error;
  }
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

private static rejectDuplicate(existingProjectId?: number): never {
  logger.info(`[ProjectCreate] duplicateDetected projectId=${existingProjectId ?? "unknown"}`);
  logger.info("[ProjectCreate] rejectedDuplicate");
  throw new ProjectAlreadyExistsError(existingProjectId);
}

static async getDistrictName(districtId: number): Promise<string> {
  const db = await getGlobalDatabase();
  const row = await db.getFirstAsync<{ DistrictName: string }>(
    `SELECT DistrictName FROM Districts WHERE DistrictID = ?`,
    [districtId]
  );
  if (!row) {
    throw new Error(`District not found: ${districtId}`);
  }
  return row.DistrictName;
}

static async setPendingPhotoFolderRename(
  projectId: number,
  pending: string | null
): Promise<void> {
  const db = await getGlobalDatabase();
  await db.runAsync(
    `UPDATE Projects SET PendingPhotoFolderRename = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE ProjectID = ?`,
    [pending, projectId]
  );
}

static async getPendingPhotoFolderRenames(): Promise<
  { ProjectID: number; PendingPhotoFolderRename: string | null }[]
> {
  const db = await getGlobalDatabase();
  return await db.getAllAsync<{ ProjectID: number; PendingPhotoFolderRename: string | null }>(
    `SELECT ProjectID, PendingPhotoFolderRename FROM Projects WHERE PendingPhotoFolderRename IS NOT NULL`
  );
}

private static async findExistingByKeys(
  districtKey: string,
  projectKey: string,
  excludeProjectId?: number
): Promise<number | null> {
  const db = await getGlobalDatabase();
  const where =
    excludeProjectId !== undefined
      ? `SELECT ProjectID FROM Projects WHERE DistrictKey = ? AND ProjectKey = ? AND ProjectID != ? LIMIT 1`
      : `SELECT ProjectID FROM Projects WHERE DistrictKey = ? AND ProjectKey = ? LIMIT 1`;
  const params =
    excludeProjectId !== undefined
      ? [districtKey, projectKey, excludeProjectId]
      : [districtKey, projectKey];
  const row = await db.getFirstAsync<{ ProjectID: number }>(where, params);
  return row?.ProjectID ?? null;
}
}

