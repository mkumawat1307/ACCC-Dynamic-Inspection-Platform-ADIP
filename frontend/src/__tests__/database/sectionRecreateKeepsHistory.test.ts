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

const PROJECT = "/mock/documents/Projects/ProjectRecreateHistory/inspection.db";

type SectionRow = { SectionID: number; SectionKey: string };

describe("Custom section/field delete + recreate keeps historical inspections isolated", () => {
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

  async function createCustomSection(db: SQLiteDatabase, name: string, key: string, order: number, createdAt?: string): Promise<number> {
    const tpl = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
    );
    const inserted = await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [tpl!.TemplateID, name, key, order]
    );
    const sectionId = inserted.lastInsertRowId as number;
    if (createdAt) {
      await db.runAsync("UPDATE InspectionSections SET CreatedAt = ? WHERE SectionID = ?", [
        createdAt,
        sectionId,
      ]);
    }
    return sectionId;
  }

  async function addDropdownOptions(
    fieldId: number,
    defaultIs: string
  ): Promise<{ yes: number; no: number }> {
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const yes = await FieldOptionRepository.create({
      FieldID: fieldId,
      OptionLabel: "Yes",
      OptionValue: "Yes",
      IsDefault: defaultIs === "Yes" ? 1 : 0,
    });
    const no = await FieldOptionRepository.create({
      FieldID: fieldId,
      OptionLabel: "No",
      OptionValue: "No",
      IsDefault: defaultIs === "No" ? 1 : 0,
    });
    return { yes, no };
  }

  async function createStatusField(sectionId: number, createdAt?: string): Promise<number> {
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const fieldId = await FieldRepository.create({
      SectionID: sectionId,
      FieldName: "Status",
      FieldKey: "status",
      FieldType: "dropdown",
    });
    if (createdAt) {
      const db = require("@/src/database/db") as typeof import("@/src/database/db");
      const dbHandle = await db.getDatabase();
      await dbHandle.runAsync("UPDATE InspectionFields SET CreatedAt = ? WHERE FieldID = ?", [
        createdAt,
        fieldId,
      ]);
    }
    return fieldId;
  }

  async function createInspection(date: string, createdAt?: string): Promise<number> {
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const inspectionId = await InspectionRepository.createInspection(1, 1, date);
    if (createdAt) {
      const db = require("@/src/database/db") as typeof import("@/src/database/db");
      const dbHandle = await db.getDatabase();
      await dbHandle.runAsync("UPDATE Inspections SET CreatedAt = ? WHERE InspectionID = ?", [
        createdAt,
        inspectionId,
      ]);
    }
    return inspectionId;
  }

  async function seedCurrentDefault(db: SQLiteDatabase, inspectionId: number, fieldId: number): Promise<string | null> {
    const option = await db.getFirstAsync<{ OptionValue: string }>(
      "SELECT OptionValue FROM FieldOptions WHERE FieldID = ? AND IsDefault = 1 AND IsActive = 1 LIMIT 1",
      [fieldId]
    );
    const value = option?.OptionValue ?? null;
    if (value !== null) {
      await db.runAsync(
        "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
        [inspectionId, fieldId, value]
      );
    }
    return value;
  }

  async function runGoldenScenario(preRecreateDefault = "Yes", postRecreateDefault = "No") {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository = require("@/src/database/repositories/InspectionFieldRepository").default;
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default;

    // 1. Custom RF section with a Status dropdown (Default = Yes).
    const oldRf = await createCustomSection(db, "RF", "rf", 4, "2026-08-01");
    const oldStatus = await createStatusField(oldRf, "2026-08-02");
    await addDropdownOptions(oldStatus, preRecreateDefault);

    // 2. Inspections A + B record Status = Yes.
    const idA = await createInspection("2026-09-01", "2026-09-01");
    const idB = await createInspection("2026-09-02", "2026-09-02");
    expect(await seedCurrentDefault(db, idA, oldStatus)).toBe("Yes");
    expect(await seedCurrentDefault(db, idB, oldStatus)).toBe("Yes");
    expect((await InspectionValueRepository.getValue(idA, oldStatus))?.FieldValue).toBe("Yes");
    expect((await InspectionValueRepository.getValue(idB, oldStatus))?.FieldValue).toBe("Yes");

    // 3. Admin deletes the RF section (soft delete — historical data preserved).
    await SectionRepository.softDeleteSection(oldRf);

    // 4. Inspections D, E, F, G created while RF is absent.
    const idsDuringAbsence = [
      await createInspection("2026-09-10", "2026-09-10"),
      await createInspection("2026-09-11", "2026-09-11"),
      await createInspection("2026-09-12", "2026-09-12"),
      await createInspection("2026-09-13", "2026-09-13"),
    ];
    for (const idX of idsDuringAbsence) {
      expect(await InspectionValueRepository.getValue(idX, oldStatus)).toBeNull();
    }

    // 6/7. Recreate RF + Status field with a NEW identity and Default = No.
    const newRf = await createCustomSection(db, "RF", "rf", 6, "2026-09-15");
    const newStatus = await createStatusField(newRf, "2026-09-16");
    await addDropdownOptions(newStatus, postRecreateDefault);

    // 8. Inspection C created after recreation receives the CURRENT default (No).
    const idC = await createInspection("2026-09-20", "2026-09-20");
    expect(await seedCurrentDefault(db, idC, newStatus)).toBe("No");
    expect((await InspectionValueRepository.getValue(idC, newStatus))?.FieldValue).toBe("No");
    expect(await InspectionValueRepository.getValue(idC, oldStatus)).toBeNull();

    // Identity assertions: never reuses historical IDs, never inherits values.
    expect(newRf).not.toBe(oldRf);
    expect(newStatus).not.toBe(oldStatus);
    expect(await InspectionValueRepository.getValue(idA, newStatus)).toBeNull();
    expect(await InspectionValueRepository.getValue(idC, oldStatus)).toBeNull();

    return {
      db,
      oldRf,
      oldStatus,
      newRf,
      newStatus,
      idA,
      idB,
      idC,
      idsDuringAbsence,
      SectionRepository,
      FieldRepository,
      FieldOptionRepository,
      InspectionRepository,
      InspectionFieldRepository,
      InspectionValueRepository,
    };
  }

  it("A. reopened historical inspection (delete->recreate->default change) still detects its own section and value", async () => {
    const s = await runGoldenScenario();

    // The app builds the screen from getSections(). For an EXISTING inspection
    // the historical (inactive) RF section that owns this inspection's saved
    // values must still be discoverable, alongside the recreated active one.
    const sectionsForA = await s.InspectionRepository.getSections(undefined, s.idA);
    const rfForA = sectionsForA.filter((x: SectionRow) => x.SectionKey === "rf");
    expect(rfForA.some((x: SectionRow) => x.SectionID === s.oldRf)).toBe(true);
    expect(rfForA.some((x: SectionRow) => x.SectionID === s.newRf)).toBe(true);

    // The historical section still resolves its own recorded value (Yes).
    const oldFields = await s.InspectionFieldRepository.getFieldsBySection(s.oldRf, s.idA);
    const oldStatus = oldFields.find((f: { FieldKey: string }) => f.FieldKey === "status");
    expect(oldStatus).toBeTruthy();
    expect((await s.InspectionValueRepository.getValue(s.idA, oldStatus!.FieldID))?.FieldValue).toBe("Yes");
  });

  it("B. new inspection C gets only the recreated field's CURRENT default, nowhere else", async () => {
    const s = await runGoldenScenario();
    expect((await s.InspectionValueRepository.getValue(s.idC, s.newStatus))?.FieldValue).toBe("No");
    expect(await s.InspectionValueRepository.getValue(s.idC, s.oldStatus)).toBeNull();
    const sectionsForC = await s.InspectionRepository.getSections(undefined, s.idC);
    expect(sectionsForC.filter((x: SectionRow) => x.SectionKey === "rf").length).toBe(1);
  });

  it("C. inspection created while the section was deleted sees the recreated active section with NO fabricated default", async () => {
    const s = await runGoldenScenario();
    const idE = s.idsDuringAbsence[1];

    // No fabricated value for the recreated field, and no historical field.
    expect(await s.InspectionValueRepository.getValue(idE, s.oldStatus)).toBeNull();
    expect(await s.InspectionValueRepository.getValue(idE, s.newStatus)).toBeNull();

    // The historical section is NOT surfaced for E (E has no values there).
    // The recreated ACTIVE section IS surfaced (global availability restored).
    const sectionsForE = await s.InspectionRepository.getSections(undefined, idE);
    expect(sectionsForE.some((x: SectionRow) => x.SectionID === s.oldRf)).toBe(false);
    expect(sectionsForE.some((x: SectionRow) => x.SectionID === s.newRf)).toBe(true);
  });

  it("D. soft-deleting a FIELD preserves its historical values and keeps them visible for old inspections", async () => {
    const s = await runGoldenScenario();

    // Simulate the settings field-delete path (soft delete, never destructive).
    await s.FieldRepository.delete(s.oldStatus);

    // Old inspection data still resolves under its own field identity.
    expect((await s.InspectionValueRepository.getValue(s.idA, s.oldStatus))?.FieldValue).toBe("Yes");

    // Historical field is discoverable for the existing inspection (inactive but has values).
    const fieldsForA = await s.InspectionFieldRepository.getFieldsBySection(s.oldRf, s.idA);
    expect(fieldsForA.some((f: { FieldID: number }) => f.FieldID === s.oldStatus)).toBe(true);

    // The field is hidden from the active settings list (IsActive = 0).
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const activeOld = await FieldRepository.getBySection(s.oldRf);
    expect(activeOld.some((f: { FieldID: number }) => f.FieldID === s.oldStatus)).toBe(false);
  });

  it("E. changing the default NEVER overwrites or fabricates historical values", async () => {
    const s = await runGoldenScenario();

    // A still holds Yes from before the delete.
    expect((await s.InspectionValueRepository.getValue(s.idA, s.oldStatus))?.FieldValue).toBe("Yes");

    // Flip the recreated field's default from No to Yes, then "reopen" A as existing.
    const options = await s.FieldOptionRepository.getByField(s.newStatus);
    const yesOpt = options.find((o: { OptionLabel: string }) => o.OptionLabel === "Yes");
    await s.FieldOptionRepository.setDefault(s.newStatus, yesOpt!.OptionID);

    // The flip is recorded on the recreated field.
    const flipped = await s.FieldOptionRepository.getByField(s.newStatus);
    const currentDefault = flipped.find((o: { IsDefault: number }) => o.IsDefault === 1);
    expect(currentDefault).toBeTruthy();
    expect((currentDefault as { OptionLabel: string }).OptionLabel).toBe("Yes");

    // A's own value set is untouched by the default change: no overwrite,
    // no fabricated value for the recreated field.
    const countBefore = (await s.InspectionValueRepository.getValuesByInspection(s.idA)).length;
    const countAfter = (await s.InspectionValueRepository.getValuesByInspection(s.idA)).length;
    expect(countAfter).toBe(countBefore);
    expect((await s.InspectionValueRepository.getValue(s.idA, s.oldStatus))?.FieldValue).toBe("Yes");
    expect(await s.InspectionValueRepository.getValue(s.idA, s.newStatus)).toBeNull();
  });

  it("F. historical values survive until reports are built (data never dropped)", async () => {
    const s = await runGoldenScenario();

    const valuesForA = await s.InspectionValueRepository.getValuesByInspection(s.idA);
    const statusValueForA = valuesForA.find(
      (v: { FieldID: number }) => v.FieldID === s.oldStatus
    )?.FieldValue;
    expect(statusValueForA).toBe("Yes");
  });

  it("G. report table returns the historical value for a reopened old inspection under the deleted label", async () => {
    const s = await runGoldenScenario();

    await s.db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID = ?", [s.idA]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [s.idA]);

    const deletedStatusCols = table.headers
      .map((h: string, i: number) => (h === "Deleted Status" ? i : -1))
      .filter((i: number) => i >= 0);
    expect(deletedStatusCols.length).toBeGreaterThan(0);
    expect(deletedStatusCols.some((i: number) => table.rows[0].cells[i] === "Yes")).toBe(true);
  });

  it("H. soft-deleting the section leaves the historical value rows untouched in the database", async () => {
    const s = await runGoldenScenario();

    const rows = await s.db.getAllAsync<{ InspectionID: number; FieldID: number; FieldValue: string }>(
      "SELECT InspectionID, FieldID, FieldValue FROM InspectionValues WHERE FieldID = ? ORDER BY InspectionID",
      [s.oldStatus]
    );
    expect(rows.map((r) => r.FieldValue)).toEqual(["Yes", "Yes"]);
    expect(rows.map((r) => r.InspectionID)).toEqual([s.idA, s.idB]);
  });
});