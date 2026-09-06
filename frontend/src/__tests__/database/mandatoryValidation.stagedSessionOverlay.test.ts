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

const PROJECT = "/mock/documents/Projects/MandatoryStagedOverlay/inspection.db";

type SectionRow = { SectionID: number; SectionKey: string; IsActive?: number };

describe("mandatory validation overlays InspectionEditSession-staged values", () => {
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

  async function createCustomSection(db: SQLiteDatabase, name: string, key: string, displayOrder: number): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
       VALUES (1, ?, ?, ?, 0, 1, 0, 1)`,
      [name, key, displayOrder]
    );
    return result.lastInsertRowId;
  }

  async function createCustomField(db: SQLiteDatabase, sectionId: number, name: string, key: string, fieldType: string, isRequired: number): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive, Width)
       VALUES (?, ?, ?, ?, 1, ?, 1, 1, 12)`,
      [sectionId, name, key, fieldType, isRequired]
    );
    return result.lastInsertRowId;
  }

  it("field-level lifecycle: deleted standard mandatory field -> new inspection -> reset restores same FieldID -> staged selection validated without explicit param", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const foundationId = await getFieldId(db, "foundation_cond");
    expect(foundationId).not.toBeNull();

    await db.runAsync("UPDATE InspectionFields SET IsActive = 0 WHERE FieldID = ?", [foundationId!]);

    const inspectionId = await createInspection("2026-09-03");
    await seedAllRequiredExcept(db, inspectionId, ["foundation_cond"]);
    expect((await InspectionRepository.validateInspection(inspectionId)).valid).toBe(true);

    await ResetRepository.performReset();
    const restored = await db.getFirstAsync<{ FieldID: number; IsActive: number }>(
      "SELECT FieldID, IsActive FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    expect(restored?.FieldID).toBe(foundationId);
    expect(restored?.IsActive).toBe(1);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, foundationId!, "Acceptable");

    const stagedSeen = await InspectionRepository.validateInspection(inspectionId);
    expect(stagedSeen.valid).toBe(true);
    expect(stagedSeen.missingFields.filter((f) => f === "Foundation Condition")).toEqual([]);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionValueRepository.getValue(inspectionId, foundationId!))?.FieldValue).toBe("Acceptable");
    expect(InspectionEditSession.isActive(inspectionId)).toBe(false);
    expect((await InspectionRepository.validateInspection(inspectionId)).valid).toBe(true);
  });

  it("option-level lifecycle: deleted mandatory option -> new inspection -> reset restores option in place -> staged restored selection persists", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const foundationId = await getFieldId(db, "foundation_cond");
    expect(foundationId).not.toBeNull();
    const fieldRow = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionFields WHERE FieldID = ?",
      [foundationId!]
    );
    const option = await db.getFirstAsync<{ OptionID: number }>(
      "SELECT OptionID FROM FieldOptions WHERE FieldID = ? AND OptionValue = 'Acceptable'",
      [foundationId!]
    );
    expect(option).toBeTruthy();

    const inspectionId = await createInspection("2026-09-04");
    await seedAllRequiredExcept(db, inspectionId, ["foundation_cond"]);
    const preOpts = await db.getAllAsync<{ OptionValue: string }>(
      "SELECT OptionValue FROM FieldOptions WHERE FieldID = ? AND IsActive = 1 ORDER BY DisplayOrder",
      [foundationId!]
    );
    await seedValue(db, inspectionId, foundationId!, preOpts[0].OptionValue);
    expect((await InspectionRepository.validateInspection(inspectionId)).valid).toBe(true);

    await db.runAsync("UPDATE FieldOptions SET IsActive = 0 WHERE FieldID = ? AND OptionValue = 'Acceptable'", [foundationId!]);

    const midInspectionId = await createInspection("2026-09-05");
    const midOptions = await InspectionFieldRepository.getFieldOptionsBySection(fieldRow!.SectionID, midInspectionId);
    expect((midOptions.get(foundationId!) ?? []).map((o) => o.OptionValue)).not.toContain("Acceptable");

    await ResetRepository.performReset();
    const restoredOption = await db.getFirstAsync<{ OptionID: number; IsActive: number }>(
      "SELECT OptionID, IsActive FROM FieldOptions WHERE FieldID = ? AND OptionValue = 'Acceptable'",
      [foundationId!]
    );
    expect(restoredOption?.OptionID).toBe(option!.OptionID);
    expect(restoredOption?.IsActive).toBe(1);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, foundationId!, "Acceptable");
    const stagedSeen = await InspectionRepository.validateInspection(inspectionId);
    expect(stagedSeen.valid).toBe(true);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionValueRepository.getValue(inspectionId, foundationId!))?.FieldValue).toBe("Acceptable");
  });

  it("device factory lifecycle: deleted device type -> new inspection -> reset -> staged device edit passes validateDeviceMandatory", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");
    const DeviceRecordsRepository = require("@/src/database/repositories/DeviceRecordsRepository").default as typeof import("@/src/database/repositories/DeviceRecordsRepository").default;
    const DeviceFieldDefsRepository = require("@/src/database/repositories/DeviceFieldDefinitionsRepository").default as typeof import("@/src/database/repositories/DeviceFieldDefinitionsRepository").default;

    await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE DeviceType = 'Camera'");
    await db.runAsync("DELETE FROM ProjectDeviceTypes WHERE DeviceType = 'Camera'");

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    expect(cameraCountId).not.toBeNull();

    const inspectionId = await createInspection("2026-09-06");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");
    await DeviceRecordsRepository.create({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceLabel: "Camera Device 1",
      DeviceNo: 1,
      DeviceData: "{}",
      DisplayOrder: 1,
      IsActive: 1,
    });

    const midInspectionId = await createInspection("2026-09-07");
    const midDeviceTypes = await DeviceFieldDefsRepository.getDeviceTypes();
    expect(midDeviceTypes).not.toContain("Camera");

    await ResetRepository.performReset();
    const reactivated = await db.getAllAsync<{ FieldName: string; IsRequired: number; IsActive: number }>(
      "SELECT FieldName, IsRequired, IsActive FROM DeviceFieldDefinitions WHERE DeviceType = 'Camera'"
    );
    const requiredNames = reactivated.filter((d) => d.IsRequired === 1).map((d) => d.FieldName);
    expect(requiredNames).toContain("CameraType");
    expect(requiredNames).toContain("CameraStatus");
    expect(reactivated.every((d) => d.IsActive === 1)).toBe(true);

    const dbRecord = (await DeviceRecordsRepository.getByInspection(inspectionId, "Camera"))[0];
    expect(dbRecord?.DeviceData).toBe("{}");

    const edited = {
      ...dbRecord!,
      DeviceData: JSON.stringify({ CameraType: "PTZ", CameraStatus: "VMS" }),
    };
    InspectionEditSession.activate(inspectionId);
    await DeviceRecordsRepository.scheduleDeviceRecordSave(edited, 500);

    expect((await DeviceRecordsRepository.getByInspection(inspectionId, "Camera"))[0].DeviceData).toBe("{}");

    const stagedValid = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(stagedValid.valid).toBe(true);
    expect(stagedValid.missingFields).toEqual([]);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await DeviceRecordsRepository.getByInspection(inspectionId, "Camera"))[0].DeviceData).toBe(
      JSON.stringify({ CameraType: "PTZ", CameraStatus: "VMS" })
    );
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);
  });

  it("device factory non-mandatory: staged optional CameraMake edit passes and persists", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");
    const DeviceRecordsRepository = require("@/src/database/repositories/DeviceRecordsRepository").default as typeof import("@/src/database/repositories/DeviceRecordsRepository").default;
    const DeviceFieldDefsRepository = require("@/src/database/repositories/DeviceFieldDefinitionsRepository").default as typeof import("@/src/database/repositories/DeviceFieldDefinitionsRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-08");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");
    await DeviceRecordsRepository.create({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceLabel: "Camera Device 1",
      DeviceNo: 1,
      DeviceData: JSON.stringify({ CameraType: "PTZ", CameraStatus: "VMS" }),
      DisplayOrder: 1,
      IsActive: 1,
    });
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);

    await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE DeviceType = 'Camera'");
    const midInspectionId = await createInspection("2026-09-09");
    expect((await DeviceFieldDefsRepository.getDeviceTypes())).not.toContain("Camera");

    await ResetRepository.performReset();

    const dbRecord = (await DeviceRecordsRepository.getByInspection(inspectionId, "Camera"))[0];
    InspectionEditSession.activate(inspectionId);
    await DeviceRecordsRepository.scheduleDeviceRecordSave({
      ...dbRecord!,
      DeviceData: JSON.stringify({ CameraType: "PTZ", CameraStatus: "VMS", CameraMake: "Hikvision" }),
    }, 500);

    const stagedValid = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(stagedValid.valid).toBe(true);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    const persisted = (await DeviceRecordsRepository.getByInspection(inspectionId, "Camera"))[0];
    expect(JSON.parse(persisted.DeviceData ?? "{}").CameraMake).toBe("Hikvision");
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);
  });

  it("custom section mandatory: deleted custom field -> new inspection -> custom re-added -> staged selection passes without explicit param", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const sectionId = await createCustomSection(db, "Custom Pylon", "custom_pylon", 90);
    const fieldId = await createCustomField(db, sectionId, "Pylon Condition Text", "pylon_cond_text", "text", 1);

    await db.runAsync("UPDATE InspectionSections SET IsActive = 0 WHERE SectionID = ?", [sectionId]);
    await db.runAsync("UPDATE InspectionFields SET IsActive = 0 WHERE FieldID = ?", [fieldId]);

    const inspectionId = await createInspection("2026-09-10");
    await seedAllRequiredExcept(db, inspectionId, []);
    const midSections = await InspectionRepository.getSections(undefined, inspectionId);
    expect(midSections.some((s: SectionRow) => s.SectionKey === "custom_pylon")).toBe(false);
    expect((await InspectionRepository.validateInspection(inspectionId)).valid).toBe(true);

    const restoredSectionId = await createCustomSection(db, "Custom Pylon", "custom_pylon", 90);
    const restoredFieldId = await createCustomField(db, restoredSectionId, "Pylon Condition Text", "pylon_cond_text", "text", 1);

    const withoutStaged = await InspectionRepository.validateInspection(inspectionId);
    expect(withoutStaged.valid).toBe(false);
    expect(withoutStaged.missingFields).toContain("Pylon Condition Text");

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, restoredFieldId, "Side A");
    const stagedSeen = await InspectionRepository.validateInspection(inspectionId);
    expect(stagedSeen.valid).toBe(true);
    expect(stagedSeen.missingFields.filter((f) => f === "Pylon Condition Text")).toEqual([]);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionValueRepository.getValue(inspectionId, restoredFieldId))?.FieldValue).toBe("Side A");
    expect((await InspectionRepository.validateInspection(inspectionId)).valid).toBe(true);
  });

  it("custom section non-mandatory: staged custom optional value persists without false positives", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const sectionId = await createCustomSection(db, "Custom Notes", "custom_notes", 91);
    const fieldId = await createCustomField(db, sectionId, "Custom Note", "custom_note", "text", 0);

    await db.runAsync("UPDATE InspectionSections SET IsActive = 0 WHERE SectionID = ?", [sectionId]);
    await db.runAsync("UPDATE InspectionFields SET IsActive = 0 WHERE FieldID = ?", [fieldId]);

    const inspectionId = await createInspection("2026-09-11");
    await seedAllRequiredExcept(db, inspectionId, []);
    const midSections = await InspectionRepository.getSections(undefined, inspectionId);
    expect(midSections.some((s: SectionRow) => s.SectionKey === "custom_notes")).toBe(false);

    const restoredSectionId = await createCustomSection(db, "Custom Notes", "custom_notes", 91);
    const restoredFieldId = await createCustomField(db, restoredSectionId, "Custom Note", "custom_note", "text", 0);

    expect((await InspectionRepository.validateInspection(inspectionId)).valid).toBe(true);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, restoredFieldId, "Side B");
    const stagedSeen = await InspectionRepository.validateInspection(inspectionId);
    expect(stagedSeen.valid).toBe(true);
    expect(stagedSeen.missingFields).toEqual([]);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionValueRepository.getValue(inspectionId, restoredFieldId))?.FieldValue).toBe("Side B");
  });

  it("custom device mandatory: deleted custom device type -> new inspection -> re-added -> staged record passes validateDeviceMandatory", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");
    const DeviceRecordsRepository = require("@/src/database/repositories/DeviceRecordsRepository").default as typeof import("@/src/database/repositories/DeviceRecordsRepository").default;
    const DeviceFieldDefsRepository = require("@/src/database/repositories/DeviceFieldDefinitionsRepository").default as typeof import("@/src/database/repositories/DeviceFieldDefinitionsRepository").default;

    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'NVR', 'NvrStatus', 'NVR Status', 'dropdown', 1, 1, 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'NVR', 'NvrMake', 'NVR Make', 'dropdown', 0, 1, 2, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('NVR', 'NvrStatus', 'Operational', 'Operational', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('NVR', 'NvrStatus', 'VMS', 'VMS', 2, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('NVR', 'NvrMake', 'Axis', 'Axis', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES ('NVR', 1)`
    );
    const nvrSectionId = await createCustomSection(db, "NVR Devices", "nvr_devices", 88);
    const nvrCountId = await createCustomField(db, nvrSectionId, "NVR Count", "nvr_count", "number", 0);

    await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE DeviceType = 'NVR'");
    await db.runAsync("DELETE FROM ProjectDeviceTypes WHERE DeviceType = 'NVR'");

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-12");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");
    await InspectionValueRepository.saveValue(inspectionId, nvrCountId, "1");

    const midInspectionId = await createInspection("2026-09-13");
    const midDeviceTypes = await DeviceFieldDefsRepository.getDeviceTypes();
    expect(midDeviceTypes).not.toContain("NVR");

    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'NVR', 'NvrStatus', 'NVR Status', 'dropdown', 1, 1, 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('NVR', 'NvrStatus', 'Operational', 'Operational', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('NVR', 'NvrStatus', 'VMS', 'VMS', 2, 1)`
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES ('NVR', 1)`
    );

    const withoutStaged = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(withoutStaged.valid).toBe(false);
    expect(withoutStaged.missingFields).toContain("NVR — NVR Status (Device 1)");

    InspectionEditSession.activate(inspectionId);
    await DeviceRecordsRepository.scheduleDeviceRecordSave({
      InspectionID: inspectionId,
      DeviceType: "NVR",
      DeviceLabel: "NVR Device 1",
      DeviceNo: 1,
      DeviceData: JSON.stringify({ NvrStatus: "VMS" }),
      DisplayOrder: 1,
      IsActive: 1,
    }, 500);

    const stagedValid = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(stagedValid.valid).toBe(true);
    expect(stagedValid.missingFields).toEqual([]);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);
  });

  it("custom device non-mandatory: staged custom optional value persists without false positives", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");
    const DeviceRecordsRepository = require("@/src/database/repositories/DeviceRecordsRepository").default as typeof import("@/src/database/repositories/DeviceRecordsRepository").default;
    const DeviceFieldDefsRepository = require("@/src/database/repositories/DeviceFieldDefinitionsRepository").default as typeof import("@/src/database/repositories/DeviceFieldDefinitionsRepository").default;

    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'SAN', 'SanStatus', 'SAN Status', 'dropdown', 1, 1, 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'SAN', 'SanMake', 'SAN Make', 'dropdown', 0, 1, 2, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('SAN', 'SanStatus', 'Operational', 'Operational', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('SAN', 'SanMake', 'Dell', 'Dell', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES ('SAN', 1)`
    );
    const sanSectionId = await createCustomSection(db, "SAN Devices", "san_devices", 87);
    const sanCountId = await createCustomField(db, sanSectionId, "SAN Count", "san_count", "number", 0);

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-15");
    await seedAllRequiredExcept(db, inspectionId, []);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");
    await InspectionValueRepository.saveValue(inspectionId, sanCountId, "1");
    await DeviceRecordsRepository.create({
      InspectionID: inspectionId,
      DeviceType: "SAN",
      DeviceLabel: "SAN Device 1",
      DeviceNo: 1,
      DeviceData: JSON.stringify({ SanStatus: "Operational" }),
      DisplayOrder: 1,
      IsActive: 1,
    });

    await db.runAsync("UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE DeviceType = 'SAN'");
    const midInspectionId = await createInspection("2026-09-16");
    expect((await DeviceFieldDefsRepository.getDeviceTypes())).not.toContain("SAN");

    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'SAN', 'SanStatus', 'SAN Status', 'dropdown', 1, 1, 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive) VALUES (1, 'SAN', 'SanMake', 'SAN Make', 'dropdown', 0, 1, 2, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('SAN', 'SanStatus', 'Operational', 'Operational', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive) VALUES ('SAN', 'SanMake', 'Dell', 'Dell', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES ('SAN', 1)`
    );

    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);

    const dbRecord = (await DeviceRecordsRepository.getByInspection(inspectionId, "SAN"))[0];
    InspectionEditSession.activate(inspectionId);
    await DeviceRecordsRepository.scheduleDeviceRecordSave({
      ...dbRecord!,
      DeviceData: JSON.stringify({ SanStatus: "Operational", SanMake: "Dell" }),
    }, 500);

    const stagedValid = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(stagedValid.valid).toBe(true);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    const persisted = (await DeviceRecordsRepository.getByInspection(inspectionId, "SAN"))[0];
    expect(JSON.parse(persisted.DeviceData ?? "{}").SanMake).toBe("Dell");
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);
  });

  it("device count overlay: staged count raises DB threshold and staged records are enforced, then pass once filled", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default as typeof import("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");
    const DeviceRecordsRepository = require("@/src/database/repositories/DeviceRecordsRepository").default as typeof import("@/src/database/repositories/DeviceRecordsRepository").default;

    const cameraCountId = await getFieldId(db, "camera_count");
    const switchCountId = await getFieldId(db, "switch_count");
    const inspectionId = await createInspection("2026-09-14");
    await seedAllRequiredExcept(db, inspectionId, ["camera_count"]);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "0");
    await InspectionValueRepository.saveValue(inspectionId, switchCountId!, "0");
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);

    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, cameraCountId!, "1");

    const enforced = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(enforced.valid).toBe(false);
    expect(enforced.missingFields).toContain("Camera — Camera Type (Device 1)");
    expect(enforced.missingFields).toContain("Camera — Camera Status (Device 1)");

    await DeviceRecordsRepository.scheduleDeviceRecordSave({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceLabel: "Camera Device 1",
      DeviceNo: 1,
      DeviceData: JSON.stringify({ CameraType: "PTZ", CameraStatus: "VMS" }),
      DisplayOrder: 1,
      IsActive: 1,
    }, 500);

    const passed = await InspectionRepository.validateDeviceMandatory(inspectionId);
    expect(passed.valid).toBe(true);
    expect(passed.missingFields).toEqual([]);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionValueRepository.getValue(inspectionId, cameraCountId!))?.FieldValue).toBe("1");
    const persisted = (await DeviceRecordsRepository.getByInspection(inspectionId, "Camera"))[0];
    expect(JSON.parse(persisted.DeviceData ?? "{}").CameraStatus).toBe("VMS");
    expect((await InspectionRepository.validateDeviceMandatory(inspectionId)).valid).toBe(true);
  });
});