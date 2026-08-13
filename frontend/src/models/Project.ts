export interface Project {
  ProjectID: number;

  ProjectName: string;

  DistrictID: number;

  DBPath?: string | null;

  SAFPath?: string | null;

  DistrictName?: string;
  DivisionName?: string;

  Block?: string | null;

  Client?: string | null;

  Description?: string | null;

  InspectorName?: string | null;

  CreatedAt: string;

  UpdatedAt: string;
}
