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
});
