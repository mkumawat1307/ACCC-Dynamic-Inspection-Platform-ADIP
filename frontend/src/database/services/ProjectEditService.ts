import { ProjectRepository } from "../repositories/ProjectRepository";
import { buildProjectFolderLabel, canonicalProjectLabel } from "@/src/utils/folderNaming";

export interface ProjectEditInput {
  projectName: string;
  districtId: number;
  block?: string;
  client?: string;
  description?: string;
  inspectorName?: string;
}

export async function updateProjectFlow(
  projectId: number,
  input: ProjectEditInput
): Promise<void> {
  const project = await ProjectRepository.getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const oldLabel = canonicalProjectLabel(project);
  const newDistrictName = await ProjectRepository.getDistrictName(input.districtId);
  const newLabel = buildProjectFolderLabel(newDistrictName, input.projectName);
  if (oldLabel !== newLabel) {
    await ProjectRepository.assertIdentityAvailable(
      input.districtId,
      input.projectName,
      projectId
    );
  }
  await ProjectRepository.updateProject(projectId, input);
}
