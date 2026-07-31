import { getDatabase } from "@/src/database/db";

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
}));

jest.mock("expo-sharing", () => {
  let available = true;
  return {
    isAvailableAsync: jest.fn().mockImplementation(async () => available),
    shareAsync: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: "file:///mock/cache/print.pdf" }),
}));
import * as XLSX from "xlsx";
import * as Print from "expo-print";

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

describe("exportProjectData", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("returns false when no inspections exist", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const { exportProjectData } = require("@/src/utils/exportData");
    const result = await exportProjectData(999, "EmptyProject");
    expect(result).toBe(false);
  });

  it("exports CSV and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { InspectionID: 1, PoleID: "P001", InspectorName: "Alice", InspectionDate: "2024-01-15", Status: "Completed", Remarks: null, Latitude: 34.05, Longitude: -118.25 },
      ])
      .mockResolvedValueOnce([
        { FieldName: "Voltage", FieldValue: "11kV" },
      ])
      .mockResolvedValue([]);

    const { exportProjectData } = require("@/src/utils/exportData");
    const result = await exportProjectData(1, "TestProject");

    expect(result).toBe(true);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it("sanitizes formula injection in CSV cells", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { InspectionID: 1, PoleID: "P001", InspectorName: "Alice", InspectionDate: "2024-01-15", Status: "Completed", Remarks: "=SUM(1,2)", Latitude: null, Longitude: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const { exportProjectData } = require("@/src/utils/exportData");
    await exportProjectData(1, "TestProject");

    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    const csvContent: string = writeCall[1];

    expect(csvContent).toContain("'=SUM(1,2)");
    expect(csvContent).not.toContain(",=SUM(1,2)");
  });

  it("includes dynamic headers from field values", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { InspectionID: 1, PoleID: "P001", InspectorName: "Alice", InspectionDate: "2024-01-15", Status: "Completed", Remarks: null, Latitude: null, Longitude: null },
      ])
      .mockResolvedValueOnce([
        { FieldName: "Voltage", FieldValue: "11kV" },
        { FieldName: "Height", FieldValue: "12m" },
      ])
      .mockResolvedValue([]);

    const { exportProjectData } = require("@/src/utils/exportData");
    await exportProjectData(1, "TestProject");

    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    const csvContent: string = writeCall[1];

    expect(csvContent).toContain("Pole ID");
    expect(csvContent).toContain("Voltage");
    expect(csvContent).toContain("Height");
  });

  it("returns false when sharing is unavailable", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { InspectionID: 1, PoleID: "P001", InspectorName: "Alice", InspectionDate: "2024-01-15", Status: "Completed", Remarks: null, Latitude: null, Longitude: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    setSharingAvailable(false);

    const { exportProjectData } = require("@/src/utils/exportData");
    const result = await exportProjectData(1, "TestProject");

    expect(result).toBe(false);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

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
      "Pole ID", "Lat/Long", "Latitude", "Longitude",
      "Camera Count", "Device No", "Camera Type",
      "Status", "Photos",
    ]);
    expect(table.rows).toEqual([]);
  });

  it("fills one base row per inspection and derives Latitude/Longitude and Status/Photos", async () => {
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
      .mockResolvedValueOnce([
        { InspectionID: 1, FileName: "p1.jpg" },
        { InspectionID: 1, FileName: "p2.jpg" },
      ]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "", "", "", "Completed", "p1.jpg, p2.jpg"], isDeviceRow: false },
      { cells: ["P002", "", "", "", "", "", "", "Draft", ""], isDeviceRow: false },
    ]);
  });

  it("emits one device row per saved device repeating pole-level columns", async () => {
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
      .mockResolvedValueOnce([]);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1);

    expect(table.rows).toEqual([
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "2", "", "", "Completed", ""], isDeviceRow: false },
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "2", "1", "IP", "Completed", ""], isDeviceRow: true },
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "2", "2", "PTZ", "Completed", ""], isDeviceRow: true },
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
      "Pole ID", "Lat/Long", "Latitude", "Longitude",
      "Camera Count", "Device No", "Camera Type",
      "Status", "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P002", "", "", "", "", "", "", "Draft", ""], isDeviceRow: false },
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
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "", "", "", "Completed", ""], isDeviceRow: false },
    ]);
  });

  it("does not attach device columns or emit device rows for non-repeatable sections", async () => {
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

    expect(table.headers).toEqual(["Pole ID", "Router Count", "Status", "Photos"]);
    expect(table.rows).toEqual([
      { cells: ["P001", "1", "Completed", ""], isDeviceRow: false },
    ]);
  });

  it("falls back to getCurrentInspectionDate when saved date is blank on base and device rows", async () => {
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
      "Pole ID", "Date", "Camera Count", "Device No", "Camera Type",
      "Status", "Photos",
    ]);
    expect(table.rows).toEqual([
      { cells: ["P001", fallback, "2", "", "", "Completed", ""], isDeviceRow: false },
      { cells: ["P001", fallback, "2", "1", "IP", "Completed", ""], isDeviceRow: true },
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

interface InspectionFormDataLike {
  poleId: string;
  status: string;
  date: string;
  sections: {
    name: string;
    sectionKey: string;
    deviceType?: string;
    fields: { label: string; value: string }[];
    devices: { title: string; fields: { label: string; value: string }[] }[];
  }[];
  photos: { fileName: string; dataUri: string | null }[];
}

function sampleTable(): ReportTableLike {
  return {
    sections: [
      { index: 0, name: "General Information", sectionKey: "general_information", columns: [
        { key: "pole_id", label: "Pole ID", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps", label: "Lat/Long", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps_lat", label: "Latitude", isDeviceColumn: false, sectionIndex: 0 },
        { key: "gps_lng", label: "Longitude", isDeviceColumn: false, sectionIndex: 0 },
      ]},
      { index: 1, name: "Camera Information", sectionKey: "camera_information", deviceType: "Camera", columns: [
        { key: "camera_count", label: "Camera Count", isDeviceColumn: false, sectionIndex: 1 },
        { key: "device_no", label: "Device No", isDeviceColumn: true, sectionIndex: 1 },
        { key: "device:Camera:CameraType", label: "Camera Type", deviceFieldName: "CameraType", isDeviceColumn: true, sectionIndex: 1 },
      ]},
      { index: 2, name: "Summary", sectionKey: "summary", columns: [
        { key: "status", label: "Status", isDeviceColumn: false, sectionIndex: 2 },
        { key: "photos", label: "Photos", isDeviceColumn: false, sectionIndex: 2 },
      ]},
    ],
    headers: ["Pole ID", "Lat/Long", "Latitude", "Longitude", "Camera Count", "Device No", "Camera Type", "Status", "Photos"],
    rows: [
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "", "", "Completed", "p1.jpg"], isDeviceRow: false },
      { cells: ["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "1", "IP", "Completed", ""], isDeviceRow: true },
    ],
  };
}

describe("buildCsv", () => {
  it("emits a band row, a header row, and data rows with CSV escaping", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const csv = buildCsv(sampleTable());
    const lines = csv.split("\n");
    expect(lines[0]).toContain("General Information");
    expect(lines[1].split(",")).toEqual([
      "Pole ID", "Lat/Long", "Latitude", "Longitude",
      "Camera Count", "Device No", "Camera Type", "Status", "Photos",
    ]);
    expect(lines[2]).toContain("P001");
  });

  it("escapes commas, quotes, and newlines", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["1,2", 'say "hi"', "line1\nline2", "", "", "", "", "", ""], isDeviceRow: false }] };
    const csv = buildCsv(table);
    expect(csv).toContain('"1,2"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("prefixes formula injection cells with a single quote", () => {
    const { buildCsv } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["=SUM(1,2)", "", "", "", "", "", "", "", ""], isDeviceRow: false }] };
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
    expect(json[0]).toEqual(["General Information", "General Information", "General Information", "General Information", "Camera Information", "Camera Information", "Camera Information", "Summary", "Summary"]);
    expect(json[1]).toEqual(sampleTable().headers);
    expect(json[2]).toEqual(["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "", "", "Completed", "p1.jpg"]);
    expect(json[3]).toEqual(["P001", "12.9716, 77.5946", "12.9716", "77.5946", "1", "1", "IP", "Completed", ""]);
    expect(Array.isArray(sheet["!merges"]) && sheet["!merges"].length).toBeGreaterThan(0);
  });
});

describe("buildProjectPdfHtml", () => {
  it("renders banded thead, a row value, and the project title", () => {
    const { buildProjectPdfHtml } = require("@/src/utils/exportData");
    const html = buildProjectPdfHtml(sampleTable(), "North Grid");
    expect(html).toContain("<table>");
    expect(html).toContain('<th colspan="4">General Information</th>');
    expect(html).toContain("<th>Pole ID</th>");
    expect(html).toContain("<td>P001</td>");
    expect(html).toContain("North Grid");
  });

  it("escapes HTML in headers and cells", () => {
    const { buildProjectPdfHtml } = require("@/src/utils/exportData");
    const table = { ...sampleTable(), rows: [{ cells: ["<script>alert(1)</script>", "", "", "", "", "", "", "", ""], isDeviceRow: false }] };
    const html = buildProjectPdfHtml(table, "North");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("exportInspections", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    setSharingAvailable(true);
  });

  it("exports CSV with a band row and shares it", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([]) // sections+fields (empty template -> Summary only)
      .mockResolvedValueOnce([]) // device defs
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([]) // values
      .mockResolvedValueOnce([]) // records
      .mockResolvedValueOnce([]); // photos

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "csv");

    expect(result).toBe(true);
    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(writeCall[1]).toContain("Summary");
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

  it("exports PDF by printing HTML then copying and sharing", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { exportInspections } = require("@/src/utils/exportData");
    const result = await exportInspections(1, "TestProject", "pdf");

    expect(result).toBe(true);
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(FileSystem.copyAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });
});

describe("loadInspectionFormData", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("loads sections, values, devices, and photos in form order", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID" },
        { SectionID: 2, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count" },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldValue: "P001" },
        { FieldID: 2, FieldValue: "2" },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type" },
      ])
      .mockResolvedValueOnce([
        { DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "IP" }) },
      ])
      .mockResolvedValueOnce([
        { FileName: "p1.jpg", FilePath: "file:///photos/p1.jpg" },
      ]);
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    const { loadInspectionFormData } = require("@/src/utils/exportData");
    const form = await loadInspectionFormData(1);

    expect(form.poleId).toBe("P001");
    expect(form.status).toBe("Completed");
    expect(form.sections[0].fields).toEqual([{ label: "Pole ID", value: "P001" }]);
    expect(form.sections[1].deviceType).toBe("Camera");
    expect(form.sections[1].devices).toEqual([
      { title: "Camera 1", fields: [
        { label: "Device No", value: "1" },
        { label: "Camera Type", value: "IP" },
      ] },
    ]);
    expect(form.photos.length).toBe(1);
    expect(form.photos[0].fileName).toBe("p1.jpg");
    expect(form.photos[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("degrades to null dataUri when a photo cannot be read", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { FileName: "missing.jpg", FilePath: "file:///photos/missing.jpg" },
      ]);
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error("not found"));

    const { loadInspectionFormData } = require("@/src/utils/exportData");
    const form = await loadInspectionFormData(1);

    expect(form.photos[0].dataUri).toBeNull();
  });

  it("falls back to getCurrentInspectionDate when the saved date value is blank", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID" },
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 2, FieldKey: "date", FieldName: "Date" },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldValue: "P001" },
        { FieldID: 2, FieldValue: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    const { loadInspectionFormData } = require("@/src/utils/exportData");
    const { getCurrentInspectionDate } = require("@/src/utils/date");
    const fallback = getCurrentInspectionDate();
    const form = await loadInspectionFormData(1);

    expect(form.date).toBe(fallback);
  });

  it("uses the saved date value when present", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 1, FieldKey: "pole_id", FieldName: "Pole ID" },
        { SectionID: 1, SectionKey: "general_information", SectionName: "General Information", IsRepeatable: 0, FieldID: 2, FieldKey: "date", FieldName: "Date" },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldValue: "P001" },
        { FieldID: 2, FieldValue: "31-Jul-2026" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    const { loadInspectionFormData } = require("@/src/utils/exportData");
    const form = await loadInspectionFormData(1);

    expect(form.date).toBe("31-Jul-2026");
  });
});

describe("buildInspectionPdfHtml", () => {
  it("renders meta, sections with device cards, and embedded photos", () => {
    const { buildInspectionPdfHtml } = require("@/src/utils/exportData");
    const form: InspectionFormDataLike = {
      poleId: "P001",
      status: "Completed",
      date: "31-Jul-2026",
      sections: [
        {
          name: "General Information",
          sectionKey: "general_information",
          fields: [{ label: "Pole ID", value: "P001" }],
          devices: [],
        },
        {
          name: "Camera Information",
          sectionKey: "camera_information",
          deviceType: "Camera",
          fields: [{ label: "Camera Count", value: "1" }],
          devices: [{ title: "Camera 1", fields: [{ label: "Camera Type", value: "IP" }] }],
        },
      ],
      photos: [{ fileName: "p1.jpg", dataUri: "data:image/jpeg;base64,QUJD" }],
    };
    const html = buildInspectionPdfHtml(form, "North Grid");

    expect(html).toContain("North Grid");
    expect(html).toContain("P001");
    expect(html).toContain("Camera Information");
    expect(html).toContain("Camera 1");
    expect(html).toContain("data:image/jpeg;base64,QUJD");
  });
});

describe("exportInspection", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
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

  it("exports a single inspection as PDF using the form-like HTML", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ InspectionID: 1, Status: "Completed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]); // remaining loadInspectionFormData queries resolve empty
    mockDb.getFirstAsync.mockResolvedValue({ Status: "Completed" });

    const { exportInspection } = require("@/src/utils/exportData");
    const result = await exportInspection(1, "TestProject", 1, "P001", "pdf");

    expect(result).toBe(true);
    expect(Print.printToFileAsync).toHaveBeenCalled();
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
