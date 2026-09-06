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

const PROJECT = "/mock/documents/Projects/MandatoryValidateRepro/inspection.db";

type SectionRow = { SectionID: number; SectionKey: string; IsActive?: number };
type FieldRow = { FieldID: number; FieldKey: string; FieldName: string; IsActive: number };

describe("mandatory validation survives delete default section + reset (REPRO)", () => {
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

  async function seedAllRequired(db: SQLiteDatabase, inspectionId: number): Promise<void> {
    const required = await db.getAllAsync<{ FieldID: number; FieldKey: string; FieldType: string; DataSourceType: string | null }>(
      `SELECT FieldID, FieldKey, FieldType, DataSourceType
       FROM InspectionFields
       WHERE IsRequired = 1 AND IsActive = 1 AND IsVisible = 1`
    );
    for (const f of required) {
      if (["date", "division", "district", "foundation_cond"].includes(f.FieldKey)) continue;
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

  it("A. exact user flow: mandatory dropdown saved -> delete default section -> another inspection -> reset -> reopen original -> validate", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const InspectionValueRepository: typeof import("@/src/database/repositories/InspectionValueRepository").default = require("@/src/database/repositories/InspectionValueRepository").default;

    const field = await db.getFirstAsync<{ FieldID: number; SectionID: number; IsRequired: number }>(
      "SELECT FieldID, SectionID, IsRequired FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    expect(field).toBeTruthy();
    expect(field!.IsRequired).toBe(1);
    const sectionId = field!.SectionID;

    const inspectionId = await createInspection("2026-09-01");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, field!.FieldID, "Acceptable");
    expect((await InspectionValueRepository.getValue(inspectionId, field!.FieldID))?.FieldValue).toBe("Acceptable");

    const beforeValidation = await InspectionRepository.validateInspection(inspectionId);
    expect(beforeValidation.valid).toBe(true);

    await SectionRepository.softDeleteSection(sectionId);

    const midInspectionId = await createInspection("2026-09-02");
    const midSections = await InspectionRepository.getSections(undefined, midInspectionId);
    expect(midSections.some((s: SectionRow) => s.SectionID === sectionId)).toBe(false);

    await ResetRepository.performReset();

    const restored = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [sectionId]
    );
    expect(restored!.IsActive).toBe(1);

    const sections = await InspectionRepository.getSections(undefined, inspectionId);
    expect(sections.some((s: SectionRow) => s.SectionID === sectionId && s.IsActive === 1)).toBe(true);

    const fields = await InspectionFieldRepository.getFieldsBySection(sectionId, inspectionId);
    const fieldRow = fields.find((f: FieldRow) => f.FieldKey === "foundation_cond");
    expect(fieldRow).toBeTruthy();
    expect(fieldRow!.FieldID).toBe(field!.FieldID);

    const opts = await InspectionFieldRepository.getFieldOptionsBySection(sectionId, inspectionId);
    expect((opts.get(field!.FieldID) ?? []).map((o) => o.OptionValue)).toContain("Acceptable");

    const editorValues = await InspectionValueRepository.getValuesByInspection(inspectionId);
    const dbValue = editorValues.find((v: { FieldID: number }) => v.FieldID === field!.FieldID);
    expect(dbValue?.FieldValue).toBe("Acceptable");

    const keys = await InspectionFieldRepository.getInspectionValues(inspectionId);
    expect(keys["foundation_cond"]).toBe("Acceptable");

    const validation = await InspectionRepository.validateInspection(inspectionId);
    expect(validation.valid).toBe(true);
    expect(validation.missingFields).not.toContain("Foundation Condition");
    expect(validation.missingFields.filter((f) => !beforeValidation.missingFields.includes(f))).toEqual([]);
  });

  it("B. same flow but the deleted default FIELD is also soft-deleted before reset", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const InspectionValueRepository: typeof import("@/src/database/repositories/InspectionValueRepository").default = require("@/src/database/repositories/InspectionValueRepository").default;

    const field = await db.getFirstAsync<{ FieldID: number; SectionID: number }>(
      "SELECT FieldID, SectionID FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    const sectionId = field!.SectionID;
    const fieldId = field!.FieldID;

    const inspectionId = await createInspection("2026-09-03");
    await seedAllRequired(db, inspectionId);
    await seedValue(db, inspectionId, fieldId, "Minor Damage");

    const beforeValidation = await InspectionRepository.validateInspection(inspectionId);
    expect(beforeValidation.valid).toBe(true);

    await SectionRepository.softDeleteSection(sectionId);
    await FieldRepository.delete(fieldId);
    await ResetRepository.performReset();

    const restoredField = await db.getFirstAsync<{ IsActive: number; FieldID: number }>(
      "SELECT FieldID, IsActive FROM InspectionFields WHERE FieldKey = 'foundation_cond' LIMIT 1"
    );
    expect(restoredField!.IsActive).toBe(1);

    const sections = await InspectionRepository.getSections(undefined, inspectionId);
    const poleSec = sections.find((s: SectionRow) => s.SectionID === sectionId);
    expect(poleSec).toBeTruthy();

    const fields = await InspectionFieldRepository.getFieldsBySection(sectionId, inspectionId);
    const fieldRow = fields.find((f: FieldRow) => f.FieldKey === "foundation_cond");
    expect(fieldRow).toBeTruthy();

    const dbValue = await InspectionValueRepository.getValue(inspectionId, restoredField!.FieldID);
    const editorValues = await InspectionValueRepository.getValuesByInspection(inspectionId);

    const validation = await InspectionRepository.validateInspection(inspectionId);
    expect(validation.valid).toBe(true);
    expect(validation.missingFields).not.toContain("Foundation Condition");
    expect(validation.missingFields.filter((f) => !beforeValidation.missingFields.includes(f))).toEqual([]);
    expect(editorValues.length).toBeGreaterThan(0);
  });

  it("C. inspection created WHILE definitions deleted -> reset -> reopen existing -> staged mandatory option must validate (session overlay) and commit", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const InspectionValueRepository: typeof import("@/src/database/repositories/InspectionValueRepository").default = require("@/src/database/repositories/InspectionValueRepository").default;
    const { InspectionEditSession } = require("@/src/database/repositories/InspectionEditSession") as typeof import("@/src/database/repositories/InspectionEditSession");

    const foundation = await db.getFirstAsync<{ FieldID: number; SectionID: number; IsRequired: number }>(
      "SELECT FieldID, SectionID, IsRequired FROM InspectionFields WHERE FieldKey = 'foundation_cond'"
    );
    expect(foundation).toBeTruthy();
    expect(foundation!.IsRequired).toBe(1);
    const sectionId = foundation!.SectionID;
    const foundationId = foundation!.FieldID;

    // DELETE default definitions (section + its fields) BEFORE any inspection exists
    await SectionRepository.softDeleteSection(sectionId);
    const sectionFields = await db.getAllAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE SectionID = ?",
      [sectionId]
    );
    for (const f of sectionFields) {
      await FieldRepository.delete(f.FieldID);
    }

    // Create a NEW inspection WHILE the definitions are deleted
    const inspectionId = await createInspection("2026-09-05");
    await seedAllRequired(db, inspectionId);

    // The mandatory field is absent: no saved value row exists
    expect((await InspectionValueRepository.getValue(inspectionId, foundationId))?.FieldValue ?? null).toBeNull();

    // Reset to Default restores the section, field (same FieldID) and options
    await ResetRepository.performReset();

    const restored = await db.getFirstAsync<{ FieldID: number; IsActive: number }>(
      "SELECT FieldID, IsActive FROM InspectionFields WHERE FieldKey = 'foundation_cond' LIMIT 1"
    );
    expect(restored!.IsActive).toBe(1);
    expect(restored!.FieldID).toBe(foundationId);

    const sections = await InspectionRepository.getSections(undefined, inspectionId);
    expect(sections.some((s: SectionRow) => s.SectionID === sectionId && s.IsActive === 1)).toBe(true);

    const options = await InspectionFieldRepository.getFieldOptionsBySection(sectionId, inspectionId);
    expect((options.get(foundationId) ?? []).map((o) => o.OptionValue)).toContain("Acceptable");

    // Reopen the existing inspection (edit session) and pick the restored
    // MANDATORY option; with the session active this is staged, not written.
    InspectionEditSession.activate(inspectionId);
    await InspectionValueRepository.saveValue(inspectionId, foundationId, "Acceptable");

    // The restored required sibling and a non-mandatory restored field are
    // also filled (all staged together, as in the real form).
    const poleAvail = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_avail' AND IsActive = 1 LIMIT 1"
    );
    let poleAvailOption: string | null = null;
    if (poleAvail) {
      poleAvailOption = (options.get(poleAvail.FieldID) ?? [])[0]?.OptionValue ?? null;
      if (poleAvailOption != null) {
        await InspectionValueRepository.saveValue(inspectionId, poleAvail.FieldID, poleAvailOption);
      }
    }
    const poleStatus = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_status' AND IsActive = 1 LIMIT 1"
    );
    let poleStatusOption: string | null = null;
    if (poleStatus) {
      poleStatusOption = (options.get(poleStatus.FieldID) ?? [])[0]?.OptionValue ?? null;
      if (poleStatusOption != null) {
        await InspectionValueRepository.saveValue(inspectionId, poleStatus.FieldID, poleStatusOption);
      }
    }

    // Nothing staged has reached the DB yet
    expect((await InspectionValueRepository.getValue(inspectionId, foundationId))?.FieldValue ?? null).toBeNull();

    // Regression: with the session active, validation auto-overlays the staged
    // values, so the selected mandatory options are seen without any caller
    // having to pass the staged map explicitly (Save would pass).
    const result = await InspectionRepository.validateInspection(inspectionId);
    expect(result.valid).toBe(true);
    expect(result.missingFields.filter((f) => f === "Foundation Condition" || f === "Pole Availability")).toEqual([]);

    // Save path: validation passed -> commit persists every staged value
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);
    expect((await InspectionValueRepository.getValue(inspectionId, foundationId))?.FieldValue).toBe("Acceptable");
    if (poleAvailOption != null) {
      expect((await InspectionValueRepository.getValue(inspectionId, poleAvail!.FieldID))?.FieldValue).toBe(poleAvailOption);
    }
    if (poleStatusOption != null) {
      expect((await InspectionValueRepository.getValue(inspectionId, poleStatus!.FieldID))?.FieldValue).toBe(poleStatusOption);
    }
    expect(InspectionEditSession.isActive(inspectionId)).toBe(false);

    const finalValidation = await InspectionRepository.validateInspection(inspectionId);
    expect(finalValidation.valid).toBe(true);
  });
});