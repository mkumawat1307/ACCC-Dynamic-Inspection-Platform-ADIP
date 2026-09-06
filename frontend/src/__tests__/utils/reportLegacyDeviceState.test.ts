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

import { ReportTable } from "@/src/utils/exportData";

const GEN = 1;
const POLE = 2;
const F_DATE = 100;
const F_POLE_ID = 101;
const F_FOUNDATION = 200;

const columnRows = [
  { SectionID: GEN, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: F_DATE, FieldKey: "date", FieldName: "Date" },
  { SectionID: GEN, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: F_POLE_ID, FieldKey: "pole_id", FieldName: "Site ID" },
  { SectionID: POLE, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsRepeatable: 0, FieldID: F_FOUNDATION, FieldKey: "foundation_cond", FieldName: "Foundation Condition" },
];

const inspections = [
  { InspectionID: 11, Status: "Completed" },
  { InspectionID: 12, Status: "Completed" },
  { InspectionID: 13, Status: "Completed" },
];

const values = [
  { InspectionID: 11, FieldID: F_POLE_ID, FieldValue: "P-001" },
  { InspectionID: 11, FieldID: F_FOUNDATION, FieldValue: "Acceptable" },
  { InspectionID: 12, FieldID: F_POLE_ID, FieldValue: "P-002" },
  { InspectionID: 12, FieldID: F_FOUNDATION, FieldValue: "Acceptable" },
  { InspectionID: 13, FieldID: F_POLE_ID, FieldValue: "P-003" },
  { InspectionID: 13, FieldID: F_FOUNDATION, FieldValue: "Minor Damage" },
];

let mockDb: { getAllAsync: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

async function build(): Promise<ReportTable> {
  mockDb = {
    getAllAsync: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("FROM DeviceFieldDefinitions")) {
        throw new Error("no such table: DeviceFieldDefinitions");
      }
      if (sql.includes("FROM DeviceRecords")) {
        throw new Error("no such table: DeviceRecords");
      }
      if (sql.includes("FROM DeviceOptions")) {
        throw new Error("no such table: DeviceOptions");
      }
      if (sql.includes("FROM InspectionFields f") && sql.includes("JOIN InspectionSections")) {
        return columnRows;
      }
      if (sql.includes("FROM InspectionValues") && sql.includes("JOIN Inspections")) {
        return values;
      }
      if (/SELECT\s+FieldID\s+FROM\s+InspectionValues/i.test(sql)) {
        return [];
      }
      if (sql.includes("FROM FieldOptions")) {
        return [];
      }
      if (sql.includes("FROM Inspections")) {
        return inspections;
      }
      return [];
    }),
  };
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  const { buildReportTable } = require("@/src/utils/exportData");
  return buildReportTable(1) as Promise<ReportTable>;
}

describe("Report — legacy project state must never wipe inspection rows", () => {
  it("returns all inspection rows when device tables throw like a legacy DB (never 'No inspection data to preview')", async () => {
    const table = await build();

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(3);
    expect(table.headers).toContain("Date");
    expect(table.headers).toContain("Site ID");
  });

  it("keeps the scalar values intact under the legacy device-state failure", async () => {
    const table = await build();

    const siteIdIdx = table.headers.indexOf("Site ID");
    expect(table.rows.map((r) => r.cells[siteIdIdx])).toEqual(["P-001", "P-002", "P-003"]);
  });
});