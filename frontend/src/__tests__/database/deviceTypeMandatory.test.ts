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
    const dpt = require("@/src/database/seeds/project-device-types.seed");
    await dpt.seedProjectDeviceTypes();
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

  async function addCountField(db: SQLiteDatabase, key: string, name: string): Promise<void> {
    const section = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'camera_information' LIMIT 1"
    );
    await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive, Width)
       VALUES (?, ?, ?, 'number', 50, 0, 1, 1, 12)`,
      [section!.SectionID, name, key]
    );
  }

  async function validateTypeRequired(inspectionId: number) {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.validateDeviceTypeMandatory(inspectionId);
  }

  it("A. factory defaults: fresh project seeds Camera Required ON, Switch OFF; setRequired round-trips", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;

    const rows = await db.getAllAsync<{ DeviceType: string; IsActive: number; IsRequired: number }>(
      "SELECT DeviceType, IsActive, IsRequired FROM ProjectDeviceTypes"
    );
    const camera = rows.find((r) => r.DeviceType === "Camera");
    const switchType = rows.find((r) => r.DeviceType === "Switch");
    expect(camera?.IsActive).toBe(1);
    expect(camera?.IsRequired).toBe(1);
    expect(switchType?.IsActive).toBe(1);
    expect(switchType?.IsRequired).toBe(0);
    expect(await repo.getRequired()).toEqual(["Camera"]);

    await repo.setRequired("Camera", false);
    expect(await repo.getRequired()).toEqual([]);

    await repo.setRequired("Camera", true);
    expect(await repo.getRequired()).toEqual(["Camera"]);
  });

  it("1. factory defaults are restored by ResetRepository.performReset after deletion", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;

    await db.runAsync("DELETE FROM ProjectDeviceTypes");
    expect(await repo.getRequired()).toEqual([]);

    await ResetRepository.performReset();

    expect(await repo.getRequired()).toEqual(["Camera"]);
    const rows = await db.getAllAsync<{ DeviceType: string; IsActive: number; IsRequired: number }>(
      "SELECT DeviceType, IsActive, IsRequired FROM ProjectDeviceTypes"
    );
    const camera = rows.find((r) => r.DeviceType === "Camera");
    const switchType = rows.find((r) => r.DeviceType === "Switch");
    expect(camera?.IsActive).toBe(1);
    expect(camera?.IsRequired).toBe(1);
    expect(switchType?.IsActive).toBe(1);
    expect(switchType?.IsRequired).toBe(0);
    expect(db).toBeTruthy();
  });

  it("B. optional device type (user disabled) with count 0 passes", async () => {
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

  it("9. optional device type (Switch, default OFF) with empty count passes", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-09-20");
    await seedAllRequiredExcept(db, inspectionId, []);

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("C. required device type (Camera, default ON) with EMPTY count fails with 'Fill Camera Count'", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-09-21");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(["Fill Camera Count"]);
  });

  it("D. required device type with count 1 passes", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-12");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("4. required device type with count 0 passes (explicit zero is a valid answer)", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-15");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("6. required Switch with EMPTY count fails with 'Fill Switch Count'", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-16");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count", "switch_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");

    await repo.setRequired("Switch", true);
    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(["Fill Switch Count"]);
  });

  it("7. required Switch with count 0 passes", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-17");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count", "switch_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");

    await repo.setRequired("Switch", true);
    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("8. required Switch with count 1 passes", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-18");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count", "switch_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "1");

    await repo.setRequired("Switch", true);
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

    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await repo.setRequired("Camera", false);

    const fieldResult = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(fieldResult.valid).toBe(false);

    const typeResult = await validateTypeRequired(inspectionId);
    expect(typeResult.valid).toBe(true);
  });

  it("11. device-level required AND field-level required work independently", async () => {
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-19");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");

    await repo.setRequired("Camera", true);
    const typeResult = await validateTypeRequired(inspectionId);
    expect(typeResult.valid).toBe(true);
    expect(typeResult.missingFields).toEqual([]);

    const fieldResult = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(fieldResult.valid).toBe(false);
    expect(fieldResult.missingFields.some((f) => f.startsWith("Camera —"))).toBe(true);
  });

  it("G. generic custom device type NVR enforced without hardcode - empty fails, camera_count does not satisfy NVR", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES ('NVR', 1, 1)`
    );
    await addCountField(db, "nvr_count", "NVR Count");

    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-22");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);

    const missing = await validateTypeRequired(inspectionId);
    expect(missing.valid).toBe(false);
    expect(missing.missingFields).toContain("Fill Camera Count");
    expect(missing.missingFields).toContain("Fill NVR Count");

    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    const withCamera = await validateTypeRequired(inspectionId);
    expect(withCamera.valid).toBe(false);
    expect(withCamera.missingFields).toEqual(["Fill NVR Count"]);

    const nvrCountId = await getFieldId(db, "nvr_count");
    await InspectionValueRepository.saveValue(inspectionId, nvrCountId!, "1");
    const withNvr = await validateTypeRequired(inspectionId);
    expect(withNvr.valid).toBe(true);
    expect(withNvr.missingFields).toEqual([]);
  });

  it("13. required custom NVR with count 0 passes", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES ('NVR', 1, 1)`
    );
    await addCountField(db, "nvr_count", "NVR Count");

    const cameraCountId = await getFieldId(db, "camera_count");
    const nvrCountId = await getFieldId(db, "nvr_count");
    const inspectionId = await createInspection("2026-09-23");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count", "nvr_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await InspectionValueRepository.saveValue(inspectionId, nvrCountId!, "0");

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("14. required custom NVR with count 1 passes", async () => {
    const { db } = await openSeededProject();
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;

    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive, IsRequired) VALUES ('NVR', 1, 1)`
    );
    await addCountField(db, "nvr_count", "NVR Count");

    const cameraCountId = await getFieldId(db, "camera_count");
    const nvrCountId = await getFieldId(db, "nvr_count");
    const inspectionId = await createInspection("2026-09-24");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count", "nvr_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await InspectionValueRepository.saveValue(inspectionId, nvrCountId!, "1");

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("H. migration preserves existing Camera/Switch config and IsRequired data", async () => {
    const { db } = await openSeededProject();
    const { migrateProjectSchema } = require("@/src/database/schema");

    await db.runAsync("DELETE FROM ProjectDeviceTypes");
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

  it("migration sets Camera as factory-required for legacy rows and is idempotent", async () => {
    const { db } = await openSeededProject();
    const { migrateProjectSchema } = require("@/src/database/schema");

    await db.runAsync("DELETE FROM ProjectDeviceTypes");
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES ('Camera', 1)`
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES ('Switch', 1)`
    );

    await migrateProjectSchema(1);

    const rows = await db.getAllAsync<{ DeviceType: string; IsActive: number; IsRequired: number }>(
      "SELECT DeviceType, IsActive, IsRequired FROM ProjectDeviceTypes"
    );
    const camera = rows.find((r) => r.DeviceType === "Camera");
    const switchType = rows.find((r) => r.DeviceType === "Switch");
    expect(camera?.IsActive).toBe(1);
    expect(camera?.IsRequired).toBe(1);
    expect(switchType?.IsActive).toBe(1);
    expect(switchType?.IsRequired).not.toBe(1);

    await migrateProjectSchema(1);
    const afterSecond = await db.getAllAsync<{ DeviceType: string; IsRequired: number }>(
      "SELECT DeviceType, IsRequired FROM ProjectDeviceTypes"
    );
    expect(afterSecond.find((r) => r.DeviceType === "Camera")?.IsRequired).toBe(1);
  });

  it("2. whitespace-only count is treated as empty for a required device type", async () => {
    const { db } = await openSeededProject();
    const cameraCountId = await getFieldId(db, "camera_count");
    const inspectionId = await createInspection("2026-09-25");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);
    await seedValue(db, inspectionId, cameraCountId!, " ");

    const result = await validateTypeRequired(inspectionId);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(["Fill Camera Count"]);
  });

  it("I. isolation: IsRequired set in Project A does not leak into Project B", async () => {
    const PROJECT_B = "/mock/documents/Projects/DeviceTypeMandatoryB/inspection.db";
    const { db } = await openSeededProject();
    const repo = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;

    await repo.setRequired("Switch", true);
    expect(await repo.getRequired()).toEqual(["Camera", "Switch"]);

    const { db: dbB } = await openSeededProject(PROJECT_B);
    const repoB = require("@/src/database/repositories/ProjectDeviceTypesRepository").default as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository").default;
    expect(await repoB.getRequired()).toEqual(["Camera"]);
    expect(db).not.toBe(dbB);
  });

  describe("deviceFieldKey util (count-field indicator semantics)", () => {
    it("resolveFieldRequired only marks the {deviceType}_count field when that type is required", () => {
      const { resolveFieldRequired } = require("@/src/utils/deviceFieldKey");

      expect(resolveFieldRequired("camera_count", "Camera", new Set(["Camera"]), false)).toBe(true);
      expect(resolveFieldRequired("camera_count", "Camera", new Set([]), false)).toBe(false);
      expect(resolveFieldRequired("camera_status", "Camera", new Set(["Camera"]), false)).toBe(false);
      expect(resolveFieldRequired("nvr_count", "NVR", new Set(["NVR"]), false)).toBe(true);
      expect(resolveFieldRequired("switch_count", "Switch", new Set(["Switch"]), false)).toBe(true);
      expect(resolveFieldRequired("switch_count", "Switch", new Set(["Camera"]), false)).toBe(false);
      expect(resolveFieldRequired("jb_status", undefined, new Set(["Camera"]), false)).toBe(false);
      expect(resolveFieldRequired("jb_status", "JunctionBox", new Set([]), true)).toBe(true);
    });

    it("deviceCountFieldKey / isCountField helpers produce expected keys", () => {
      const { deviceCountFieldKey, isCountField } = require("@/src/utils/deviceFieldKey");

      expect(deviceCountFieldKey("Camera")).toBe("camera_count");
      expect(deviceCountFieldKey("Switch")).toBe("switch_count");
      expect(deviceCountFieldKey("NVR")).toBe("nvr_count");
      expect(deviceCountFieldKey("Junction Box")).toBe("junction_box_count");
      expect(isCountField("camera_count")).toBe(true);
      expect(isCountField("switch_count")).toBe(true);
      expect(isCountField("camera_type")).toBe(false);
      expect(isCountField("jb_status")).toBe(false);
    });

    it("isCountEmpty treats null/undefined/blank/whitespace as empty but keeps 0 and numeric strings", () => {
      const { isCountEmpty } = require("@/src/utils/deviceFieldKey");

      expect(isCountEmpty(null)).toBe(true);
      expect(isCountEmpty(undefined)).toBe(true);
      expect(isCountEmpty("")).toBe(true);
      expect(isCountEmpty("   ")).toBe(true);
      expect(isCountEmpty("0")).toBe(false);
      expect(isCountEmpty(0)).toBe(false);
      expect(isCountEmpty("1")).toBe(false);
      expect(isCountEmpty(1)).toBe(false);
    });
  });
});