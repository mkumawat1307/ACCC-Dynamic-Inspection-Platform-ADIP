export interface Photo {
  PhotoID?: number;

  InspectionID: number;

  PhotoType: string | null;

  FileName: string;

  FilePath: string;

  Latitude: number | null;

  Longitude: number | null;

  CapturedAt: string | null;

  Remarks: string | null;

  CreatedAt?: string;
}