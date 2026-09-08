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

const PROJECT_DB_FILE_NAME = "inspection.db";
const PROJECT_DB_PARENT_FOLDER = "Projects";
const FOLDER_HASH_SUFFIX = /^[0-9a-f]{8}$/i;

export function photoStorageLabelForProject(project: Project): string {
  const fromDbPath = photoLabelFromProjectDbPath(project.DBPath);
  return fromDbPath ?? canonicalProjectLabel(project);
}

function photoLabelFromProjectDbPath(dbPath: string | null | undefined): string | null {
  if (!dbPath) return null;
  let path = dbPath.trim();
  while (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  const fileMarker = `/${PROJECT_DB_FILE_NAME}`;
  const folderEnd = path.length - fileMarker.length;
  if (folderEnd <= 0 || !path.endsWith(fileMarker)) {
    return null;
  }
  const folder = path.slice(0, folderEnd);
  const slash = folder.lastIndexOf("/");
  const folderName = slash >= 0 ? folder.slice(slash + 1) : folder;
  // Projects/<label>_<8hex-hash>. The hash suffix is always the FINAL
  // _<8hex> by construction, so a label that itself ends in _<8hex>
  // is preserved exactly.
  const hashIndex = folderName.lastIndexOf("_");
  if (hashIndex <= 0 || hashIndex + 1 >= folderName.length) {
    return null;
  }
  const hash = folderName.slice(hashIndex + 1);
  if (!FOLDER_HASH_SUFFIX.test(hash)) {
    return null;
  }
  const label = folderName.slice(0, hashIndex);
  if (!label) {
    return null;
  }
  const base = slash >= 0 ? folder.slice(0, slash) : "";
  if (!isUnderProjectsFolder(base)) {
    return null;
  }
  return label;
}

function isUnderProjectsFolder(base: string): boolean {
  if (!base) return false;
  const segments = base.split("/").filter((s) => s.length > 0);
  return segments[segments.length - 1] === PROJECT_DB_PARENT_FOLDER;
}

export function legacyStrippedLabel(project: Project): string {
  const district = (project.DistrictName || "").replace(/[^a-zA-Z0-9]/g, "");
  const projectName = (project.ProjectName || "").replace(/[^a-zA-Z0-9]/g, "");
  return `${district}_${projectName}`;
}

export function legacyProjectOnlyLabel(project: Project): string {
  return sanitizeFolderName((project.ProjectName || "").trim());
}
