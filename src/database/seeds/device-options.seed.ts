import { getDatabase } from "../db";

import { logger } from "@/src/utils/logger";
interface DeviceOptionSeed {
  DeviceType: string;
  FieldName: string;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
}

const deviceOptions: DeviceOptionSeed[] = [
  // =====================================================
  // Camera Options
  // =====================================================
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Bullet", OptionValue: "Bullet", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "Box", OptionValue: "Box", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "PTZ", OptionValue: "PTZ", DisplayOrder: 3 },

  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "VMS", OptionValue: "VMS", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Local", OptionValue: "Local", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Non-Live", OptionValue: "Non-Live", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "In Stock", OptionValue: "In Stock", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Dismantled", OptionValue: "Dismantled", DisplayOrder: 5 },
  { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 6 },

  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Sparsh", OptionValue: "Sparsh", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Prama", OptionValue: "Prama", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Hikvision", OptionValue: "Hikvision", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "CP Plus", OptionValue: "CP Plus", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraMake", OptionLabel: "Secura", OptionValue: "Secura", DisplayOrder: 5 },

  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "Technosys (LSY)", OptionValue: "Technosys (LSY)", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (LSY)", OptionValue: "TCIL (LSY)", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (RC)", OptionValue: "TCIL (RC)", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TCIL (Smart City)", OptionValue: "TCIL (Smart City)", DisplayOrder: 4 },
  { DeviceType: "Camera", FieldName: "CameraSI", OptionLabel: "TASL (Technosys)", OptionValue: "TASL (Technosys)", DisplayOrder: 5 },

  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "64 GB", OptionValue: "64 GB", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "128 GB", OptionValue: "128 GB", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "256 GB", OptionValue: "256 GB", DisplayOrder: 3 },
  { DeviceType: "Camera", FieldName: "SDCardCapacity", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 4 },

  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Working", OptionValue: "Working", DisplayOrder: 1 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Not Working", OptionValue: "Not Working", DisplayOrder: 2 },
  { DeviceType: "Camera", FieldName: "SDCardStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 3 },

  // =====================================================
  // Switch Options
  // =====================================================
  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "4-Port", OptionValue: "4-Port", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchType", OptionLabel: "8-Port", OptionValue: "8-Port", DisplayOrder: 2 },

  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "VMS", OptionValue: "VMS", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Local", OptionValue: "Local", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Non-Live", OptionValue: "Non-Live", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "In Stock", OptionValue: "In Stock", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Dismantled", OptionValue: "Dismantled", DisplayOrder: 5 },
  { DeviceType: "Switch", FieldName: "SwitchStatus", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 6 },

  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "D-Link", OptionValue: "D-Link", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Cisco", OptionValue: "Cisco", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Allied", OptionValue: "Allied", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchMake", OptionLabel: "Tejas", OptionValue: "Tejas", DisplayOrder: 4 },

  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "Technosys (LSY)", OptionValue: "Technosys (LSY)", DisplayOrder: 1 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (LSY)", OptionValue: "TCIL (LSY)", DisplayOrder: 2 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (RC)", OptionValue: "TCIL (RC)", DisplayOrder: 3 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TCIL (Smart City)", OptionValue: "TCIL (Smart City)", DisplayOrder: 4 },
  { DeviceType: "Switch", FieldName: "SwitchSI", OptionLabel: "TASL (Technosys)", OptionValue: "TASL (Technosys)", DisplayOrder: 5 },
];

export async function seedDeviceOptions() {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ Count: number }>(
    `SELECT COUNT(*) AS Count FROM DeviceOptions`
  );

  if ((existing?.Count ?? 0) > 0) {
    logger.info("✅ Device Options already seeded.");
    return;
  }

  logger.info("🌱 Seeding Device Options...");

  await db.withTransactionAsync(async () => {
    for (const opt of deviceOptions) {
      await db.runAsync(
        `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder)
         VALUES (?, ?, ?, ?, ?)`,
        [opt.DeviceType, opt.FieldName, opt.OptionLabel, opt.OptionValue, opt.DisplayOrder]
      );
    }
  });

  logger.info("✅ Device Options Seeded.");
}

