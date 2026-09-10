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
  deletePhoto: jest.fn().mockResolvedValue(undefined),
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

const PROJECT = "/mock/documents/Projects/ProjectCustomLifecycle/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectCustomLifecycleIsolation/inspection.db";

type SectionRow = { SectionID: number; SectionKey: string; IsActive?: number };
type FieldRow = { FieldID: number; FieldKey: string; FieldName: string; IsActive: number };

describe("Custom section/field lifecycle — delete/recreate global availability", () => {
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

  // NOTE: the in-memory mock does NOT apply table column defaults, so every
  // visible column used later (IsVisible, IsRepeatable, ...) must be inserted
  // explicitly.
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

  async function addDropdownOptions(
    fieldId: number,
    defaultIs: string
  ): Promise<void> {
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    await FieldOptionRepository.create({
      FieldID: fieldId,
      OptionLabel: "Yes",
      OptionValue: "Yes",
      IsDefault: defaultIs === "Yes" ? 1 : 0,
    });
    await FieldOptionRepository.create({
      FieldID: fieldId,
      OptionLabel: "No",
      OptionValue: "No",
      IsDefault: defaultIs === "No" ? 1 : 0,
    });
  }

  async function createStatusField(sectionId: number): Promise<number> {
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    return FieldRepository.create({
      SectionID: sectionId,
      FieldName: "Status",
      FieldKey: "status",
      FieldType: "dropdown",
    });
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

  // Fixture: custom "RF" section + Status dropdown; inspection A records Status = Yes;
  // section soft-deleted; recreated as newRf + newStatus with Default = No; inspection C records No.
  async function setupDeleteRecreateScenario(): Promise<{
    db: SQLiteDatabase;
    oldRf: number;
    oldStatus: number;
    newRf: number;
    newStatus: number;
    idA: number;
    idC: number;
  }> {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");

    const oldRf = await createCustomSection(db, "RF", "rf", 4);
    const oldStatus = await createStatusField(oldRf);
    await addDropdownOptions(oldStatus, "Yes");

    const idA = await createInspection("2026-09-01");
    await seedValue(db, idA, oldStatus, "Yes");

    await SectionRepository.softDeleteSection(oldRf);

    const newRf = await createCustomSection(db, "RF", "rf", 6);
    const newStatus = await createStatusField(newRf);
    await addDropdownOptions(newStatus, "No");

    const idC = await createInspection("2026-09-20");
    await seedValue(db, idC, newStatus, "No");

    return { db, oldRf, oldStatus, newRf, newStatus, idA, idC };
  }

  it("1. recreated active section is globally available to a new inspection", async () => {
    const s = await setupDeleteRecreateScenario();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const sections = await InspectionRepository.getSections(undefined, s.idC);
    const rf = sections.filter((x: SectionRow) => x.SectionKey === "rf");
    expect(rf.some((x: SectionRow) => x.SectionID === s.newRf)).toBe(true);
    expect(rf.every((x: SectionRow) => x.IsActive === 1)).toBe(true);
  });

  it("2. old inspection sees BOTH the deleted historical section and the recreated active one (no shadowing)", async () => {
    const s = await setupDeleteRecreateScenario();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const sections = await InspectionRepository.getSections(undefined, s.idA);
    const rf = sections.filter((x: SectionRow) => x.SectionKey === "rf");
    expect(rf.some((x: SectionRow) => x.SectionID === s.oldRf && x.IsActive === 0)).toBe(true);
    expect(rf.some((x: SectionRow) => x.SectionID === s.newRf && x.IsActive === 1)).toBe(true);
  });

  it("3. inspection created mid-absence sees only the recreated active section", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const oldRf = await createCustomSection(db, "RF", "rf", 4);
    const oldStatus = await createStatusField(oldRf);
    await addDropdownOptions(oldStatus, "Yes");

    await SectionRepository.softDeleteSection(oldRf);

    const newRf = await createCustomSection(db, "RF", "rf", 6);
    await createStatusField(newRf);

    const idMidMissing = await createInspection("2026-09-12");
    const sections = await InspectionRepository.getSections(undefined, idMidMissing);
    const rf = sections.filter((x: SectionRow) => x.SectionKey === "rf");
    expect(rf.some((x: SectionRow) => x.SectionID === oldRf)).toBe(false);
    expect(rf.some((x: SectionRow) => x.SectionID === newRf && x.IsActive === 1)).toBe(true);

    void oldStatus;
  });

  it("4. never-used-then-deleted section produces NO columns and is never surfaced", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const unusedSection = await createCustomSection(db, "Unused", "unused", 12);
    await createStatusField(unusedSection);
    const idX = await createInspection("2026-09-05");

    const poleAvail = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_avail'"
    );
    await seedValue(db, idX, poleAvail!.FieldID, "Yes");

    await SectionRepository.softDeleteSection(unusedSection);

    const sections = await InspectionRepository.getSections(undefined, idX);
    expect(sections.some((x: SectionRow) => x.SectionID === unusedSection)).toBe(false);

    await db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID = ?", [idX]);
    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [idX]);
    expect(table.headers.some((h: string) => h.includes("Deleted"))).toBe(false);
    expect(table.sections.some((x: { name: string }) => x.name === "Deleted Unused")).toBe(false);
  });

  it("6. a deleted field's orphan column disappears when the report scope holds no value for it", async () => {
    const s = await setupDeleteRecreateScenario();
    await s.db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID IN (?, ?)", [s.idA, s.idC]);

    const { buildReportTable } = require("@/src/utils/exportData");

    const tableOnlyC = await buildReportTable(1, [s.idC]);
    expect(tableOnlyC.headers.some((h: string) => h === "Deleted Status")).toBe(false);

    const tableA = await buildReportTable(1, [s.idA]);
    expect(tableA.headers.some((h: string) => h === "Deleted Status")).toBe(true);
  });

  it("7. reset restores a deleted non-locked default section (earthing) to canonical config", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const earthing = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'earthing'"
    );
    await SectionRepository.softDeleteSection(earthing!.SectionID);

    await ResetRepository.performReset();

    const restored = await db.getFirstAsync<{ IsActive: number; IsDefault: number }>(
      "SELECT IsActive, IsDefault FROM InspectionSections WHERE SectionKey = 'earthing'"
    );
    expect(restored).toBeTruthy();
    expect(restored!.IsActive).toBe(1);
    expect(restored!.IsDefault).toBe(1);
  });

  it("8. reset never touches the locked sections' rows, fields or options", async () => {
    const { db } = await openSeededProject();
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    await db.runAsync("UPDATE InspectionSections SET SectionName = ? WHERE SectionKey = 'general_information'", ["Custom GI"]);
    await db.runAsync("DELETE FROM InspectionFields WHERE FieldKey = 'remarks'");

    await ResetRepository.performReset();

    const gi = await db.getFirstAsync<{ SectionName: string }>(
      "SELECT SectionName FROM InspectionSections WHERE SectionKey = 'general_information'"
    );
    expect(gi!.SectionName).toBe("Custom GI");

    const remarksField = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'remarks'"
    );
    expect(remarksField).toBeNull();
  });

  it("9. locked sections cannot be deleted (protected)", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository, SectionDeletionError } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");

    for (const key of ["general_information", "remarks", "photos"]) {
      const row = await db.getFirstAsync<{ SectionID: number }>(
        "SELECT SectionID FROM InspectionSections WHERE SectionKey = ?",
        [key]
      );
      await expect(SectionRepository.softDeleteSection(row!.SectionID)).rejects.toMatchObject({
        name: "SectionDeletionError",
        reason: "protected",
      });
      const still = await db.getFirstAsync<{ IsActive: number }>(
        "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
        [row!.SectionID]
      );
      expect(still!.IsActive).toBe(1);
    }
    void SectionDeletionError;
  });

  it("10. a non-locked default section CAN be soft-deleted", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");

    const meter = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'meter'"
    );
    await SectionRepository.softDeleteSection(meter!.SectionID);

    const after = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionID = ?",
      [meter!.SectionID]
    );
    expect(after!.IsActive).toBe(0);
  });

  it("11. a soft-deleted default section with historical values is surfaced for the old inspection (Deleted label state)", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");

    const meter = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'meter'"
    );
    const meterField = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE SectionID = ? LIMIT 1",
      [meter!.SectionID]
    );
    const idX = await createInspection("2026-09-01");
    await seedValue(db, idX, meterField!.FieldID, "Yes");

    await SectionRepository.softDeleteSection(meter!.SectionID);

    const sections = await InspectionRepository.getSections(undefined, idX);
    const meterSections = sections.filter((x: SectionRow) => x.SectionKey === "meter");
    expect(meterSections.some((x: SectionRow) => x.SectionID === meter!.SectionID && x.IsActive === 0)).toBe(true);
  });

  it("12. field-level delete inside a LIVE custom section preserves history and hides the field from active lists", async () => {
    const { db } = await openSeededProject();
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const InspectionFieldRepository = require("@/src/database/repositories/InspectionFieldRepository").default;

    const live = await createCustomSection(db, "Live", "live", 12);
    const fieldId = await createStatusField(live);
    const idX = await createInspection("2026-09-01");
    await seedValue(db, idX, fieldId, "Yes");

    await FieldRepository.delete(fieldId);

    const hidden = await FieldRepository.getBySection(live);
    expect(hidden.some((f: { FieldID: number }) => f.FieldID === fieldId)).toBe(false);

    const fieldsForX = await InspectionFieldRepository.getFieldsBySection(live, idX);
    const historical = fieldsForX.find((f: { FieldID: number }) => f.FieldID === fieldId);
    expect(historical).toBeTruthy();
    expect((historical as FieldRow).IsActive).toBe(0);
  });

  it("13. field-level delete inside a live section keeps its historical value in the report under 'Deleted Status'", async () => {
    const { db } = await openSeededProject();
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");

    const live = await createCustomSection(db, "Live", "live", 13);
    const fieldId = await createStatusField(live);
    const idX = await createInspection("2026-09-02");
    await seedValue(db, idX, fieldId, "Yes");
    await db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID = ?", [idX]);

    await FieldRepository.delete(fieldId);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [idX]);
    const cols = table.headers
      .map((h: string, i: number) => (h === "Deleted Status" ? i : -1))
      .filter((i: number) => i >= 0);
    expect(cols.length).toBe(1);
    expect(cols.some((i: number) => table.rows[0].cells[i] === "Yes")).toBe(true);
  });

  it("14. deleted section produces a 'Deleted RF' orphan band with a deleted flag", async () => {
    const s = await setupDeleteRecreateScenario();
    await s.db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID = ?", [s.idA]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [s.idA]);
    const labelBand = table.sections.find((x: { name: string }) => x.name === "Deleted RF");
    expect(labelBand).toBeTruthy();
    const deletedCol = labelBand!.columns.find((c: { label: string }) => c.label === "Deleted Status");
    expect(deletedCol).toBeTruthy();
    expect(deletedCol!.deleted).toBe(true);
  });

  it("15. deleting every inspection holding a historical value removes the orphan band", async () => {
    const s = await setupDeleteRecreateScenario();
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const { buildReportTable } = require("@/src/utils/exportData");

    await s.db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID = ?", [s.idA]);
    expect((await buildReportTable(1, [s.idA])).sections.some((x: { name: string }) => x.name === "Deleted RF")).toBe(true);

    await InspectionRepository.deleteInspection(s.idA);

    await s.db.runAsync("UPDATE Inspections SET Status = 'Completed' WHERE InspectionID = ?", [s.idC]);
    const after = await buildReportTable(1, [s.idC]);
    expect(after.sections.some((x: { name: string }) => x.name === "Deleted RF")).toBe(false);
  });

  it("17. recreating a deleted section with the same key does not resurrect historical data", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const InspectionValueRepository = require("@/src/database/repositories/InspectionValueRepository").default;

    const oldRf = await createCustomSection(db, "RF", "rf", 4);
    const oldStatus = await createStatusField(oldRf);
    await addDropdownOptions(oldStatus, "Yes");
    const idA = await createInspection("2026-09-01");
    await seedValue(db, idA, oldStatus, "Yes");

    await SectionRepository.softDeleteSection(oldRf);

    const newRf = await createCustomSection(db, "RF", "rf", 6);
    const newStatus = await createStatusField(newRf);
    await addDropdownOptions(newStatus, "No");

    expect(newRf).not.toBe(oldRf);
    expect(await InspectionValueRepository.getValue(idA, newStatus)).toBeNull();
  });

  it("18. deleting a custom section keeps its historical value rows untouched (data never dropped)", async () => {
    const s = await setupDeleteRecreateScenario();
    const rows = await s.db.getAllAsync<{ FieldID: number; FieldValue: string }>(
      "SELECT FieldID, FieldValue FROM InspectionValues WHERE InspectionID = ?",
      [s.idA]
    );
    expect(rows.some((r) => r.FieldID === s.oldStatus && r.FieldValue === "Yes")).toBe(true);
  });

  it("20. isolation regression: a custom section created in one project never leaks into another", async () => {
    const { db: dbA } = await openSeededProject(PROJECT);

    const customId = await createCustomSection(dbA, "Isolated", "isolated", 15);
    expect(customId).toBeGreaterThan(0);

    const { db: dbB } = await openSeededProject(PROJECT_B);
    const sectionsB = await dbB.getAllAsync<{ SectionKey: string }>(
      "SELECT SectionKey FROM InspectionSections"
    );
    expect(sectionsB.some((s) => s.SectionKey === "isolated")).toBe(false);
  });
});