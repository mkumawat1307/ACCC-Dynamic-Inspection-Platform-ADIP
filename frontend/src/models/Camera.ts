export interface Camera {
  CameraID?: number;

  InspectionID: number;

  CameraNo: number;

  CameraType: string | null;

  CameraStatus: string | null;

  CameraMake: string | null;

  CameraModel: string | null;

  CameraIP: string | null;

  CameraSerialNumber: string | null;

  CameraSI: string | null;

  SDCardCapacity: string | null;

  SDCardStatus: string | null;

  CreatedAt?: string;

  UpdatedAt?: string;
}