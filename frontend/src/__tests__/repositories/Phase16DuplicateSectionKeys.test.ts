jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";

type TemplateRow = {
  TemplateID: number;
  TemplateName: string;
  IsDefault: number;
  IsActive: number;
};
type SectionRow = {
  SectionID: number;
  TemplateID: number;
  SectionKey: string;
  SectionName: string;
  IsDefault: number;
  IsActive: number;
};
type FieldRow = {
  FieldID: number;
  SectionID: number;
  FieldKey: string;
  FieldName: string;
  IsActive: number;
};

function createMockDb() {
  let templateRows: TemplateRow[] = [
    { TemplateID: 1, TemplateName: "ACCC Dynamic Inspection Platform", IsDefault: 1, IsActive: 1 },
  ];
  let sectionRows: SectionRow[] = [];
  let fieldRows: FieldRow[] = [];
  let nextSectionId = 100;
  let nextFieldId = 200;
  let nextTemplateId = 10;

  const runAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = sql.toUpperCase().replace(/\s+/g, " ").trim();

    if (s.includes("INSERT INTO INSPECTIONTEMPLATES")) {
      const id = nextTemplateId++;
      templateRows.push({
        TemplateID: id,
        TemplateName: params?.[0] as string ?? "",
        IsDefault: params?.[2] as number ?? 0,
        IsActive: 1,
      });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONTEMPLATES")) {
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONSECTIONS") && s.includes("ISACTIVE = 0")) {
      const tid = params![0] as number;
      sectionRows = sectionRows.map((r) => (r.TemplateID === tid ? { ...r, IsActive: 0 } : r));
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

    if (s.includes("UPDATE INSPECTIONSECTIONS")) {
      const sid = params![params!.length - 1] as number;
      sectionRows = sectionRows.map((r) =>
        r.SectionID === sid ? { ...r, SectionName: params![0] as string, IsActive: 1 } : r
      );
      return { changes: 1 };
    }

    if (s.includes("UPDATE INSPECTIONFIELDS") && s.includes("ISACTIVE = 0")) {
      const sid = params![0] as number;
      const excludedKeys = params!.slice(1) as string[];
      fieldRows = fieldRows.map((f) =>
        f.SectionID === sid && !excludedKeys.includes(f.FieldKey) ? { ...f, IsActive: 0 } : f
      );
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

    if (s.includes("UPDATE INSPECTIONFIELDS")) {
      const fid = params![params!.length - 1] as number;
      fieldRows = fieldRows.map((f) => (f.FieldID === fid ? { ...f, IsActive: 1 } : f));
      return { changes: 1 };
    }

    if (s.includes("DELETE FROM FIELDOPTIONS")) {
      return { changes: 0 };
    }

    if (s.includes("INSERT INTO FIELDOPTIONS")) {
      return { lastInsertRowId: 1, changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 1 };
  });

  const getAllAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = sql.toUpperCase().replace(/\s+/g, " ").trim();

    if (s.includes("SELECT TEMPLATEID") && s.includes("INSPECTIONTEMPLATES") && s.includes("WHERE TEMPLATENAME IN")) {
      const names = params as string[];
      return templateRows.filter((t) => names.includes(t.TemplateName) && t.IsActive === 1).map((t) => ({ TemplateID: t.TemplateID }));
    }

    if (s.includes("SELECT SECTIONID") && s.includes("FROM INSPECTIONSECTIONS") && s.includes("ISACTIVE = 1")) {
      return sectionRows.filter((r) => r.IsActive === 1).map((r) => ({ SectionID: r.SectionID, TemplateID: r.TemplateID }));
    }

    if (s.includes("SELECT SECTIONID") && s.includes("FIELDKEY") && s.includes("FROM INSPECTIONFIELDS")) {
      return fieldRows.filter((f) => f.IsActive === 1).map((f) => ({ SectionID: f.SectionID, FieldKey: f.FieldKey }));
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

    if (s.includes("SELECT SECTIONID") && s.includes("INSPECTIONSECTIONS")) {
      const tid = params?.[0] as number;
      const key = params?.[1] as string;
      const found = sectionRows.find((r) => r.TemplateID === tid && r.SectionKey === key);
      return found ? { SectionID: found.SectionID } : null;
    }

    if (s.includes("SELECT FIELDID") && s.includes("INSPECTIONFIELDS") && s.includes("SECTIONID")) {
      const sid = params?.[0] as number;
      const key = params?.[1] as string;
      const found = fieldRows.find((f) => f.SectionID === sid && f.FieldKey === key);
      return found ? { FieldID: found.FieldID } : null;
    }

    if (s.includes("SELECT FIELDID") && s.includes("INSPECTIONFIELDS")) {
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
    seedSections: (rows: SectionRow[]) => { sectionRows = [...rows]; },
    seedFields: (rows: FieldRow[]) => { fieldRows = [...rows]; },
  };
}

function section(sectionKey: string, fieldKey?: string) {
  return {
    SectionName: sectionKey.split("_").join(" "),
    SectionKey: sectionKey,
    Description: null,
    Icon: "business",
    DisplayOrder: 1,
    IsRepeatable: 0,
    IsVisible: 1,
    fields: [
      {
        FieldName: `Field of ${sectionKey}`,
        FieldKey: fieldKey ?? `field_${sectionKey}`,
        FieldType: "Text",
        Placeholder: null,
        DefaultValue: null,
        HelpText: null,
        ValidationRule: null,
        DisplayOrder: 1,
        IsRequired: 0,
        IsVisible: 1,
        IsReadOnly: 0,
        IsSystemField: 0,
        Width: 12,
        options: [],
      },
    ],
  };
}

function makeImportData(templateName: string, sections: ReturnType<typeof section>[]) {
  return {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: [
      {
        TemplateName: templateName,
        Description: null,
        IsDefault: 1,
        sections,
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: [],
  };
}

describe("Phase 16 — Duplicate Section Identifiers (SectionKey) on Import", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("TEST 1: Import with two sections sharing the same SectionKey in one template is rejected", async () => {
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(
      makeImportData("ACCC Dynamic Inspection Platform", [
        section("pole_structure", "field_a"),
        section("pole_structure", "field_b"),
      ])
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Duplicate section identifier");
    expect(mockDb.getSectionRows().filter((s) => s.IsActive === 1).length).toBe(0);
  });

  it("TEST 2: Duplicate SectionKeys differing only by case/whitespace are rejected", async () => {
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const data = makeImportData("ACCC Dynamic Inspection Platform", [
      section("pole_structure", "field_a"),
    ]);
    data.templates[0].sections.push({ ...section("Pole_Structure ", "field_b"), SectionKey: "  Pole_Structure  " });

    const result = await applyTemplateImport(data);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Duplicate section identifier");
  });

  it("TEST 3: Same SectionKey across two different templates is allowed", async () => {
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport({
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Template A",
          Description: null,
          IsDefault: 1,
          sections: [section("pole_structure", "field_a")],
          deviceTypes: [],
          deviceOptions: [],
        },
        {
          TemplateName: "Template B",
          Description: null,
          IsDefault: 0,
          sections: [section("pole_structure", "field_b")],
          deviceTypes: [],
          deviceOptions: [],
        },
      ],
      projectDeviceTypes: [],
    });

    expect(result.success).toBe(true);
    const rows = mockDb.getSectionRows().filter((s) => s.SectionKey === "pole_structure");
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.TemplateID)).size).toBe(2);
  });

  it("TEST 4: Duplicate SectionKeys within the same TemplateName listed twice are rejected", async () => {
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport({
      version: "2.0",
      exportedAt: new Date().toISOString(),
      templates: [
        {
          TemplateName: "Template A",
          Description: null,
          IsDefault: 1,
          sections: [section("pole_structure", "field_a")],
          deviceTypes: [],
          deviceOptions: [],
        },
        {
          TemplateName: "Template A",
          Description: null,
          IsDefault: 0,
          sections: [section("pole_structure", "field_b")],
          deviceTypes: [],
          deviceOptions: [],
        },
      ],
      projectDeviceTypes: [],
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Duplicate section identifier");
  });

  it("TEST 5: Re-import of own template with unique keys still succeeds (upsert)", async () => {
    mockDb.seedSections([
      { SectionID: 10, TemplateID: 1, SectionKey: "pole_structure", SectionName: "Pole Structure Details", IsDefault: 1, IsActive: 1 },
    ]);
    mockDb.seedFields([
      { FieldID: 25, SectionID: 10, FieldKey: "field_pole_structure", FieldName: "Field of pole_structure", IsActive: 1 },
    ]);

    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(
      makeImportData("ACCC Dynamic Inspection Platform", [section("pole_structure")])
    );

    expect(result.success).toBe(true);
    expect(mockDb.getSectionRows().filter((s) => s.SectionKey === "pole_structure").length).toBe(1);
  });

  it("TEST 6: All canonical section keys import without duplicate failure", async () => {
    const canonical = [
      "general_information", "pole_structure", "junction_box", "earthing",
      "meter", "connectivity", "camera_information", "switch_information",
      "remarks", "photos",
    ];

    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(
      makeImportData("ACCC Dynamic Inspection Platform", canonical.map((k, i) => section(k, `field_${k}_${i}`)))
    );

    expect(result.success).toBe(true);
    for (const key of canonical) {
      expect(mockDb.getSectionRows().filter((s) => s.SectionKey === key).length).toBe(1);
    }
  });
});