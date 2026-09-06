import { openDatabaseAsync, __resetDbState } from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { closeAllDatabases } from "@/src/database/db";
import {
  buildTemplateExportData,
  applyTemplateImport,
} from "@/src/utils/templateData";
import type { TemplateExportData } from "@/src/utils/templateData";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

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
  `CREATE TABLE IF NOT EXISTS DeviceRecords (
    RecordID INTEGER PRIMARY KEY AUTOINCREMENT,
    InspectionID INTEGER NOT NULL,
    DeviceType TEXT NOT NULL,
    DeviceNo INTEGER NOT NULL,
    DeviceData TEXT,
    DisplayOrder INTEGER NOT NULL DEFAULT 1,
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

async function seedDeviceOption(
  deviceType: string,
  fieldName: string,
  label: string,
  value: string,
  isDefault: number,
  displayOrder: number
) {
  await db.runAsync(
    `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [TID, deviceType, fieldName, label, value, displayOrder, isDefault]
  );
}

describe("Template Export — IsDefault", () => {
  it("exports IsDefault=1 for default option", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);
    await seedDeviceOption("Camera", "CameraStatus", "Broken", "Broken", 0, 2);

    const result = await buildTemplateExportData();
    expect(result).not.toBeNull();

    const deviceOpts = result!.data.templates[0].deviceOptions;
    expect(deviceOpts).toHaveLength(2);
    expect(deviceOpts.find((o) => o.OptionLabel === "Working")?.IsDefault).toBe(1);
    expect(deviceOpts.find((o) => o.OptionLabel === "Broken")?.IsDefault).toBe(0);
  });

  it("exports IsDefault=0 for non-default option", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Broken", "Broken", 0, 1);

    const result = await buildTemplateExportData();
    const deviceOpts = result!.data.templates[0].deviceOptions;
    expect(deviceOpts[0].IsDefault).toBe(0);
  });

  it("does not alter unrelated template fields", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);

    const result = await buildTemplateExportData();
    const tpl = result!.data.templates[0];
    expect(tpl.TemplateName).toBe("Default Template");
    expect(tpl.Description).toBe("Test");
    expect(tpl.IsDefault).toBe(1);
  });
});

describe("Template Import — IsDefault", () => {
  it("imports template with IsDefault=1 and restores default", async () => {
    const importData: TemplateExportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Imported Template",
          Description: "Imported",
          IsDefault: 1,
          sections: [],
          deviceTypes: [],
          deviceOptions: [
            { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Working", OptionValue: "Working", DisplayOrder: 1, IsDefault: 1 },
            { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Broken", OptionValue: "Broken", DisplayOrder: 2, IsDefault: 0 },
          ],
        },
      ],
      projectDeviceTypes: ["Camera"],
    };

    const result = await applyTemplateImport(importData);
    expect(result.success).toBe(true);

    const defaultValue = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus");
    expect(defaultValue).toBe("Working");
  });

  it("imports template without IsDefault (legacy) — defaults to 0", async () => {
    const importData: TemplateExportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Legacy Template",
          Description: "Legacy",
          IsDefault: 1,
          sections: [],
          deviceTypes: [],
          deviceOptions: [
            { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Working", OptionValue: "Working", DisplayOrder: 1, IsDefault: 0 as any },
          ],
        },
      ],
      projectDeviceTypes: [],
    };

    const result = await applyTemplateImport(importData);
    expect(result.success).toBe(true);

    const allOptions = await DeviceOptionsRepository.getAll("Camera");
    expect(allOptions.length).toBeGreaterThan(0);
    const workingOpt = allOptions.find((o) => o.OptionLabel === "Working");
    expect(workingOpt).toBeDefined();
    expect(workingOpt!.IsDefault).toBe(0);
  });

  it("re-import updates existing option IsDefault", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);

    const importData: TemplateExportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Default Template",
          Description: "Test",
          IsDefault: 1,
          sections: [],
          deviceTypes: [],
          deviceOptions: [
            { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Working", OptionValue: "Working", DisplayOrder: 1, IsDefault: 0 },
          ],
        },
      ],
      projectDeviceTypes: [],
    };

    await applyTemplateImport(importData);

    const allOptions = await DeviceOptionsRepository.getAll("Camera");
    const workingOpt = allOptions.find((o) => o.OptionLabel === "Working");
    expect(workingOpt).toBeDefined();
    expect(workingOpt!.IsDefault).toBe(0);
  });

  it("export round-trip preserves IsDefault", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);
    await seedDeviceOption("Camera", "CameraStatus", "Broken", "Broken", 0, 2);

    const exported = await buildTemplateExportData();
    expect(exported).not.toBeNull();

    const reimportResult = await applyTemplateImport(exported!.data);
    expect(reimportResult.success).toBe(true);

    const defaultValue = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus");
    expect(defaultValue).toBe("Working");
  });
});
