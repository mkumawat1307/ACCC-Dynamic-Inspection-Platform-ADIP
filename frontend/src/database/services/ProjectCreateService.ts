import { logger } from "@/src/utils/logger";
import { ProjectRepository, ProjectAlreadyExistsError } from "../repositories/ProjectRepository";
import {
  createProjectDb,
  deleteProjectDb,
  getProjectDbPath,
  ProjectFolderExistsError,
} from "../helpers/ProjectDBManager";
import { buildProjectFolderLabel } from "@/src/utils/folderNaming";
import { ensureProjectFolder } from "@/src/utils/storageManager";
import { requestAndroidBackup } from "@/src/utils/androidBackup";

export interface CreateProjectInput {
  projectName: string;
  districtId: number;
  districtName: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}

export async function createProjectFlow(input: CreateProjectInput): Promise<number> {
  logger.info(
    `[ProjectCreate] start district=${input.districtName} project=${input.projectName}`
  );

  const dbPath = getProjectDbPath(input.districtName, input.projectName);

  let newId: number | null = null;
  try {
    newId = await ProjectRepository.createProject({
      projectName: input.projectName,
      districtId: input.districtId,
      dbPath,
      client: input.client,
      description: input.description,
      inspectorName: input.inspectorName,
    });

    await createProjectDb(input.projectName, dbPath, newId);

    const folderLabel = buildProjectFolderLabel(input.districtName, input.projectName);
    ensureProjectFolder(folderLabel).catch((e) =>
      logger.error("[Storage] createProjectFlow ensureProjectFolder failed:", e)
    );

    return newId;
  } catch (error) {
    if (error instanceof ProjectAlreadyExistsError) {
      logger.info(
        `[ProjectCreate] duplicateDetected projectId=${error.existingProjectId ?? "unknown"}`
      );
      logger.info("[ProjectCreate] rejectedDuplicate");
      throw error;
    }

    logger.error("[ProjectCreate] failed=", error);
    if (newId !== null) {
      try {
        await ProjectRepository.deleteProject(newId);
      } catch (cleanupError) {
        logger.error("[ProjectCreate] cleanup deleteProject failed:", cleanupError);
      }
      if (!(error instanceof ProjectFolderExistsError)) {
        try {
          await deleteProjectDb(dbPath);
        } catch (cleanupError) {
          logger.error("[ProjectCreate] cleanup deleteProjectDb failed:", cleanupError);
        }
      }
      requestAndroidBackup();
    }
    throw error;
  }
}
