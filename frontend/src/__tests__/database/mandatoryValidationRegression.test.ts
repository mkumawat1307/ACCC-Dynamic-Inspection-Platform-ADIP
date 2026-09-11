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

const PROJECT = "/mock/documents/Projects/MandatoryValidationRegression";
let projectSeq = 0;

type SectionRow = { SectionID: number; SectionKey: string; IsActive?: number };

describe("Mandatory validation stays correct across delete-default-section + reset flows", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openSeededProject(): Promise<{ db: SQLiteDatabase }> {
    projectSeq += 1;
    const path = `${PROJECT}/${projectSeq}/inspection.db`;
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
    await db.runAsync("DELETE FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?", [inspectionId, fieldId]);
    await db.runAsync(
      "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
      [inspectionId, fieldId, value]
    );
  }

  async function setValue(db: SQLiteDatabase, inspectionId: number, fieldId: number, value: string): Promise<void> {
    const existing = await db.getFirstAsync<{ ValueID: number }>(
      "SELECT ValueID FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?",
      [inspectionId, fieldId]
    );
    if (existing) {
      await db.runAsync("UPDATE InspectionValues SET FieldValue = ? WHERE ValueID = ?", [value, existing.ValueID]);
    } else {
      await db.runAsync(
        "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
        [inspectionId, fieldId, value]
      );
    }
  }

  async function seedAllRequired(db: SQLiteDatabase, inspectionId: number, skipFieldKeys: string[] = []): Promise<void> {
    const required = await db.getAllAsync<{ FieldID: number; FieldKey: string; FieldType: string; DataSourceType: string | null }>(
      `SELECT FieldID, FieldKey, FieldType, DataSourceType
       FROM InspectionFields
       WHERE IsRequired = 1 AND IsActive = 1 AND IsVisible = 1`
    );
    for (const f of required) {
      if (["date", "division", "district"].includes(f.FieldKey)) continue;
      if (skipFieldKeys.includes(f.FieldKey)) continue;
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

  async function createCustomSection(db: SQLiteDatabase, name: string, key: string, order: number): Promise<number> {
    const tpl = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
    );
    const inserted = await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive, IsVisible)
       VALUES (?, ?, ?, ?, 0, 1, 1)`,
      [tpl!.TemplateID, name, key, order]
    );
    return inserted.lastInsertRowId as number;
  }

  async function createRequiredField(db: SQLiteDatabase, sectionId: number, key: string): Promise<number> {
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    return FieldRepository.create({
      SectionID: sectionId,
      FieldName: key,
      FieldKey: key,
      FieldType: "dropdown",
      IsRequired: 1,
    });
  }

  async function fieldId(db: SQLiteDatabase, fieldKey: string): Promise<number> {
    const row = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = ? ORDER BY FieldID ASC LIMIT 1",
      [fieldKey]
    );
    return row!.FieldID;
  }

  async function fieldName(db: SQLiteDatabase, fieldKey: string): Promise<string> {
    const row = await db.getFirstAsync<{ FieldName: string }>(
      "SELECT FieldName FROM InspectionFields WHERE FieldKey = ? ORDER BY FieldID ASC LIMIT 1",
      [fieldKey]
    );
    return row!.FieldName;
  }

  function validate(db: SQLiteDatabase, inspectionId: number) {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.validateInspection(inspectionId);
  }

  it("1. fully-seeded valid inspection -> valid with no missing fields", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-09-01");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, await fieldId(db, "foundation_cond"), "Acceptable");

    const v = await validate(db, inspectionId);
    expect(v.valid).toBe(true);
    expect(v.missingFields).toEqual([]);
  });

  it("2. required field missing -> invalid and flagged by display name", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-09-02");
    await seedAllRequired(db, inspectionId, ["foundation_cond"]);

    const v = await validate(db, inspectionId);
    expect(v.valid).toBe(false);
    expect(v.missingFields).toContain("Foundation Condition");
  });

  it("3. OPTIONAL field missing -> still valid", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-09-03");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, await fieldId(db, "foundation_cond"), "Acceptable");
    const remarks = await db.getFirstAsync<{ FieldID: number; IsRequired: number }>(
      "SELECT FieldID, IsRequired FROM InspectionFields WHERE FieldKey = 'remarks' LIMIT 1"
    );
    expect(remarks).toBeTruthy();
    expect(remarks!.IsRequired).toBe(0);
    expect(remarks!.FieldID).toBeGreaterThan(0);

    const v = await validate(db, inspectionId);
    expect(v.valid).toBe(true);
  });

  it("4. delete default section -> reopen original -> still valid (baseline)", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const inspectionId = await createInspection("2026-09-04");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, await fieldId(db, "foundation_cond"), "Acceptable");

    const before = await validate(db, inspectionId);
    expect(before.valid).toBe(true);

    await SectionRepository.softDeleteSection(sectionId);
    const reopened = await validate(db, inspectionId);
    expect(reopened.valid).toBe(true);
    expect(reopened.missingFields).toEqual(before.missingFields);
  });

  it("5. delete default section -> create inspection -> reset -> reopen original -> still valid", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const inspectionId = await createInspection("2026-09-05");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, await fieldId(db, "foundation_cond"), "Acceptable");

    const before = await validate(db, inspectionId);
    expect(before.valid).toBe(true);

    await SectionRepository.softDeleteSection(sectionId);

    const midInspectionId = await createInspection("2026-09-06");
    const midSections = await InspectionRepository.getSections(undefined, midInspectionId);
    expect(midSections.some((s: SectionRow) => s.SectionID === sectionId)).toBe(false);

    await ResetRepository.performReset();

    const restored = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [sectionId]
    );
    expect(restored!.IsActive).toBe(1);

    const after = await validate(db, inspectionId);
    expect(after.valid).toBe(true);
    expect(after.missingFields).toEqual(before.missingFields);
  });

  it("6. delete default section AND default field -> create inspection -> reset -> reopen original -> still valid", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const inspectionId = await createInspection("2026-09-07");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, await fieldId(db, "foundation_cond"), "Minor Damage");

    const before = await validate(db, inspectionId);
    expect(before.valid).toBe(true);

    await SectionRepository.softDeleteSection(sectionId);
    await FieldRepository.delete(await fieldId(db, "foundation_cond"));
    await ResetRepository.performReset();

    const restored = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionFields WHERE FieldKey = 'foundation_cond' ORDER BY FieldID ASC LIMIT 1"
    );
    expect(restored!.IsActive).toBe(1);

    const after = await validate(db, inspectionId);
    expect(after.valid).toBe(true);
    expect(after.missingFields).toEqual(before.missingFields);
  });

  it("7. CHANGE a saved required value before delete/reset -> reopen original -> new value validated", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const InspectionFieldRepository = require("@/src/database/repositories/InspectionFieldRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default;

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const foundationId = await fieldId(db, "foundation_cond");
    const inspectionId = await createInspection("2026-09-08");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, foundationId, "Acceptable");
    await setValue(db, inspectionId, foundationId, "Minor Damage");

    await SectionRepository.softDeleteSection(sectionId);
    await createInspection("2026-09-09");
    await ResetRepository.performReset();

    const editorValues = await InspectionValueRepository.getValuesByInspection(inspectionId);
    const dbValue = editorValues.find((v: { FieldID: number }) => v.FieldID === foundationId);
    expect(dbValue?.FieldValue).toBe("Minor Damage");

    const keys = await InspectionFieldRepository.getInspectionValues(inspectionId);
    expect(keys["foundation_cond"]).toBe("Minor Damage");

    const after = await validate(db, inspectionId);
    expect(after.valid).toBe(true);
  });

  it("8. CLEAR a required value after reset -> invalid until restored", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const foundationId = await fieldId(db, "foundation_cond");
    const inspectionId = await createInspection("2026-09-10");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, foundationId, "Acceptable");

    await SectionRepository.softDeleteSection(sectionId);
    await ResetRepository.performReset();

    await setValue(db, inspectionId, foundationId, "");
    const cleared = await validate(db, inspectionId);
    expect(cleared.valid).toBe(false);
    expect(cleared.missingFields).toContain("Foundation Condition");

    await setValue(db, inspectionId, foundationId, "Acceptable");
    const restored = await validate(db, inspectionId);
    expect(restored.valid).toBe(true);
  });

  it("9. CLEAR an OPTIONAL (remarks) value after reset -> still valid", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const foundationId = await fieldId(db, "foundation_cond");
    const remarks = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'remarks' LIMIT 1"
    );
    const inspectionId = await createInspection("2026-09-11");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, foundationId, "Acceptable");
    await seedValue(db, inspectionId, remarks!.FieldID, "hello");

    await SectionRepository.softDeleteSection(sectionId);
    await ResetRepository.performReset();

    await setValue(db, inspectionId, remarks!.FieldID, "");
    const v = await validate(db, inspectionId);
    expect(v.valid).toBe(true);
    expect(v.missingFields).not.toContain("Remarks");
  });

  it("10. multiple missing required fields -> each reported exactly ONCE, no duplicates", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-09-12");
    await seedAllRequired(db, inspectionId, ["foundation_cond", "jb_status"]);

    const v = await validate(db, inspectionId);
    expect(v.valid).toBe(false);

    const f1 = await fieldName(db, "foundation_cond");
    const f2 = await fieldName(db, "jb_status");
    expect(v.missingFields).toContain(f1);
    expect(v.missingFields).toContain(f2);
    expect(v.missingFields.length).toBe(2);
    expect(new Set(v.missingFields).size).toBe(v.missingFields.length);
  });

  it("11. MULTI-delete (two default sections) -> create inspection -> reset -> reopen original -> still valid", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const poleSec = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;
    const cameraSec = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'camera_information'"
    ))!.SectionID;

    const inspectionId = await createInspection("2026-09-13");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, await fieldId(db, "foundation_cond"), "Acceptable");

    const before = await validate(db, inspectionId);
    expect(before.valid).toBe(true);

    await SectionRepository.softDeleteSection(poleSec);
    await SectionRepository.softDeleteSection(cameraSec);

    const midInspectionId = await createInspection("2026-09-14");
    const midSections = await InspectionRepository.getSections(undefined, midInspectionId);
    expect(midSections.some((s: SectionRow) => s.SectionID === poleSec)).toBe(false);
    expect(midSections.some((s: SectionRow) => s.SectionID === cameraSec)).toBe(false);

    await ResetRepository.performReset();

    const poleRestored = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [poleSec]
    );
    const cameraRestored = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [cameraSec]
    );
    expect(poleRestored!.IsActive).toBe(1);
    expect(cameraRestored!.IsActive).toBe(1);

    const after = await validate(db, inspectionId);
    expect(after.valid).toBe(true);
    expect(after.missingFields).toEqual(before.missingFields);
  });

  it("12. CUSTOM (IsDefault=0) required dropdown field: reset deactivates the custom section/field (no switch of a default-required field)", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");

    const sectionId = await createCustomSection(db, "Custom Required", "custom_required", 95);
    const customFieldId = await createRequiredField(db, sectionId, "custom_req_value");
    await FieldOptionRepository.create({
      FieldID: customFieldId,
      OptionLabel: "CustomOK",
      OptionValue: "CustomOK",
      DisplayOrder: 1,
    });

    const defaultFieldRows = await db.getAllAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM InspectionFields WHERE FieldKey = 'foundation_cond'`
    );
    expect(defaultFieldRows[0].cnt).toBe(1);

    await ResetRepository.performReset();

    const customField = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionFields WHERE FieldKey = 'custom_req_value' ORDER BY FieldID ASC LIMIT 1"
    );
    expect(customField!.IsActive).toBe(0);

    const customSections = await db.getAllAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM InspectionSections WHERE SectionKey = 'custom_required' AND IsActive = 1`
    );
    expect(customSections[0].cnt).toBe(0);

    const defaultFieldStillOne = await db.getAllAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM InspectionFields WHERE FieldKey = 'foundation_cond'`
    );
    expect(defaultFieldStillOne[0].cnt).toBe(1);

    const restoredDefault = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionFields WHERE FieldKey = 'foundation_cond' ORDER BY FieldID ASC LIMIT 1"
    );
    expect(restoredDefault!.IsActive).toBe(1);
  });

  it("13. NEW inspection after delete+reset seeds and validates identically; no duplicate field rows", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const sectionId = (await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'pole_structure'"
    ))!.SectionID;

    await SectionRepository.softDeleteSection(sectionId);
    await ResetRepository.performReset();

    const freshId = await createInspection("2026-09-17");
    await seedAllRequired(db, freshId);
    await seedValue(db, freshId, await fieldId(db, "foundation_cond"), "Acceptable");

    const v = await validate(db, freshId);
    expect(v.valid).toBe(true);

    const foundationRows = await db.getAllAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM InspectionFields WHERE FieldKey = 'foundation_cond'`
    );
    expect(foundationRows[0].cnt).toBe(1);

    const sectionRows = await db.getAllAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM InspectionSections WHERE SectionKey = 'pole_structure'`
    );
    expect(sectionRows[0].cnt).toBe(1);
  });
});