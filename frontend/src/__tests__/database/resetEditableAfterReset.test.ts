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

const PROJECT = "/mock/documents/Projects/ResetEditable/inspection.db";

type SectionRow = { SectionID: number; SectionKey: string; IsActive?: number };
type FieldRow = { FieldID: number; FieldKey: string; FieldName: string; IsActive: number };

describe("Historical deleted config stays editable across Reset to Default", () => {
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

  // --- Standard field + custom option deleted, saved in an existing inspection ---

  it("1. custom option on a DEFAULT dropdown field survives Reset and stays editable for the old inspection (while hidden for new ones)", async () => {
    const { db } = await openSeededProject();
const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const f = await db.getFirstAsync<{ FieldID: number; SectionID: number }>(
      "SELECT FieldID, SectionID FROM InspectionFields WHERE FieldKey = 'cable_status'"
    );
    const optionId = await FieldOptionRepository.create({
      FieldID: f!.FieldID,
      OptionLabel: "Spliced",
      OptionValue: "Spliced",
      IsDefault: 0,
    });
    const inspectionId = await createInspection("2026-09-01");
    await seedValue(db, inspectionId, f!.FieldID, "Spliced");

    await FieldOptionRepository.delete(optionId);
    await ResetRepository.performReset();

    const opts = await InspectionFieldRepository.getFieldOptionsBySection(f!.SectionID, inspectionId);
    const spliced = (opts.get(f!.FieldID) ?? []).find((o) => o.OptionValue === "Spliced");
    expect(spliced).toBeTruthy();
    expect(spliced!.IsActive).toBe(0);

    const fresh = await InspectionFieldRepository.getFieldOptionsBySection(f!.SectionID);
    expect((fresh.get(f!.FieldID) ?? []).some((o) => o.OptionValue === "Spliced")).toBe(false);

    const rows = await db.getAllAsync<{ OptionLabel: string; IsActive: number; OptionID: number }>(
      "SELECT OptionLabel, IsActive, OptionID FROM FieldOptions WHERE FieldID = ? ORDER BY OptionID",
      [f!.FieldID]
    );
    expect(rows.map((r) => r.OptionLabel)).toContain("Spliced");
    expect(rows.find((r) => r.OptionLabel === "Spliced")!.IsActive).toBe(0);
  });

  // --- Standard dropdown option deleted (canonical), saved, then Reset ---

  it("2. a deleted CANONICAL option is reactivated by Reset to the SAME row (no duplicates, OptionID preserved)", async () => {
    const { db } = await openSeededProject();
const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const f = await db.getFirstAsync<{ FieldID: number; SectionID: number }>(
      "SELECT FieldID, SectionID FROM InspectionFields WHERE FieldKey = 'cable_status'"
    );
    const before = await db.getAllAsync<{ OptionID: number; OptionLabel: string; IsActive: number }>(
      "SELECT OptionID, OptionLabel, IsActive FROM FieldOptions WHERE FieldID = ? ORDER BY OptionID",
      [f!.FieldID]
    );
    const overhead = before.find((o) => o.OptionLabel === "Overhead")!;

    const inspectionId = await createInspection("2026-09-02");
    await seedValue(db, inspectionId, f!.FieldID, "Overhead");

    await FieldOptionRepository.delete(overhead.OptionID);
    await ResetRepository.performReset();

    const after = await db.getAllAsync<{ OptionID: number; OptionLabel: string; IsActive: number }>(
      "SELECT OptionID, OptionLabel, IsActive FROM FieldOptions WHERE FieldID = ? ORDER BY OptionID",
      [f!.FieldID]
    );
    expect(after).toHaveLength(before.length);
    const restored = after.find((o) => o.OptionLabel === "Overhead")!;
    expect(restored.OptionID).toBe(overhead.OptionID);
    expect(restored.IsActive).toBe(1);

    const opts = await InspectionFieldRepository.getFieldOptionsBySection(f!.SectionID, inspectionId);
    expect((opts.get(f!.FieldID) ?? []).map((o) => o.OptionValue)).toContain("Overhead");
  });

  // --- Custom section + custom field + custom options, all saved, deleted, Reset ---

  it("3. custom section + field + options deleted then Reset — the old inspection still sees the whole chain and the saved option stays selectable", async () => {
    const { db } = await openSeededProject();
    const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const { InspectionRepository } = require("@/src/database/repositories/InspectionRepository") as typeof import("@/src/database/repositories/InspectionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const sectionId = await createCustomSection(db, "RF", "rf", 4);
    const fieldId = await FieldRepository.create({
      SectionID: sectionId,
      FieldName: "Status",
      FieldKey: "rf_status",
      FieldType: "dropdown",
    });
    await FieldOptionRepository.create({ FieldID: fieldId, OptionLabel: "Yes", OptionValue: "Yes", IsDefault: 0 });
    const noOptionId = await FieldOptionRepository.create({ FieldID: fieldId, OptionLabel: "No", OptionValue: "No", IsDefault: 0 });

    const inspectionId = await createInspection("2026-09-03");
    await seedValue(db, inspectionId, fieldId, "Yes");

    await SectionRepository.softDeleteSection(sectionId);
    await FieldOptionRepository.delete(noOptionId);
    await ResetRepository.performReset();

    const sections = await InspectionRepository.getSections(undefined, inspectionId);
    const rf = sections.filter((x: SectionRow) => x.SectionKey === "rf");
    expect(rf.some((x: SectionRow) => x.SectionID === sectionId && x.IsActive === 0)).toBe(true);

    const fields = await InspectionFieldRepository.getFieldsBySection(sectionId, inspectionId);
    const status = fields.filter((x: FieldRow) => x.FieldKey === "rf_status");
    expect(status.some((x: FieldRow) => x.IsActive === 0)).toBe(true);

const opts = await InspectionFieldRepository.getFieldOptionsBySection(sectionId, inspectionId);
    const fieldOptions = opts.get(fieldId) ?? [];
    expect(fieldOptions.map((o) => o.OptionValue)).toContain("Yes");
    expect(fieldOptions.map((o) => o.OptionValue)).toContain("No");

    const rows = await db.getAllAsync<{ OptionLabel: string; IsActive: number }>(
      "SELECT OptionLabel, IsActive FROM FieldOptions WHERE FieldID = ? ORDER BY OptionID",
      [fieldId]
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.IsActive === 0)).toBe(true);
  });

  // --- Deleted default section restores, deleted default field restores ---

  it("4. Reset reactivates a deleted DEFAULT section + field so existing inspections keep working with the canonical config", async () => {
    const { db } = await openSeededProject();
    const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

const earthing = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'earthing'"
    );
    const earthingWire = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'earthing_wire'"
    );

    const inspectionId = await createInspection("2026-09-04");
    await seedValue(db, inspectionId, earthingWire!.FieldID, "Installed");

    await SectionRepository.softDeleteSection(earthing!.SectionID);
    await FieldRepository.delete(earthingWire!.FieldID);
    await ResetRepository.performReset();

    const restoredSection = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionSections WHERE SectionKey = 'earthing'"
    );
    expect(restoredSection!.IsActive).toBe(1);

    const restoredField = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionFields WHERE FieldKey = 'earthing_wire'"
    );
    expect(restoredField!.IsActive).toBe(1);

    const values = await db.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ? AND FieldID = ?",
      [inspectionId, earthingWire!.FieldID]
    );
    expect(values).toHaveLength(1);
    expect(values[0].FieldValue).toBe("Installed");

    const sec = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'earthing'"
    );
    const fields = await InspectionFieldRepository.getFieldsBySection(sec!.SectionID, inspectionId);
    expect(fields.some((x: FieldRow) => x.FieldKey === "earthing_wire")).toBe(true);
  });

  // --- Custom field without data, deleted, Reset: never surfaced (no historical data) ---

  it("5. a CUSTOM field WITHOUT data stays hidden for the old inspection after Reset", async () => {
    const { db } = await openSeededProject();
const { FieldRepository } = require("@/src/database/repositories/FieldRepository") as typeof import("@/src/database/repositories/FieldRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const earthing = await db.getFirstAsync<{ SectionID: number }>(
      "SELECT SectionID FROM InspectionSections WHERE SectionKey = 'earthing'"
    );
    const customFieldId = await FieldRepository.create({
      SectionID: earthing!.SectionID,
      FieldName: "Extra Note",
      FieldKey: "custom_extra_note",
      FieldType: "text",
    });
    const inspectionId = await createInspection("2026-09-05");

    await FieldRepository.delete(customFieldId);
    await ResetRepository.performReset();

    const deactivated = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM InspectionFields WHERE FieldID = ?",
      [customFieldId]
    );
    expect(deactivated!.IsActive).toBe(0);

    const fields = await InspectionFieldRepository.getFieldsBySection(earthing!.SectionID, inspectionId);
    expect(fields.some((x: FieldRow) => x.FieldKey === "custom_extra_note")).toBe(false);
  });

  // --- Device: canonical option deleted + saved in DeviceData, then Reset ---

  it("6. a soft-deleted canonical DEVICE option on Camera is reactivated by Reset to the same row (no duplicates)", async () => {
await openSeededProject();
    const DeviceOptionsRepository: typeof import("@/src/database/repositories/DeviceOptionsRepository").default = require("@/src/database/repositories/DeviceOptionsRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const before = await DeviceOptionsRepository.getByField("Camera", "CameraType", undefined, true);
    const bullet = before.find((o) => o.OptionValue === "Bullet")!;

    await DeviceOptionsRepository.delete(bullet.OptionID!);
    await ResetRepository.performReset();

    const after = await DeviceOptionsRepository.getByField("Camera", "CameraType", undefined, true);
    expect(after).toHaveLength(before.length);
    const restored = after.find((o) => o.OptionValue === "Bullet")!;
    expect(restored.OptionID).toBe(bullet.OptionID);
    expect(restored.IsActive).toBe(1);
  });

  // --- Device: custom device type defs/options stay inactive but records survive Reset ---

  it("7. a custom device type's definitions/options stay deactivated but its DeviceRecords survive Reset and remain available to old inspections", async () => {
    const { db } = await openSeededProject();
    const DeviceFieldDefinitionsRepository: typeof import("@/src/database/repositories/DeviceFieldDefinitionsRepository").default = require("@/src/database/repositories/DeviceFieldDefinitionsRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const tpl = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
    );
    await db.runAsync(
      `INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES (?, 1)`,
      ["NVR"]
    );
    await db.runAsync(
      `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder, IsVisible, IsActive)
       VALUES (?, ?, ?, ?, ?, 0, 1, 1, 1)`,
      [tpl!.TemplateID, "NVR", "RecorderType", "Recorder Type", "dropdown"]
    );
    await db.runAsync(
      `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, ?, 1, 0, 1)`,
      [tpl!.TemplateID, "NVR", "RecorderType", "Dome", "Dome"]
    );
    await db.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceLabel, DeviceData, DisplayOrder, IsActive)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [77, "NVR", 1, "NVR-1", JSON.stringify({ RecorderType: "Dome" })]
    );

    await ResetRepository.performReset();

    const def = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM DeviceFieldDefinitions WHERE DeviceType = 'NVR'"
    );
    expect(def!.IsActive).toBe(0);
    const opt = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM DeviceOptions WHERE DeviceType = 'NVR'"
    );
    expect(opt!.IsActive).toBe(0);
    const pdt = await db.getFirstAsync<{ DeviceType: string }>(
      "SELECT DeviceType FROM ProjectDeviceTypes WHERE DeviceType = 'NVR'"
    );
    expect(pdt).toBeNull();

    const record = await db.getFirstAsync<{ DeviceData: string }>(
      "SELECT DeviceData FROM DeviceRecords WHERE InspectionID = 77 AND DeviceType = 'NVR'"
    );
    expect(record).toBeTruthy();
    expect(record!.DeviceData).toContain('"RecorderType":"Dome"');

    const historicalTypes = await DeviceFieldDefinitionsRepository.getDeviceTypes(tpl!.TemplateID, true);
    expect(historicalTypes).toContain("NVR");
    const activeTypes = await DeviceFieldDefinitionsRepository.getDeviceTypes(tpl!.TemplateID, false);
    expect(activeTypes).not.toContain("NVR");
  });

  // --- Order independence: delete -> reset -> delete again -> reset ---

  it("8. delete-after-reset cycles stay idempotent: no duplicate options and stable OptionID across repeated resets", async () => {
    const { db } = await openSeededProject();
    const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const f = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'cable_status'"
    );
    const optionId = await FieldOptionRepository.create({
      FieldID: f!.FieldID,
      OptionLabel: "Spliced",
      OptionValue: "Spliced",
      IsDefault: 0,
    });

    await FieldOptionRepository.delete(optionId);
    await ResetRepository.performReset();
    await FieldOptionRepository.delete(optionId);
    await ResetRepository.performReset();

    const rows = await db.getAllAsync<{ OptionID: number; OptionLabel: string; IsActive: number }>(
      "SELECT OptionID, OptionLabel, IsActive FROM FieldOptions WHERE FieldID = ? ORDER BY OptionID",
      [f!.FieldID]
    );
    const splicedRows = rows.filter((r) => r.OptionLabel === "Spliced");
    expect(splicedRows).toHaveLength(1);
    expect(splicedRows[0].OptionID).toBe(optionId);
    expect(splicedRows[0].IsActive).toBe(0);

    const canonicalLabels = rows.filter((r) => r.OptionLabel !== "Spliced").map((r) => r.OptionLabel);
    expect(canonicalLabels).toHaveLength(5);
    for (const canonical of rows.filter((r) => r.OptionLabel !== "Spliced")) {
      expect(canonical.IsActive).toBe(1);
    }
  });

  // --- No cross-inspection leakage: another inspection without the custom option never sees it ---

  it("9. Option rows preserved by Reset are only surfaced for inspections that saved them", async () => {
    const { db } = await openSeededProject();
const { FieldOptionRepository } = require("@/src/database/repositories/FieldOptionRepository") as typeof import("@/src/database/repositories/FieldOptionRepository");
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

    const f = await db.getFirstAsync<{ FieldID: number; SectionID: number }>(
      "SELECT FieldID, SectionID FROM InspectionFields WHERE FieldKey = 'cable_status'"
    );
    const optionId = await FieldOptionRepository.create({
      FieldID: f!.FieldID,
      OptionLabel: "Spliced",
      OptionValue: "Spliced",
      IsDefault: 0,
    });

    const inspectionWithData = await createInspection("2026-09-10");
    await seedValue(db, inspectionWithData, f!.FieldID, "Spliced");
    const inspectionWithoutData = await createInspection("2026-09-11");

    await FieldOptionRepository.delete(optionId);
    await ResetRepository.performReset();

    const withData = await InspectionFieldRepository.getFieldOptionsBySection(f!.SectionID, inspectionWithData);
    expect((withData.get(f!.FieldID) ?? []).some((o) => o.OptionValue === "Spliced")).toBe(true);

    const withoutData = await InspectionFieldRepository.getFieldOptionsBySection(f!.SectionID, inspectionWithoutData);
    expect((withoutData.get(f!.FieldID) ?? []).some((o) => o.OptionValue === "Spliced")).toBe(false);
  });

  // --- Clean section untouched by reset keeps its normal active options ---

  it("10. active config stays normal after Reset for untouched default options", async () => {
    const { db } = await openSeededProject();
    const InspectionFieldRepository: typeof import("@/src/database/repositories/InspectionFieldRepository").default = require("@/src/database/repositories/InspectionFieldRepository").default;
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");

const beforeField = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'pole_avail'"
    );
    const before = await db.getAllAsync<{ OptionLabel: string }>(
      "SELECT OptionLabel FROM FieldOptions WHERE FieldID = ? ORDER BY OptionID",
      [beforeField!.FieldID]
    );
    await ResetRepository.performReset();

    const f = await db.getFirstAsync<{ FieldID: number; SectionID: number }>(
      "SELECT FieldID, SectionID FROM InspectionFields WHERE FieldKey = 'pole_avail'"
    );
    const opts = await InspectionFieldRepository.getFieldOptionsBySection(f!.SectionID);
    expect((opts.get(f!.FieldID) ?? []).map((o) => o.OptionLabel)).toEqual(before.map((b) => b.OptionLabel));
  });
});

