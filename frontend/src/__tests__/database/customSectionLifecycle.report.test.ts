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

describe("Report labels: active vs deleted same-name fields stay DISTINCT (TEST 5/19)", () => {
  // Stable identities across a delete+recreate of a custom "RF" section.
  const oldRf = 101;
  const oldStatus = 201;
  const newRf = 202;
  const newStatus = 302;
  const idA = 11;
  const idC = 13;

  const activeRows = [
    {
      SectionID: newRf,
      SectionKey: "rf",
      SectionName: "RF",
      IsRepeatable: 0,
      FieldID: newStatus,
      FieldKey: "status",
      FieldName: "Status",
    },
  ];

  const allValues = [
    { InspectionID: idA, FieldID: oldStatus, FieldValue: "Yes" },
    { InspectionID: idC, FieldID: newStatus, FieldValue: "No" },
  ];

  const allValueFieldIds = [{ FieldID: oldStatus }, { FieldID: newStatus }];

  const allFieldRows = [
    {
      SectionID: oldRf,
      FieldID: oldStatus,
      FieldKey: "status",
      FieldName: "Status",
      IsActive: 0,
      IsVisible: 1,
      DisplayOrder: 1,
    },
    {
      SectionID: newRf,
      FieldID: newStatus,
      FieldKey: "status",
      FieldName: "Status",
      IsActive: 1,
      IsVisible: 1,
      DisplayOrder: 1,
    },
  ];

  const allOrphanSections = [
    {
      SectionID: oldRf,
      SectionName: "RF",
      SectionKey: "rf",
      IsRepeatable: 0,
      IsActive: 0,
      IsVisible: 1,
    },
  ];

  function createMockDb(scope: number[]): { getAllAsync: jest.Mock } {
    return {
      getAllAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM InspectionFields f") || sql.includes("JOIN InspectionSections")) {
          return activeRows;
        }
        if (sql.includes("SELECT DeviceType, FieldName, Label FROM DeviceFieldDefinitions")) {
          return [];
        }
        if (sql.includes("FROM Inspections WHERE InspectionID IN")) {
          return scope.map((id) => ({ InspectionID: id, Status: "Completed" }));
        }
        if (
          sql.includes("FROM InspectionValues WHERE InspectionID IN") &&
          !/SELECT\s+FieldID\s+FROM\s+InspectionValues/i.test(sql)
        ) {
          const ids = new Set(params as number[]);
          return allValues.filter((v) => ids.has(v.InspectionID));
        }
        if (sql.includes("FROM DeviceRecords WHERE InspectionID IN")) {
          return [];
        }
        if (sql.includes("FROM FieldOptions WHERE IsActive")) {
          return [
            { FieldID: oldStatus, OptionLabel: "Yes", OptionValue: "Yes" },
            { FieldID: newStatus, OptionLabel: "No", OptionValue: "No" },
          ];
        }
        if (sql.includes("FROM DeviceOptions WHERE IsActive")) {
          return [];
        }
        if (/SELECT\s+FieldID\s+FROM\s+InspectionValues/i.test(sql)) {
          const ids = new Set(params as number[]);
          return allValueFieldIds.filter((f) =>
            allValues.some((v) => v.FieldID === f.FieldID && ids.has(v.InspectionID))
          );
        }
        if (sql.includes("FROM InspectionFields WHERE FieldID IN")) {
          const ids = new Set(params as number[]);
          return allFieldRows.filter((f) => ids.has(f.FieldID));
        }
        if (sql.includes("FROM InspectionSections WHERE SectionID IN")) {
          const ids = new Set(params as number[]);
          return allOrphanSections.filter((s) => ids.has(s.SectionID));
        }
        return [];
      }),
    };
  }

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("5. report for the historical + recreated inspections keeps one ACTIVE 'Status' and one 'Deleted Status' column", async () => {
    mockDb = createMockDb([idA, idC]);
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [idA, idC]);

    expect(table.headers.filter((h: string) => h === "Status").length).toBe(1);
    expect(table.headers.filter((h: string) => h === "Deleted Status").length).toBe(1);
    expect(table.headers.indexOf("Status")).not.toBe(table.headers.indexOf("Deleted Status"));

    const sectionNames = table.sections.map((s: { name: string }) => s.name);
    expect(sectionNames).toContain("RF");
    expect(sectionNames).toContain("Deleted RF");

    const rowA = table.rows[0];
    const deletedIdx = table.headers.indexOf("Deleted Status");
    const activeIdx = table.headers.indexOf("Status");
    expect(rowA.cells[deletedIdx]).toBe("Yes");
    expect(rowA.cells[activeIdx]).toBe("");
  });

  it("19. report scoped to the new inspection alone never duplicates the recreated section (no Deleted Status ghost)", async () => {
    mockDb = createMockDb([idC]);
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [idC]);

    expect(table.headers.filter((h: string) => h === "Status").length).toBe(1);
    expect(table.headers.some((h: string) => h === "Deleted Status")).toBe(false);
    expect(table.sections.map((s: { name: string }) => s.name)).toEqual(["RF"]);

    const rowC = table.rows[0];
    expect(rowC.cells[table.headers.indexOf("Status")]).toBe("No");
  });

  it("5b. deleting the field inside a live section and deleting the section both keep unique orphan keys", async () => {
    mockDb = createMockDb([idA]);
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    const { buildReportTable } = require("@/src/utils/exportData");
    const table = await buildReportTable(1, [idA]);

    const orphanCol = table.sections
      .find((s: { name: string }) => s.name === "Deleted RF")
      ?.columns.find((c: { key: string }) => c.key.startsWith("deleted:"));
    expect(orphanCol).toBeTruthy();
    expect(orphanCol!.key).toBe(`deleted:${oldRf}:${oldStatus}`);
    expect(orphanCol!.deleted).toBe(true);
  });
});