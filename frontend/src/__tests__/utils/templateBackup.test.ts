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
    __setMockResult: (r: { canceled: boolean; assets?: { uri: string; name?: string }[] }) => {
      mockResult = r;
    },
    __resetPickerState: () => {
      mockResult = { canceled: true };
    },
  };
});

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    ensureFolder: jest.fn(async () => true),
    writeUtf8: jest.fn(async (_rel: string, _name: string, _mime: string, _text: string) =>
      "content://media/Download/ACCC Dynamic Inspection/some-file.json"
    ),
  },
}));

import { getDatabase } from "@/src/database/db";
import * as FileSystem from "expo-file-system/legacy";
import { downloadStorage } from "@/src/utils/downloadStorage";
import { __setMockResult, __resetPickerState } from "expo-document-picker";

declare module "expo-document-picker" {
  export function __setMockResult(r: { canceled: boolean; assets?: { uri: string; name?: string }[] }): void;
  export function __resetPickerState(): void;
}

const PROJECT_LABEL = "Balotra_Balotra";

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
            fields: [],
          },
        ],
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: ["Camera"],
  };
}

describe("backupTemplatesToFile", () => {
  let mockDb: any;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    __resetPickerState();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("writes the backup JSON to the ACCC Dynamic Inspection root folder", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { TemplateID: 1, TemplateName: "Default", Description: null, IsDefault: 1, IsActive: 1 },
      ])
      .mockResolvedValueOnce([]) // sections
      .mockResolvedValueOnce([]) // device types
      .mockResolvedValueOnce([]) // device options
      .mockResolvedValueOnce([]); // project device types

    const { backupTemplatesToFile } = require("@/src/utils/templateBackup");
    const result = await backupTemplatesToFile(PROJECT_LABEL);

    expect(result.ok).toBe(true);
    expect(downloadStorage.ensureFolder).not.toHaveBeenCalled();
    expect(downloadStorage.writeUtf8).toHaveBeenCalledWith(
      "",
      `${PROJECT_LABEL}_templates_backup.json`,
      "application/json",
      expect.stringContaining('"version": "2.0"')
    );
    expect(logSpy).toHaveBeenCalledWith("[TemplateBackup] start");
    expect(logSpy).toHaveBeenCalledWith("[TemplateBackup] success");
  });

  it("returns an error when no templates exist", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const { backupTemplatesToFile } = require("@/src/utils/templateBackup");
    const result = await backupTemplatesToFile(PROJECT_LABEL);

    expect(result.ok).toBe(false);
    expect(result.message).toBe("No template found to back up.");
    expect(downloadStorage.writeUtf8).not.toHaveBeenCalled();
  });

  it("builds the expected backup file name", () => {
    const { templateBackupFileName } = require("@/src/utils/templateBackup");
    expect(templateBackupFileName(PROJECT_LABEL)).toBe(`${PROJECT_LABEL}_templates_backup.json`);
  });
});

describe("restoreTemplatesFromFile / applyTemplateRestore", () => {
  let mockDb: any;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    __resetPickerState();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("returns canceled when no file is selected", async () => {
    const { restoreTemplatesFromFile } = require("@/src/utils/templateBackup");
    expect(await restoreTemplatesFromFile()).toEqual({ status: "canceled" });
    expect(logSpy).toHaveBeenCalledWith("[TemplateRestore] start");
  });

  it("logs fileSelected and returns error on invalid JSON", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json", name: "backup.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce("not json");

    const { restoreTemplatesFromFile } = require("@/src/utils/templateBackup");
    const step = await restoreTemplatesFromFile();

    expect(step).toEqual({ status: "error", message: "Invalid JSON file." });
    expect(logSpy).toHaveBeenCalledWith("[TemplateRestore] fileSelected=backup.json");
    expect(logSpy).toHaveBeenCalledWith("[TemplateRestore] failed=Invalid JSON file.");
  });

  it("returns a confirm step and applies the restore on confirm", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json", name: "backup.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(makeValidV2()));

    const { restoreTemplatesFromFile, applyTemplateRestore } = require("@/src/utils/templateBackup");
    const step = await restoreTemplatesFromFile();

    expect(step.status).toBe("confirm");
    if (step.status !== "confirm") throw new Error("expected confirm");
    expect(step.parsed.summary.templateCount).toBe(1);
    expect(logSpy).toHaveBeenCalledWith("[TemplateRestore] fileSelected=backup.json");

    const result = await applyTemplateRestore(step.parsed);
    expect(result.ok).toBe(true);
    expect(logSpy).toHaveBeenCalledWith("[TemplateRestore] success");
  });
});
