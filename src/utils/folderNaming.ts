import { Project } from "@/src/models/Project";

const ILLEGAL_CHARS = /[<>:"/\\|?*]/g;

export function sanitizeFolderName(name: string): string {
  return name.replace(ILLEGAL_CHARS, "_");
}

export function canonicalProjectLabel(project: Project): string {
  const district = (project.DistrictName || "").trim();
  const projectName = (project.ProjectName || "").trim();
  if (district && projectName) {
    return sanitizeFolderName(`${district}_${projectName}`);
  }
  return sanitizeFolderName(district || projectName);
}

export function legacyStrippedLabel(project: Project): string {
  const district = (project.DistrictName || "").replace(/[^a-zA-Z0-9]/g, "");
  const projectName = (project.ProjectName || "").replace(/[^a-zA-Z0-9]/g, "");
  return `${district}_${projectName}`;
}

export function legacyProjectOnlyLabel(project: Project): string {
  return sanitizeFolderName((project.ProjectName || "").trim());
}
