import { openDatabaseAsync, __resetDbState } from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { closeAllDatabases } from "@/src/database/db";
import {
  buildTemplateExportData,
  applyTemplateImport,
} from "@/src/utils/templateData";
import type {
  TemplateExportData,
  TemplateExportDeviceType,
  TemplateExportDeviceOption,
} from "@/src/utils/templateData";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";

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

async function seedDeviceField(
  deviceType: string,
  fieldName: string,
  label: string,
  opts: { fieldType?: string; isRequired?: number; displayOrder?: number } = {}
) {
  await db.runAsync(
    `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, IsVisible, DisplayOrder, IsActive)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1)`,
    [
      TID,
      deviceType,
      fieldName,
      label,
      opts.fieldType ?? "text",
      opts.isRequired ?? 0,
      opts.displayOrder ?? 1,
    ]
  );
}

function makeDeviceImport(
  deviceTypes: TemplateExportDeviceType[],
  deviceOptions: TemplateExportDeviceOption[],
  templateName = "Default Template"
): TemplateExportData {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: [
      {
        TemplateName: templateName,
        Description: "Test",
        IsDefault: 1,
        sections: [],
        deviceTypes,
        deviceOptions,
      },
    ],
    projectDeviceTypes: [],
  };
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

describe("Template Import — Device Field/Option Deactivation", () => {
  it("deactivates a device field removed from an imported template", async () => {
    await seedDeviceField("Camera", "Vendor", "Vendor");
    await seedDeviceField("Camera", "Resolution", "Resolution");

    await applyTemplateImport(makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Resolution", Label: "Resolution", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      []
    ));

    const active = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID);
    expect(active.map((f) => f.FieldName)).toEqual(["Resolution"]);

    const all = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);
    const vendor = all.find((f) => f.FieldName === "Vendor");
    expect(vendor).toBeDefined();
    expect(vendor!.IsActive).toBe(0);
  });

  it("deactivates a device option removed from an imported template", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Online", "Online", 1, 1);
    await seedDeviceOption("Camera", "CameraStatus", "Offline", "Offline", 0, 2);

    await applyTemplateImport(makeDeviceImport(
      [],
      [{ DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Online", OptionValue: "Online", DisplayOrder: 1, IsDefault: 1 }]
    ));

    const active = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID);
    expect(active.map((o) => o.OptionLabel)).toEqual(["Online"]);

    const all = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID, true);
    const offline = all.find((o) => o.OptionLabel === "Offline");
    expect(offline).toBeDefined();
    expect(offline!.IsActive).toBe(0);
  });

  it("preserves historical device field values after the field is deactivated", async () => {
    await seedDeviceField("Camera", "Vendor", "Vendor");
    await seedDeviceField("Camera", "Resolution", "Resolution");
    await db.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData, DisplayOrder, IsActive)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [1, "Camera", 1, JSON.stringify({ Vendor: "OldCo", Resolution: "1080p" }), 1]
    );

    await applyTemplateImport(makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Resolution", Label: "Resolution", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      []
    ));

    const record = await db.getFirstAsync<{ DeviceData: string }>(
      `SELECT DeviceData FROM DeviceRecords WHERE InspectionID = 1 AND DeviceType = ? AND DeviceNo = 1`,
      ["Camera"]
    );
    expect(record).toBeDefined();
    expect(JSON.parse(record!.DeviceData)).toEqual({ Vendor: "OldCo", Resolution: "1080p" });

    const all = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);
    expect(all.find((f) => f.FieldName === "Vendor")?.IsActive).toBe(0);
  });

  it("preserves historical device option values after the option is deactivated", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Online", "Online", 1, 1);
    await seedDeviceOption("Camera", "CameraStatus", "Offline", "Offline", 0, 2);
    await db.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData, DisplayOrder, IsActive)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [1, "Camera", 1, JSON.stringify({ CameraStatus: "Offline" }), 1]
    );

    await applyTemplateImport(makeDeviceImport(
      [],
      [{ DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Online", OptionValue: "Online", DisplayOrder: 1, IsDefault: 1 }]
    ));

    const record = await db.getFirstAsync<{ DeviceData: string }>(
      `SELECT DeviceData FROM DeviceRecords WHERE InspectionID = 1 AND DeviceType = ? AND DeviceNo = 1`,
      ["Camera"]
    );
    expect(JSON.parse(record!.DeviceData)).toEqual({ CameraStatus: "Offline" });

    const dropdown = await DeviceOptionsRepository.getDropdownData("Camera", "CameraStatus", TID, true);
    const offline = dropdown.find((o) => o.label === "Offline");
    expect(offline).toBeDefined();
    expect(offline!.IsActive).toBe(0);
  });

  it("re-activates a removed device field and option when the original template is re-imported (A→B→A)", async () => {
    const templateA = makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Vendor", Label: "Vendor", FieldType: "text", IsRequired: 0, DisplayOrder: 1 },
        { DeviceType: "Camera", FieldName: "Resolution", Label: "Resolution", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      [
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Online", OptionValue: "Online", DisplayOrder: 1, IsDefault: 1 },
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Offline", OptionValue: "Offline", DisplayOrder: 2, IsDefault: 0 },
      ]
    );

    await applyTemplateImport(templateA);
    const templateB = makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Resolution", Label: "Resolution", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      [
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Online", OptionValue: "Online", DisplayOrder: 1, IsDefault: 1 },
      ]
    );
    await applyTemplateImport(templateB);

    expect(DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID)).resolves.toHaveLength(1);
    expect(DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID)).resolves.toHaveLength(1);

    await applyTemplateImport(templateA);

    const activeFields = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID);
    expect(activeFields.map((f) => f.FieldName).sort()).toEqual(["Resolution", "Vendor"]);
    const activeOptions = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID);
    expect(activeOptions.map((o) => o.OptionLabel).sort()).toEqual(["Offline", "Online"]);
  });

  it("does not deactivate a field on an unrelated device type", async () => {
    await seedDeviceField("Camera", "Serial", "Serial");
    await seedDeviceField("NVR", "Serial", "Serial");

    await applyTemplateImport(makeDeviceImport(
      [
        { DeviceType: "NVR", FieldName: "Serial", Label: "Serial", FieldType: "text", IsRequired: 0, DisplayOrder: 1 },
      ],
      []
    ));

    const nvr = await DeviceFieldDefinitionsRepository.getByDeviceType("NVR", TID);
    expect(nvr.map((f) => f.FieldName)).toEqual(["Serial"]);
    expect(nvr[0].IsActive).toBe(1);

    const camera = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);
    const camSerial = camera.find((f) => f.FieldName === "Serial");
    expect(camSerial).toBeDefined();
    expect(camSerial!.IsActive).toBe(0);
  });

  it("is idempotent across repeated imports of the same template", async () => {
    await seedDeviceField("Camera", "Vendor", "Vendor");
    await seedDeviceField("Camera", "Resolution", "Resolution");

    const data = makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Resolution", Label: "Resolution", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      []
    );

    await applyTemplateImport(data);
    await applyTemplateImport(data);

    const all = await db.getAllAsync<{ FieldName: string; IsActive: number }>(
      `SELECT FieldName, IsActive FROM DeviceFieldDefinitions WHERE TemplateID = ? ORDER BY FieldName`,
      [TID]
    );
    expect(all).toHaveLength(2);
    const vendor = all.find((r) => r.FieldName === "Vendor");
    expect(vendor!.IsActive).toBe(0);
    expect(all.find((r) => r.FieldName === "Resolution")!.IsActive).toBe(1);
  });

  it("removes a deactivated mandatory device field from new-inspection validation", async () => {
    await seedDeviceField("Camera", "Serial", "Serial", { isRequired: 1, displayOrder: 1 });
    await seedDeviceField("Camera", "Optional", "Optional", { isRequired: 0, displayOrder: 2 });

    await applyTemplateImport(makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Optional", Label: "Optional", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      []
    ));

    const active = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID);
    expect(active.map((f) => f.FieldName)).toEqual(["Optional"]);
    expect(active.some((f) => f.IsRequired === 1)).toBe(false);

    const all = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);
    const removed = all.find((f) => f.FieldName === "Serial");
    expect(removed).toBeDefined();
    expect(removed!.IsActive).toBe(0);
    expect(removed!.IsRequired).toBe(1);
  });

  it("never returns a removed default option for new records", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);
    await seedDeviceOption("Camera", "CameraStatus", "Broken", "Broken", 0, 2);

    await applyTemplateImport(makeDeviceImport(
      [],
      [
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Online", OptionValue: "Online", DisplayOrder: 1, IsDefault: 1 },
      ]
    ));

    const defaultValue = await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID);
    expect(defaultValue).toBe("Online");
    expect(defaultValue).not.toBe("Working");

    await applyTemplateImport(makeDeviceImport(
      [],
      [
        { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "Online", OptionValue: "Online", DisplayOrder: 1, IsDefault: 0 },
      ]
    ));

    expect(await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID)).toBeNull();

    const all = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID, true);
    expect(all.find((o) => o.OptionLabel === "Working")!.IsActive).toBe(0);
  });
});

function makeField(key: string, displayOrder: number): TemplateExportData["templates"][0]["sections"][0]["fields"][0] {
  return {
    FieldName: key,
    FieldKey: key,
    FieldType: "text",
    Placeholder: null,
    DefaultValue: null,
    HelpText: null,
    ValidationRule: null,
    DisplayOrder: displayOrder,
    IsRequired: 0,
    IsVisible: 1,
    IsReadOnly: 0,
    IsSystemField: 0,
    Width: 12,
    options: [],
  };
}

function makeSection(sectionKey: string, fieldKeys: string[]): TemplateExportData["templates"][0]["sections"][0] {
  return {
    SectionName: sectionKey,
    SectionKey: sectionKey,
    Description: null,
    Icon: null,
    DisplayOrder: 1,
    IsRepeatable: 0,
    IsVisible: 1,
    fields: fieldKeys.map((k, i) => makeField(k, i + 1)),
  };
}

function makeFieldImport(
  templateName: string,
  sections: Array<{ sectionKey: string; fieldKeys: string[] }>,
  description: string | null = "Test"
): TemplateExportData {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: [
      {
        TemplateName: templateName,
        Description: description,
        IsDefault: 0,
        sections: sections.map((s) => makeSection(s.sectionKey, s.fieldKeys)),
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: [],
  };
}

async function seedActiveField(templateName: string, sectionKey: string, fieldKey: string): Promise<number> {
  const template = await db.getFirstAsync<{ TemplateID: number }>(
    "SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?",
    [templateName]
  );
  expect(template).toBeTruthy();
  const section = await db.runAsync(
    `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
     VALUES (?, ?, ?, 1, 0, 1, 0, 1)`,
    [template!.TemplateID, sectionKey, sectionKey]
  );
  const field = await db.runAsync(
    `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, DisplayOrder, IsRequired, IsVisible, IsActive)
     VALUES (?, ?, ?, 'text', 1, 0, 1, 1)`,
    [section.lastInsertRowId, fieldKey, fieldKey]
  );
  return field.lastInsertRowId;
}

describe("Template import — global field identifier uniqueness", () => {
  it("rejects an import whose identifier collides with an active field of another template", async () => {
    await seedActiveField("Default Template", "general_information", "voltage");

    const result = await applyTemplateImport(
      makeFieldImport("Imported Form", [{ sectionKey: "electrical", fieldKeys: ["Voltage"] }])
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("already exists as an active field");

    const created = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?",
      ["Imported Form"]
    );
    expect(created).toBeNull();
  });

  it("rejects an identifier that matches an active field ignoring surrounding whitespace", async () => {
    await seedActiveField("Default Template", "general_information", "voltage");

    const result = await applyTemplateImport(
      makeFieldImport("Imported Form", [{ sectionKey: "electrical", fieldKeys: ["  VOLTAGE  "] }])
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("already exists as an active field");
  });

  it("rejects duplicate identifiers within a single import across sections", async () => {
    const result = await applyTemplateImport(
      makeFieldImport("Imported Form", [
        { sectionKey: "first", fieldKeys: ["voltage"] },
        { sectionKey: "second", fieldKeys: ["Voltage"] },
      ])
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Duplicate field identifier");

    const created = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?",
      ["Imported Form"]
    );
    expect(created).toBeNull();
  });

  it("rejects duplicate identifiers used across two templates of one import", async () => {
    const data: TemplateExportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Alpha",
          Description: "Test",
          IsDefault: 0,
          sections: [makeSection("a", ["voltage"])],
          deviceTypes: [],
          deviceOptions: [],
        },
        {
          TemplateName: "Beta",
          Description: "Test",
          IsDefault: 0,
          sections: [makeSection("b", ["Voltage"])],
          deviceTypes: [],
          deviceOptions: [],
        },
      ],
      projectDeviceTypes: [],
    };

    const result = await applyTemplateImport(data);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Duplicate field identifier");

    expect(
      await db.getFirstAsync<{ TemplateID: number }>(
        "SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?",
        ["Alpha"]
      )
    ).toBeNull();
    expect(
      await db.getFirstAsync<{ TemplateID: number }>(
        "SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?",
        ["Beta"]
      )
    ).toBeNull();
  });

  it("allows an identifier that matches an inactive field of another template", async () => {
    const fieldId = await seedActiveField("Default Template", "general_information", "voltage");
    await db.runAsync(`UPDATE InspectionFields SET IsActive = 0 WHERE FieldID = ?`, [fieldId]);

    const result = await applyTemplateImport(
      makeFieldImport("Imported Form", [{ sectionKey: "electrical", fieldKeys: ["voltage"] }])
    );

    expect(result.success).toBe(true);

    const active = await db.getAllAsync<{ FieldKey: string }>(
      "SELECT FieldKey FROM InspectionFields WHERE IsActive = 1 AND FieldKey = ?",
      ["voltage"]
    );
    expect(active).toHaveLength(1);
  });

  it("allows re-importing a template's own field identifiers", async () => {
    await seedActiveField("Default Template", "general_information", "voltage");

    const result = await applyTemplateImport(
      makeFieldImport("Default Template", [{ sectionKey: "general_information", fieldKeys: ["voltage"] }])
    );

    expect(result.success).toBe(true);

    const active = await db.getAllAsync<{ FieldKey: string }>(
      "SELECT FieldKey FROM InspectionFields WHERE IsActive = 1 AND FieldKey = ?",
      ["voltage"]
    );
    expect(active).toHaveLength(1);
  });

  it("rolls back all writes when a mid-transaction failure occurs", async () => {
    await seedDeviceField("Camera", "Vendor", "Vendor");
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);

    const changingData: TemplateExportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Default Template",
          Description: "CHANGED",
          IsDefault: 0,
          sections: [],
          deviceTypes: [],
          deviceOptions: [
            { DeviceType: "Camera", FieldName: "CameraStatus", OptionLabel: "X", OptionValue: "X", DisplayOrder: 1, IsDefault: 1 },
          ],
        },
      ],
      projectDeviceTypes: [],
    };

    const originalRunAsync = db.runAsync.bind(db);
    const spy = jest.spyOn(db, "runAsync");
    spy.mockImplementation((async (sql: string, params: unknown[] = []) => {
      const s = sql.toUpperCase();
      if (s.includes("INSERT INTO DEVICEOPTIONS")) {
        throw new Error("mid-transaction failure");
      }
      return originalRunAsync(sql, params as unknown as Parameters<typeof originalRunAsync>[1]);
    }) as never);

    const result = await applyTemplateImport(changingData);

    expect(result.success).toBe(false);
    expect(result.message).toContain("mid-transaction failure");

    const template = await db.getFirstAsync<{ Description: string }>(
      "SELECT Description FROM InspectionTemplates WHERE TemplateName = ?",
      ["Default Template"]
    );
    expect(template?.Description).toBe("Test");

    const vendor = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM DeviceFieldDefinitions WHERE TemplateID = ? AND FieldName = ?",
      [TID, "Vendor"]
    );
    expect(vendor?.IsActive).toBe(1);

    const working = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM DeviceOptions WHERE TemplateID = ? AND OptionLabel = ?",
      [TID, "Working"]
    );
    expect(working?.IsActive).toBe(1);
    expect(await DeviceOptionsRepository.getDefaultOption("Camera", "CameraStatus", TID)).toBe("Working");
    expect(
      await db.getFirstAsync<{ OptionID: number }>(
        "SELECT OptionID FROM DeviceOptions WHERE TemplateID = ? AND OptionLabel = ?",
        [TID, "X"]
      )
    ).toBeNull();
  });
});

describe("Template import — unconditional device deactivation", () => {
  it("deactivates stale device fields when deviceTypes is empty", async () => {
    await seedDeviceField("Camera", "Vendor", "Vendor");
    await seedDeviceField("Camera", "Resolution", "Resolution");

    await applyTemplateImport(makeDeviceImport([], []));

    const all = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);
    expect(all).toHaveLength(2);
    expect(all.every((f) => f.IsActive === 0)).toBe(true);
  });

  it("deactivates stale device options when deviceOptions is empty", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);
    await seedDeviceOption("Camera", "CameraStatus", "Broken", "Broken", 0, 2);

    await applyTemplateImport(makeDeviceImport([], []));

    const all = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID, true);
    expect(all).toHaveLength(2);
    expect(all.every((o) => o.IsActive === 0)).toBe(true);
  });

  it("deactivates both stale fields and options on a combined empty import", async () => {
    await seedDeviceField("Camera", "Serial", "Serial");
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);

    await applyTemplateImport(makeDeviceImport([], []));

    const fields = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true);
    expect(fields.find((f) => f.FieldName === "Serial")!.IsActive).toBe(0);

    const options = await DeviceOptionsRepository.getByField("Camera", "CameraStatus", TID, true);
    expect(options.find((o) => o.OptionLabel === "Working")!.IsActive).toBe(0);
  });

  it("leaves historical device records untouched when deactivating stale config", async () => {
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);
    await db.runAsync(
      `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData, DisplayOrder, IsActive)
       VALUES (1, 'Camera', 1, '[]', 1, 1)`
    );

    await applyTemplateImport(makeDeviceImport([], []));

    const records = await db.getAllAsync<{ InspectionID: number; DeviceType: string; IsActive: number }>(
      "SELECT InspectionID, DeviceType, IsActive FROM DeviceRecords"
    );
    expect(records).toHaveLength(1);
    expect(records[0].InspectionID).toBe(1);
    expect(records[0].DeviceType).toBe("Camera");
    expect(records[0].IsActive).toBe(1);
  });

  it("rolls back a failed restore of device config", async () => {
    await seedDeviceField("Camera", "Serial", "Serial");
    await seedDeviceOption("Camera", "CameraStatus", "Working", "Working", 1, 1);

    const data = makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Remote", Label: "Remote", FieldType: "text", IsRequired: 0, DisplayOrder: 2 },
      ],
      []
    );

    const originalRunAsync = db.runAsync.bind(db);
    const spy = jest.spyOn(db, "runAsync");
    spy.mockImplementation((async (sql: string, params: unknown[] = []) => {
      const s = sql.toUpperCase();
      if (s.includes("INSERT INTO DEVICEFIELDDEFINITIONS")) {
        throw new Error("restore failure");
      }
      return originalRunAsync(sql, params as unknown as Parameters<typeof originalRunAsync>[1]);
    }) as never);

    const result = await applyTemplateImport(data);
    expect(result.success).toBe(false);
    expect(result.message).toContain("restore failure");

    const serial = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM DeviceFieldDefinitions WHERE TemplateID = ? AND FieldName = ?",
      [TID, "Serial"]
    );
    expect(serial?.IsActive).toBe(1);

    const working = await db.getFirstAsync<{ IsActive: number }>(
      "SELECT IsActive FROM DeviceOptions WHERE TemplateID = ? AND OptionLabel = ?",
      [TID, "Working"]
    );
    expect(working?.IsActive).toBe(1);
  });

  it("re-activates device fields removed by an empty restore on the next proper import", async () => {
    await seedDeviceField("Camera", "Serial", "Serial");

    await applyTemplateImport(makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Serial", Label: "Serial", FieldType: "text", IsRequired: 0, DisplayOrder: 1 },
      ],
      []
    ));
    expect(
      (await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID)).some((f) => f.FieldName === "Serial")
    ).toBe(true);

    await applyTemplateImport(makeDeviceImport([], []));
    expect(
      (await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID, true))
        .find((f) => f.FieldName === "Serial")!.IsActive
    ).toBe(0);

    await applyTemplateImport(makeDeviceImport(
      [
        { DeviceType: "Camera", FieldName: "Serial", Label: "Serial", FieldType: "text", IsRequired: 0, DisplayOrder: 1 },
      ],
      []
    ));
    const active = await DeviceFieldDefinitionsRepository.getByDeviceType("Camera", TID);
    expect(active.some((f) => f.FieldName === "Serial")).toBe(true);
    expect(active.find((f) => f.FieldName === "Serial")!.IsActive).toBe(1);
  });
});
