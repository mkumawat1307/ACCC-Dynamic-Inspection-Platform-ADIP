jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT = "/mock/documents/Projects/ResetDeviceConfig/inspection.db";

async function openSeededProject(): Promise<{ db: SQLiteDatabase }> {
  const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
  await dbModule.setActiveProject(PROJECT);
  const { createProjectSchema } = require("@/src/database/schema");
  await createProjectSchema();
  const tpl = require("@/src/database/seeds/inspection-template.seed");
  await tpl.seedInspectionTemplate();
  const sec = require("@/src/database/seeds/inspection-sections.seed");
  await sec.seedInspectionSections();
  const fld = require("@/src/database/seeds/inspection-fields.seed");
  await fld.seedInspectionFields();
  const fo = require("@/src/database/seeds/field-options.seed");
  await fo.seedFieldOptions();
  const dopt = require("@/src/database/seeds/device-options.seed");
  await dopt.seedDeviceOptions();
  const ddf = require("@/src/database/seeds/device-field-definitions.seed");
  await ddf.seedDeviceFieldDefinitions();
  const pdt = require("@/src/database/seeds/project-device-types.seed");
  await pdt.seedProjectDeviceTypes();
  const db: SQLiteDatabase = await dbModule.getDatabase();
  return { db };
}

async function resetToDefault(): Promise<void> {
  const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
  await ResetRepository.performReset();
}

describe("Reset to Default restores edited device configuration", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("A. reset restores factory device-type required flags after Switch was set mandatory and Camera non-mandatory", async () => {
    const { db } = await openSeededProject();
    const pdt = require("@/src/database/repositories/ProjectDeviceTypesRepository") as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository");

    await pdt.default.setRequired("Switch", true);
    await pdt.default.setRequired("Camera", false);

    const before = await db.getAllAsync<{ DeviceType: string; IsRequired: number }>(
      "SELECT DeviceType, IsRequired FROM ProjectDeviceTypes WHERE IsActive = 1 ORDER BY DeviceType"
    );
    expect(before).toEqual([
      { DeviceType: "Camera", IsRequired: 0 },
      { DeviceType: "Switch", IsRequired: 1 },
    ]);

    await resetToDefault();

    const after = await db.getAllAsync<{ DeviceType: string; IsRequired: number }>(
      "SELECT DeviceType, IsRequired FROM ProjectDeviceTypes WHERE IsActive = 1 ORDER BY DeviceType"
    );
    expect(after).toEqual([
      { DeviceType: "Camera", IsRequired: 1 },
      { DeviceType: "Switch", IsRequired: 0 },
    ]);

    const required = await pdt.default.getRequired();
    expect(required).toEqual(["Camera"]);
  });

  it("B. reset clears a user-set placeholder on a factory device field", async () => {
    const { db } = await openSeededProject();

    const switchType = await db.getFirstAsync<{ FieldDefID: number }>(
      "SELECT FieldDefID FROM DeviceFieldDefinitions WHERE DeviceType = 'Switch' AND FieldName = 'SwitchType'"
    );
    expect(switchType).toBeTruthy();
    await db.runAsync(
      "UPDATE DeviceFieldDefinitions SET Placeholder = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldDefID = ?",
      ["Enter switch type", switchType!.FieldDefID]
    );

    await resetToDefault();

    const restored = await db.getFirstAsync<{ Label: string; Placeholder: string | null; IsRequired: number }>(
      "SELECT Label, Placeholder, IsRequired FROM DeviceFieldDefinitions WHERE DeviceType = 'Switch' AND FieldName = 'SwitchType'"
    );
    expect(restored).toBeTruthy();
    expect(restored!.Label).toBe("Switch Type");
    expect(restored!.Placeholder).toBeNull();
    expect(restored!.IsRequired).toBe(0);
  });

  it("C. reset reconstructs the identical default device configuration after mixed edits", async () => {
    const { db } = await openSeededProject();
    const pdt = require("@/src/database/repositories/ProjectDeviceTypesRepository") as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository");

    await pdt.default.setRequired("Switch", true);
    await db.runAsync(
      "UPDATE DeviceFieldDefinitions SET Placeholder = 'Stale', Label = 'Stale Label', IsRequired = 1 WHERE DeviceType = 'Switch' AND FieldName = 'SwitchIP'"
    );

    await resetToDefault();

    const types = await db.getAllAsync<{ DeviceType: string; IsRequired: number }>(
      "SELECT DeviceType, IsRequired FROM ProjectDeviceTypes WHERE IsActive = 1 ORDER BY DeviceType"
    );
    expect(types).toEqual([
      { DeviceType: "Camera", IsRequired: 1 },
      { DeviceType: "Switch", IsRequired: 0 },
    ]);

    const switchIp = await db.getFirstAsync<{ Label: string; Placeholder: string | null; IsRequired: number }>(
      "SELECT Label, Placeholder, IsRequired FROM DeviceFieldDefinitions WHERE DeviceType = 'Switch' AND FieldName = 'SwitchIP'"
    );
    expect(switchIp).toBeTruthy();
    expect(switchIp!.Label).toBe("Switch IP");
    expect(switchIp!.Placeholder).toBeNull();
    expect(switchIp!.IsRequired).toBe(0);

    const cameraIp = await db.getFirstAsync<{ Placeholder: string | null }>(
      "SELECT Placeholder FROM DeviceFieldDefinitions WHERE DeviceType = 'Camera' AND FieldName = 'CameraIP'"
    );
    expect(cameraIp!.Placeholder).toBeNull();
  });
});