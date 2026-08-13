export interface Switch {
  SwitchID?: number;

  InspectionID: number;

  SwitchNo: number;

  SwitchType: string | null;

  SwitchStatus: string | null;

  SwitchMake: string | null;

  SwitchModel: string | null;

  SwitchIP: string | null;

  SwitchSerialNumber: string | null;

  SwitchSI: string | null;

  CreatedAt?: string;

  UpdatedAt?: string;
}