import { getDatabase } from "@/src/database/db";

jest.mock("@/src/database/db");

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockRejectedValue(new Error("not found")),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-sharing", () => {
  let available = true;
  return {
    isAvailableAsync: jest.fn().mockImplementation(async () => available),
    shareAsync: jest.fn().mockResolvedValue(undefined),
  };
});

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
