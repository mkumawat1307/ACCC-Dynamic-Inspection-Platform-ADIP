export interface FactorySection {
  key: string;
  name: string;
  description: string;
  icon: string;
  repeatable: number;
}

export interface FactoryDeviceField {
  DeviceType: string;
  FieldName: string;
  Label: string;
  FieldType: string;
  IsRequired: number;
  DisplayOrder: number;
}

export interface FactoryDeviceOption {
  DeviceType: string;
  FieldName: string;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
}

export const LOCKED_SECTION_KEYS: ReadonlySet<string> = new Set([
  "general_information",
  "remarks",
  "photos",
]);

export function isLockedSectionKey(sectionKey: string | null | undefined): boolean {
  return sectionKey != null && LOCKED_SECTION_KEYS.has(sectionKey);
}

export const FACTORY_SECTIONS: FactorySection[] = [
  { key: "general_information", name: "General Information", description: "General inspection details", icon: "information-circle", repeatable: 0 },
  { key: "pole_structure", name: "Pole Structure Details", description: "Pole structure", icon: "business", repeatable: 0 },
  { key: "junction_box", name: "Junction Box and Power Cable", description: "JB Details and Power Cable Details", icon: "cube", repeatable: 0 },
  { key: "earthing", name: "Earthing Details", description: "Earthing", icon: "flash", repeatable: 0 },
  { key: "meter", name: "Metering Information", description: "Meter", icon: "speedometer", repeatable: 0 },
  { key: "connectivity", name: "Connectivity Information", description: "Network", icon: "wifi", repeatable: 0 },
  { key: "camera_information", name: "Camera Information", description: "Camera", icon: "camera", repeatable: 1 },
  { key: "switch_information", name: "Switch Information", description: "Switch", icon: "git-network", repeatable: 1 },
  { key: "remarks", name: "Remarks", description: "Remarks", icon: "note-text", repeatable: 0 },
  { key: "photos", name: "Photos", description: "Photo Section", icon: "images", repeatable: 0 },
];

export const FACTORY_DEVICE_TYPES: string[] = ["Camera", "Switch"];

export const FACTORY_DEVICE_FIELDS: FactoryDeviceField[] = [
  { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", FieldType: "dropdown", IsRequired: 1, DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraStatus", Label: "Camera Status", FieldType: "dropdown", IsRequired: 1, DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraMake", Label: "Camera Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraModel", Label: "Camera Model", FieldType: "text", IsRequired: 0, DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraIP", Label: "Camera IP", FieldType: "text", IsRequired: 0, DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraSerialNumber", Label: "Camera Serial Number", FieldType: "text", IsRequired: 0, DisplayOrder: 6 },
  { DeviceType: "Camera", FieldName: "CameraSI", Label: "Camera SI", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 7 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", Label: "SD Card Capacity", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 8 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", Label: "SD Card Status", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 9 },
  { DeviceType: "Switch", FieldName: "SwitchType", Label: "Switch Type", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", Label: "Switch Status", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchMake", Label: "Switch Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchModel", Label: "Switch Model", FieldType: "text", IsRequired: 0, DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchIP", Label: "Switch IP", FieldType: "text", IsRequired: 0, DisplayOrder: 5 },
  { DeviceType: "Switch", FieldName: "SwitchSerialNumber", Label: "Switch Serial Number", FieldType: "text", IsRequired: 0, DisplayOrder: 6 },
  { DeviceType: "Switch", FieldName: "SwitchSI", Label: "Switch SI", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 7 },
];

export const FACTORY_DEVICE_OPTIONS: FactoryDeviceOption[] = [
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "4K", OptionValue: "4K", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Box", OptionValue: "Box", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Box Reliance", OptionValue: "Box Reliance", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Bullet", OptionValue: "Bullet", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Dome", OptionValue: "Dome", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "PTZ", OptionValue: "PTZ", DisplayOrder: 6 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "PCR Camera", OptionValue: "PCR Camera", DisplayOrder: 7 },

  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "VMS Live", OptionValue: "VMS", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Local Live", OptionValue: "Local", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Non-Live", OptionValue: "Non-Live", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "In Stock", OptionValue: "In Stock", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Dismantled", OptionValue: "Dismantled", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 6 },

  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "CP Plus", OptionValue: "CP Plus", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Hikvision", OptionValue: "Hikvision", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Hikvision/Reliance", OptionValue: "Hikvision/Reliance", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Prama", OptionValue: "Prama", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Secura", OptionValue: "Secura", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Sparsh", OptionValue: "Sparsh", DisplayOrder: 6 },

  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TASL (Technosys)", OptionValue: "TASL (Technosys)", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (RC)", OptionValue: "TCIL (RC)", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (Smart City)", OptionValue: "TCIL (Smart City)", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "Technosys (LSY)", OptionValue: "Technosys (LSY)", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (LSY)", OptionValue: "TCIL (LSY)", DisplayOrder: 5 },

  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "256 GB", OptionValue: "256 GB", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "128 GB", OptionValue: "128 GB", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "64 GB", OptionValue: "64 GB", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "Not Installed", OptionValue: "Not Installed", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 5 },

  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Working", OptionValue: "Working", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Not Working", OptionValue: "Not Working", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 3 },

  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "4-Port", OptionValue: "4-Port", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "8-Port", OptionValue: "8-Port", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "16-Port", OptionValue: "16-Port", DisplayOrder: 3 },

  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "VMS Live", OptionValue: "VMS", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Local Live", OptionValue: "Local", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Non-Live", OptionValue: "Non-Live", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "In Stock", OptionValue: "In Stock", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Dismantled", OptionValue: "Dismantled", DisplayOrder: 5 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 6 },

  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "D-Link", OptionValue: "D-Link", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Cisco", OptionValue: "Cisco", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Allied Telesis", OptionValue: "Allied", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Tejas", OptionValue: "Tejas", DisplayOrder: 4 },

  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TASL (Technosys)", OptionValue: "TASL (Technosys)", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (RC)", OptionValue: "TCIL (RC)", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (Smart City)", OptionValue: "TCIL (Smart City)", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "Technosys (LSY)", OptionValue: "Technosys (LSY)", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (LSY)", OptionValue: "TCIL (LSY)", DisplayOrder: 5 },
];