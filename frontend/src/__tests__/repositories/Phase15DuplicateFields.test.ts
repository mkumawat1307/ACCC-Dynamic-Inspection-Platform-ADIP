jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { poleInspectionFields } from "@/src/database/seeds/pole-inspection-data";

const CANONICAL_SECTION_KEYS = [
  "general_information", "pole_structure", "junction_box", "earthing",
  "meter", "connectivity", "camera_information", "switch_information",
  "remarks", "photos",
];

function createMockDb() {
  let templateRows: Array<{ TemplateID: number; TemplateName: string; IsDefault: number; IsActive: number }> = [
    { TemplateID: 1, TemplateName: "ACCC Dynamic Inspection Platform", IsDefault: 1, IsActive: 1 },
  ];
  let sectionRows: Array<{ SectionID: number; TemplateID: number; SectionKey: string; SectionName: string; IsDefault: number; IsActive: number }> = [];
  let fieldRows: Array<{ FieldID: number; SectionID: number; FieldKey: string; FieldName: string; IsActive: number }> = [];
  let fieldOptionRows: Array<{ OptionID: number; FieldID: number; OptionLabel: string; OptionValue: string }> = [];
  let inspectionValues: Array<{ ValueID: number; InspectionID: number; FieldID: number; FieldValue: string }> = [];
  let nextSectionId = 100;
  let nextFieldId = 200;
  let nextOptionId = 1;
  let nextTemplateId = 10;

  const runAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = sql.toUpperCase().replace(/\s+/g, " ").trim();

    if (s.includes("INSERT OR IGNORE") && s.includes("INSPECTIONTEMPLATES")) {
      return { lastInsertRowId: nextTemplateId++, changes: 1 };
    }

    if (s.includes("INSERT OR IGNORE")) {
      return { lastInsertRowId: 0, changes: 0 };
    }

    if (s.includes("INSERT INTO INSPECTIONTEMPLATES")) {
      const id = nextTemplateId++;
      templateRows.push({ TemplateID: id, TemplateName: params?.[0] as string ?? "", IsDefault: params?.[2] as number ?? 0, IsActive: 1 });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONTEMPLATES")) {
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONSECTIONS") && s.includes("ISACTIVE = 0")) {
      if (s.includes("WHERE TEMPLATEID")) {
        const tid = params![0] as number;
        sectionRows = sectionRows.map((r) => r.TemplateID === tid ? { ...r, IsActive: 0 } : r);
      } else {
        sectionRows = sectionRows.map((r) => ({ ...r, IsActive: 0 }));
      }
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONFIELDS") && s.includes("ISACTIVE = 0") && s.includes("SECTIONID")) {
      const sid = params![0] as number;
      const excludedKeys = params!.slice(1) as string[];
      fieldRows = fieldRows.map((f) =>
        f.SectionID === sid && !excludedKeys.includes(f.FieldKey) ? { ...f, IsActive: 0 } : f
      );
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONFIELDS") && s.includes("ISACTIVE = 0") && !s.includes("SECTIONID")) {
      const excludedKeys = params as string[];
      fieldRows = fieldRows.map((f) =>
        !excludedKeys.includes(f.FieldKey) ? { ...f, IsActive: 0 } : f
      );
      return { changes: 1 };
    }

    if (s.includes("INSERT INTO INSPECTIONSECTIONS")) {
      const id = nextSectionId++;
      sectionRows.push({
        SectionID: id,
        TemplateID: params![0] as number,
        SectionKey: params![2] as string,
        SectionName: params![1] as string,
        IsDefault: 0,
        IsActive: 1,
      });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONSECTIONS") && s.includes("SECTIONNAME")) {
      const name = params![0] as string;
      const sid = params![params!.length - 1] as number;
      sectionRows = sectionRows.map((r) => r.SectionID === sid ? { ...r, SectionName: name, IsActive: 1 } : r);
      return { changes: 1 };
    }

    if (s.includes("INSERT INTO INSPECTIONFIELDS")) {
      const id = nextFieldId++;
      fieldRows.push({
        FieldID: id,
        SectionID: params![0] as number,
        FieldKey: params![2] as string,
        FieldName: params![1] as string,
        IsActive: 1,
      });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONFIELDS") && s.includes("FIELDNAME") && s.includes("ISACTIVE = 1")) {
      const fid = params![params!.length - 1] as number;
      fieldRows = fieldRows.map((f) => f.FieldID === fid ? { ...f, IsActive: 1 } : f);
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONFIELDS") && s.includes("SET SECTIONID") && s.includes("WHERE SECTIONID")) {
      const target = params![0] as number;
      const source = params![1] as number;
      fieldRows = fieldRows.map((f) => f.SectionID === source ? { ...f, SectionID: target } : f);
      return { changes: 1 };
    }

    if (s.includes("DELETE FROM FIELDOPTIONS") && s.includes("WHERE FIELDID")) {
      const fid = params![0] as number;
      fieldOptionRows = fieldOptionRows.filter((o) => o.FieldID !== fid);
      return { changes: 0 };
    }

    if (s.includes("DELETE FROM FIELDOPTIONS")) {
      fieldOptionRows = [];
      return { changes: 0 };
    }

    if (s.includes("INSERT INTO FIELDOPTIONS")) {
      const id = nextOptionId++;
      fieldOptionRows.push({
        OptionID: id,
        FieldID: params![0] as number,
        OptionLabel: params![1] as string,
        OptionValue: params![2] as string,
      });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (s.includes("DELETE FROM INSPECTIONSECTIONS")) {
      const sid = params![0] as number;
      sectionRows = sectionRows.filter((r) => r.SectionID !== sid);
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONVALUES") && s.includes("SET FIELDID")) {
      const target = params![0] as number;
      const source = params![1] as number;
      inspectionValues = inspectionValues.map((v) => v.FieldID === source ? { ...v, FieldID: target } : v);
      return { changes: 1 };
    }

    if (s.includes("DELETE FROM INSPECTIONFIELDS")) {
      const fid = params![0] as number;
      fieldRows = fieldRows.filter((f) => f.FieldID !== fid);
      return { changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 1 };
  });

  const getAllAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = sql.toUpperCase().replace(/\s+/g, " ").trim();

    if (s.includes("SELECT SECTIONKEY") && s.includes("FROM INSPECTIONSECTIONS") && s.includes("WHERE ISDEFAULT")) {
      return sectionRows.filter((r) => r.IsDefault === 1).map((r) => ({ SectionKey: r.SectionKey, SectionID: r.SectionID }));
    }

    if (s.includes("SELECT SECTIONID") && s.includes("ISDEFAULT") && s.includes("FROM INSPECTIONSECTIONS") && s.includes("WHERE SECTIONKEY")) {
      const key = params?.[0] as string;
      return sectionRows.filter((r) => r.SectionKey === key).map((r) => ({ SectionID: r.SectionID, IsDefault: r.IsDefault }));
    }

    if (s.includes("SELECT FIELDID") && s.includes("ISACTIVE") && s.includes("FROM INSPECTIONFIELDS") && s.includes("WHERE FIELDKEY")) {
      const key = params?.[0] as string;
      return fieldRows.filter((f) => f.FieldKey === key).map((f) => ({ FieldID: f.FieldID, SectionID: f.SectionID, IsActive: f.IsActive }));
    }

    return [];
  });

  const getFirstAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = sql.toUpperCase().replace(/\s+/g, " ").trim();

    if (s.includes("SELECT TEMPLATEID") && s.includes("INSPECTIONTEMPLATES")) {
      const name = params?.[0] as string;
      const found = templateRows.find((t) => t.TemplateName === name && t.IsActive === 1);
      return found ? { TemplateID: found.TemplateID } : null;
    }

    if (s.includes("SELECT SECTIONID") && s.includes("INSPECTIONSECTIONS") && s.includes("SECTIONKEY")) {
      const tid = params?.[0] as number;
      const key = params?.[1] as string;
      const found = sectionRows.find((r) => r.TemplateID === tid && r.SectionKey === key);
      return found ? { SectionID: found.SectionID } : null;
    }

    if (s.includes("SELECT FIELDID") && s.includes("INSPECTIONFIELDS") && s.includes("SECTIONID") && s.includes("FIELDKEY")) {
      const sid = params?.[0] as number;
      const key = params?.[1] as string;
      const found = fieldRows.find((f) => f.SectionID === sid && f.FieldKey === key);
      return found ? { FieldID: found.FieldID } : null;
    }

    if (s.includes("SELECT FIELDID") && s.includes("INSPECTIONFIELDS") && s.includes("FIELDKEY")) {
      const key = params?.[0] as string;
      const found = fieldRows.find((f) => f.FieldKey === key);
      return found ? { FieldID: found.FieldID } : null;
    }

    return null;
  });

  return {
    runAsync: runAsyncFn,
    getAllAsync: getAllAsyncFn,
    getFirstAsync: getFirstAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
    getSectionRows: () => sectionRows,
    getFieldRows: () => fieldRows,
    getFieldOptionRows: () => fieldOptionRows,
    getInspectionValues: () => inspectionValues,
    seedSections: (rows: typeof sectionRows) => { sectionRows = [...rows]; },
    seedFields: (rows: typeof fieldRows) => { fieldRows = [...rows]; },
    addInspectionValue: (val: (typeof inspectionValues)[0]) => { inspectionValues.push(val); },
  };
}

function makeImportData() {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: [
      {
        TemplateName: "ACCC Dynamic Inspection Platform",
        Description: "Standard inspection template",
        IsDefault: 1,
        sections: [
          {
            SectionName: "Pole Structure Details",
            SectionKey: "pole_structure",
            Description: "Pole structure",
            Icon: "business",
            DisplayOrder: 2,
            IsRepeatable: 0,
            IsVisible: 1,
            fields: [
              {
                FieldName: "Foundation Condition",
                FieldKey: "foundation_cond",
                FieldType: "dropdown",
                Placeholder: "Select Foundation Condition",
                DefaultValue: null,
                HelpText: null,
                ValidationRule: null,
                DisplayOrder: 1,
                IsRequired: 1,
                IsVisible: 1,
                IsReadOnly: 0,
                IsSystemField: 0,
                Width: 12,
                options: [
                  { OptionLabel: "Acceptable", OptionValue: "Acceptable", DisplayOrder: 1, IsDefault: 0 },
                  { OptionLabel: "Minor Damage", OptionValue: "Minor Damage", DisplayOrder: 2, IsDefault: 0 },
                ],
              },
            ],
          },
        ],
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: ["Camera", "Switch"],
  };
}

describe("Phase 15 — Duplicate Field Definitions After Import/Reset", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("TEST 1: Fresh canonical database has 1 foundation_cond row after import", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
    ]);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(makeImportData());
    expect(result.success).toBe(true);

    const fcFields = mockDb.getFieldRows().filter((f) => f.FieldKey === "foundation_cond");
    expect(fcFields.length).toBe(1);
  });

  it("TEST 2: Export → Import produces 1 foundation_cond row", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
    ]);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(makeImportData());

    const fcFields = mockDb.getFieldRows().filter((f) => f.FieldKey === "foundation_cond");
    expect(fcFields.length).toBe(1);
  });

  it("TEST 3: Export → Import → Reset produces 1 foundation_cond row", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
    ]);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(makeImportData());

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const fcFields = mockDb.getFieldRows().filter((f) => f.FieldKey === "foundation_cond");
    expect(fcFields.length).toBe(1);
  });

  it("TEST 4: Repeated Import/Reset cycles always produce 1 foundation_cond row", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
    ]);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");

    for (let i = 0; i < 3; i++) {
      await applyTemplateImport(makeImportData());
      const fcAfterImport = mockDb.getFieldRows().filter((f) => f.FieldKey === "foundation_cond");
      expect(fcAfterImport.length).toBe(1);

      await ResetRepository.performReset();
      const fcAfterReset = mockDb.getFieldRows().filter((f) => f.FieldKey === "foundation_cond");
      expect(fcAfterReset.length).toBe(1);
    }
  });

  it("TEST 5: Existing duplicate field is consolidated by Reset", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
      { FieldID: 51, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
    ]);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const fcFields = mockDb.getFieldRows().filter((f) => f.FieldKey === "foundation_cond");
    expect(fcFields.length).toBe(1);
    expect(fcFields[0].FieldID).toBe(25);
  });

  it("TEST 6: Historical InspectionValues referencing duplicate FieldID remain valid", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
      { FieldID: 51, SectionID: 10, FieldKey: "foundation_cond", FieldName: "Foundation Condition", IsActive: 1 },
    ]);
    mockDb.addInspectionValue({ ValueID: 1, InspectionID: 1, FieldID: 51, FieldValue: "Acceptable" });
    mockDb.addInspectionValue({ ValueID: 2, InspectionID: 2, FieldID: 51, FieldValue: "Minor Damage" });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const values = mockDb.getInspectionValues();
    expect(values.length).toBe(2);
    expect(values[0].FieldID).toBe(25);
    expect(values[1].FieldID).toBe(25);
    expect(values[0].FieldValue).toBe("Acceptable");
    expect(values[1].FieldValue).toBe("Minor Damage");
  });

  it("TEST 7: ALL canonical field keys have no duplicates after import", async () => {
    const sections = CANONICAL_SECTION_KEYS.map((key, i) => ({
      SectionID: 100 + i,
      TemplateID: 1,
      SectionKey: key,
      SectionName: key,
      IsDefault: 1,
      IsActive: 1,
    }));
    mockDb.seedSections(sections);

    const fields = poleInspectionFields.map((f, i) => ({
      FieldID: 200 + i,
      SectionID: sections.find((s) => s.SectionKey === f.SectionKey)?.SectionID ?? 100,
      FieldKey: f.FieldKey,
      FieldName: f.FieldName,
      IsActive: 1,
    }));
    mockDb.seedFields(fields);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(makeImportData());

    for (const pf of poleInspectionFields) {
      const matching = mockDb.getFieldRows().filter((f) => f.FieldKey === pf.FieldKey);
      expect(matching.length).toBe(1);
    }
  });

  it("TEST 8: ALL canonical section keys have no duplicates after import", async () => {
    const sections = CANONICAL_SECTION_KEYS.map((key, i) => ({
      SectionID: 100 + i,
      TemplateID: 1,
      SectionKey: key,
      SectionName: key,
      IsDefault: 1,
      IsActive: 1,
    }));
    mockDb.seedSections(sections);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(makeImportData());

    for (const key of CANONICAL_SECTION_KEYS) {
      const matching = mockDb.getSectionRows().filter((s) => s.SectionKey === key);
      expect(matching.length).toBe(1);
    }
  });
});
