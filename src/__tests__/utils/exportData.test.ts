import { getDatabase, getGlobalDatabase } from "@/src/database/db";

jest.mock("@/src/database/db");

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

jest.mock("expo-sharing", () => {
  let available = true;
  return {
    isAvailableAsync: jest.fn().mockImplementation(async () => available),
    shareAsync: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: 0 }),
}));

import * as XLSX from "xlsx";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

function createMockDb(overrides: Record<string, unknown> = {}) {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    ...overrides,
  };
}

function setSharingAvailable(available: boolean) {
  (Sharing.isAvailableAsync as jest.Mock).mockImplementation(async () => available);
}

describe("buildReportTable", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  const templateRows = [
    { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
    { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 2, FieldKey: "gps", FieldName: "Lat/Long", FieldDisplayOrder: 2 },
    { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, SectionDisplayOrder: 2, FieldID: 3, FieldKey: "camera_count", FieldName: "Camera Count", FieldDisplayOrder: 1 },
  ];

  const deviceDefs = [
    { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", DisplayOrder: 1 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("builds banded sections and full headers in form order", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([])   // inspections
      .mockResolvedValueOnce([])   // values
      .mockResolvedValueOnce([])   // device records
      .mockResolvedValueOnce([]);  // photos

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.sections.map((s: { name: string }) => s.name)).toEqual([
      "General Information",
      "Camera Information",
      "Summary",
    ]);
    expect(table.headers).toEqual([
      "Pole ID", "Latitude", "Longitude",
      "Camera Count", "Camera Type",
      "Photos",
    ]);
    expect(table.rows).toEqual([]);
  });

  it("fills one base row per inspection and derives Latitude/Longitude", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([
        { InspectionID: 1, Status: "Completed" },
        { InspectionID: 2, Status: "Draft" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
        { InspectionID: 2, FieldID: 1, FieldValue: "P002" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716", "77.5946", "", "", ""], isDeviceRow: false },
      { cells: ["P002", "", "", "", "", ""], isDeviceRow: false },
    ]);
  });

  it("lists devices row by row repeating General Information only", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
        { InspectionID: 1, FieldID: 3, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: JSON.stringify({ CameraType: "PTZ" }) },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FileName: "photo1.jpg" },
      ]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716", "77.5946", "2", "IP", "photo1.jpg"], isDeviceRow: true },
      { cells: ["P001", "12.9716", "77.5946", "", "PTZ", ""], isDeviceRow: true },
    ]);
  });

  it("aligns device rows by index across device sections", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
        { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, SectionDisplayOrder: 2, FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldDisplayOrder: 1 },
        { SectionID: 3, SectionKey: "switch_information", SectionName: "Switch Information", IsRepeatable: 1, SectionDisplayOrder: 3, FieldID: 3, FieldKey: "switch_count", FieldName: "Switch Count", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", DisplayOrder: 1 },
        { DeviceType: "Switch", FieldName: "SwitchType", Label: "Switch Type", DisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "2" },
        { InspectionID: 1, FieldID: 3, FieldValue: "1" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: JSON.stringify({ CameraType: "PTZ" }) },
        { InspectionID: 1, DeviceType: "Switch", DeviceNo: 1, DeviceData: JSON.stringify({ SwitchType: "S1" }) },
      ])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.headers).toEqual([
      "Pole ID", "Camera Count", "Camera Type", "Switch Count", "Switch Type", "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P001", "2", "IP", "1", "S1", ""], isDeviceRow: true },
      { cells: ["P001", "", "PTZ", "", "", ""], isDeviceRow: true },
    ]);
  });

  it("exports device rows for a custom device section created with IsRepeatable = 0", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
        { SectionID: 2, SectionKey: "ups_information", SectionName: "UPS Information", IsRepeatable: 0, SectionDisplayOrder: 2, FieldID: 2, FieldKey: "ups_count", FieldName: "UPS Count", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "UPS", FieldName: "UPSModel", Label: "UPS Model", DisplayOrder: 1 },
        { DeviceType: "UPS", FieldName: "UPSStatus", Label: "UPS Status", DisplayOrder: 2 },
      ])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "UPS", DeviceNo: 1, DeviceData: JSON.stringify({ UPSModel: "APC-1", UPSStatus: "OK" }) },
        { InspectionID: 1, DeviceType: "UPS", DeviceNo: 2, DeviceData: JSON.stringify({ UPSModel: "APC-2", UPSStatus: "Fault" }) },
      ])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.headers).toEqual(["Pole ID", "UPS Count", "UPS Model", "UPS Status", "Photos"]);
    expect(table.rows).toEqual([
      { cells: ["P001", "2", "APC-1", "OK", ""], isDeviceRow: true },
      { cells: ["P001", "", "APC-2", "Fault", ""], isDeviceRow: true },
    ]);
  });

  it("blanks non-General, non-Categorization sections after the first device row", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 2, FieldKey: "date", FieldName: "Date", FieldDisplayOrder: 2 },
        { SectionID: 2, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsRepeatable: 0, SectionDisplayOrder: 2, FieldID: 3, FieldKey: "foundation_cond", FieldName: "Foundation Condition", FieldDisplayOrder: 1 },
        { SectionID: 3, SectionKey: "categorization", SectionName: "Categorization", IsRepeatable: 0, SectionDisplayOrder: 3, FieldID: 4, FieldKey: "pole_category", FieldName: "Pole Category", FieldDisplayOrder: 1 },
        { SectionID: 4, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, SectionDisplayOrder: 4, FieldID: 5, FieldKey: "camera_count", FieldName: "Camera Count", FieldDisplayOrder: 1 },
        { SectionID: 5, SectionKey: "remarks", SectionName: "Remarks", IsRepeatable: 0, SectionDisplayOrder: 5, FieldID: 6, FieldKey: "remarks", FieldName: "Remarks", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "31-Jul-2026" },
        { InspectionID: 1, FieldID: 3, FieldValue: "Good" },
        { InspectionID: 1, FieldID: 4, FieldValue: "Smart" },
        { InspectionID: 1, FieldID: 5, FieldValue: "2" },
        { InspectionID: 1, FieldID: 6, FieldValue: "note" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 2, DeviceData: JSON.stringify({ CameraType: "PTZ" }) },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FileName: "photo1.jpg" },
      ]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "31-Jul-2026", "Good", "Smart", "2", "IP", "note", "photo1.jpg"], isDeviceRow: true },
      { cells: ["P001", "31-Jul-2026", "", "Smart", "", "PTZ", "", ""], isDeviceRow: true },
    ]);
  });

  it("keeps headers stable regardless of which inspection has data", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 2, Status: "Draft" }])
      .mockResolvedValueOnce([{ InspectionID: 2, FieldID: 1, FieldValue: "P002" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.headers).toEqual([
      "Pole ID", "Latitude", "Longitude",
      "Camera Count", "Camera Type",
      "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P002", "", "", "", "", ""], isDeviceRow: false },
    ]);
  });

  it("filters to a single inspection when inspectionId is given", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, 1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716", "77.5946", "", "", ""], isDeviceRow: false },
    ]);
  });

  it("filters to multiple inspection IDs when an array is given", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce(templateRows)
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([
        { InspectionID: 1, Status: "Completed" },
        { InspectionID: 3, Status: "Completed" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "12.9716, 77.5946" },
        { InspectionID: 3, FieldID: 1, FieldValue: "P003" },
        { InspectionID: 3, FieldID: 2, FieldValue: "28.7041, 77.1025" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [1, 3]);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716", "77.5946", "", "", ""], isDeviceRow: false },
      { cells: ["P003", "28.7041", "77.1025", "", "", ""], isDeviceRow: false },
    ]);
  });

  it("keeps scalar values of sections without device rows on the first device row", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
        { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, SectionDisplayOrder: 2, FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldDisplayOrder: 1 },
        { SectionID: 3, SectionKey: "switch_information", SectionName: "Switch Information", IsRepeatable: 1, SectionDisplayOrder: 3, FieldID: 3, FieldKey: "switch_count", FieldName: "Switch Count", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", DisplayOrder: 1 },
        { DeviceType: "Switch", FieldName: "SwitchType", Label: "Switch Type", DisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "1" },
        { InspectionID: 1, FieldID: 3, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
      ])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.headers).toEqual([
      "Pole ID", "Camera Count", "Camera Type", "Switch Count", "Switch Type", "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P001", "1", "IP", "2", "", ""], isDeviceRow: true },
    ]);
  });

  it("attaches device columns and emits device rows when a section key matches a device type regardless of IsRepeatable", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
        { SectionID: 2, SectionKey: "router_information", SectionName: "Router Information", IsRepeatable: 0, SectionDisplayOrder: 2, FieldID: 2, FieldKey: "router_count", FieldName: "Router Count", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Router", FieldName: "RouterModel", Label: "Router Model", DisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "1" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Router", DeviceNo: 1, DeviceData: JSON.stringify({ RouterModel: "R1" }) },
      ])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.headers).toEqual(["Pole ID", "Router Count", "Router Model", "Photos"]);
    expect(table.rows).toEqual([
      { cells: ["P001", "1", "R1", ""], isDeviceRow: true },
    ]);
  });

  it("falls back to getCurrentInspectionDate when saved date is blank on device rows", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 2, FieldKey: "date", FieldName: "Date", FieldDisplayOrder: 2 },
        { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, SectionDisplayOrder: 2, FieldID: 3, FieldKey: "camera_count", FieldName: "Camera Count", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce(deviceDefs)
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "" },
        { InspectionID: 1, FieldID: 3, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
      ])
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const { getCurrentInspectionDate } = require("@/src/utils/date");
    const fallback = getCurrentInspectionDate();
    const table = await buildReportTable(1);

    expect(table.headers).toEqual([
      "Pole ID", "Date", "Camera Count", "Camera Type", "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P001", fallback, "2", "IP", ""], isDeviceRow: true },
    ]);
  });
});

describe("splitLatLong", () => {
  it("splits a combined GPS value into latitude and longitude", () => {
    const { splitLatLong } = require("@/src/utils/exportData");
    expect(splitLatLong("12.9716, 77.5946")).toEqual(["12.9716", "77.5946"]);
    expect(splitLatLong("12.9716")).toEqual(["12.9716", ""]);
    expect(splitLatLong("")).toEqual(["", ""]);
  });
});

interface ReportTableLike {
  sections: { index: number; name: string; sectionKey: string; deviceType?: string; columns: { key: string; label: string; fieldId?: number; deviceFieldName?: string; isDeviceColumn: boolean; sectionIndex: number }[] }[];
  headers: string[];
  rows: { cells: string[]; isDeviceRow: boolean }[];
}

function sampleTable(): ReportTableLike {
  return {
    sections: [
      { index: 0, name: "General Information", sectionKey: "general_information", columns: [
        { key: "pole_id", label: "Pole ID", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps_lat", label: "Latitude", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps_lng", label: "Longitude", isDeviceColumn: false, sectionIndex: 0 },
      ]},
      { index: 1, name: "Camera Information", sectionKey: "camera_information", deviceType: "Camera", columns: [
        { key: "camera_count", label: "Camera Count", isDeviceColumn: false, sectionIndex: 1 },
        { key: "device:Camera:CameraType", label: "Camera Type", deviceFieldName: "CameraType", isDeviceColumn: true, sectionIndex: 1 },
      ]},
    ],
    headers: ["Pole ID", "Latitude", "Longitude", "Camera Count", "Camera Type"],
    rows: [
      { cells: ["P001", "12.9716", "77.5946", "1", ""], isDeviceRow: false },
      { cells: ["P001", "12.9716", "77.5946", "", "IP"], isDeviceRow: true },
    ],
  };
}

describe("buildCsv", () => {
  it("emits a header row and data rows with CSV escaping", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const csv = buildCsv(sampleTable());
    const lines = csv.split("\n");
    expect(lines[0].split(",")).toEqual([
      "Pole ID", "Latitude", "Longitude",
      "Camera Count", "Camera Type",
    ]);
    expect(lines[1]).toContain("P001");
  });

  it("escapes commas, quotes, and newlines", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["1,2", 'say "hi"', "line1\nline2", "", ""], isDeviceRow: false }] };
    const csv = buildCsv(table);
    expect(csv).toContain('"1,2"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("prefixes formula injection cells with a single quote", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["=SUM(1,2)", "", "", "", ""], isDeviceRow: false }] };
    const csv = buildCsv(table);
    expect(csv).toContain("'=SUM(1,2)");
  });
});

describe("buildExcelBase64", () => {
  it("produces a valid xlsx with band merges that round-trips", () => {
    const { buildExcelBase64 } = require("@/src/utils/exportData");
    const base64 = buildExcelBase64(sampleTable());

    const buf = Buffer.from(base64, "base64");
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K

    const workbook = XLSX.read(buf, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });
    expect(json[0]).toEqual(["General Information", "General Information", "General Information", "Camera Information", "Camera Information"]);
    expect(json[1]).toEqual(sampleTable().headers);
    expect(json[2]).toEqual(["P001", "12.9716", "77.5946", "1", ""]);
    expect(json[3]).toEqual(["P001", "12.9716", "77.5946", "", "IP"]);
    expect(Array.isArray(sheet["!merges"]) && sheet["!merges"].length).toBeGreaterThan(0);
  });
});

describe("exportInspections", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    (getGlobalDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("exports CSV with a header row and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([]) // device defs
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([{ InspectionID: 1, FieldID: 1, FieldValue: "P001" }])
      .mockResolvedValueOnce([]) // records
      .mockResolvedValueOnce([]); // photos

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "csv");

    expect(result).toBe(true);
    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(writeCall[1]).toContain("Pole ID");
    expect(writeCall[1]).not.toContain("General Information");
    expect(writeCall[1]).toContain("P001");
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("returns false when no inspections exist", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(999, "EmptyProject", "csv");

    expect(result).toBe(false);
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("exports Excel as base64 with Base64 encoding and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "excel");

    expect(result).toBe(true);
    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(writeCall[2].encoding).toBe(FileSystem.EncodingType.Base64);
    expect(writeCall[1]).toMatch(/^UEsDB/);
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("returns false when sharing is unavailable", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    setSharingAvailable(false);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "csv");

    expect(result).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

describe("exportInspection", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    (getGlobalDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("exports a single inspection as CSV (filtered table) and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([{ InspectionID: 1, FieldID: 1, FieldValue: "P001" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspection } = require("@/src/utils/exportData");
    const result = await exportInspection(1, "TestProject", 1, "P001", "csv");

    expect(result).toBe(true);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("returns false when the inspection has no rows", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspection } = require("@/src/utils/exportData");
    const result = await exportInspection(1, "TestProject", 999, "NONE", "csv");

    expect(result).toBe(false);
  });
});

describe("createExportFile", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    (getGlobalDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("writes a CSV file and returns export metadata without sharing", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { InspectionID: 1, Status: "Completed" },
        { InspectionID: 2, Status: "Completed" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 2, FieldID: 1, FieldValue: "P002" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { createExportFile } = require("@/src/utils/exportData");
    const result = await createExportFile(1, "TestProject", [1, 2], null, "csv");

    expect(result).not.toBeNull();
    expect(result!.fileName).toMatch(/\.csv$/);
    expect(result!.format).toBe("csv");
    expect(result!.inspectionCount).toBe(2);
    expect(result!.rowCount).toBe(2);
    expect(typeof result!.durationMs).toBe("number");
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("writes an Excel file as base64 with metadata", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, SectionDisplayOrder: 1, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID", FieldDisplayOrder: 1 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([{ InspectionID: 1, FieldID: 1, FieldValue: "P001" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { createExportFile } = require("@/src/utils/exportData");
    const result = await createExportFile(1, "TestProject", [1], null, "excel");

    expect(result).not.toBeNull();
    expect(result!.fileName).toMatch(/\.xlsx$/);
    expect(result!.format).toBe("excel");
    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(writeCall[2].encoding).toBe(FileSystem.EncodingType.Base64);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("returns null when the selected inspections have no rows", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { createExportFile } = require("@/src/utils/exportData");
    const result = await createExportFile(1, "TestProject", [1, 2], null, "csv");

    expect(result).toBeNull();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });
});

describe("shareExportFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSharingAvailable(true);
  });

  it("shares an existing file with the CSV mime type", async () => {
    const { shareExportFile } = require("@/src/utils/exportData");
    const result = await shareExportFile({
      fileUri: "file:///mock/documents/report.csv",
      fileName: "report.csv",
      format: "csv",
      inspectionCount: 1,
      rowCount: 1,
      durationMs: 10,
    });

    expect(result).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      "file:///mock/documents/report.csv",
      expect.objectContaining({ mimeType: "text/csv" })
    );
  });

  it("returns false when sharing is unavailable", async () => {
    setSharingAvailable(false);
    const { shareExportFile } = require("@/src/utils/exportData");
    const result = await shareExportFile({
      fileUri: "file:///mock/documents/report.xlsx",
      fileName: "report.xlsx",
      format: "excel",
      inspectionCount: 1,
      rowCount: 1,
      durationMs: 10,
    });

    expect(result).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

describe("openExportFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSharingAvailable(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("falls back to sharing on non-Android platforms", async () => {
    const { openExportFile } = require("@/src/utils/exportData");
    const result = await openExportFile({
      fileUri: "file:///mock/documents/report.csv",
      fileName: "report.csv",
      format: "csv",
      inspectionCount: 1,
      rowCount: 1,
      durationMs: 10,
    });

    expect(result).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("launches a VIEW intent with a content URI on Android", async () => {
    const { Platform } = require("react-native");
    jest.replaceProperty(Platform, "OS", "android");
    const IntentLauncher = require("expo-intent-launcher");

    const { openExportFile } = require("@/src/utils/exportData");
    const result = await openExportFile({
      fileUri: "file:///mock/documents/report.xlsx",
      fileName: "report.xlsx",
      format: "excel",
      inspectionCount: 1,
      rowCount: 1,
      durationMs: 10,
    });

    expect(result).toBe(true);
    expect(FileSystem.getContentUriAsync).toHaveBeenCalledWith("file:///mock/documents/report.xlsx");
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
      "android.intent.action.VIEW",
      expect.objectContaining({
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        flags: 1,
      })
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
