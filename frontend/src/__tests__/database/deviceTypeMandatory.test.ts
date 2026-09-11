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
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  getContentUriAsync: jest.fn().mockResolvedValue("content://mock/exported"),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: 0 }),
}));

jest.mock("@/src/utils/storageManager", () => ({
  ensureRootFolder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://mock/exported/file.xlsx"),
    writeUtf8: jest.fn().mockResolvedValue("content://mock/exported/file.csv"),
    readBase64: jest.fn().mockResolvedValue("QUJD"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
  },
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT = "/mock/documents/Projects/DeviceTypeMandatory/inspection.db";

describe("device type mandatory validation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openSeededProject(path = PROJECT): Promise<{ db: SQLiteDatabase }> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(path);
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
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync("UPDATE FieldOptions SET IsActive = 1");
    await db.runAsync("UPDATE DeviceOptions SET IsActive = 1");
    await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 1");
    return { db };
  }

  async function createInspection(date: string): Promise<number> {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.createInspection(1, 1, date);
  }

  async function seedValue(db: SQLiteDatabase, inspectionId: number, fieldId: number, value: string): Promise<void> {
    await db.runAsync(
      "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
      [inspectionId, fieldId, value]
    );
  }

  async function seedAllRequiredExcept(db: SQLiteDatabase, inspectionId: number, skipKeys: string[]): Promise<void> {
    const required = await db.getAllAsync<{ FieldID: number; FieldKey: string; FieldType: string; DataSourceType: string | null }>(
      `SELECT FieldID, FieldKey, FieldType, DataSourceType
       FROM InspectionFields
       WHERE IsRequired = 1 AND IsActive = 1 AND IsVisible = 1`
    );
    const skip = new Set(["date", "division", "district", ...skipKeys]);
    for (const f of required) {
      if (skip.has(f.FieldKey)) continue;
      let value: string;
      if (f.FieldType === "dropdown" && f.DataSourceType === "options") {
        const opt = await db.getFirstAsync<{ OptionValue: string }>(
          `SELECT OptionValue FROM FieldOptions WHERE FieldID = ? AND IsActive = 1 ORDER BY DisplayOrder LIMIT 1`,
          [f.FieldID]
        );
        value = opt?.OptionValue ?? "1";
      } else {
        value = "1";
      }
      await seedValue(db, inspectionId, f.FieldID, value);
    }
  }

  async function getFieldId(db: SQLiteDatabase, fieldKey: string): Promise<number | null> {
    const row = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = ?",
      [fieldKey]
    );
    return row?.FieldID ?? null;
  }

  async function validateTypeRequired(inspectionId: number) {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.validateDeviceTypeMandatory(inspectionId);
  }

  it("A. settings persistence: setRequired round-trips and defaults to not required", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;

    expect(await repo.getRequired()).toEqual([]);

    await repo.setRequired("Camera", true);
    expect(await repo.getRequired()).toEqual(["Camera"]);

    await repo.setRequired("Camera", false);
    expect(await repo.getRequired()).toEqual([]);
    expect(db).toBeTruthy();
  });

  it("B. optional device type with count 0 passes", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-10");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");

    await repo.setRequired("Camera", false);
    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("C. required device type with count 0 fails with type-scoped message", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-11");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");

    await repo.setRequired("Camera", true);
    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(["Camera — Camera Count (minimum 1)"]);
  });

  it("D. required device type with count 1 passes", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-12");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");

    await repo.setRequired("Camera", true);
    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("E. field-level IsRequired is independent of device-level required", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-13");
    await seedAllRequiredExcept(db, inspectionId, []);

    // Camera count set but device fields left empty -> validateDeviceMandatory still fails
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await repo.setRequired("Camera", false);

    const fieldResult = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(fieldResult.valid).toBe(false);

    const typeResult = await validateTypeRequired(inspectionId);
    expect(typeResult.valid).toBe(true);
  });

  it("F. both types required and count 0 fails for both", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-14");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");

    await repo.setRequired("Camera", true);
    await repo.setRequired("Switch", true);

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("Camera — Camera Count (minimum 1)");
    expect(result.missingFields).toContain("Switch — Switch Count (minimum 1)");
  });

  it("G. generic custom device type enforced without Camera hardcode", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES ('NVR', 1, 1)`
    );

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-15");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);

    const missing = await validateTypeRequired(inspectionId);
    expect(missing.valid).toBe(false);
    expect(missing.missingFields).toEqual(["NVR — NVR Count (minimum 1)"]);

    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    const withCamera = await validateTypeRequired(inspectionId);
    expect(withCamera.valid).toBe(false);
    expect(withCamera.missingFields).toEqual(["NVR — NVR Count (minimum 1)"]);
  });

  it("H. migration preserves existing Camera/Switch config and IsRequired data", async () => {
    const { db } = await openSeededProject();
    const { migrateProjectSchema } = require("@/src/database/schema");

    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES ('Camera', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES ('Switch', 1, 0)`
    );

    await migrateProjectSchema(1);

    const rows = await db.getAllAsync<{ DeviceType: string; IsActive: number; IsRequired: number }>(
      "SELECT DeviceType, IsActive, IsRequired FROM ProjectDeviceTypes"
    );
    const camera = rows.find((r) => r.DeviceType === "Camera");
    const switchType = rows.find((r) => r.DeviceType === "Switch");
    expect(camera?.IsRequired).toBe(1);
    expect(camera?.IsActive).toBe(1);
    expect(switchType?.IsRequired).toBe(0);
  });

  it("I. isolation: IsRequired set in Project A does not leak into Project B", async () => {
    const PROJECT_B = "/mock/documents/Projects/DeviceTypeMandatoryB/inspection.db";
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;

    await repo.setRequired("Camera", true);
    await repo.setRequired("Switch", true);
    expect(await repo.getRequired()).toEqual(["Camera", "Switch"]);

    const { db: dbB } = await openSeededProject(PROJECT_B);
    const repoB = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    expect(await repoB.getRequired()).toEqual([]);
    expect(db).not.toBe(dbB);
  });
});