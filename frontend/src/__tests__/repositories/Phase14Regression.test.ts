jest.mock("@/src/database/db");

import { getDatabase } from "@/src/database/db";
import { fieldOptions } from "@/src/database/seeds/field-options.data";
import { poleInspectionFields } from "@/src/database/seeds/pole-inspection-data";

function createMockDb() {
  let fieldOptionRows: Array<{ OptionID: number; FieldID: number; OptionLabel: string; OptionValue: string; DisplayOrder: number; IsDefault: number; IsActive: number }> = [];
  let inspectionValues: Array<{ ValueID: number; InspectionID: number; FieldID: number; FieldValue: string }> = [];
  let inspections: Array<{ InspectionID: number; ProjectID: number }> = [];
  let nextId = 1;

  const runAsyncFn = jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
    const sqlUpper = sql.toUpperCase();

    if (sqlUpper.includes("INSERT INTO FIELDOPTIONS")) {
      const id = nextId++;
      fieldOptionRows.push({
        OptionID: id,
        FieldID: params[0] as number,
        OptionLabel: params[1] as string,
        OptionValue: params[2] as string,
        DisplayOrder: params[3] as number,
        IsDefault: (params[4] as number) ?? 0,
        IsActive: 1,
      });
      return { lastInsertRowId: id, changes: 1 };
    }

    if (sqlUpper.includes("DELETE FROM FIELDOPTIONS")) {
      fieldOptionRows = [];
      return { changes: 0 };
    }

    if (sqlUpper.includes("UPDATE FIELDOPTIONS") && sqlUpper.includes("OPTIONLABEL")) {
      const optionLabel = params[0] as string;
      const optionValue = params[2] as string;
      const fieldId = params[3] as number;
      fieldOptionRows = fieldOptionRows.map((r) => {
        if (r.FieldID === fieldId && r.OptionValue === optionValue) {
          return { ...r, OptionLabel: optionLabel };
        }
        return r;
      });
      return { changes: 1 };
    }

    if (sqlUpper.includes("UPDATE FIELDOPTIONS") && sqlUpper.includes("ISACTIVE")) {
      const fieldId = params[0] as number;
      const optionValue = params[1] as string;
      fieldOptionRows = fieldOptionRows.map((r) => {
        if (r.FieldID === fieldId && r.OptionValue === optionValue) {
          return { ...r, IsActive: 0 };
        }
        return r;
      });
      return { changes: 1 };
    }

    if (sqlUpper.includes("INSERT OR IGNORE INTO PROJECTDEVICETYPES")) {
      return { changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 1 };
  });

  const getAllAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const sqlUpper = sql.toUpperCase();

    if (sqlUpper.includes("SELECT SECTIONKEY, SECTIONID FROM INSPECTIONSECTIONS")) {
      return [
        { SectionKey: "general_information", SectionID: 1 },
        { SectionKey: "pole_structure", SectionID: 2 },
        { SectionKey: "junction_box", SectionID: 3 },
        { SectionKey: "earthing", SectionID: 4 },
        { SectionKey: "meter", SectionID: 5 },
        { SectionKey: "connectivity", SectionID: 6 },
        { SectionKey: "camera_information", SectionID: 7 },
        { SectionKey: "switch_information", SectionID: 8 },
        { SectionKey: "remarks", SectionID: 9 },
        { SectionKey: "photos", SectionID: 10 },
      ];
    }

    return [];
  });

  const getFirstAsyncFn = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    const sqlUpper = sql.toUpperCase();

    if (sqlUpper.includes("SELECT FIELDID FROM INSPECTIONFIELDS WHERE FIELDKEY")) {
      const fieldKey = params?.[0] as string;
      const fieldMap: Record<string, number> = {};
      poleInspectionFields.forEach((f, i) => { fieldMap[f.FieldKey] = i + 1; });
      return fieldMap[fieldKey] ? { FieldID: fieldMap[fieldKey] } : null;
    }

    return null;
  });

  return {
    runAsync: runAsyncFn,
    getAllAsync: getAllAsyncFn,
    getFirstAsync: getFirstAsyncFn,
    withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
    getFieldOptionRows: () => fieldOptionRows,
    getInspectionValues: () => inspectionValues,
    getInspections: () => inspections,
    seedFieldOptions: (opts: typeof fieldOptionRows) => { fieldOptionRows = [...opts]; },
    addInspection: (insp: typeof inspections[0]) => { inspections.push(insp); },
    addInspectionValue: (val: typeof inspectionValues[0]) => { inspectionValues.push(val); },
  };
}

describe("Phase 14 Regression — Power Cable & Reset Canonical Data", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("TEST 1: fieldOptions.power_cable has Installed/Not Installed labels with Yes/No values", () => {
    const powerCableOptions = fieldOptions.filter((o) => o.FieldKey === "power_cable");

    expect(powerCableOptions).toEqual([
      { FieldKey: "power_cable", OptionLabel: "Installed", OptionValue: "Yes", DisplayOrder: 1 },
      { FieldKey: "power_cable", OptionLabel: "Not Installed", OptionValue: "No", DisplayOrder: 2 },
      { FieldKey: "power_cable", OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 3 },
    ]);
  });

  it("TEST 2: Reset restores canonical power_cable options after corruption", async () => {
    const powerCableFieldId = poleInspectionFields.findIndex((f) => f.FieldKey === "power_cable") + 1;

    const corruptedOptions = [
      { OptionID: 1, FieldID: powerCableFieldId, OptionLabel: "Yes", OptionValue: "Yes", DisplayOrder: 1, IsDefault: 0, IsActive: 1 },
      { OptionID: 2, FieldID: powerCableFieldId, OptionLabel: "No", OptionValue: "No", DisplayOrder: 2, IsDefault: 0, IsActive: 1 },
      { OptionID: 3, FieldID: powerCableFieldId, OptionLabel: "Not Verified", OptionValue: "Not Verified", DisplayOrder: 3, IsDefault: 0, IsActive: 1 },
    ];
    mockDb.seedFieldOptions(corruptedOptions);

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const insertCalls = mockDb.runAsync.mock.calls.filter(
      (c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions")
    );

    const powerCableInserts = insertCalls.filter((c: [string, unknown[]]) => {
      const params = c[1];
      const fieldId = params[0] as number;
      return fieldId === powerCableFieldId;
    });

    expect(powerCableInserts.length).toBe(3);

    const labels = powerCableInserts.map((c: [string, unknown[]]) => (c[1] as unknown[])[1]);
    expect(labels).toEqual(["Installed", "Not Installed", "Not Verified"]);
  });

  it("TEST 3: Reset produces same canonical configuration as fresh seed", async () => {
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");

    await ResetRepository.performReset();
    const resetCalls = mockDb.runAsync.mock.calls.map((c: [string, unknown[]]) => ({
      sql: String(c[0]),
      params: [...(c[1] || [])],
    }));

    const resetInserts = resetCalls.filter((c) => c.sql.includes("INSERT INTO FieldOptions"));

    const powerCableFieldId = poleInspectionFields.findIndex((f) => f.FieldKey === "power_cable") + 1;

    const resetPCInserts = resetInserts.filter((c) => c.params[0] === powerCableFieldId);
    const resetPCLabels = resetPCInserts.map((c) => c.params[1]);
    const resetPCValues = resetPCInserts.map((c) => c.params[2]);

    expect(resetPCLabels).toEqual(["Installed", "Not Installed", "Not Verified"]);
    expect(resetPCValues).toEqual(["Yes", "No", "Not Verified"]);

    const expectedPCOptions = fieldOptions.filter((o) => o.FieldKey === "power_cable");
    for (const expected of expectedPCOptions) {
      expect(resetPCLabels).toContain(expected.OptionLabel);
      expect(resetPCValues).toContain(expected.OptionValue);
    }
  });

  it("TEST 4: Historical inspection values are preserved through migration", async () => {
    const powerCableFieldId = poleInspectionFields.findIndex((f) => f.FieldKey === "power_cable") + 1;
    mockDb.addInspection({ InspectionID: 1, ProjectID: 1 });
    mockDb.addInspectionValue({ ValueID: 1, InspectionID: 1, FieldID: powerCableFieldId, FieldValue: "Yes" });
    mockDb.addInspectionValue({ ValueID: 2, InspectionID: 1, FieldID: powerCableFieldId, FieldValue: "No" });

    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const inspections = mockDb.getInspections();
    const values = mockDb.getInspectionValues();

    expect(inspections.length).toBe(1);
    expect(values.length).toBe(2);
    expect(values[0].FieldValue).toBe("Yes");
    expect(values[1].FieldValue).toBe("No");
  });

  it("TEST 5: Triple reset produces identical FieldOptions INSERT calls", async () => {
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");

    await ResetRepository.performReset();
    const firstInserts = mockDb.runAsync.mock.calls
      .filter((c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions"))
      .map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: [...(c[1] || [])] }));

    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    await ResetRepository.performReset();
    const secondInserts = mockDb.runAsync.mock.calls
      .filter((c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions"))
      .map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: [...(c[1] || [])] }));

    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);

    await ResetRepository.performReset();
    const thirdInserts = mockDb.runAsync.mock.calls
      .filter((c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions"))
      .map((c: [string, unknown[]]) => ({ sql: String(c[0]), params: [...(c[1] || [])] }));

    expect(thirdInserts.length).toBe(firstInserts.length);
    for (let i = 0; i < firstInserts.length; i++) {
      expect(thirdInserts[i].sql).toBe(firstInserts[i].sql);
      expect(thirdInserts[i].params).toEqual(firstInserts[i].params);
    }
  });

  it("TEST 6: No FieldOptions insert has IsDefault=1 (no multiple defaults)", async () => {
    const { ResetRepository } = require("@/src/database/repositories/ResetRepository");
    await ResetRepository.performReset();

    const insertCalls = mockDb.runAsync.mock.calls.filter(
      (c: [string]) => String(c[0]).includes("INSERT INTO FieldOptions")
    );

    for (const call of insertCalls) {
      const isDefault = (call as [string, unknown[]])[1][4];
      expect(isDefault).toBe(0);
    }
  });

  it("fieldOptions has correct labels for all dropdown groups per canonical template", () => {
    const checkGroup = (key: string, expected: { label: string; value: string }[]) => {
      const opts = fieldOptions.filter((o) => o.FieldKey === key);
      expect(opts.length).toBe(expected.length);
      for (const exp of expected) {
        const found = opts.find((o) => o.OptionLabel === exp.label && o.OptionValue === exp.value);
        expect(found).toBeTruthy();
      }
    };

    checkGroup("pole_avail", [
      { label: "Installed", value: "Yes" },
      { label: "Not Installed", value: "No" },
    ]);

    checkGroup("foundation_cond", [
      { label: "Acceptable", value: "Acceptable" },
      { label: "Minor Damage", value: "Minor Damage" },
      { label: "Major Damage", value: "Major Damage" },
      { label: "Not Visible", value: "Not Visible" },
      { label: "Not Installed", value: "Not Installed" },
    ]);

    checkGroup("cable_status", [
      { label: "Overhead", value: "Overhead" },
      { label: "Underground", value: "Underground" },
      { label: "On Ground", value: "On Ground" },
      { label: "Not Verified", value: "Not Verified" },
      { label: "Damage", value: "Damage" },
    ]);

    checkGroup("meter_power_status", [
      { label: "Powered", value: "Powered" },
      { label: "Non-Powered", value: "Non-Powered" },
      { label: "Tapping", value: "Tapping" },
    ]);

    const connectivityOpts = fieldOptions.filter((o) => o.FieldKey === "connectivity_type");
    expect(connectivityOpts.map((o) => o.OptionLabel)).toEqual(["Fiber", "RF", "No Connectivity"]);
    expect(connectivityOpts.find((o) => o.OptionLabel === "Local")).toBeUndefined();
  });
});
