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
  writeAsStringAsync: jest.fn().mockResolvedValue(""),
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

const PROJECT = "/mock/documents/Projects/DropdownHistory/inspection.db";

describe("Dropdown options for deleted/historical fields", () => {
  beforeEach(() => {
    jest.resetModules();
  });

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
    const db: SQLiteDatabase = await dbModule.getDatabase();
    return { db };
  }

  async function createInspection(date: string): Promise<number> {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    return InspectionRepository.createInspection(1, 1, date);
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

  async function createDropdownField(db: SQLiteDatabase, sectionId: number, key: string): Promise<number> {
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    return FieldRepository.create({
      SectionID: sectionId,
      FieldName: key,
      FieldKey: key,
      FieldType: "dropdown",
    });
  }

  async function addOption(db: SQLiteDatabase, fieldId: number, value: string, order: number, isDefault = 0): Promise<number> {
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    return FieldOptionRepository.create({
      FieldID: fieldId,
      OptionLabel: value,
      OptionValue: value,
      IsDefault: isDefault,
      DisplayOrder: order,
    });
  }

  async function seedValue(db: SQLiteDatabase, inspectionId: number, fieldId: number, value: string): Promise<void> {
    await db.runAsync(
      "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
      [inspectionId, fieldId, value]
    );
  }

  function optionValues(opts: unknown[] | undefined): string[] {
    return (opts ?? []).map((o) => (o as { OptionValue: string }).OptionValue);
  }

  it("1. active field + active options -> all active options returned for an inspection", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "A", "a", 90);
    const fieldId = await createDropdownField(db, sectionId, "a_status");
    await addOption(db, fieldId, "One", 1);
    await addOption(db, fieldId, "Two", 2);
    const inspectionId = await createInspection("2026-09-01");

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["One", "Two"]);
  });

  it("2. active field: inactive (deleted) option that was SAVED stays present", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "B", "b", 90);
    const fieldId = await createDropdownField(db, sectionId, "b_status");
    await addOption(db, fieldId, "Live", 1);
    const deadId = await addOption(db, fieldId, "Dead", 2);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, fieldId, "Dead");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.delete(deadId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Live", "Dead"]);
  });

  it("3. active field: inactive option that is NOT saved is excluded", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "C", "c", 90);
    const fieldId = await createDropdownField(db, sectionId, "c_status");
    await addOption(db, fieldId, "Live", 1);
    const deadId = await addOption(db, fieldId, "Dead", 2);
    const inspectionId = await createInspection("2026-09-01");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.delete(deadId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Live"]);
  });

  it("4. deleted field with saved value -> FULL historical option set, including deleted options", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "D", "d", 90);
    const fieldId = await createDropdownField(db, sectionId, "d_status");
    await addOption(db, fieldId, "Opt A", 1);
    const deadId = await addOption(db, fieldId, "Opt B", 2);
    await addOption(db, fieldId, "Opt C", 3);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, fieldId, "Opt B");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldRepository.delete(fieldId);
    await FieldOptionRepository.delete(deadId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Opt A", "Opt B", "Opt C"]);
  });

  it("5. deleted field full set preserves OptionValue and DisplayOrder ordering", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "E", "e", 90);
    const fieldId = await createDropdownField(db, sectionId, "e_status");
    await addOption(db, fieldId, "Zeta", 10);
    await addOption(db, fieldId, "Alpha", 5);
    await addOption(db, fieldId, "Mid", 7);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, fieldId, "Mid");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    await FieldRepository.delete(fieldId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("6. deleted field with NO saved value in the inspection -> not present in the option map", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "F", "f", 90);
    const fieldId = await createDropdownField(db, sectionId, "f_status");
    await addOption(db, fieldId, "Unused", 1);
    const inspectionId = await createInspection("2026-09-01");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    await FieldRepository.delete(fieldId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(opts.has(fieldId)).toBe(false);
  });

  it("7. deleted field + separate active field in same section: active one keeps normal filtering, deleted one full", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "G", "g", 90);
    const activeId = await createDropdownField(db, sectionId, "g_active");
    await addOption(db, activeId, "Live", 1);
    const goneId = await addOption(db, activeId, "Gone", 2);
    const deletedId = await createDropdownField(db, sectionId, "g_deleted");
    await addOption(db, deletedId, "Old A", 1);
    await addOption(db, deletedId, "Old B", 2);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, deletedId, "Old B");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldRepository.delete(deletedId);
    await FieldOptionRepository.delete(goneId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(activeId))).toEqual(["Live"]);
    expect(optionValues(opts.get(deletedId))).toEqual(["Old A", "Old B"]);
  });

  it("8. no inspectionId (edit-config context) -> only active fields with ACTIVE options", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "H", "h", 90);
    const fieldId = await createDropdownField(db, sectionId, "h_status");
    await addOption(db, fieldId, "Keep", 1);
    const deadId = await addOption(db, fieldId, "Drop", 2);
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.delete(deadId);
    const deletedFieldId = await createDropdownField(db, sectionId, "h_deleted");
    await addOption(db, deletedFieldId, "Hidden", 1);
    await FieldRepository.delete(deletedFieldId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Keep"]);
    expect(opts.has(deletedFieldId)).toBe(false);
  });

  it("9. deleted field with an EMPTY saved value still shows the full historical set", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "I", "i", 90);
    const fieldId = await createDropdownField(db, sectionId, "i_status");
    await addOption(db, fieldId, "P1", 1);
    await addOption(db, fieldId, "P2", 2);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, fieldId, "");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    await FieldRepository.delete(fieldId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["P1", "P2"]);
  });

  it("10. ACTIVE field with every option deleted -> empty option list (not absent from map)", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "J", "j", 90);
    const fieldId = await createDropdownField(db, sectionId, "j_status");
    const optA = await addOption(db, fieldId, "D1", 1);
    const optB = await addOption(db, fieldId, "D2", 2);
    const inspectionId = await createInspection("2026-09-01");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.delete(optA);
    await FieldOptionRepository.delete(optB);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual([]);
  });

  it("11. deleted field where the SAVED option row itself is inactive: still full set", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "K", "k", 90);
    const fieldId = await createDropdownField(db, sectionId, "k_status");
    await addOption(db, fieldId, "Saved", 1);
    await addOption(db, fieldId, "Other", 2);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, fieldId, "Saved");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    await FieldRepository.delete(fieldId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Saved", "Other"]);
  });

  it("12. active field with a saved inactive option keeps ONLY the saved inactive (others excluded)", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "L", "l", 90);
    const fieldId = await createDropdownField(db, sectionId, "l_status");
    await addOption(db, fieldId, "Live", 1);
    const savedId = await addOption(db, fieldId, "KeptSaved", 2);
    const droppedId = await addOption(db, fieldId, "Dropped", 3);
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, fieldId, "KeptSaved");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.delete(savedId);
    await FieldOptionRepository.delete(droppedId);

    const IFR: typeof import("@/src/database/repositories/InspectionFieldRepository").default =
      require("@/src/database/repositories/InspectionFieldRepository").default;
    const opts = await IFR.getFieldOptionsBySection(sectionId, inspectionId);
    expect(optionValues(opts.get(fieldId))).toEqual(["Live", "KeptSaved"]);
  });
});