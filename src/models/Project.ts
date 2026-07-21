export interface Project {
  ProjectID: number;

  ProjectName: string;

  DistrictID: number;

  DistrictName?: string;
  DivisionName?: string;

  Block?: string | null;

  Client?: string | null;

  Description?: string | null;

  CreatedAt: string;

  UpdatedAt: string;
}