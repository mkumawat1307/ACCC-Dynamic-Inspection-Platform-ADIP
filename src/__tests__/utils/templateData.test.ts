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

jest.mock("expo-sharing", () => {
  let sharingAvailable = true;
  return {
    isAvailableAsync: jest.fn().mockImplementation(async () => sharingAvailable),
    shareAsync: jest.fn().mockResolvedValue(undefined),
    __setSharingAvailable: (v: boolean) => { sharingAvailable = v; },
  };
});

import { getDatabase } from "@/src/database/db";
import * as FileSystem from "expo-file-system/legacy";
import { __setMockResult, __resetPickerState } from "expo-document-picker";
import { __setSharingAvailable } from "expo-sharing";

declare module "expo-sharing" {
  export function __setSharingAvailable(v: boolean): void;
}

function makeValidTemplate() {
  return {
    version: "1.0",
    exportedAt: "2024-01-01T00:00:00.000Z",
    template: { TemplateName: "Test Template", Description: "A test" },
    sections: [
      {
        SectionName: "General",
        SectionKey: "general",
        Description: null,
        Icon: null,
        DisplayOrder: 1,
        IsRepeatable: 0,
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
            options: [],
          },
        ],
      },
    ],
  };
}

describe("exportDefaultTemplate", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
      withTransactionAsync: jest.fn(),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    __setSharingAvailable(true);
  });

  it("returns false when no default template exists", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const { exportDefaultTemplate } = require("@/src/utils/templateData");
    const result = await exportDefaultTemplate();
    expect(result).toBe(false);
  });

  it("exports template and shares it", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ TemplateID: 1, TemplateName: "Default", Description: "Default template" });
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionName: "General", SectionKey: "general", Description: null, Icon: null, DisplayOrder: 1, IsRepeatable: 0 },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text", Placeholder: null, DefaultValue: null, HelpText: null, ValidationRule: null, DisplayOrder: 1, IsRequired: 1, IsVisible: 1, IsReadOnly: 0 },
      ])
      .mockResolvedValueOnce([]);

    const { exportDefaultTemplate } = require("@/src/utils/templateData");
    const result = await exportDefaultTemplate();

    expect(result).toBe(true);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    const { shareAsync } = require("expo-sharing");
    expect(shareAsync).toHaveBeenCalled();
  });
});

describe("importTemplate", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
      withTransactionAsync: jest.fn(),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    __resetPickerState();
  });

  it("returns cancelled when no file selected", async () => {
    __setMockResult({ canceled: true });

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result).toEqual({ success: false, message: "No file selected." });
  });

  it("returns invalid JSON when file is not valid JSON", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce("not json");

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result).toEqual({ success: false, message: "Invalid JSON file." });
  });

  it("returns invalid format when template structure is missing", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({}));

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid template format");
  });

  it("returns error when TemplateName is missing", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({ template: {}, sections: [] }));

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(false);
    expect(result.message).toContain("TemplateName");
  });

  it("validates field types", async () => {
    const data = makeValidTemplate();
    data.sections[0].fields[0].FieldType = "invalid_type";
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(false);
    expect(result.message).toContain("invalid FieldType");
  });

  it("accepts uppercased field types like DATE_AUTO from exported seed templates", async () => {
    const data = makeValidTemplate();
    data.sections[0].fields[0].FieldType = "DATE_AUTO";
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionFields"),
      expect.arrayContaining(["date_auto"])
    );
  });

  it("validates section fields array exists", async () => {
    const data = makeValidTemplate();
    delete (data.sections[0] as any).fields;
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(false);
    expect(result.message).toContain("missing fields array");
  });

  it("validates field options have required properties", async () => {
    const data = makeValidTemplate();
    (data.sections[0].fields[0].options as Array<Record<string, unknown>>) = [{ OptionLabel: "", OptionValue: "", DisplayOrder: 1, IsDefault: 0 }];
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(false);
    expect(result.message).toContain("OptionLabel");
  });

  it("imports a valid template successfully", async () => {
    const data = makeValidTemplate();
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));
    mockDb.withTransactionAsync.mockImplementationOnce(async (fn: () => Promise<void>) => fn());

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(true);
    expect(result.message).toContain("imported");
  });

  it("returns error when DB transaction fails", async () => {
    const data = makeValidTemplate();
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));
    mockDb.withTransactionAsync.mockRejectedValueOnce(new Error("DB failure"));

    const { importTemplate } = require("@/src/utils/templateData");
    const result = await importTemplate();

    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to import");
  });
});

describe("exportTemplates", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
      withTransactionAsync: jest.fn(),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("returns null when no templates exist", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const { exportTemplates } = require("@/src/utils/templateData");
    expect(await exportTemplates()).toBeNull();
  });

  it("exports all templates with sections, fields, options, device data and summary", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { TemplateID: 1, TemplateName: "Default", Description: "d", IsDefault: 1, IsActive: 1 },
        { TemplateID: 2, TemplateName: "Custom", Description: null, IsDefault: 0, IsActive: 1 },
      ])
      .mockResolvedValueOnce([
        { SectionID: 1, SectionName: "General", SectionKey: "general", Description: null, Icon: null, DisplayOrder: 1, IsRepeatable: 0, IsVisible: 1 },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text", Placeholder: null, DefaultValue: null, HelpText: null, ValidationRule: null, DisplayOrder: 1, IsRequired: 1, IsVisible: 1, IsReadOnly: 0, IsSystemField: 0, Width: 12 },
      ])
      .mockResolvedValueOnce([
        { OptionLabel: "A", OptionValue: "a", DisplayOrder: 1, IsDefault: 0 },
      ])
      .mockResolvedValueOnce([]) // sections for template 2
      .mockResolvedValueOnce([]) // device types for template 1
      .mockResolvedValueOnce([]) // device options for template 1
      .mockResolvedValueOnce([]) // device types for template 2
      .mockResolvedValueOnce([]) // device options for template 2
      .mockResolvedValueOnce(["Camera", "Switch", "UPS"]); // projectDeviceTypes

    const { exportTemplates } = require("@/src/utils/templateData");
    const result = await exportTemplates();

    expect(result).not.toBeNull();
    expect(result!.fileName).toMatch(/^template_.+\.json$/);
    expect(result!.summary).toEqual({
      templateCount: 2,
      sectionCount: 1,
      fieldCount: 1,
      deviceTypeCount: 0,
      deviceOptionCount: 0,
    });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();

    const { shareAsync } = require("expo-sharing");
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it("writes the v2.0 JSON shape", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([{ TemplateID: 1, TemplateName: "Default", Description: null, IsDefault: 1, IsActive: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ DeviceType: "Camera" }]);

    const { exportTemplates } = require("@/src/utils/templateData");
    await exportTemplates();

    const [, json] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    const data = JSON.parse(json);
    expect(data.version).toBe("2.0");
    expect(data.templates).toHaveLength(1);
    expect(data.templates[0].TemplateName).toBe("Default");
    expect(data.templates[0].sections).toEqual([]);
    expect(data.templates[0].deviceTypes).toEqual([]);
    expect(data.projectDeviceTypes).toEqual(["Camera"]);
  });
});
