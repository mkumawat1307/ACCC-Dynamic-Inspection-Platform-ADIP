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

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("Cross-project data isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function openProject(dbPath: string): Promise<{ db: SQLiteDatabase }> {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault) VALUES (?, ?, ?)`,
      ["Template", "desc", 1]
    );
    return { db };
  }

  it("returns a distinct DB handle per project path", async () => {
    const a = await openProject(PROJECT_A);
    const b = await openProject(PROJECT_B);
    expect(a.db).not.toBe(b.db);
  });

  it("does not leak dashboard cards added in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const { DashboardCardRepository } = require("@/src/database/repositories/DashboardCardRepository") as typeof import("@/src/database/repositories/DashboardCardRepository");
    const cardId = await DashboardCardRepository.createCard({
      ProjectID: 1,
      CardKey: "leak_probe_card",
      Title: "Leak Probe Card",
      Icon: "alert",
      Color: "#111111",
      EntityType: "inspections",
      CounterType: "total",
      FilterJson: null,
      CountMode: "count",
      DistinctColumn: null,
      SortOrder: 0,
      Enabled: 1,
      IsDefault: 0,
    });
    expect(cardId).toBeGreaterThan(0);

    const cardsInA = await dbA.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );
    expect(cardsInA.some((c) => c.CardKey === "leak_probe_card")).toBe(true);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);

    const cardsInB = await dbB.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );
    expect(cardsInB.some((c) => c.CardKey === "leak_probe_card")).toBe(false);

    const cardsInAAfter = await dbA.getAllAsync<{ CardKey: string }>(
      "SELECT CardKey FROM DashboardCards"
    );
    expect(cardsInAAfter.some((c) => c.CardKey === "leak_probe_card")).toBe(true);
  });

  it("does not leak a custom section added in one project into another", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const templateA = await dbA.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    expect(templateA).not.toBeNull();

    const { SectionRepository } = require("@/src/database/repositories/SectionRepository") as typeof import("@/src/database/repositories/SectionRepository");
    const sectionId = await SectionRepository.create({
      TemplateID: templateA!.TemplateID,
      SectionName: "Leak Probe Section",
      SectionKey: "leak_probe_section",
    });
    expect(sectionId).toBeGreaterThan(0);

    const sectionsInA = await dbA.getAllAsync<{ SectionKey: string }>(
      "SELECT SectionKey FROM InspectionSections"
    );
    expect(sectionsInA.some((s) => s.SectionKey === "leak_probe_section")).toBe(true);

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);

    const templateB = await dbB.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    expect(templateB).not.toBeNull();

    const sectionsInB = await dbB.getAllAsync<{ SectionKey: string }>(
      "SELECT SectionKey FROM InspectionSections"
    );
    expect(sectionsInB.some((s) => s.SectionKey === "leak_probe_section")).toBe(false);

    const sectionsInAAfter = await dbA.getAllAsync<{ SectionKey: string }>(
      "SELECT SectionKey FROM InspectionSections"
    );
    expect(sectionsInAAfter.some((s) => s.SectionKey === "leak_probe_section")).toBe(true);
  });

  it("does not write inspection values for a stale inspection ID from another project", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    const { db: dbA } = await openProject(PROJECT_A);

    const insertResult = await dbA.runAsync(
      `INSERT INTO Inspections (ProjectID, DistrictID, PoleID, InspectionDate, Status) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, "P-LEAK", "2026-08-02", "Draft"]
    );
    const staleId = insertResult.lastInsertRowId as number;

    await dbModule.clearActiveProject();

    const { db: dbB } = await openProject(PROJECT_B);

    const fieldResult = await dbB.runAsync(
      `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "Leak Field", "leak_field", "text", 1, 1, 1, 1]
    );
    const fieldInB = fieldResult.lastInsertRowId as number;

    const { default: InspectionValueRepository } = require("@/src/database/repositories/InspectionValueRepository") as typeof import("@/src/database/repositories/InspectionValueRepository");
    await expect(
      InspectionValueRepository.saveValue(staleId, fieldInB, "leak-value")
    ).resolves.toBeUndefined();

    const valuesInB = await dbB.getAllAsync<{ FieldValue: string }>(
      "SELECT FieldValue FROM InspectionValues WHERE InspectionID = ?",
      [staleId]
    );
    expect(valuesInB).toEqual([]);
  });
});
