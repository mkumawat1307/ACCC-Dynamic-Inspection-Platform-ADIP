import { openDatabaseAsync, __resetDbState } from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { closeAllDatabases } from "@/src/database/db";
import {
  buildTemplateExportData,
  applyTemplateImport,
} from "@/src/utils/templateData";
import type {
  TemplateExportData,
  TemplateExportSection,
} from "@/src/utils/templateData";
import { DEFAULT_MINIMUM_PHOTOS } from "@/src/database/seeds/factory-config";

const TID = 1;

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS InspectionTemplates (
    TemplateID INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateName TEXT NOT NULL,
    Description TEXT,
    IsDefault INTEGER NOT NULL DEFAULT 1,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS InspectionSections (
    SectionID INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateID INTEGER NOT NULL,
    SectionName TEXT NOT NULL,
    SectionKey TEXT NOT NULL,
    Description TEXT,
    Icon TEXT,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsRepeatable INTEGER NOT NULL DEFAULT 0,
    IsVisible INTEGER NOT NULL DEFAULT 1,
    MinimumPhotos INTEGER NOT NULL DEFAULT 1,
    IsDefault INTEGER NOT NULL DEFAULT 1,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS InspectionFields (
    FieldID INTEGER PRIMARY KEY AUTOINCREMENT,
    SectionID INTEGER NOT NULL,
    FieldName TEXT NOT NULL,
    FieldKey TEXT NOT NULL,
    FieldType TEXT NOT NULL DEFAULT 'text',
    Placeholder TEXT,
    DefaultValue TEXT,
    HelpText TEXT,
    ValidationRule TEXT,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsRequired INTEGER NOT NULL DEFAULT 0,
    IsVisible INTEGER NOT NULL DEFAULT 1,
    IsReadOnly INTEGER NOT NULL DEFAULT 0,
    IsSystemField INTEGER NOT NULL DEFAULT 0,
    Width INTEGER NOT NULL DEFAULT 12,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS FieldOptions (
    OptionID INTEGER PRIMARY KEY AUTOINCREMENT,
    FieldID INTEGER NOT NULL,
    OptionLabel TEXT NOT NULL,
    OptionValue TEXT NOT NULL,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsDefault INTEGER NOT NULL DEFAULT 0,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS DeviceFieldDefinitions (
    FieldDefID INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateID INTEGER NOT NULL DEFAULT 1,
    DeviceType TEXT NOT NULL,
    FieldName TEXT NOT NULL,
    Label TEXT NOT NULL,
    Placeholder TEXT,
    FieldType TEXT NOT NULL DEFAULT 'text',
    IsRequired INTEGER DEFAULT 0,
    IsVisible INTEGER DEFAULT 1,
    DisplayOrder INTEGER NOT NULL DEFAULT 0,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(TemplateID, DeviceType, FieldName)
  );`,
  `CREATE TABLE IF NOT EXISTS DeviceOptions (
    OptionID INTEGER PRIMARY KEY AUTOINCREMENT,
    TemplateID INTEGER NOT NULL DEFAULT 1,
    DeviceType TEXT NOT NULL,
    FieldName TEXT NOT NULL,
    OptionLabel TEXT NOT NULL,
    OptionValue TEXT NOT NULL,
    DisplayOrder INTEGER NOT NULL DEFAULT 1,
    IsDefault INTEGER NOT NULL DEFAULT 0,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS ProjectDeviceTypes (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    DeviceType TEXT NOT NULL,
    IsActive INTEGER DEFAULT 1,
    CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(DeviceType)
  );`,
];

let db: SQLiteDatabase;

beforeEach(async () => {
  await closeAllDatabases();
  __resetDbState();
  db = await openDatabaseAsync("accc_global.db");
  for (const sql of SCHEMA_SQL) {
    await db.execAsync(sql);
  }
  await db.runAsync(
    `INSERT INTO InspectionTemplates (TemplateID, TemplateName, Description, IsDefault, IsActive) VALUES (?, ?, ?, ?, ?)`,
    [TID, "Default Template", "Test", 1, 1]
  );
});

afterEach(async () => {
  await closeAllDatabases();
  await db.closeAsync();
});

async function seedSection(
  sectionKey: string,
  minimumPhotos?: number,
  displayOrder = 0
): Promise<number> {
  if (minimumPhotos === undefined) {
    await db.runAsync(
      `INSERT INTO InspectionSections
       (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      [TID, sectionKey, sectionKey, null, null, displayOrder, 0, 1]
    );
  } else {
    await db.runAsync(
      `INSERT INTO InspectionSections
       (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, MinimumPhotos, IsDefault, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      [TID, sectionKey, sectionKey, null, null, displayOrder, 0, 1, minimumPhotos]
    );
  }
  const row = await db.getFirstAsync<{ SectionID: number }>(
    `SELECT SectionID FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?`,
    [TID, sectionKey]
  );
  return row!.SectionID;
}

async function seedField(sectionId: number): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO InspectionFields
     (SectionID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue, HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly, IsSystemField, Width, IsActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [sectionId, "Voltage", "voltage", "text", null, null, null, null, 1, 1, 1, 0, 0, 12]
  );
  const fieldId = result.lastInsertRowId;
  await db.runAsync(
    `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [fieldId, "220V", "220", 1, 0]
  );
  return fieldId;
}

function makeImport(sections: TemplateExportSection[], templateName = "Default Template"): TemplateExportData {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: [
      {
        TemplateName: templateName,
        Description: "Test",
        IsDefault: 1,
        sections,
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: [],
  };
}

function section(
  sectionKey: string,
  minimumPhotos?: number,
  fields: TemplateExportSection["fields"] = []
): TemplateExportSection {
  const s: TemplateExportSection = {
    SectionName: sectionKey,
    SectionKey: sectionKey,
    Description: null,
    Icon: null,
    DisplayOrder: 0,
    IsRepeatable: 0,
    IsVisible: 1,
    fields,
  };
  if (minimumPhotos !== undefined) {
    s.MinimumPhotos = minimumPhotos;
  }
  return s;
}

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Template Backup/Restore — MinimumPhotos export", () => {
  it.each([0, 1, 5])("exports MinimumPhotos=%i from the section row", async (value) => {
    await seedSection("photos", value);

    const result = await buildTemplateExportData();
    expect(result).not.toBeNull();

    const exported = serialize(result!.data);
    expect(exported.templates[0].sections[0].MinimumPhotos).toBe(value);
  });

  it("leaves MinimumPhotos absent for a legacy section row that has none", async () => {
    await seedSection("legacy_section", undefined);

    const result = await buildTemplateExportData();
    expect(result).not.toBeNull();

    const exported = serialize(result!.data);
    expect(exported.templates[0].sections[0]).not.toHaveProperty("MinimumPhotos");
  });
});

describe("Template Backup/Restore — MinimumPhotos restore", () => {
  it.each([0, 1, 5])("preserves MinimumPhotos=%i through export → import round trip", async (value) => {
    await seedSection("photos", value);

    const result = await buildTemplateExportData();
    expect(result).not.toBeNull();

    const restore = await applyTemplateImport(serialize(result!.data));
    expect(restore.success).toBe(true);

    const row = await db.getFirstAsync<{ MinimumPhotos: number }>(
      "SELECT MinimumPhotos FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?",
      [TID, "photos"]
    );
    expect(row?.MinimumPhotos).toBe(value);
  });

  it("restores MinimumPhotos on a fresh section insert (import path)", async () => {
    const restore = await applyTemplateImport(
      makeImport([section("new_section", 4)])
    );
    expect(restore.success).toBe(true);

    const row = await db.getFirstAsync<{ MinimumPhotos: number }>(
      "SELECT MinimumPhotos FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?",
      [TID, "new_section"]
    );
    expect(row?.MinimumPhotos).toBe(4);
  });

  it("updates MinimumPhotos on a re-import of an existing section", async () => {
    await seedSection("photos", 3);

    const restore = await applyTemplateImport(
      makeImport([section("photos", 5)])
    );
    expect(restore.success).toBe(true);

    const row = await db.getFirstAsync<{ MinimumPhotos: number }>(
      "SELECT MinimumPhotos FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?",
      [TID, "photos"]
    );
    expect(row?.MinimumPhotos).toBe(5);
  });

  it("applies the default MinimumPhotos when restoring a legacy template without the property (insert path)", async () => {
    const restore = await applyTemplateImport(
      makeImport([section("legacy_new")])
    );
    expect(restore.success).toBe(true);

    const row = await db.getFirstAsync<{ MinimumPhotos: number }>(
      "SELECT MinimumPhotos FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?",
      [TID, "legacy_new"]
    );
    expect(row?.MinimumPhotos).toBe(DEFAULT_MINIMUM_PHOTOS);
  });

  it("resets an existing MinimumPhotos to the default when restoring a legacy template without the property (update path)", async () => {
    await seedSection("legacy_existing", 5);

    const restore = await applyTemplateImport(
      makeImport([section("legacy_existing")])
    );
    expect(restore.success).toBe(true);

    const row = await db.getFirstAsync<{ MinimumPhotos: number }>(
      "SELECT MinimumPhotos FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?",
      [TID, "legacy_existing"]
    );
    expect(row?.MinimumPhotos).toBe(DEFAULT_MINIMUM_PHOTOS);
  });

  it("keeps section/field configuration intact while MinimumPhotos survives the round trip", async () => {
    const sectionId = await seedSection("detail", 2);
    await seedField(sectionId);

    const result = await buildTemplateExportData();
    expect(result).not.toBeNull();

    const restore = await applyTemplateImport(serialize(result!.data));
    expect(restore.success).toBe(true);

    const sectionRow = await db.getFirstAsync<{
      SectionID: number;
      SectionName: string;
      DisplayOrder: number;
      IsVisible: number;
      MinimumPhotos: number;
    }>(
      "SELECT SectionID, SectionName, DisplayOrder, IsVisible, MinimumPhotos FROM InspectionSections WHERE TemplateID = ? AND SectionKey = ?",
      [TID, "detail"]
    );
    expect(sectionRow?.SectionName).toBe("detail");
    expect(sectionRow?.MinimumPhotos).toBe(2);

    const fieldRow = await db.getFirstAsync<{
      FieldName: string;
      FieldType: string;
      IsRequired: number;
    }>(
      "SELECT FieldName, FieldType, IsRequired FROM InspectionFields WHERE SectionID = ? AND FieldKey = ?",
      [sectionRow!.SectionID, "voltage"]
    );
    expect(fieldRow?.FieldName).toBe("Voltage");
    expect(fieldRow?.FieldType).toBe("text");
    expect(fieldRow?.IsRequired).toBe(1);

    const optionRow = await db.getFirstAsync<{ OptionLabel: string; OptionValue: string }>(
      "SELECT OptionLabel, OptionValue FROM FieldOptions WHERE FieldID = ?",
      [
        (
          await db.getFirstAsync<{ FieldID: number }>(
            "SELECT FieldID FROM InspectionFields WHERE SectionID = ? AND FieldKey = ?",
            [sectionRow!.SectionID, "voltage"]
          )
        )!.FieldID,
      ]
    );
    expect(optionRow?.OptionLabel).toBe("220V");
    expect(optionRow?.OptionValue).toBe("220");
  });
});