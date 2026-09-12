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

const PROJECT = "/mock/documents/Projects/FieldKeyCollision/inspection.db";
const FIELD_KEY = "sensor_reading";

describe("FieldKey collision regression (delete + recreate same-key field)", () => {
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

  async function activeSectionId(db: SQLiteDatabase, sectionKey: string): Promise<number> {
    const section = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = ?",
      [sectionKey]
    );
    if (!section) throw new Error(`Section '${sectionKey}' not found`);
    return section.SectionID;
  }

  async function createTextField(
    db: SQLiteDatabase,
    sectionId: number,
    key: string,
    name: string,
    isRequired: boolean
  ): Promise<number> {
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    return FieldRepository.create({
      SectionID: sectionId,
      FieldName: name,
      FieldKey: key,
      FieldType: "text",
      IsRequired: isRequired ? 1 : 0,
      IsVisible: 1,
    });
  }

  async function seedAllRequiredExcept(
    db: SQLiteDatabase,
    inspectionId: number,
    skipKey: string
  ): Promise<void> {
    const required = await db.getAllAsync<{ FieldID: number; FieldKey: string; FieldType: string; DataSourceType: string | null }>(
      `SELECT FieldID, FieldKey, FieldType, DataSourceType
       FROM InspectionFields
       WHERE IsRequired = 1 AND IsActive = 1 AND IsVisible = 1`
    );
    for (const f of required) {
      if (["date", "division", "district", skipKey].includes(f.FieldKey)) continue;
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

  async function buildDeletedRecreatedPair(db: SQLiteDatabase): Promise<{ oldId: number; newId: number }> {
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const sectionId = await activeSectionId(db, "pole_structure");
    const oldId = await createTextField(db, sectionId, FIELD_KEY, "Legacy Sensor Reading", false);
    await FieldRepository.delete(oldId);
    const newId = await createTextField(db, sectionId, FIELD_KEY, "Recreated Sensor Reading", false);
    expect(newId).not.toBe(oldId);
    return { oldId, newId };
  }

  it("TEST 1 - two fields with the same key (one inactive): values for BOTH FieldIDs are accessible", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;

    const inspectionId = await createInspection("2026-09-01");
    const { oldId, newId } = await buildDeletedRecreatedPair(db);
    await seedValue(db, inspectionId, oldId, "220");
    await seedValue(db, inspectionId, newId, "240");

    const byId = await InspectionRepository.getInspectionValuesById(inspectionId);
    expect(byId.get(oldId)).toBe("220");
    expect(byId.get(newId)).toBe("240");
    expect(byId.size).toBe(2);

    const byKey = await InspectionRepository.getInspectionValues(inspectionId);
    expect(byKey[FIELD_KEY]).toBe("240");

    const mirror = await InspectionFieldRepository.getInspectionValues(inspectionId);
    expect(mirror[FIELD_KEY]).toBe("240");
  });

  it("TEST 2 - historical value of an inactive field remains readable after soft-delete", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionValueRepository: typeof import("@/src/database/repositories/InspectionValueRepository").default = require("@/src/database/repositories/InspectionValueRepository").default;

    const inspectionId = await createInspection("2026-09-01");
    const { oldId } = await buildDeletedRecreatedPair(db);
    await seedValue(db, inspectionId, oldId, "220");

    const byId = await InspectionRepository.getInspectionValuesById(inspectionId);
    expect(byId.get(oldId)).toBe("220");

    const raw = await InspectionValueRepository.getValue(inspectionId, oldId);
    expect(raw?.FieldValue).toBe("220");
  });

  it("TEST 3 - recreated same-key field does NOT overwrite the historical value", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const inspectionId = await createInspection("2026-09-01");
    const { oldId, newId } = await buildDeletedRecreatedPair(db);
    await seedValue(db, inspectionId, oldId, "220");

    const byKey = await InspectionRepository.getInspectionValues(inspectionId);
    expect(Object.prototype.hasOwnProperty.call(byKey, FIELD_KEY)).toBe(false);

    const byId = await InspectionRepository.getInspectionValuesById(inspectionId);
    expect(byId.get(oldId)).toBe("220");
    expect(byId.has(newId)).toBe(false);
  });

  it("TEST 4 - validation is no longer masked by a stale inactive same-key value", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");

    const activeName = "Sensor Reading (Active)";
    const sectionId = await activeSectionId(db, "pole_structure");
    const oldId = await createTextField(db, sectionId, FIELD_KEY, "Legacy Sensor Reading", true);
    await FieldRepository.delete(oldId);
    const newId = await createTextField(db, sectionId, FIELD_KEY, activeName, true);

    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, oldId, "999");
    await seedAllRequiredExcept(db, inspectionId, FIELD_KEY);

    const stale = await InspectionRepository.validateInspection(inspectionId);
    expect(stale.valid).toBe(false);
    expect(stale.missingFields).toContain(activeName);

    await seedValue(db, inspectionId, newId, "100");
    const filled = await InspectionRepository.validateInspection(inspectionId);
    expect(filled.valid).toBe(true);
  });

  it("TEST 5 - normal active-field FieldKey lookups are unchanged", async () => {
    const { db } = await openSeededProject();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const sectionId = await activeSectionId(db, "pole_structure");
    const id = await createTextField(db, sectionId, "reading_alt", "Reading Alt", false);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, id, "11kV");

    const byKey = await InspectionRepository.getInspectionValues(inspectionId);
    expect(byKey).toEqual({ reading_alt: "11kV" });

    const byId = await InspectionRepository.getInspectionValuesById(inspectionId);
    expect(byId.get(id)).toBe("11kV");
    expect(byId.size).toBe(1);
  });
});