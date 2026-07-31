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

describe("buildInspectionTable", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("builds headers from template columns plus Status and Remarks", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldName: "Pole ID" },
        { FieldID: 2, FieldName: "Voltage" },
        { FieldID: 3, FieldName: "Height" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildInspectionTable } = require("@/src/utils/exportData");
    const table = await buildInspectionTable(1);

    expect(table.headers).toEqual(["Pole ID", "Voltage", "Height", "Status", "Remarks"]);
    expect(table.rows).toEqual([]);
  });

  it("aligns saved values to columns by FieldID, empty where missing", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldName: "Pole ID" },
        { FieldID: 2, FieldName: "Voltage" },
        { FieldID: 3, FieldName: "Height" },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, Status: "Completed", Remarks: "ok" },
        { InspectionID: 2, Status: "Draft", Remarks: null },
      ])
      .mockResolvedValueOnce([
        { InspectionID: 1, FieldID: 1, FieldValue: "P001" },
        { InspectionID: 1, FieldID: 2, FieldValue: "11kV" },
        { InspectionID: 2, FieldID: 1, FieldValue: "P002" },
      ]);

    const { buildInspectionTable } = require("@/src/utils/exportData");
    const table = await buildInspectionTable(1);

    expect(table.rows).toEqual([
      ["P001", "11kV", "", "Completed", "ok"],
      ["P002", "", "", "Draft", ""],
    ]);
  });

  it("keeps headers stable regardless of which inspection has data", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { FieldID: 1, FieldName: "Pole ID" },
        { FieldID: 2, FieldName: "Voltage" },
      ])
      .mockResolvedValueOnce([{ InspectionID: 2, Status: "Draft", Remarks: null }])
      .mockResolvedValueOnce([{ InspectionID: 2, FieldID: 1, FieldValue: "P002" }]);

    const { buildInspectionTable } = require("@/src/utils/exportData");
    const table = await buildInspectionTable(1);

    expect(table.headers).toEqual(["Pole ID", "Voltage", "Status", "Remarks"]);
    expect(table.rows).toEqual([["P002", "", "Draft", ""]]);
  });

  it("returns empty table for empty project", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildInspectionTable } = require("@/src/utils/exportData");
    const table = await buildInspectionTable(999);

    expect(table.headers).toEqual(["Status", "Remarks"]);
    expect(table.rows).toEqual([]);
  });
});
