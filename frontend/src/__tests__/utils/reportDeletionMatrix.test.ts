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
const CAMERA = 3;
const F_DATE = 100;
const F_POLE_ID = 101;
const F_FOUNDATION = 200;
const F_CAMERA_COUNT = 300;

interface ColumnRow {
  SectionID: number;
  SectionKey: string;
  SectionName: string;
  IsRepeatable: number;
  FieldID: number;
  FieldKey: string;
  FieldName: string;
}

interface FieldRow {
  SectionID: number;
  FieldID: number;
  FieldKey: string;
  FieldName: string;
  IsActive: number;
  IsVisible: number;
  DisplayOrder: number;
}

interface SectionRow {
  SectionID: number;
  SectionName: string;
  SectionKey: string;
  IsRepeatable: number;
  IsActive: number;
  IsVisible: number;
}

interface DeviceDefRow {
  DeviceType: string;
  FieldName: string;
  Label: string;
  IsActive: number;
}

interface RecordRow {
  InspectionID: number;
  DeviceType: string;
  DeviceNo: number;
  DeviceData: string | null;
}

const columnRow = (o: Partial<ColumnRow> & { FieldID: number; FieldKey: string; FieldName: string }): ColumnRow => ({
  SectionID: GEN,
  SectionKey: "general_information",
  SectionName: "General Information",
  IsRepeatable: 0,
  ...o,
});

const baseColumns: ColumnRow[] = [
  columnRow({ SectionID: GEN, SectionKey: "general_information", SectionName: "General Information", FieldID: F_DATE, FieldKey: "date", FieldName: "Date" }),
  columnRow({ SectionID: GEN, SectionKey: "general_information", SectionName: "General Information", FieldID: F_POLE_ID, FieldKey: "pole_id", FieldName: "Site ID" }),
  columnRow({ SectionID: POLE, SectionKey: "pole_structure", SectionName: "Pole Structure Details", FieldID: F_FOUNDATION, FieldKey: "foundation_cond", FieldName: "Foundation Condition" }),
  columnRow({ SectionID: CAMERA, SectionKey: "camera_information", SectionName: "Camera Information", IsRepeatable: 1, FieldID: F_CAMERA_COUNT, FieldKey: "camera_count", FieldName: "Camera Count" }),
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

const foundationFieldInactive: FieldRow = {
  SectionID: POLE,
  FieldID: F_FOUNDATION,
  FieldKey: "foundation_cond",
  FieldName: "Foundation Condition",
  IsActive: 0,
  IsVisible: 1,
  DisplayOrder: 1,
};

const poleSectionInactive: SectionRow = {
  SectionID: POLE,
  SectionName: "Pole Structure Details",
  SectionKey: "pole_structure",
  IsRepeatable: 0,
  IsActive: 0,
  IsVisible: 1,
};

const cameraSectionInactive: SectionRow = {
  SectionID: CAMERA,
  SectionName: "Camera Information",
  SectionKey: "camera_information",
  IsRepeatable: 1,
  IsActive: 0,
  IsVisible: 1,
};

const cameraTypeDef: DeviceDefRow = { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 1 };
const modelDefInactive: DeviceDefRow = { DeviceType: "Camera", FieldName: "Model", Label: "Model", IsActive: 0 };
const cameraTypeDefInactive: DeviceDefRow = { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 0 };

const cameraRecords: RecordRow[] = [
  { InspectionID: 11, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "PTZ", Model: "M1" }) },
  { InspectionID: 11, DeviceType: "Camera", DeviceNo: 2, DeviceData: JSON.stringify({ CameraType: "IP", Model: "M2" }) },
];

interface DbConfig {
  columnRows?: ColumnRow[];
  orphanFieldRows?: FieldRow[];
  orphanSectionRows?: SectionRow[];
  deviceSectionRows?: SectionRow[];
  deviceDefs?: DeviceDefRow[];
  records?: RecordRow[];
  inspections?: { InspectionID: number; Status: string }[];
  values?: typeof values;
  fieldOptions?: { FieldID: number; OptionLabel: string; OptionValue: string }[];
  deviceOptions?: { DeviceType: string; FieldName: string; OptionLabel: string; OptionValue: string }[];
}

function createMockDb(cfg: DbConfig): { getAllAsync: jest.Mock } {
  const columnRows = cfg.columnRows ?? baseColumns;
  const orphanFieldRows = cfg.orphanFieldRows ?? [];
  const orphanSectionRows = cfg.orphanSectionRows ?? [];
  const deviceSectionRows = cfg.deviceSectionRows ?? [];
  const deviceDefs = cfg.deviceDefs ?? [];
  const records = cfg.records ?? [];
  const inspectionsRows = cfg.inspections ?? inspections;
  const valuesRows = cfg.values ?? values;
  const fieldOptions = cfg.fieldOptions ?? [];
  const deviceOptions = cfg.deviceOptions ?? [];

  return {
    getAllAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM InspectionSections WHERE SectionKey IN")) {
        const keys = new Set(params as string[]);
        return deviceSectionRows.filter((s) => keys.has(s.SectionKey));
      }
      if (sql.includes("FROM InspectionSections WHERE SectionID IN")) {
        const ids = new Set(params as number[]);
        return orphanSectionRows.filter((s) => ids.has(s.SectionID));
      }
      if (sql.includes("FROM InspectionFields WHERE FieldID IN")) {
        const ids = new Set(params as number[]);
        return orphanFieldRows.filter((f) => ids.has(f.FieldID));
      }
      if (sql.includes("FROM InspectionFields f") && sql.includes("JOIN InspectionSections")) {
        return columnRows;
      }
      if (sql.includes("FROM DeviceFieldDefinitions")) {
        return deviceDefs;
      }
      if (sql.includes("FROM DeviceRecords")) {
        return records;
      }
      if (sql.includes("FROM InspectionValues") && sql.includes("JOIN Inspections")) {
        return valuesRows;
      }
      if (/SELECT\s+FieldID\s+FROM\s+InspectionValues/i.test(sql)) {
        const ids = new Set(params as number[]);
        const present = new Set(
          valuesRows.filter((v) => ids.has(v.InspectionID)).map((v) => v.FieldID)
        );
        return orphanFieldRows.filter((f) => present.has(f.FieldID));
      }
      if (sql.includes("FROM FieldOptions")) {
        return fieldOptions;
      }
      if (sql.includes("FROM DeviceOptions")) {
        return deviceOptions;
      }
      if (sql.includes("FROM Inspections")) {
        return inspectionsRows;
      }
      return [];
    }),
  };
}

let mockDb: { getAllAsync: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

async function build(cfg: DbConfig): Promise<ReportTable> {
  mockDb = createMockDb(cfg);
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  const { buildReportTable } = require("@/src/utils/exportData");
  return buildReportTable(1) as Promise<ReportTable>;
}

const headerIdx = (table: ReportTable, label: string): number => table.headers.indexOf(label);

describe("Report deletion matrix", () => {
  it("A: deleting the only section keeps inspections and shows 'Deleted Pole Structure Details'", async () => {
    const table = await build({
      columnRows: baseColumns.filter((c) => c.SectionID !== POLE),
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      orphanSectionRows: [poleSectionInactive],
    });

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(3);
    expect(table.sections.map((s) => s.name)).toContain("Deleted Pole Structure Details");
    expect(table.headers).toContain("Deleted Foundation Condition");
    expect(table.rows.map((r) => r.cells[headerIdx(table, "Deleted Foundation Condition")])).toEqual([
      "Acceptable",
      "Acceptable",
      "Minor Damage",
    ]);
  });

  it("B: deleting the ONLY option (0 active fields) keeps reports — band keeps the plain section name", async () => {
    const table = await build({
      columnRows: baseColumns.filter((c) => c.SectionID !== POLE),
      orphanFieldRows: [foundationFieldInactive],
      orphanSectionRows: [{ ...poleSectionInactive, IsActive: 1 }],
    });

    expect(table.rows.length).toBe(3);
    expect(table.sections.map((s) => s.name)).toContain("Pole Structure Details");
    expect(table.sections.map((s) => s.name)).not.toContain("Deleted Pole Structure Details");
    expect(table.headers).toContain("Deleted Foundation Condition");
    expect(table.rows.map((r) => r.cells[headerIdx(table, "Deleted Foundation Condition")])).toEqual([
      "Acceptable",
      "Acceptable",
      "Minor Damage",
    ]);
  });

  it("C: deleting ONE of many options keeps reports and shows the raw value for the deleted option", async () => {
    const table = await build({
      columnRows: baseColumns,
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      fieldOptions: [{ FieldID: F_FOUNDATION, OptionLabel: "Acceptable", OptionValue: "Acceptable" }],
    });

    expect(table.rows.length).toBe(3);
    expect(table.headers).toContain("Foundation Condition");
    expect(table.rows.map((r) => r.cells[headerIdx(table, "Foundation Condition")])).toEqual([
      "Acceptable",
      "Acceptable",
      "Minor Damage",
    ]);
  });

  it("D: deleting a dropdown option shows the stored raw value and keeps inspections", async () => {
    const table = await build({
      columnRows: baseColumns,
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      fieldOptions: [],
    });

    expect(table.rows.length).toBe(3);
    expect(table.rows.map((r) => r.cells[headerIdx(table, "Foundation Condition")])).toEqual([
      "Acceptable",
      "Acceptable",
      "Minor Damage",
    ]);
  });

  it("E: deleting a device SECTION preserves device rows as 'Deleted Camera Information'", async () => {
    const table = await build({
      columnRows: baseColumns.filter((c) => c.SectionID !== CAMERA),
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      deviceDefs: [cameraTypeDef],
      records: cameraRecords,
      deviceSectionRows: [cameraSectionInactive],
    });

    expect(table.sections.map((s) => s.name)).toContain("Deleted Camera Information");
    expect(table.headers).toContain("Deleted Camera Type");

    const band = table.sections.find((s) => s.name === "Deleted Camera Information");
    expect(band?.deleted).toBe(true);
    expect(band?.deviceType).toBe("Camera");

    const deviceRows = table.rows.filter((r) => r.isDeviceRow);
    expect(deviceRows).toHaveLength(2);
    expect(deviceRows.map((r) => r.cells[headerIdx(table, "Deleted Camera Type")])).toEqual(["PTZ", "IP"]);
  });

  it("F: deleting a device TYPE (inactive defs + deleted section) preserves device rows", async () => {
    const table = await build({
      columnRows: baseColumns.filter((c) => c.SectionID !== CAMERA),
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      deviceDefs: [cameraTypeDefInactive],
      records: cameraRecords,
      deviceSectionRows: [cameraSectionInactive],
    });

    expect(table.sections.map((s) => s.name)).toContain("Deleted Camera Information");
    expect(table.headers).toContain("Deleted Camera Type");
    const deviceRows = table.rows.filter((r) => r.isDeviceRow);
    expect(deviceRows.map((r) => r.cells[headerIdx(table, "Deleted Camera Type")])).toEqual(["PTZ", "IP"]);
  });

  it("G: deleting a device FIELD keeps its data as a 'Deleted <Label>' column on the live section", async () => {
    const table = await build({
      columnRows: baseColumns,
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      deviceDefs: [cameraTypeDef, modelDefInactive],
      records: cameraRecords,
    });

    expect(table.headers).toContain("Camera Type");
    expect(table.headers).toContain("Deleted Model");
    const deviceRows = table.rows.filter((r) => r.isDeviceRow);
    expect(deviceRows.map((r) => r.cells[headerIdx(table, "Deleted Model")])).toEqual(["M1", "M2"]);
  });

  it("G-sparse: no deleted-device column when no inspection carries data for it", async () => {
    const table = await build({
      columnRows: baseColumns,
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      deviceDefs: [cameraTypeDef, modelDefInactive],
      records: [
        { InspectionID: 11, DeviceType: "Camera", DeviceNo: 1, DeviceData: JSON.stringify({ CameraType: "PTZ" }) },
      ],
    });

    expect(table.headers).toContain("Camera Type");
    expect(table.headers).not.toContain("Deleted Model");
  });

  it("H: deleting a device dropdown option shows the stored raw value", async () => {
    const table = await build({
      columnRows: baseColumns,
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      deviceDefs: [cameraTypeDef],
      records: cameraRecords,
      deviceOptions: [
        { DeviceType: "Camera", FieldName: "CameraType", OptionLabel: "IP", OptionValue: "IP" },
      ],
    });

    expect(table.rows.length).toBe(4);
    const deviceRows = table.rows.filter((r) => r.isDeviceRow);
    expect(deviceRows.map((r) => r.cells[headerIdx(table, "Camera Type")])).toEqual(["PTZ", "IP"]);
  });

  it("N: multiple deletions together — every band preserved and inspections stay", async () => {
    const table = await build({
      columnRows: baseColumns.filter((c) => c.SectionID === GEN),
      orphanFieldRows: [{ ...foundationFieldInactive, IsActive: 1 }],
      orphanSectionRows: [poleSectionInactive],
      deviceDefs: [cameraTypeDef],
      records: cameraRecords,
      deviceSectionRows: [cameraSectionInactive],
    });

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(4);
    const names = table.sections.map((s) => s.name);
    expect(names).toContain("Deleted Pole Structure Details");
    expect(names).toContain("Deleted Camera Information");
    expect(table.headers).toContain("Deleted Foundation Condition");
    expect(table.headers).toContain("Deleted Camera Type");
    table.rows.forEach((r) => expect(r.cells.length).toBe(table.headers.length));
  });

  it("extreme 1: deleting every section/field still reports every inspection with 'Deleted' bands", async () => {
    const everyFieldInactive: FieldRow[] = [
      { SectionID: GEN, FieldID: F_DATE, FieldKey: "date", FieldName: "Date", IsActive: 0, IsVisible: 1, DisplayOrder: 1 },
      { SectionID: GEN, FieldID: F_POLE_ID, FieldKey: "pole_id", FieldName: "Site ID", IsActive: 0, IsVisible: 1, DisplayOrder: 2 },
      foundationFieldInactive,
      { SectionID: CAMERA, FieldID: F_CAMERA_COUNT, FieldKey: "camera_count", FieldName: "Camera Count", IsActive: 0, IsVisible: 1, DisplayOrder: 1 },
    ];
    const everySectionInactive: SectionRow[] = [
      { SectionID: GEN, SectionName: "General Information", SectionKey: "general_information", IsRepeatable: 0, IsActive: 0, IsVisible: 1 },
      poleSectionInactive,
      cameraSectionInactive,
    ];
    const fullValues = [
      ...values,
      { InspectionID: 11, FieldID: F_DATE, FieldValue: "01-Sep-2026" },
      { InspectionID: 11, FieldID: F_CAMERA_COUNT, FieldValue: "2" },
    ];

    const table = await build({
      columnRows: [],
      orphanFieldRows: everyFieldInactive,
      orphanSectionRows: everySectionInactive,
      values: fullValues,
    });

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(3);
    const names = table.sections.map((s) => s.name);
    expect(names).toEqual([
      "Deleted General Information",
      "Deleted Pole Structure Details",
      "Deleted Camera Information",
    ]);
    expect(table.headers).toContain("Deleted Site ID");
    expect(table.headers).toContain("Deleted Foundation Condition");
    expect(table.headers).toContain("Deleted Camera Count");
    table.rows.forEach((r) => expect(r.cells.length).toBe(table.headers.length));
  });

  it("extreme 2: deleting every section/field with no historical values still reports every inspection", async () => {
    const table = await build({
      columnRows: [],
      values: [],
      orphanFieldRows: [],
      orphanSectionRows: [],
    });

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(3);
    expect(table.headers).toEqual([]);
    expect(table.sections).toEqual([]);
    expect(table.rows.every((r) => r.cells.length === 0)).toBe(true);
  });

  it("I-K: deleted custom variant section appears as 'Deleted <Name>' and does not hide inspections", async () => {
    const rfSectionId = 40;
    const rfFieldId = 401;
    const table = await build({
      columnRows: baseColumns,
      values: [
        ...values,
        { InspectionID: 11, FieldID: rfFieldId, FieldValue: "RF-1" },
      ],
      orphanFieldRows: [
        { ...foundationFieldInactive, IsActive: 1 },
        { SectionID: rfSectionId, FieldID: rfFieldId, FieldKey: "rf_name", FieldName: "RF Name", IsActive: 0, IsVisible: 1, DisplayOrder: 1 },
      ],
      orphanSectionRows: [
        { SectionID: rfSectionId, SectionName: "RF", SectionKey: "rf_section", IsRepeatable: 0, IsActive: 0, IsVisible: 1 },
      ],
    });

    expect(table.inspectionCount).toBe(3);
    expect(table.rows.length).toBe(3);
    const names = table.sections.map((s) => s.name);
    expect(names).toContain("Deleted RF");
    expect(table.headers).toContain("Deleted RF Name");
    const rfIdx = headerIdx(table, "Deleted RF Name");
    expect(table.rows.map((r) => r.cells[rfIdx])).toEqual(["RF-1", "", ""]);
  });
});