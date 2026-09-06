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

// SectionID layout (matches the seeded template order):
//   1 = general_information, 2 = pole_structure, 3 = camera_information
const GEN_SECTION = 1;
const POLE_SECTION = 2;
const CAMERA_SECTION = 3;
const DATE_FIELD = 100;
const POLE_ID_FIELD = 101;
const FOUNDATION_FIELD = 200;

interface ActiveRow {
  SectionID: number;
  SectionKey: string;
  SectionName: string;
  IsRepeatable: number;
  FieldID: number;
  FieldKey: string;
  FieldName: string;
}

interface OrphanFieldRow {
  SectionID: number;
  FieldID: number;
  FieldKey: string;
  FieldName: string;
  FieldType: string;
  IsActive: number;
  IsVisible: number;
  DisplayOrder: number;
}

interface OrphanSectionRow {
  SectionID: number;
  SectionName: string;
  SectionKey: string;
  IsRepeatable: number;
  IsActive: number;
  IsVisible: number;
}

interface ValueRow {
  InspectionID: number;
  FieldID: number;
  FieldValue: string | null;
}

interface InspRow {
  InspectionID: number;
  Status: string;
}

interface DeviceRow {
  InspectionID: number;
  DeviceType: string;
  DeviceNo: number;
  DeviceData: string | null;
}

interface DeviceDefRow {
  DeviceType: string;
  FieldName: string;
  Label: string;
  IsActive: number;
}

interface SuiteConfig {
  activeRows?: ActiveRow[];
  inspections?: InspRow[];
  values?: ValueRow[];
  orphanFieldRows?: OrphanFieldRow[];
  orphanSectionRows?: OrphanSectionRow[];
  deviceRows?: DeviceRow[];
  deviceDefs?: DeviceDefRow[];
  idList?: number[];
}

describe("Report column presence only while a deleted-config field holds a POPULATED value", () => {
  const baseActiveRows: ActiveRow[] = [
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

  const baseInspections: InspRow[] = [
    { InspectionID: 11, Status: "Completed" },
    { InspectionID: 12, Status: "Completed" },
  ];

  function makeConfig(overrides: SuiteConfig = {}): SuiteConfig {
    return {
      activeRows: baseActiveRows,
      inspections: baseInspections,
      values: [],
      orphanFieldRows: [],
      orphanSectionRows: [],
      deviceRows: [],
      deviceDefs: [],
      ...overrides,
    };
  }

  function softDeletedDropdownField(): OrphanFieldRow {
    return {
      SectionID: POLE_SECTION,
      FieldID: FOUNDATION_FIELD,
      FieldKey: "foundation_cond",
      FieldName: "Foundation Condition",
      FieldType: "dropdown",
      IsActive: 0,
      IsVisible: 1,
      DisplayOrder: 1,
    };
  }

  function buildMockDb(cfg: SuiteConfig) {
    const activeRows = cfg.activeRows ?? baseActiveRows;
    const inspections = cfg.inspections ?? baseInspections;
    const values = cfg.values ?? [];
    const orphanFieldRows = cfg.orphanFieldRows ?? [];
    const orphanSectionRows = cfg.orphanSectionRows ?? [];
    const deviceRows = cfg.deviceRows ?? [];
    const deviceDefs = cfg.deviceDefs ?? [];

    return {
      getAllAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM InspectionFields f") && sql.includes("JOIN InspectionSections")) {
          return activeRows;
        }
        if (sql.includes("FROM DeviceFieldDefinitions")) {
          return deviceDefs;
        }
        if (sql.includes("FROM Inspections WHERE")) {
          return cfg.idList
            ? inspections.filter((i) => (cfg.idList as number[]).includes(i.InspectionID))
            : inspections;
        }
        if (/SELECT\s+FieldID\s+FROM\s+InspectionValues/i.test(sql)) {
          const ids = new Set(params as number[]);
          const fieldIdsWithValues = new Set(
            values.filter((v) => ids.has(v.InspectionID)).map((v) => v.FieldID)
          );
          return [...fieldIdsWithValues].map((FieldID) => ({ FieldID }));
        }
        if (sql.includes("FROM InspectionValues") && /JOIN Inspections/.test(sql)) {
          return values;
        }
        if (/SELECT\s+InspectionID,\s*FieldID,\s*FieldValue\s+FROM\s+InspectionValues/i.test(sql)) {
          return cfg.idList
            ? values.filter((v) => (cfg.idList as number[]).includes(v.InspectionID))
            : [];
        }
        if (sql.includes("FROM DeviceRecords")) {
          return deviceRows;
        }
        if (sql.includes("FROM FieldOptions WHERE IsActive")) {
          return [];
        }
        if (sql.includes("FROM DeviceOptions WHERE IsActive")) {
          return [];
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

  let mockDb: ReturnType<typeof buildMockDb>;

  async function build(cfg: SuiteConfig, inspectionId?: number): Promise<ReportTable> {
    mockDb = buildMockDb(cfg);
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    const { buildReportTable } = require("@/src/utils/exportData");
    return buildReportTable(1, inspectionId) as Promise<ReportTable>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("1. soft-deleted field keeps its 'Deleted <Name>' column while a report inspection holds a populated value", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "Acceptable" },
        ],
      })
    );

    expect(table.headers).toContain("Deleted Foundation Condition");
    const idx = table.headers.indexOf("Deleted Foundation Condition");
    expect(table.rows.map((r) => r.cells[idx])).toContain("Acceptable");
  });

  it("2. soft-deleted field column DROPPED when every report value is an empty string", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "" },
          { InspectionID: 12, FieldID: FOUNDATION_FIELD, FieldValue: "" },
        ],
      })
    );

    expect(table.headers).not.toContain("Deleted Foundation Condition");
  });

  it("3. soft-deleted field column DROPPED when every report value is NULL", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: null },
        ],
      })
    );

    expect(table.headers).not.toContain("Deleted Foundation Condition");
  });

  it("4. soft-deleted field column DROPPED when every report value is whitespace-only", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "   " },
        ],
      })
    );

    expect(table.headers).not.toContain("Deleted Foundation Condition");
  });

  it("5. ONE populated value among empties keeps the deleted column", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "" },
          { InspectionID: 12, FieldID: FOUNDATION_FIELD, FieldValue: "Minor Damage" },
        ],
      })
    );

    expect(table.headers).toContain("Deleted Foundation Condition");
    const idx = table.headers.indexOf("Deleted Foundation Condition");
    expect(table.rows.map((r) => r.cells[idx])).toEqual(["", "Minor Damage"]);
  });

  it("6. values that only exist on a Draft (non-final) inspection never create the deleted column", async () => {
    const table = await build(
      makeConfig({
        inspections: [{ InspectionID: 11, Status: "Completed" }],
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 12, FieldID: FOUNDATION_FIELD, FieldValue: "Acceptable" },
        ],
      })
    );

    expect(table.headers).not.toContain("Deleted Foundation Condition");
  });

  it("7. whole CLOSED section with only empty values emits no 'Deleted Pole Structure Details' band", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [
          {
            SectionID: POLE_SECTION,
            FieldID: FOUNDATION_FIELD,
            FieldKey: "foundation_cond",
            FieldName: "Foundation Condition",
            FieldType: "dropdown",
            IsActive: 1,
            IsVisible: 1,
            DisplayOrder: 1,
          },
        ],
        orphanSectionRows: [
          {
            SectionID: POLE_SECTION,
            SectionName: "Pole Structure Details",
            SectionKey: "pole_structure",
            IsRepeatable: 0,
            IsActive: 0,
            IsVisible: 1,
          },
        ],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "" },
        ],
      })
    );

    expect(table.sections.map((s) => s.name)).not.toContain("Deleted Pole Structure Details");
    expect(table.headers).not.toContain("Deleted Foundation Condition");
  });

  it("8. closed SECTION with populated values keeps its band and column", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [
          {
            SectionID: POLE_SECTION,
            FieldID: FOUNDATION_FIELD,
            FieldKey: "foundation_cond",
            FieldName: "Foundation Condition",
            FieldType: "dropdown",
            IsActive: 1,
            IsVisible: 1,
            DisplayOrder: 1,
          },
        ],
        orphanSectionRows: [
          {
            SectionID: POLE_SECTION,
            SectionName: "Pole Structure Details",
            SectionKey: "pole_structure",
            IsRepeatable: 0,
            IsActive: 0,
            IsVisible: 1,
          },
        ],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "Acceptable" },
        ],
      })
    );

    expect(table.sections.map((s) => s.name)).toContain("Deleted Pole Structure Details");
    expect(table.headers).toContain("Deleted Foundation Condition");
  });

  it("9. deleted CHECKBOX field: '0' means empty (column dropped), '1' keeps the column", async () => {
    const makeCheckboxConfig = (fieldValue: string) =>
      makeConfig({
        orphanFieldRows: [{ ...softDeletedDropdownField(), FieldType: "checkbox" }],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: fieldValue },
        ],
      });

    const emptyTable = await build(makeCheckboxConfig("0"));
    expect(emptyTable.headers).not.toContain("Deleted Foundation Condition");

    const filledTable = await build(makeCheckboxConfig("1"));
    expect(filledTable.headers).toContain("Deleted Foundation Condition");
  });

  it("10. deleted NUMBER field: '' means empty (dropped), numeric '0' keeps the column", async () => {
    const makeNumberConfig = (fieldValue: string) =>
      makeConfig({
        orphanFieldRows: [{ ...softDeletedDropdownField(), FieldType: "number" }],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: fieldValue },
        ],
      });

    const emptyTable = await build(makeNumberConfig(""));
    expect(emptyTable.headers).not.toContain("Deleted Foundation Condition");

    const zeroTable = await build(makeNumberConfig("0"));
    expect(zeroTable.headers).toContain("Deleted Foundation Condition");
  });

  it("11. cleared-dropdown semantics: an empty stored value (what Clear writes) drops the deleted column", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "" },
        ],
      })
    );

    expect(table.headers).not.toContain("Deleted Foundation Condition");
    expect(table.headers.join("|")).not.toContain("__dropdown_clear__");
  });

  it("12. deleted DEVICE field: empty stored values on every device drop the column; any populated value keeps it", async () => {
    const makeDeviceConfig = (values: (string | null)[]) =>
      makeConfig({
        deviceDefs: [
          { DeviceType: "Camera", FieldName: "CameraType", Label: "Camera Type", IsActive: 1 },
          { DeviceType: "Camera", FieldName: "Model", Label: "Model", IsActive: 0 },
        ],
        deviceRows: values.map((v, i) => ({
          InspectionID: 11,
          DeviceType: "Camera",
          DeviceNo: i + 1,
          DeviceData: JSON.stringify({ CameraType: "PTZ", Model: v }),
        })),
      });

    const emptyTable = await build(makeDeviceConfig(["", null]));
    expect(emptyTable.headers).not.toContain("Deleted Model");

    const mixedTable = await build(makeDeviceConfig(["", "M1"]));
    expect(mixedTable.headers).toContain("Deleted Model");
    const idx = mixedTable.headers.indexOf("Deleted Model");
    expect(mixedTable.rows.map((r) => r.cells[idx]).join("|")).toContain("M1");
  });

  it("13. explicit inspection-id report: empty-only values still drop the deleted column", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "" },
        ],
        idList: [11],
      }),
      11
    );

    expect(table.headers).not.toContain("Deleted Foundation Condition");
  });

  it("14. explicit inspection-id report: populated value keeps the deleted column", async () => {
    const table = await build(
      makeConfig({
        orphanFieldRows: [softDeletedDropdownField()],
        values: [
          { InspectionID: 11, FieldID: POLE_ID_FIELD, FieldValue: "P-001" },
          { InspectionID: 11, FieldID: FOUNDATION_FIELD, FieldValue: "Acceptable" },
        ],
        idList: [11],
      }),
      11
    );

    expect(table.headers).toContain("Deleted Foundation Condition");
    const idx = table.headers.indexOf("Deleted Foundation Condition");
    expect(table.rows.map((r) => r.cells[idx])).toContain("Acceptable");
  });
});