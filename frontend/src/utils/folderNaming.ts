import { Project } from "@/src/models/Project";

const ILLEGAL_CHARS = /[<>:"/\\|?*]/g;

export function sanitizeFolderName(name: string): string {
  return name.replace(ILLEGAL_CHARS, "_");
}

export function buildProjectFolderLabel(districtName: string, projectName: string): string {
  const district = (districtName || "").trim();
  const name = (projectName || "").trim();
  if (district && name) {
    return sanitizeFolderName(`${district}_${name}`);
  }
  return sanitizeFolderName(district || name);
}

export function canonicalProjectLabel(project: Project): string {
  return buildProjectFolderLabel(project.DistrictName ?? "", project.ProjectName ?? "");
}

export function legacyStrippedLabel(project: Project): string {
  const district = (project.DistrictName || "").replace(/[^a-zA-Z0-9]/g, "");
  const projectName = (project.ProjectName || "").replace(/[^a-zA-Z0-9]/g, "");
  return `${district}_${projectName}`;
}

export function legacyProjectOnlyLabel(project: Project): string {
  return sanitizeFolderName((project.ProjectName || "").trim());
}
