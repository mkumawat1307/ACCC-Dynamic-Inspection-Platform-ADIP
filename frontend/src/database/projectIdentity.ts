export function normalizeKey(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function buildProjectIdentity(
  districtName: string,
  projectName: string
): { districtKey: string; projectKey: string } {
  return {
    districtKey: normalizeKey(districtName),
    projectKey: normalizeKey(projectName),
  };
}

export function buildIdentitySeed(districtName: string, projectName: string): string {
  const { districtKey, projectKey } = buildProjectIdentity(districtName, projectName);
  return `${districtKey}\u0000${projectKey}`;
}

export interface ProjectDuplicateGroup {
  districtKey: string;
  projectKey: string;
  members: Array<{
    ProjectID: number;
    ProjectName: string;
    DistrictName: string;
    DBPath: string | null;
  }>;
}

export interface DuplicateScanProject {
  ProjectID: number;
  ProjectName: string;
  DistrictID: number;
  DBPath: string | null;
}

export function detectProjectDuplicates(
  projects: DuplicateScanProject[],
  districts: Array<{ DistrictID: number; DistrictName: string }>
): ProjectDuplicateGroup[] {
  const nameByDistrict = new Map(districts.map((d) => [d.DistrictID, d.DistrictName]));
  const groups = new Map<string, ProjectDuplicateGroup>();
  for (const p of projects) {
    const districtName = nameByDistrict.get(p.DistrictID) ?? "";
    const seed = buildIdentitySeed(districtName, p.ProjectName);
    const { districtKey, projectKey } = buildProjectIdentity(districtName, p.ProjectName);
    const group = groups.get(seed) ?? { districtKey, projectKey, members: [] };
    group.members.push({
      ProjectID: p.ProjectID,
      ProjectName: p.ProjectName,
      DistrictName: districtName,
      DBPath: p.DBPath,
    });
    groups.set(seed, group);
  }
  return [...groups.values()].filter((g) => g.members.length > 1);
}
