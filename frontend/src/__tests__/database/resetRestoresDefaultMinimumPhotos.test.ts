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
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT = "/mock/documents/Projects/ResetMinimumPhotos/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ResetMinimumPhotosB/inspection.db";

async function openSeededProject(dbPath: string = PROJECT): Promise<{ db: SQLiteDatabase }> {
  const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
  await dbModule.setActiveProject(dbPath);
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
  const pdt = require("@/src/database/seeds/project-device-types.seed");
  await pdt.seedProjectDeviceTypes();
  const db: SQLiteDatabase = await dbModule.getDatabase();
  return { db };
}

async function openProject(dbPath: string): Promise<{ db: SQLiteDatabase }> {
  const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
  await dbModule.setActiveProject(dbPath);
  const db: SQLiteDatabase = await dbModule.getDatabase();
  return { db };
}

async function resetToDefault(): Promise<void> {
  const { ResetRepository } = require("@/src/database/repositories/ResetRepository") as typeof import("@/src/database/repositories/ResetRepository");
  await ResetRepository.performReset();
}

async function minimumPhotos(): Promise<number> {
  const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
  return SectionRepository.getMinimumPhotos();
}

async function setMinimumPhotos(value: number): Promise<void> {
  const { default: SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
  await SectionRepository.setMinimumPhotos(value);
}

describe("Reset to Default restores the default minimum photo requirement", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("A. resets a configured minimum of 5 back to the default of 1", async () => {
    await openSeededProject();
    await setMinimumPhotos(5);
    await expect(minimumPhotos()).resolves.toBe(5);

    await resetToDefault();

    await expect(minimumPhotos()).resolves.toBe(1);
  });

  it("B. resets a configured minimum of 3 back to the default of 1", async () => {
    await openSeededProject();
    await setMinimumPhotos(3);
    await expect(minimumPhotos()).resolves.toBe(3);

    await resetToDefault();

    await expect(minimumPhotos()).resolves.toBe(1);
  });

  it("C. resets an optional (minimum 0) configuration to the default of 1", async () => {
    await openSeededProject();
    await setMinimumPhotos(0);
    await expect(minimumPhotos()).resolves.toBe(0);

    await resetToDefault();

    await expect(minimumPhotos()).resolves.toBe(1);
  });

  it("D. the reset value persists in the database after reopening the project", async () => {
    const { db } = await openSeededProject();
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await setMinimumPhotos(6);

    await resetToDefault();
    await expect(minimumPhotos()).resolves.toBe(1);

    await dbModule.clearActiveProject();
    const reopened = await openProject(PROJECT);
    expect(reopened.db).toBe(db);

    const row = await reopened.db.getFirstAsync<{ MinimumPhotos: number }>(
      "SELECT s.MinimumPhotos FROM InspectionSections s INNER JOIN InspectionTemplates t ON t.TemplateID = s.TemplateID WHERE s.SectionKey = 'photos' AND s.IsActive = 1 AND t.IsDefault = 1 LIMIT 1"
    );
    expect(row?.MinimumPhotos).toBe(1);
    await expect(minimumPhotos()).resolves.toBe(1);
  });

  it("E. the inspection Photos UI reflects the reset value (Min 1 Required / Minimum 1 Photo)", async () => {
    await openSeededProject();
    await setMinimumPhotos(4);

    await resetToDefault();

    const min = await minimumPhotos();
    expect(min).toBe(1);

    // Settings card subtitle text for the photos section.
    expect(min <= 0 ? "Photos Optional" : min === 1 ? "Minimum 1 Photo" : `Minimum ${min} Photos`).toBe("Minimum 1 Photo");

    // Inspection Photos section header chip / empty state text.
    const { photoRequirementLabel, photoEmptyStateTitle, photoEmptyStateHint } = require("@/src/components/inspection/photoUtils");
    expect(photoRequirementLabel(min)).toBe("Min 1 Required");
    expect(photoEmptyStateTitle(min)).toBe("No photo captured");
    expect(photoEmptyStateHint(min)).toBe("Tap capture to take the first photo.\nMinimum 1 Photo Required");
  });

  it("F. resetting Project A to default does not alter Project B's minimum", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    await openSeededProject(PROJECT);
    await setMinimumPhotos(5);
    await dbModule.clearActiveProject();

    await openSeededProject(PROJECT_B);
    await setMinimumPhotos(3);
    await expect(minimumPhotos()).resolves.toBe(3);
    await dbModule.clearActiveProject();

    await openProject(PROJECT);
    await expect(minimumPhotos()).resolves.toBe(5);
    await resetToDefault();
    await expect(minimumPhotos()).resolves.toBe(1);
    await dbModule.clearActiveProject();

    await openProject(PROJECT_B);
    await expect(minimumPhotos()).resolves.toBe(3);
    await dbModule.clearActiveProject();

    await openProject(PROJECT);
    await expect(minimumPhotos()).resolves.toBe(1);
  });

  it("G. reset does not overwrite historical inspection values or inspections", async () => {
    const { db } = await openSeededProject();
    await setMinimumPhotos(5);

    const ins = await db.runAsync(
      `INSERT INTO Inspections (ProjectID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?)`,
      [1, "POLE-001", "2026-01-01", "Completed"]
    );
    const inspectionId = Number(ins.lastInsertRowId);

    const field = await db.getFirstAsync<{ FieldID: number }>(
      "SELECT FieldID FROM InspectionFields WHERE FieldKey = 'foundation_cond' LIMIT 1"
    );
    expect(field).toBeTruthy();
    await db.runAsync(
      "INSERT INTO InspectionValues (InspectionID, FieldID, FieldValue) VALUES (?, ?, ?)",
      [inspectionId, field!.FieldID, "Good"]
    );

    await resetToDefault();

    await expect(minimumPhotos()).resolves.toBe(1);

    const values = await db.getAllAsync<{ InspectionID: number; FieldID: number; FieldValue: string }>(
      "SELECT InspectionID, FieldID, FieldValue FROM InspectionValues"
    );
    expect(values).toEqual([{ InspectionID: inspectionId, FieldID: field!.FieldID, FieldValue: "Good" }]);

    const inspections = await db.getAllAsync<{ PoleID: string; Status: string }>(
      "SELECT PoleID, Status FROM Inspections"
    );
    expect(inspections).toEqual([{ PoleID: "POLE-001", Status: "Completed" }]);
  });

  it("H. existing reset behavior for other settings is unchanged", async () => {
    const { db } = await openSeededProject();
    const pdt = require("@/src/database/repositories/ProjectDeviceTypesRepository") as typeof import("@/src/database/repositories/ProjectDeviceTypesRepository");
    await setMinimumPhotos(2);
    await pdt.default.setRequired("Switch", true);

    const switchType = await db.getFirstAsync<{ FieldDefID: number }>(
      "SELECT FieldDefID FROM DeviceFieldDefinitions WHERE DeviceType = 'Switch' AND FieldName = 'SwitchType'"
    );
    await db.runAsync(
      "UPDATE DeviceFieldDefinitions SET Placeholder = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldDefID = ?",
      ["Enter switch type", switchType!.FieldDefID]
    );

    await resetToDefault();

    await expect(minimumPhotos()).resolves.toBe(1);

    const required = await pdt.default.getRequired();
    expect(required).toEqual(["Camera"]);

    const restored = await db.getFirstAsync<{ Placeholder: string | null }>(
      "SELECT Placeholder FROM DeviceFieldDefinitions WHERE DeviceType = 'Switch' AND FieldName = 'SwitchType'"
    );
    expect(restored!.Placeholder).toBeNull();
  });
});