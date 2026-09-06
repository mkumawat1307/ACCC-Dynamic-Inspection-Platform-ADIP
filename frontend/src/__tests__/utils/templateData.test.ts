jest.mock("@/src/database/db");

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-document-picker", () => {
  let mockResult = { canceled: true };
  return {
    getDocumentAsync: jest.fn().mockImplementation(async () => mockResult),
    __setMockResult: (r: typeof mockResult) => { mockResult = r; },
    __resetPickerState: () => { mockResult = { canceled: true }; },
  };
});

import { getDatabase } from "@/src/database/db";
import * as FileSystem from "expo-file-system/legacy";
import { __setMockResult, __resetPickerState } from "expo-document-picker";

declare module "expo-document-picker" {
  export function __setMockResult(r: { canceled: boolean; assets?: { uri: string; name?: string }[] }): void;
  export function __resetPickerState(): void;
}

function makeValidV2(): any {
  return {
    version: "2.0",
    exportedAt: "2024-01-01T00:00:00.000Z",
    templates: [
      {
        TemplateName: "Test Template",
        Description: "A test",
        IsDefault: 1,
        sections: [
          {
            SectionName: "General",
            SectionKey: "general",
            Description: null,
            Icon: null,
            DisplayOrder: 1,
            IsRepeatable: 0,
            IsVisible: 1,
            fields: [
              {
                FieldName: "Voltage",
                FieldKey: "voltage",
                FieldType: "text",
                Placeholder: null,
                DefaultValue: null,
                HelpText: null,
                ValidationRule: null,
                DisplayOrder: 1,
                IsRequired: 1,
                IsVisible: 1,
                IsReadOnly: 0,
                IsSystemField: 0,
                Width: 12,
                options: [],
              },
            ],
          },
        ],
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: ["Camera"],
  };
}

describe("pickAndParseTemplate", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      withTransactionAsync: jest.fn(),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    __resetPickerState();
  });

  it("returns canceled when no file selected", async () => {
    __setMockResult({ canceled: true });
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    expect(await pickAndParseTemplate()).toEqual({ status: "canceled" });
  });

  it("parses a v2.0 file and returns a summary", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(makeValidV2()));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.parsed.data.version).toBe("2.0");
      expect(result.parsed.summary).toEqual({ templateCount: 1, sectionCount: 1, fieldCount: 1, deviceTypeCount: 0, deviceOptionCount: 0 });
    }
  });

  it("normalizes a v1.0 file to v2.0 shape", async () => {
    const legacy = {
      version: "1.0",
      exportedAt: "2024-01-01T00:00:00.000Z",
      template: { TemplateName: "Old", Description: null },
      sections: makeValidV2().templates[0].sections,
    };
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(legacy));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.parsed.data.templates).toHaveLength(1);
      expect(result.parsed.data.templates[0].TemplateName).toBe("Old");
      expect(result.parsed.data.templates[0].deviceTypes).toEqual([]);
      expect(result.parsed.data.projectDeviceTypes).toEqual([]);
    }
  });

  it("rejects invalid JSON and missing templates", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce("not json");
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    expect(await pickAndParseTemplate()).toEqual({ status: "error", message: "Invalid JSON file." });

    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({}));
    expect(await pickAndParseTemplate()).toEqual({ status: "error", message: "Invalid template format." });
  });

  it("rejects a legacy file missing TemplateName", async () => {
    const legacy = {
      version: "1.0",
      template: { TemplateName: null, Description: null },
      sections: [],
    };
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(legacy));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    expect(await pickAndParseTemplate()).toEqual({ status: "error", message: "Template missing valid TemplateName." });
  });

  it("rejects a v2 file whose section has no fields array", async () => {
    const v2 = makeValidV2();
    delete v2.templates[0].sections[0].fields;
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(v2));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("missing fields array");
  });

  it("rejects a field with an invalid FieldType", async () => {
    const v2 = makeValidV2();
    v2.templates[0].sections[0].fields[0].FieldType = "invalid_type";
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(v2));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("invalid FieldType");
  });

  it("rejects a field option missing OptionLabel", async () => {
    const v2 = makeValidV2();
    v2.templates[0].sections[0].fields[0].options = [
      { OptionLabel: "", OptionValue: "", DisplayOrder: 1, IsDefault: 0 },
    ];
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(v2));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("OptionLabel");
  });
});

describe("applyTemplateImport", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("deactivates existing non-default template rows and inserts imported data", async () => {
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(makeValidV2());

    expect(result.success).toBe(true);
    const deactivateCalls = (mockDb.runAsync as jest.Mock).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("IsActive = 0")
    );
    expect(deactivateCalls.length).toBeGreaterThanOrEqual(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionTemplates"),
      expect.arrayContaining(["Test Template", 1])
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionSections"),
      expect.anything()
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionFields"),
      expect.anything()
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionTemplates"),
      expect.anything()
    );
  });

  it("updates an existing template in place rather than inserting a duplicate", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ TemplateID: 42 });
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(makeValidV2());

    expect(result.success).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE InspectionTemplates SET Description"),
      expect.arrayContaining(["A test", 1, 42])
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE InspectionSections SET IsActive = 0 WHERE TemplateID = ?"),
      [42]
    );
  });

  it("upserts device field definitions by (TemplateID, DeviceType, FieldName)", async () => {
    const v2 = makeValidV2();
    v2.templates[0].deviceTypes = [
      { DeviceType: "UPS", FieldName: "UPSMake", Label: "UPS Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 1 },
    ];
    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(v2);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO DeviceFieldDefinitions"),
      expect.arrayContaining(["UPS", "UPSMake", "UPS Make"])
    );
  });

  it("replaces ProjectDeviceTypes without referencing ProjectID", async () => {
    const v2 = makeValidV2();
    v2.projectDeviceTypes = ["Camera", "UPS"];
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(v2);

    expect(result.success).toBe(true);
    const calls = (mockDb.runAsync as jest.Mock).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((sql) => sql.includes("ProjectDeviceTypes"))).toBe(true);
    expect(calls.some((sql) => sql.includes("ProjectID"))).toBe(false);
  });

  it("normalizes uppercased field types like DATE_AUTO to lowercase", async () => {
    const v2 = makeValidV2();
    v2.templates[0].sections[0].fields[0].FieldType = "DATE_AUTO";
    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(v2);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionFields"),
      expect.arrayContaining(["date_auto"])
    );
  });

  it("returns an error message when the DB transaction fails", async () => {
    mockDb.withTransactionAsync.mockRejectedValueOnce(new Error("DB failure"));
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(makeValidV2());

    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to import");
  });
});
