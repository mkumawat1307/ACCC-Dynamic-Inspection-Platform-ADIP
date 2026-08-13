jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("Template import isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function seedProject(dbPath: string, templateName: string, sectionKey: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault, IsActive) VALUES (?, ?, 1, 1)`,
      [templateName, "desc"]
    );
    const template = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
       VALUES (?, ?, ?, NULL, NULL, 1, 0, 1, 1, 1)`,
      [template!.TemplateID, sectionKey, sectionKey]
    );
    return { db };
  }

  it("does not leak an imported custom form from Project B back into Project A", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    await seedProject(PROJECT_A, "Project A Template", "section_a");

    await dbModule.setActiveProject(PROJECT_B);
    const dbB: SQLiteDatabase = await dbModule.getDatabase();
    await dbB.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault, IsActive) VALUES (?, ?, 1, 1)`,
      ["Project B Template", "desc"]
    );

    const { applyTemplateImport } = require("@/src/utils/templateData") as typeof import("@/src/utils/templateData");
    const importedForm = {
      version: "2.0",
      exportedAt: "2024-01-01T00:00:00.000Z",
      templates: [
        {
          TemplateName: "Shared Custom Form",
          Description: null,
          IsDefault: 1,
          sections: [
            {
              SectionName: "Shared Section",
              SectionKey: "shared_section",
              Description: null,
              Icon: null,
              DisplayOrder: 1,
              IsRepeatable: 0,
              IsVisible: 1,
              fields: [],
            },
          ],
          deviceTypes: [{ DeviceType: "UPS", FieldName: "UPSMake", Label: "UPS Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 1 }],
          deviceOptions: [],
        },
      ],
      projectDeviceTypes: ["Camera", "UPS"],
    };

    const result = await applyTemplateImport(importedForm);
    expect(result.success).toBe(true);

    const sectionsInB = await dbB.getAllAsync<{ SectionKey: string }>("SELECT SectionKey FROM InspectionSections");
    expect(sectionsInB.some((s) => s.SectionKey === "shared_section")).toBe(true);

    await dbModule.setActiveProject(PROJECT_A);
    const dbA: SQLiteDatabase = await dbModule.getDatabase();
    const sectionsInA = await dbA.getAllAsync<{ SectionKey: string }>("SELECT SectionKey FROM InspectionSections");
    expect(sectionsInA.some((s) => s.SectionKey === "shared_section")).toBe(false);
    expect(sectionsInA.some((s) => s.SectionKey === "section_a")).toBe(true);

    const devicesInA = await dbA.getAllAsync<{ DeviceType: string }>("SELECT DeviceType FROM DeviceFieldDefinitions");
    expect(devicesInA.some((d) => d.DeviceType === "UPS")).toBe(false);
  });
});
