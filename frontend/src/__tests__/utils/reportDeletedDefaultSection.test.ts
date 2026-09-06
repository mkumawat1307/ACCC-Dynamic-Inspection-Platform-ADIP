import { getDatabase } from "@/src/database/db";

jest.mock("@/src/database/db");

jest.mock("@/src/utils/storageManager", () => ({
  ensureRootFolder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/utils/downloadStorage", () => ({
  downloadStorage: {
    androidApiLevel: 35,
    hasFiles: jest.fn().mockResolvedValue(true),
    writeBase64: jest.fn().mockResolvedValue("content://mock/exported/file.xlsx"),
    writeUtf8: jest.fn().mockResolvedValue("content://mock/exported/file.csv"),
    readBase64: jest.fn().mockResolvedValue("QUJD"),
    deleteFile: jest.fn().mockResolvedValue(true),
    findFile: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue("QUJD"),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  getContentUriAsync: jest.fn().mockResolvedValue("content://mock/exported"),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: 0 }),
}));

// Simulates the project DB state AFTER a user soft-deletes the default
// "pole_structure" section (Pole Structure Details). softDeleteSection() only
// flips InspectionSections.IsActive=0; its fields and all InspectionValues
// intacts. The active-column query therefore no longer returns the pole
// fields, but historical values reference them (orphans).
//
// SectionID layout (matches the seeded template order):
//   1 = general_information, 2 = pole_structure, 3 = camera_information
const GEN_SECTION = 1;
const POLE_SECTION = 2;
const CAMERA_SECTION = 3;
const DATE_FIELD = 100;
const POLE_ID_FIELD = 101;
const FOUNDATION_FIELD = 200;

const activeColumnRows = [
  {
    SectionID: GEN_SECTION,
    SectionKey: "general_information",
    SectionName: "General Information",
    IsRepeatable: 0,
    FieldID: DATE_FIELD,
    FieldKey: "date",
    FieldName: "Date",
  },
  {
    SectionID: GEN_SECTION,
    SectionKey: "general_information",
    SectionName: "General Information",
    IsRepeatable: 0,
    FieldID: POLE_ID_FIELD,
    FieldKey: "pole_id",
    FieldName: "Site ID",
  },
  {
    SectionID: CAMERA_SECTION,
    SectionKey: "camera_information",
    SectionName: "Camera Information",
    IsRepeatable: 1,
    FieldID: 300,
    FieldKey: "camera_count",
    FieldName: "Camera Count",
  },
];

const orphanFieldRows = [
  {
    SectionID: POLE_SECTION,
    FieldID: FOUNDATION_FIELD,
    FieldKey: "foundation_cond",
    FieldName: "Foundation Condition",
    IsActive: 1,
    IsVisible: 1,
    DisplayOrder: 1,
  },
];

const orphanSectionRows = [
  {
    SectionID: POLE_SECTION,
    SectionName: "Pole Structure Details",
    SectionKey: "pole_structure",
    IsRepeatable: 0,
    IsActive: 0,
    IsVisible: 1,
  },
];

const foundationOptions = [
  { FieldID: FOUNDATION_FIELD, OptionLabel: "Acceptable", OptionValue: "Acceptable" },
  { FieldID: FOUNDATION_FIELD, OptionLabel: "Minor Damage", OptionValue: "Minor Damage" },
];

const inspections = [
  { InspectionID: 11, Status: "Completed" },
  { InspectionID: 12, Status: "Completed" },
  { InspectionID: 13, Status: "Completed" },
];

const allValues = [
  { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
  { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "Acceptable" },
  { InspectionID: 12, FieldID: POLE_ID_FIELD, FieldValue: "P-002" },
  { InspectionID: 12, FieldID: FOUNDATION_FIELD, FieldValue: "Acceptable" },
  { InspectionID: 13, FieldID: POLE_ID_FIELD, FieldValue: "P-003" },
  { InspectionID: 13, FieldID: FOUNDATION_FIELD, FieldValue: "Minor Damage" },
];

const allValueFieldIdRows = [
  { FieldID: POLE_ID_FIELD },
  { FieldID: FOUNDATION_FIELD },
];

describe("Report Preview after a DEFAULT non-repeatable section is deleted", () => {
  function createMockDb(opts: {
    valueFieldIdRows?: { FieldID: number }[];
    values?: typeof allValues;
  } = {}): { getAllAsync: jest.Mock } {
    const valueFieldIdRows = opts.valueFieldIdRows ?? allValueFieldIdRows;
    const values = opts.values ?? allValues;

    return {
      getAllAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM InspectionFields f") && sql.includes("JOIN InspectionSections")) {
          return activeColumnRows;
        }
        if (sql.includes("FROM DeviceFieldDefinitions")) {
          return [];
        }
        if (sql.includes("FROM Inspections WHERE")) {
          return inspections;
        }
        if (sql.includes("FROM InspectionValues") && /JOIN Inspections/.test(sql)) {
          return values;
        }
        if (sql.includes("FROM DeviceRecords")) {
          return [];
        }
        if (sql.includes("FROM FieldOptions WHERE IsActive")) {
          return foundationOptions;
        }
        if (sql.includes("FROM DeviceOptions WHERE IsActive")) {
          return [];
        }
        if (/SELECT\s+FieldID\s+FROM\s+InspectionValues/i.test(sql)) {
          const ids = new Set(params as number[]);
          const fieldIdsWithValues = new Set(
            values.filter((v) => ids.has(v.InspectionID)).map((v) => v.FieldID)
          );
          const out = valueFieldIdRows.filter((f) => fieldIdsWithValues.has(f.FieldID));
          return out;
        }
        if (sql.includes("FROM InspectionFields WHERE FieldID IN")) {
          const ids = new Set(params as number[]);
          return orphanFieldRows.filter((f) => ids.has(f.FieldID));
        }
        if (sql.includes("FROM InspectionSections WHERE SectionID IN")) {
          const ids = new Set(params as number[]);
          return orphanSectionRows.filter((s) => ids.has(s.SectionID));
        }
        return [];
      }),
    };
  }

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps every completed inspection AND shows a 'Deleted Pole Structure Details' band with its historical data", async () => {
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(3);

    const names = table.sections.map((s: { name: string }) => s.name);
    expect(names).toContain("General Information");
    expect(names).toContain("Camera Information");
    expect(names).toContain("Deleted Pole Structure Details");

    const band = table.sections.find(
      (s: { name: string }) => s.name === "Deleted Pole Structure Details"
    );
    expect(band?.deleted).toBe(true);

    expect(table.headers).toContain("Site ID");
    expect(table.headers).toContain("Deleted Foundation Condition");

    const siteIdIdx = table.headers.indexOf("Site ID");
    const deletedIdx = table.headers.indexOf("Deleted Foundation Condition");

    expect(table.rows.map((r: { cells: string[] }) => r.cells[siteIdIdx])).toEqual([
      "P-001",
      "P-002",
      "P-003",
    ]);
    expect(table.rows.map((r: { cells: string[] }) => r.cells[deletedIdx])).toEqual([
      "Acceptable",
      "Acceptable",
      "Minor Damage",
    ]);
  });

  it("deleting ONE section never hides inspections — active sections still show for every inspection", async () => {
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    const hasCameraCol = table.headers.some((h: string) => h === "Camera Count");
    expect(hasCameraCol).toBe(true);
    expect(table.rows.every((r: { cells: string[] }) => r.cells.length === table.headers.length)).toBe(true);
  });

  it("does NOT re-add the deleted band when no historical values exist for the deleted section", async () => {
    const values = allValues.filter((v) => v.FieldID === POLE_ID_FIELD);
    mockDb = createMockDb({
      values,
      valueFieldIdRows: [{ FieldID: POLE_ID_FIELD }],
    });
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows.length).toBe(3);
    const names = table.sections.map((s: { name: string }) => s.name);
    expect(names).not.toContain("Deleted Pole Structure Details");
  });

  it("CSV and Excel exports include the deleted section band and its data", async () => {
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { createExportFile } = require("@/src/utils/exportData") as typeof import("@/src/utils/exportData");
    const { downloadStorage } = require("@/src/utils/downloadStorage") as {
      downloadStorage: { writeUtf8: jest.Mock; writeBase64: jest.Mock };
    };

    const csvResult = await createExportFile(1, "Project X", null, "csv");
    expect(csvResult).not.toBeNull();
    expect(downloadStorage.writeUtf8).toHaveBeenCalled();
    const csv = downloadStorage.writeUtf8.mock.calls[0][3] as string;
    expect(csv).toContain("Deleted Foundation Condition");
    expect(csv).toContain("Acceptable");
    expect(csv.split("\n").length).toBe(4);

    const xlsResult = await createExportFile(1, "Project X", null, "excel");
    expect(xlsResult).not.toBeNull();
    expect(downloadStorage.writeBase64).toHaveBeenCalled();
  });
});