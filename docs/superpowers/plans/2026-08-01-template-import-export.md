# Template Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export their fully customized inspection form (all templates, sections, fields, options, custom device types, device options, project device type mappings) to a JSON file, share it to another phone, and import it there so the form becomes exactly the exported state — with a proper modal UI.

**Architecture:** Extend the existing `src/utils/templateData.ts` with a v2.0 JSON format (array of templates + device data + project device types). Export writes a JSON file and returns a summary; import is split into parse-then-apply so the UI can show a confirmation dialog before the replace-in-place transaction. A shared `useTemplateFlow` hook drives the modal state machine in `app/settings/index.tsx`.

**Tech Stack:** React Native / Expo (SDK 54), expo-sqlite, expo-file-system/legacy, expo-sharing, expo-document-picker, react-native-paper (Dialog/Portal), Jest + jest-expo.

## Global Constraints

- Use the sequential open/close DB model — one `SQLiteDatabase` handle at a time via `getDatabase()` from `src/database/db.ts`. Never call `getGlobalDatabase()`.
- All template/device data lives in the project DB. Never touch `accc_global.db`.
- Every project-scoped feature ships with an isolation regression test (mirror `src/__tests__/database/isolation.test.ts`).
- TypeScript strict. No `any`. No comments unless requested.
- Jest mocks stay path-aware; distinct DB handles per test.
- JSON format version is `"2.0"`. Import must still accept v1.0 files.
- `FieldOptions`/`InspectionSections`/`InspectionFields`/`InspectionTemplates` all have `IsActive`, `IsDefault`, `UpdatedAt`. `DeviceFieldDefinitions` and `DeviceOptions` have `TemplateID`, `DeviceType`, `FieldName`, `IsActive`. `ProjectDeviceTypes` in practice has no `ProjectID` column (inline schema in `schema.ts`) — do not query it by `ProjectID`.
- Run all commands from `frontend/`. Tests: `npx jest <path>`. Typecheck: `npx tsc --noEmit`. Lint: `npx expo lint`.

---

### Task 1: v2.0 export in `templateData.ts` — types + `exportTemplates()`

**Files:**
- Modify: `frontend/src/utils/templateData.ts`
- Test: `frontend/src/__tests__/utils/templateData.test.ts`

**Interfaces:**
- Consumes: existing `getDatabase()` from `../database/db`.
- Produces:
  ```ts
  export interface TemplateExportSummary {
    templateCount: number;
    sectionCount: number;
    fieldCount: number;
    deviceTypeCount: number;
    deviceOptionCount: number;
  }
  export interface TemplateExportResult {
    fileUri: string;
    fileName: string;
    summary: TemplateExportSummary;
  }
  export async function exportTemplates(): Promise<TemplateExportResult | null>;
  ```
  Returns `null` when the project has no templates. Does NOT auto-share (the UI calls `shareTemplateFile` after success).

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/utils/templateData.test.ts`. Keep the existing `jest.mock("@/src/database/db")` and the existing `mockDb` setup (it already has `getFirstAsync`, `getAllAsync`, `runAsync`, `withTransactionAsync`).

```ts
describe("exportTemplates", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
      withTransactionAsync: jest.fn(),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("returns null when no templates exist", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const { exportTemplates } = require("@/src/utils/templateData");
    expect(await exportTemplates()).toBeNull();
  });

  it("exports all templates with sections, fields, options, device data and summary", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        { TemplateID: 1, TemplateName: "Default", Description: "d", IsDefault: 1, IsActive: 1 },
        { TemplateID: 2, TemplateName: "Custom", Description: null, IsDefault: 0, IsActive: 1 },
      ])
      .mockResolvedValueOnce([
        { SectionID: 1, SectionName: "General", SectionKey: "general", Description: null, Icon: null, DisplayOrder: 1, IsRepeatable: 0, IsVisible: 1 },
      ])
      .mockResolvedValueOnce([
        { FieldID: 1, FieldName: "Voltage", FieldKey: "voltage", FieldType: "text", Placeholder: null, DefaultValue: null, HelpText: null, ValidationRule: null, DisplayOrder: 1, IsRequired: 1, IsVisible: 1, IsReadOnly: 0, IsSystemField: 0, Width: 12 },
      ])
      .mockResolvedValueOnce([
        { OptionLabel: "A", OptionValue: "a", DisplayOrder: 1, IsDefault: 0 },
      ])
      .mockResolvedValueOnce([]) // sections for template 2
      .mockResolvedValueOnce([]) // device types for template 1
      .mockResolvedValueOnce([]) // device options for template 1
      .mockResolvedValueOnce([]) // device types for template 2
      .mockResolvedValueOnce([]) // device options for template 2
      .mockResolvedValueOnce(["Camera", "Switch", "UPS"]); // projectDeviceTypes

    const { exportTemplates } = require("@/src/utils/templateData");
    const result = await exportTemplates();

    expect(result).not.toBeNull();
    expect(result!.fileName).toMatch(/^template_.+\.json$/);
    expect(result!.summary).toEqual({
      templateCount: 2,
      sectionCount: 1,
      fieldCount: 1,
      deviceTypeCount: 0,
      deviceOptionCount: 0,
    });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();

    const { shareAsync } = require("expo-sharing");
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
```

The existing `expo-file-system/legacy` mock already exposes `writeAsStringAsync`. Note the v2.0 format is written via `JSON.stringify(..., null, 2)` — assert structure by reading what was passed:

```ts
it("writes the v2.0 JSON shape", async () => {
  mockDb.getAllAsync
    .mockResolvedValueOnce([{ TemplateID: 1, TemplateName: "Default", Description: null, IsDefault: 1, IsActive: 1 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(["Camera"]);

  const { exportTemplates } = require("@/src/utils/templateData");
  await exportTemplates();

  const [, json] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
  const data = JSON.parse(json);
  expect(data.version).toBe("2.0");
  expect(data.templates).toHaveLength(1);
  expect(data.templates[0].TemplateName).toBe("Default");
  expect(data.templates[0].sections).toEqual([]);
  expect(data.templates[0].deviceTypes).toEqual([]);
  expect(data.projectDeviceTypes).toEqual(["Camera"]);
});
```

- [ ] **Step 2: Run tests to verify the export tests fail**

Run: `npx jest src/__tests__/utils/templateData.test.ts`
Expected: FAIL — `exportTemplates` is not exported / undefined.

- [ ] **Step 3: Implement `exportTemplates` in `templateData.ts`**

Replace the type block at the top of the file (keep `VALID_FIELD_TYPES` and `normalizeFieldType`):

```ts
export interface TemplateExportSummary {
  templateCount: number;
  sectionCount: number;
  fieldCount: number;
  deviceTypeCount: number;
  deviceOptionCount: number;
}

export interface TemplateExportResult {
  fileUri: string;
  fileName: string;
  summary: TemplateExportSummary;
}

export interface TemplateExportData {
  version: string;
  exportedAt: string;
  templates: TemplateExportTemplate[];
  projectDeviceTypes: string[];
}

export interface TemplateExportTemplate {
  TemplateName: string;
  Description: string | null;
  IsDefault: number;
  sections: TemplateExportSection[];
  deviceTypes: TemplateExportDeviceType[];
  deviceOptions: TemplateExportDeviceOption[];
}

export interface TemplateExportSection {
  SectionName: string;
  SectionKey: string;
  Description: string | null;
  Icon: string | null;
  DisplayOrder: number;
  IsRepeatable: number;
  IsVisible: number;
  fields: TemplateExportField[];
}

export interface TemplateExportField {
  FieldName: string;
  FieldKey: string;
  FieldType: string;
  Placeholder: string | null;
  DefaultValue: string | null;
  HelpText: string | null;
  ValidationRule: string | null;
  DisplayOrder: number;
  IsRequired: number;
  IsVisible: number;
  IsReadOnly: number;
  IsSystemField: number;
  Width: number;
  options: { OptionLabel: string; OptionValue: string; DisplayOrder: number; IsDefault: number }[];
}

export interface TemplateExportDeviceType {
  DeviceType: string;
  FieldName: string;
  Label: string;
  FieldType: string;
  IsRequired: number;
  DisplayOrder: number;
}

export interface TemplateExportDeviceOption {
  DeviceType: string;
  FieldName: string;
  OptionLabel: string;
  OptionValue: string;
  DisplayOrder: number;
}
```

Add the export function after `exportDefaultTemplate` (keep `exportDefaultTemplate` for now — it is replaced in Task 3):

```ts
export async function exportTemplates(): Promise<TemplateExportResult | null> {
  const db = await getDatabase();

  const templates = await db.getAllAsync<{
    TemplateID: number;
    TemplateName: string;
    Description: string | null;
    IsDefault: number;
    IsActive: number;
  }>(
    `SELECT TemplateID, TemplateName, Description, IsDefault, IsActive
     FROM InspectionTemplates ORDER BY TemplateID`
  );

  const activeTemplates = templates.filter((t) => t.IsActive === 1);
  if (activeTemplates.length === 0) return null;

  const exportTemplates: TemplateExportTemplate[] = [];
  let sectionCount = 0;
  let fieldCount = 0;
  let deviceTypeCount = 0;
  let deviceOptionCount = 0;

  for (const template of activeTemplates) {
    const sections = await db.getAllAsync<{
      SectionID: number;
      SectionName: string;
      SectionKey: string;
      Description: string | null;
      Icon: string | null;
      DisplayOrder: number;
      IsRepeatable: number;
      IsVisible: number;
    }>(
      `SELECT SectionID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible
       FROM InspectionSections WHERE TemplateID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
      [template.TemplateID]
    );

    const exportSections: TemplateExportSection[] = [];

    for (const section of sections) {
      const fields = await db.getAllAsync<{
        FieldID: number;
        FieldName: string;
        FieldKey: string;
        FieldType: string;
        Placeholder: string | null;
        DefaultValue: string | null;
        HelpText: string | null;
        ValidationRule: string | null;
        DisplayOrder: number;
        IsRequired: number;
        IsVisible: number;
        IsReadOnly: number;
        IsSystemField: number;
        Width: number;
      }>(
        `SELECT FieldID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
                HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly,
                IsSystemField, Width
         FROM InspectionFields WHERE SectionID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
        [section.SectionID]
      );

      const exportFields: TemplateExportSection["fields"] = [];

      for (const field of fields) {
        const options = await db.getAllAsync<{
          OptionLabel: string;
          OptionValue: string;
          DisplayOrder: number;
          IsDefault: number;
        }>(
          `SELECT OptionLabel, OptionValue, DisplayOrder, IsDefault
           FROM FieldOptions WHERE FieldID = ? ORDER BY DisplayOrder`,
          [field.FieldID]
        );

        exportFields.push({
          FieldName: field.FieldName,
          FieldKey: field.FieldKey,
          FieldType: field.FieldType,
          Placeholder: field.Placeholder,
          DefaultValue: field.DefaultValue,
          HelpText: field.HelpText,
          ValidationRule: field.ValidationRule,
          DisplayOrder: field.DisplayOrder,
          IsRequired: field.IsRequired,
          IsVisible: field.IsVisible,
          IsReadOnly: field.IsReadOnly,
          IsSystemField: field.IsSystemField,
          Width: field.Width,
          options,
        });
        fieldCount++;
      }

      exportSections.push({
        SectionName: section.SectionName,
        SectionKey: section.SectionKey,
        Description: section.Description,
        Icon: section.Icon,
        DisplayOrder: section.DisplayOrder,
        IsRepeatable: section.IsRepeatable,
        IsVisible: section.IsVisible,
        fields: exportFields,
      });
      sectionCount++;
    }

    const deviceTypes = await db.getAllAsync<{
      DeviceType: string;
      FieldName: string;
      Label: string;
      FieldType: string;
      IsRequired: number;
      DisplayOrder: number;
    }>(
      `SELECT DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder
       FROM DeviceFieldDefinitions WHERE TemplateID = ? AND IsActive = 1 ORDER BY DisplayOrder`,
      [template.TemplateID]
    );

    const deviceOptions = await db.getAllAsync<{
      DeviceType: string;
      FieldName: string;
      OptionLabel: string;
      OptionValue: string;
      DisplayOrder: number;
    }>(
      `SELECT DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder
       FROM DeviceOptions WHERE TemplateID = ? AND IsActive = 1 ORDER BY FieldName, DisplayOrder`,
      [template.TemplateID]
    );

    deviceTypeCount += deviceTypes.length;
    deviceOptionCount += deviceOptions.length;

    exportTemplates.push({
      TemplateName: template.TemplateName,
      Description: template.Description,
      IsDefault: template.IsDefault,
      sections: exportSections,
      deviceTypes,
      deviceOptions,
    });
  }

  const projectDeviceTypes = (
    await db.getAllAsync<{ DeviceType: string }>(
      `SELECT DeviceType FROM ProjectDeviceTypes WHERE IsActive = 1`
    )
  ).map((r) => r.DeviceType);

  const exportData: TemplateExportData = {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    templates: exportTemplates,
    projectDeviceTypes,
  };

  const json = JSON.stringify(exportData, null, 2);
  const fileName = `template_${new Date().toISOString().slice(0, 10)}.json`;
  const fileUri = FileSystem.documentDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return {
    fileUri,
    fileName,
    summary: {
      templateCount: activeTemplates.length,
      sectionCount,
      fieldCount,
      deviceTypeCount,
      deviceOptionCount,
    },
  };
}
```

- [ ] **Step 4: Run the export tests to verify they pass**

Run: `npx jest src/__tests__/utils/templateData.test.ts`
Expected: PASS (new `exportTemplates` tests; existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/utils/templateData.ts src/__tests__/utils/templateData.test.ts
git commit -m "feat(template): add v2.0 full-template export with summary"
```

---

### Task 2: `shareTemplateFile` + keep `exportDefaultTemplate` working

**Files:**
- Modify: `frontend/src/utils/templateData.ts`
- Test: `frontend/src/__tests__/utils/templateData.test.ts`

**Interfaces:**
- Consumes: `TemplateExportResult` from Task 1.
- Produces:
  ```ts
  export async function shareTemplateFile(result: TemplateExportResult): Promise<boolean>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe("shareTemplateFile", () => {
  it("shares the exported file", async () => {
    __setSharingAvailable(true);
    const { shareTemplateFile } = require("@/src/utils/templateData");
    const result = {
      fileUri: "file:///mock/documents/template_2026-08-01.json",
      fileName: "template_2026-08-01.json",
      summary: { templateCount: 1, sectionCount: 0, fieldCount: 0, deviceTypeCount: 0, deviceOptionCount: 0 },
    };
    const ok = await shareTemplateFile(result);
    expect(ok).toBe(true);
    const { shareAsync } = require("expo-sharing");
    expect(shareAsync).toHaveBeenCalledWith(result.fileUri, expect.any(Object));
  });

  it("returns false when sharing is unavailable", async () => {
    __setSharingAvailable(false);
    const { shareTemplateFile } = require("@/src/utils/templateData");
    const result = {
      fileUri: "file:///mock/documents/template.json",
      fileName: "template.json",
      summary: { templateCount: 1, sectionCount: 0, fieldCount: 0, deviceTypeCount: 0, deviceOptionCount: 0 },
    };
    expect(await shareTemplateFile(result)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/__tests__/utils/templateData.test.ts`
Expected: FAIL — `shareTemplateFile` not exported.

- [ ] **Step 3: Implement `shareTemplateFile`**

```ts
export async function shareTemplateFile(result: TemplateExportResult): Promise<boolean> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.fileUri, {
      mimeType: "application/json",
      dialogTitle: "Export Inspection Template",
      UTI: "public.json",
    });
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Refactor `exportDefaultTemplate` to delegate** (keeps existing tests green while removing duplication):

```ts
export async function exportDefaultTemplate(): Promise<boolean> {
  const result = await exportTemplates();
  if (!result) return false;
  return shareTemplateFile(result);
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest src/__tests__/utils/templateData.test.ts`
Expected: PASS — both new `shareTemplateFile` tests and existing `exportDefaultTemplate` tests.

- [ ] **Step 6: Commit**

```bash
git add src/utils/templateData.ts src/__tests__/utils/templateData.test.ts
git commit -m "feat(template): add shareTemplateFile and delegate exportDefaultTemplate"
```

---

### Task 3: Split import into parse + apply (v2.0, replace-in-place)

**Files:**
- Modify: `frontend/src/utils/templateData.ts`
- Test: `frontend/src/__tests__/utils/templateData.test.ts`

**Interfaces:**
- Consumes: `TemplateExportData`, `TemplateExportTemplate` types from Task 1.
- Produces:
  ```ts
  export interface TemplateImportSummary {
    templateCount: number;
    sectionCount: number;
    fieldCount: number;
    deviceTypeCount: number;
    deviceOptionCount: number;
  }
  export interface ParsedTemplateFile {
    data: TemplateExportData;
    summary: TemplateImportSummary;
  }
  export async function pickAndParseTemplate(): Promise<
    | { status: "canceled" }
    | { status: "error"; message: string }
    | { status: "ready"; parsed: ParsedTemplateFile }
  >;
  export async function applyTemplateImport(data: TemplateExportData): Promise<{ success: boolean; message: string }>;
  ```
  `pickAndParseTemplate` opens the document picker, reads + validates the file, returns parsed data and a summary of what will be applied. `applyTemplateImport` performs the replace-in-place transaction. `importTemplate()` is redefined as pick + parse + apply for backward compatibility.

- [ ] **Step 1: Write the failing tests**

Add a helper to normalize v1.0 → v2.0 input and a test for parsing:

```ts
function makeValidV2() {
  return {
    version: "2.0",
    exportedAt: "2024-01-01T00:00:00.000Z",
    templates: [
      {
        TemplateName: "Test Template",
        Description: "A test",
        IsDefault: 1,
        sections: [
          {
            SectionName: "General",
            SectionKey: "general",
            Description: null,
            Icon: null,
            DisplayOrder: 1,
            IsRepeatable: 0,
            IsVisible: 1,
            fields: [
              {
                FieldName: "Voltage",
                FieldKey: "voltage",
                FieldType: "text",
                Placeholder: null,
                DefaultValue: null,
                HelpText: null,
                ValidationRule: null,
                DisplayOrder: 1,
                IsRequired: 1,
                IsVisible: 1,
                IsReadOnly: 0,
                IsSystemField: 0,
                Width: 12,
                options: [],
              },
            ],
          },
        ],
        deviceTypes: [],
        deviceOptions: [],
      },
    ],
    projectDeviceTypes: ["Camera"],
  };
}
```

```ts
describe("pickAndParseTemplate", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      withTransactionAsync: jest.fn(),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    __resetPickerState();
  });

  it("returns canceled when no file selected", async () => {
    __setMockResult({ canceled: true });
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    expect(await pickAndParseTemplate()).toEqual({ status: "canceled" });
  });

  it("parses a v2.0 file and returns a summary", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(makeValidV2()));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.parsed.data.version).toBe("2.0");
      expect(result.parsed.summary).toEqual({ templateCount: 1, sectionCount: 1, fieldCount: 1, deviceTypeCount: 0, deviceOptionCount: 0 });
    }
  });

  it("normalizes a v1.0 file to v2.0 shape", async () => {
    const legacy = {
      version: "1.0",
      exportedAt: "2024-01-01T00:00:00.000Z",
      template: { TemplateName: "Old", Description: null },
      sections: makeValidV2().templates[0].sections,
    };
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(legacy));
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    const result = await pickAndParseTemplate();
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.parsed.data.templates).toHaveLength(1);
      expect(result.parsed.data.templates[0].TemplateName).toBe("Old");
      expect(result.parsed.data.templates[0].deviceTypes).toEqual([]);
      expect(result.parsed.data.projectDeviceTypes).toEqual([]);
    }
  });

  it("rejects invalid JSON and missing templates", async () => {
    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce("not json");
    const { pickAndParseTemplate } = require("@/src/utils/templateData");
    expect(await pickAndParseTemplate()).toEqual({ status: "error", message: "Invalid JSON file." });

    __setMockResult({ canceled: false, assets: [{ uri: "test.json" }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({}));
    expect(await pickAndParseTemplate()).toEqual({ status: "error", message: "Invalid template format." });
  });
});
```

Add tests for the apply step (replace-in-place):

```ts
describe("applyTemplateImport", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  it("deactivates existing non-default template rows and inserts imported data", async () => {
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(makeValidV2());

    expect(result.success).toBe(true);
    const deactivateCalls = (mockDb.runAsync as jest.Mock).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("IsActive = 0")
    );
    expect(deactivateCalls.length).toBeGreaterThanOrEqual(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionTemplates"),
      expect.arrayContaining(["Test Template", 1])
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionSections"),
      expect.anything()
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionFields"),
      expect.anything()
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO InspectionTemplates"),
      expect.anything()
    );
  });

  it("upserts device field definitions by (TemplateID, DeviceType, FieldName)", async () => {
    const v2 = makeValidV2();
    v2.templates[0].deviceTypes = [
      { DeviceType: "UPS", FieldName: "UPSMake", Label: "UPS Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 1 },
    ];
    const { applyTemplateImport } = require("@/src/utils/templateData");
    await applyTemplateImport(v2);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO DeviceFieldDefinitions"),
      expect.arrayContaining(["UPS", "UPSMake", "UPS Make"])
    );
  });

  it("replaces ProjectDeviceTypes without referencing ProjectID", async () => {
    const v2 = makeValidV2();
    v2.projectDeviceTypes = ["Camera", "UPS"];
    const { applyTemplateImport } = require("@/src/utils/templateData");
    const result = await applyTemplateImport(v2);

    expect(result.success).toBe(true);
    const calls = (mockDb.runAsync as jest.Mock).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((sql) => sql.includes("ProjectDeviceTypes"))).toBe(true);
    expect(calls.some((sql) => sql.includes("ProjectID"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/__tests__/utils/templateData.test.ts`
Expected: FAIL — `pickAndParseTemplate` / `applyTemplateImport` not exported.

- [ ] **Step 3: Implement `pickAndParseTemplate`**

Add the summary type and parser. Keep the existing `VALID_FIELD_TYPES` validation; move it into the parser:

```ts
export interface TemplateImportSummary {
  templateCount: number;
  sectionCount: number;
  fieldCount: number;
  deviceTypeCount: number;
  deviceOptionCount: number;
}

export interface ParsedTemplateFile {
  data: TemplateExportData;
  summary: TemplateImportSummary;
}

function computeImportSummary(templates: TemplateExportTemplate[]): TemplateImportSummary {
  let sectionCount = 0;
  let fieldCount = 0;
  let deviceTypeCount = 0;
  let deviceOptionCount = 0;
  for (const t of templates) {
    deviceTypeCount += t.deviceTypes?.length ?? 0;
    deviceOptionCount += t.deviceOptions?.length ?? 0;
    for (const s of t.sections ?? []) {
      sectionCount++;
      fieldCount += s.fields?.length ?? 0;
    }
  }
  return {
    templateCount: templates.length,
    sectionCount,
    fieldCount,
    deviceTypeCount,
    deviceOptionCount,
  };
}

export async function pickAndParseTemplate(): Promise<
  | { status: "canceled" }
  | { status: "error"; message: string }
  | { status: "ready"; parsed: ParsedTemplateFile }
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) {
    return { status: "canceled" };
  }

  const fileUri = result.assets[0].uri;
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    return { status: "error", message: "Invalid JSON file." };
  }

  const templates: TemplateExportTemplate[] = [];
  let projectDeviceTypes: string[] = [];

  if (Array.isArray(raw.templates) && raw.templates.length > 0) {
    for (const t of raw.templates as TemplateExportTemplate[]) {
      if (!t.TemplateName || !Array.isArray(t.sections)) {
        return { status: "error", message: `Template "${t.TemplateName ?? "?"}" is missing sections.` };
      }
      templates.push({
        ...t,
        deviceTypes: Array.isArray(t.deviceTypes) ? t.deviceTypes : [],
        deviceOptions: Array.isArray(t.deviceOptions) ? t.deviceOptions : [],
      });
    }
    projectDeviceTypes = Array.isArray(raw.projectDeviceTypes)
      ? (raw.projectDeviceTypes as string[])
      : [];
  } else if (raw.template && Array.isArray(raw.sections)) {
    const legacy = raw as unknown as {
      template: { TemplateName: string; Description: string | null };
      sections: TemplateExportSection[];
    };
    if (!legacy.template.TemplateName) {
      return { status: "error", message: "Template missing valid TemplateName." };
    }
    templates.push({
      TemplateName: legacy.template.TemplateName,
      Description: legacy.template.Description ?? null,
      IsDefault: 1,
      sections: legacy.sections,
      deviceTypes: [],
      deviceOptions: [],
    });
    projectDeviceTypes = [];
  } else {
    return { status: "error", message: "Invalid template format." };
  }

  const validFieldTypes = VALID_FIELD_TYPES.map((t) => t.toUpperCase());
  for (let si = 0; si < templates.length; si++) {
    const sections = templates[si].sections;
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      if (!section.SectionName || !section.SectionKey) {
        return { status: "error", message: `Section ${sIdx + 1} missing SectionName or SectionKey.` };
      }
      if (!Array.isArray(section.fields)) {
        return { status: "error", message: `Section "${section.SectionName}" missing fields array.` };
      }
      for (let fi = 0; fi < section.fields.length; fi++) {
        const field = section.fields[fi];
        if (!field.FieldName || !field.FieldKey || !field.FieldType) {
          return { status: "error", message: `Field ${fi + 1} in section "${section.SectionName}" missing required property (FieldName, FieldKey, or FieldType).` };
        }
        if (!validFieldTypes.includes(field.FieldType.toUpperCase())) {
          return { status: "error", message: `Field "${field.FieldName}" has invalid FieldType "${field.FieldType}". Valid types: ${VALID_FIELD_TYPES.join(", ")}` };
        }
        if (Array.isArray(field.options)) {
          for (const opt of field.options) {
            if (!opt.OptionLabel || opt.OptionValue === undefined) {
              return { status: "error", message: `Option in field "${field.FieldName}" missing OptionLabel or OptionValue.` };
            }
          }
        }
      }
    }
  }

  const data: TemplateExportData = {
    version: String(raw.version ?? "2.0"),
    exportedAt: String(raw.exportedAt ?? new Date().toISOString()),
    templates,
    projectDeviceTypes,
  };

  return { status: "ready", parsed: { data, summary: computeImportSummary(templates) } };
}
```

- [ ] **Step 4: Implement `applyTemplateImport`**

Replace the body of the old `importTemplate` transaction with this function (the old `importTemplate` becomes a thin wrapper in Step 6):

```ts
export async function applyTemplateImport(data: TemplateExportData): Promise<{ success: boolean; message: string }> {
  const db = await getDatabase();

  try {
    await db.withTransactionAsync(async () => {
      const templateIdByName = new Map<string, number>();

      for (const template of data.templates) {
        const existing = await db.getFirstAsync<{ TemplateID: number }>(
          `SELECT TemplateID FROM InspectionTemplates WHERE TemplateName = ?`,
          [template.TemplateName]
        );
        let templateId: number;
        if (existing) {
          templateId = existing.TemplateID;
          await db.runAsync(
            `UPDATE InspectionTemplates SET Description = ?, IsDefault = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE TemplateID = ?`,
            [template.Description ?? null, template.IsDefault, templateId]
          );
          await db.runAsync(`UPDATE InspectionSections SET IsActive = 0 WHERE TemplateID = ?`, [templateId]);
        } else {
          const result = await db.runAsync(
            `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault, IsActive)
             VALUES (?, ?, ?, 1)`,
            [template.TemplateName, template.Description ?? null, template.IsDefault]
          );
          templateId = result.lastInsertRowId;
        }
        templateIdByName.set(template.TemplateName, templateId);

        for (const section of template.sections) {
          const sectionResult = await db.runAsync(
            `INSERT INTO InspectionSections
             (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
            [
              templateId,
              section.SectionName,
              section.SectionKey,
              section.Description ?? null,
              section.Icon ?? null,
              section.DisplayOrder,
              section.IsRepeatable,
              section.IsVisible,
            ]
          );
          const sectionId = sectionResult.lastInsertRowId;

          for (const field of section.fields) {
            const fieldResult = await db.runAsync(
              `INSERT INTO InspectionFields
               (SectionID, FieldName, FieldKey, FieldType, Placeholder, DefaultValue,
                HelpText, ValidationRule, DisplayOrder, IsRequired, IsVisible, IsReadOnly,
                IsSystemField, Width, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                sectionId,
                field.FieldName,
                field.FieldKey,
                normalizeFieldType(field.FieldType),
                field.Placeholder ?? null,
                field.DefaultValue ?? null,
                field.HelpText ?? null,
                field.ValidationRule ?? null,
                field.DisplayOrder,
                field.IsRequired,
                field.IsVisible,
                field.IsReadOnly,
                field.IsSystemField ?? 0,
                field.Width ?? 12,
              ]
            );
            const fieldId = fieldResult.lastInsertRowId;

            for (const option of field.options) {
              await db.runAsync(
                `INSERT INTO FieldOptions (FieldID, OptionLabel, OptionValue, DisplayOrder, IsDefault, IsActive)
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [fieldId, option.OptionLabel, option.OptionValue, option.DisplayOrder, option.IsDefault ?? 0]
              );
            }
          }
        }

        for (const deviceType of template.deviceTypes) {
          const existingDef = await db.getFirstAsync<{ FieldDefID: number }>(
            `SELECT FieldDefID FROM DeviceFieldDefinitions
             WHERE TemplateID = ? AND DeviceType = ? AND FieldName = ?`,
            [templateId, deviceType.DeviceType, deviceType.FieldName]
          );
          if (existingDef) {
            await db.runAsync(
              `UPDATE DeviceFieldDefinitions SET Label = ?, FieldType = ?, IsRequired = ?, DisplayOrder = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldDefID = ?`,
              [deviceType.Label, deviceType.FieldType, deviceType.IsRequired, deviceType.DisplayOrder, existingDef.FieldDefID]
            );
          } else {
            await db.runAsync(
              `INSERT INTO DeviceFieldDefinitions (TemplateID, DeviceType, FieldName, Label, FieldType, IsRequired, DisplayOrder, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
              [templateId, deviceType.DeviceType, deviceType.FieldName, deviceType.Label, deviceType.FieldType, deviceType.IsRequired, deviceType.DisplayOrder]
            );
          }
        }

        for (const option of template.deviceOptions) {
          const existingOpt = await db.getFirstAsync<{ OptionID: number }>(
            `SELECT OptionID FROM DeviceOptions
             WHERE TemplateID = ? AND DeviceType = ? AND FieldName = ? AND OptionLabel = ?`,
            [templateId, option.DeviceType, option.FieldName, option.OptionLabel]
          );
          if (existingOpt) {
            await db.runAsync(
              `UPDATE DeviceOptions SET OptionValue = ?, DisplayOrder = ?, IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE OptionID = ?`,
              [option.OptionValue, option.DisplayOrder, existingOpt.OptionID]
            );
          } else {
            await db.runAsync(
              `INSERT INTO DeviceOptions (TemplateID, DeviceType, FieldName, OptionLabel, OptionValue, DisplayOrder, IsActive)
               VALUES (?, ?, ?, ?, ?, ?, 1)`,
              [templateId, option.DeviceType, option.FieldName, option.OptionLabel, option.OptionValue, option.DisplayOrder]
            );
          }
        }
      }

      await db.runAsync(`UPDATE DeviceFieldDefinitions SET IsActive = 0 WHERE TemplateID NOT IN (SELECT TemplateID FROM InspectionTemplates WHERE IsActive = 1)`);
      await db.runAsync(`UPDATE DeviceOptions SET IsActive = 0 WHERE TemplateID NOT IN (SELECT TemplateID FROM InspectionTemplates WHERE IsActive = 1)`);

      await db.runAsync(`UPDATE ProjectDeviceTypes SET IsActive = 0`);
      for (const deviceType of data.projectDeviceTypes) {
        const existing = await db.getFirstAsync<{ ID: number }>(
          `SELECT ID FROM ProjectDeviceTypes WHERE DeviceType = ?`,
          [deviceType]
        );
        if (existing) {
          await db.runAsync(`UPDATE ProjectDeviceTypes SET IsActive = 1 WHERE ID = ?`, [existing.ID]);
        } else {
          await db.runAsync(`INSERT INTO ProjectDeviceTypes (DeviceType, IsActive) VALUES (?, 1)`, [deviceType]);
        }
      }
    });

    const summary = computeImportSummary(data.templates);
    return {
      success: true,
      message: `Template imported with ${summary.templateCount} template(s), ${summary.sectionCount} section(s), ${summary.fieldCount} field(s).`,
    };
  } catch (error) {
    logger.error("Import error:", error);
    return { success: false, message: "Failed to import template. " + (error as Error).message };
  }
}
```

Note: the two bulk `UPDATE ... IsActive = 0` statements above deactivate device rows that belong to templates no longer active — this handles the replace-in-place for device data without relying on `ProjectID`.

- [ ] **Step 5: Redefine `importTemplate` as a wrapper**

```ts
export async function importTemplate(): Promise<{ success: boolean; message: string }> {
  const picked = await pickAndParseTemplate();
  if (picked.status === "canceled") return { success: false, message: "No file selected." };
  if (picked.status === "error") return { success: false, message: picked.message };
  return applyTemplateImport(picked.parsed.data);
}
```

- [ ] **Step 6: Run all templateData tests**

Run: `npx jest src/__tests__/utils/templateData.test.ts`
Expected: PASS — new parse/apply tests plus all existing `importTemplate` tests (the wrapper keeps their observable behavior identical).

- [ ] **Step 7: Commit**

```bash
git add src/utils/templateData.ts src/__tests__/utils/templateData.test.ts
git commit -m "feat(template): parse-then-apply import with replace-in-place"
```

---

### Task 4: `useTemplateFlow` hook

**Files:**
- Create: `frontend/src/components/template/useTemplateFlow.ts`
- Test: `frontend/src/__tests__/components/template/useTemplateFlow.test.tsx`

**Interfaces:**
- Consumes: `exportTemplates`, `shareTemplateFile`, `pickAndParseTemplate`, `applyTemplateImport`, `TemplateExportResult`, `ParsedTemplateFile` from `@/src/utils/templateData`.
- Produces:
  ```ts
  export type TemplateFlowState =
    | { phase: "idle" }
    | { phase: "exporting" }
    | { phase: "exported"; result: TemplateExportResult }
    | { phase: "parsing" }
    | { phase: "confirming"; parsed: ParsedTemplateFile }
    | { phase: "importing" }
    | { phase: "imported"; message: string }
    | { phase: "error"; message: string };

  export function useTemplateFlow(): {
    state: TemplateFlowState;
    busy: boolean;
    beginExport: () => Promise<void>;
    beginImport: () => Promise<void>;
    confirmImport: () => Promise<void>;
    cancelImport: () => void;
    dismissExport: () => void;
    dismissImport: () => void;
    dismissError: () => void;
    shareExported: () => Promise<void>;
    retry: () => void;
  };
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/components/template/useTemplateFlow.test.tsx` mirroring the structure of `useExportFlow.test.tsx` (react-test-renderer, `flowRef` set in `useEffect`, `renderHost` wrapped in `act`):

```tsx
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { useTemplateFlow } from "@/src/components/template/useTemplateFlow";

jest.mock("@/src/utils/templateData", () => ({
  exportTemplates: jest.fn(),
  shareTemplateFile: jest.fn().mockResolvedValue(true),
  pickAndParseTemplate: jest.fn(),
  applyTemplateImport: jest.fn(),
}));

jest.mock("@/src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const {
  exportTemplates,
  shareTemplateFile,
  pickAndParseTemplate,
  applyTemplateImport,
} = require("@/src/utils/templateData");

type Flow = ReturnType<typeof useTemplateFlow>;

const exportResult = {
  fileUri: "file:///mock/template.json",
  fileName: "template.json",
  summary: { templateCount: 1, sectionCount: 1, fieldCount: 1, deviceTypeCount: 0, deviceOptionCount: 0 },
};

const parsedFile = {
  data: { version: "2.0", exportedAt: "2024-01-01", templates: [], projectDeviceTypes: [] },
  summary: { templateCount: 1, sectionCount: 1, fieldCount: 1, deviceTypeCount: 0, deviceOptionCount: 0 },
};

function Host({ flowRef }: { flowRef: { current: Flow | null } }) {
  const flow = useTemplateFlow();
  useEffect(() => {
    flowRef.current = flow;
  }, [flow, flowRef]);
  return (
    <View>
      <Text testID="phase">{flow.state.phase}</Text>
      {flow.state.phase === "exported" && <Text testID="summary">{flow.state.result.summary.sectionCount}</Text>}
      {flow.state.phase === "confirming" && <Text testID="summary">{flow.state.parsed.summary.sectionCount}</Text>}
      {flow.state.phase === "imported" && <Text testID="message">{flow.state.message}</Text>}
      {flow.state.phase === "error" && <Text testID="message">{flow.state.message}</Text>}
    </View>
  );
}

function renderHost() {
  const flowRef: { current: Flow | null } = { current: null };
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Host flowRef={flowRef} />);
  });
  return { root: renderer!.root, flowRef };
}

function find(root: TestRenderer.ReactTestInstance, testID: string) {
  return root.find((n) => n.props.testID === testID).props.children as string;
}

describe("useTemplateFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (exportTemplates as jest.Mock).mockResolvedValue(exportResult);
    (pickAndParseTemplate as jest.Mock).mockResolvedValue({ status: "ready", parsed: parsedFile });
    (applyTemplateImport as jest.Mock).mockResolvedValue({ success: true, message: "Imported 1 template." });
  });

  it("exports to success and shares", async () => {
    const { root, flowRef } = renderHost();

    await act(async () => {
      await flowRef.current!.beginExport();
    });
    expect(find(root, "phase")).toBe("exported");
    expect(find(root, "summary")).toBe("1");
    expect(exportTemplates).toHaveBeenCalledTimes(1);

    await act(async () => {
      await flowRef.current!.shareExported();
    });
    expect(shareTemplateFile).toHaveBeenCalledWith(exportResult);
  });

  it("surfaces export error and retry recovers", async () => {
    (exportTemplates as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const { root, flowRef } = renderHost();

    await act(async () => {
      await flowRef.current!.beginExport();
    });
    expect(find(root, "phase")).toBe("error");
    expect(find(root, "message")).toContain("export");

    await act(async () => {
      await flowRef.current!.retry();
    });
    expect(find(root, "phase")).toBe("exported");
  });

  it("shows null export as an error", async () => {
    (exportTemplates as jest.Mock).mockResolvedValueOnce(null);
    const { root, flowRef } = renderHost();
    await act(async () => {
      await flowRef.current!.beginExport();
    });
    expect(find(root, "phase")).toBe("error");
  });

  it("imports via confirm after parsing", async () => {
    const { root, flowRef } = renderHost();

    await act(async () => {
      await flowRef.current!.beginImport();
    });
    expect(find(root, "phase")).toBe("confirming");
    expect(find(root, "summary")).toBe("1");

    await act(async () => {
      await flowRef.current!.confirmImport();
    });
    expect(find(root, "phase")).toBe("imported");
    expect(find(root, "message")).toBe("Imported 1 template.");
    expect(applyTemplateImport).toHaveBeenCalledWith(parsedFile.data);
  });

  it("returns to idle on cancel and canceled picker", async () => {
    const { root, flowRef } = renderHost();
    await act(async () => {
      await flowRef.current!.beginImport();
      flowRef.current!.cancelImport();
    });
    expect(find(root, "phase")).toBe("idle");

    (pickAndParseTemplate as jest.Mock).mockResolvedValueOnce({ status: "canceled" });
    await act(async () => {
      await flowRef.current!.beginImport();
    });
    expect(find(root, "phase")).toBe("idle");
  });

  it("handles import error", async () => {
    (applyTemplateImport as jest.Mock).mockResolvedValueOnce({ success: false, message: "Failed to import template. x" });
    const { root, flowRef } = renderHost();
    await act(async () => {
      await flowRef.current!.beginImport();
      await flowRef.current!.confirmImport();
    });
    expect(find(root, "phase")).toBe("error");
    expect(find(root, "message")).toContain("Failed to import");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/__tests__/components/template/useTemplateFlow.test.tsx`
Expected: FAIL — `useTemplateFlow` module not found.

- [ ] **Step 3: Implement the hook**

```ts
import { useCallback, useRef, useState } from "react";
import {
  applyTemplateImport,
  exportTemplates,
  ParsedTemplateFile,
  pickAndParseTemplate,
  shareTemplateFile,
  TemplateExportResult,
} from "@/src/utils/templateData";
import { logger } from "@/src/utils/logger";

export type TemplateFlowState =
  | { phase: "idle" }
  | { phase: "exporting" }
  | { phase: "exported"; result: TemplateExportResult }
  | { phase: "parsing" }
  | { phase: "confirming"; parsed: ParsedTemplateFile }
  | { phase: "importing" }
  | { phase: "imported"; message: string }
  | { phase: "error"; message: string };

export function useTemplateFlow() {
  const [state, setState] = useState<TemplateFlowState>({ phase: "idle" });
  const lastExport = useRef<{ phase: "exporting" } | { phase: "exported"; result: TemplateExportResult } | { phase: "error"; message: string }>({ phase: "exporting" });
  const pendingImport = useRef<ParsedTemplateFile | null>(null);

  const beginExport = useCallback(async () => {
    setState({ phase: "exporting" });
    try {
      const result = await exportTemplates();
      if (!result) {
        setState({ phase: "error", message: "No template found to export." });
        return;
      }
      setState({ phase: "exported", result });
    } catch (error) {
      logger.error("Export error:", error);
      setState({ phase: "error", message: "Unable to export template." });
    }
  }, []);

  const dismissExport = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const shareExported = useCallback(async () => {
    if (state.phase !== "exported") return;
    try {
      await shareTemplateFile(state.result);
    } catch (error) {
      logger.error("Share template error:", error);
    }
  }, [state]);

  const beginImport = useCallback(async () => {
    setState({ phase: "parsing" });
    try {
      const picked = await pickAndParseTemplate();
      if (picked.status === "canceled") {
        setState({ phase: "idle" });
        return;
      }
      if (picked.status === "error") {
        setState({ phase: "error", message: picked.message });
        return;
      }
      pendingImport.current = picked.parsed;
      setState({ phase: "confirming", parsed: picked.parsed });
    } catch (error) {
      logger.error("Import error:", error);
      setState({ phase: "error", message: "Unable to read the template file." });
    }
  }, []);

  const confirmImport = useCallback(async () => {
    const parsed = pendingImport.current;
    if (!parsed) return;
    setState({ phase: "importing" });
    try {
      const result = await applyTemplateImport(parsed.data);
      if (result.success) {
        setState({ phase: "imported", message: result.message });
      } else {
        setState({ phase: "error", message: result.message });
      }
    } catch (error) {
      logger.error("Import error:", error);
      setState({ phase: "error", message: "Failed to import template." });
    }
  }, []);

  const cancelImport = useCallback(() => {
    pendingImport.current = null;
    setState({ phase: "idle" });
  }, []);

  const dismissImport = useCallback(() => {
    pendingImport.current = null;
    setState({ phase: "idle" });
  }, []);

  const dismissError = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const retry = useCallback(() => {
    if (state.phase === "error") {
      if (lastExport.current) {
        void beginExport();
      } else if (pendingImport.current) {
        void confirmImport();
      } else {
        void beginImport();
      }
    }
  }, [state, beginExport, confirmImport, beginImport]);

  const busy = state.phase === "exporting" || state.phase === "parsing" || state.phase === "importing";

  return {
    state,
    busy,
    beginExport,
    beginImport,
    confirmImport,
    cancelImport,
    dismissExport,
    dismissImport,
    dismissError,
    shareExported,
    retry,
  };
}
```

Note: `lastExport` is tracked by `retry` only — simplify by removing `lastExport` and relying on `pendingImport`. Update `retry`:

```ts
const retry = useCallback(() => {
  if (state.phase === "error") {
    if (pendingImport.current) {
      void confirmImport();
    } else {
      void beginExport();
    }
  }
}, [state, beginExport, confirmImport]);
```

And remove the unused `lastExport` ref.

- [ ] **Step 4: Run tests**

Run: `npx jest src/__tests__/components/template/useTemplateFlow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (fix any type issues in the hook, e.g. `picked.parsed` narrowing on the union).

- [ ] **Step 6: Commit**

```bash
git add src/components/template/useTemplateFlow.ts src/__tests__/components/template/useTemplateFlow.test.tsx
git commit -m "feat(template): add useTemplateFlow state machine hook"
```

---

### Task 5: `TemplateExportDialogs` + `TemplateImportDialogs` components

**Files:**
- Create: `frontend/app/settings/components/TemplateExportDialogs.tsx`
- Create: `frontend/app/settings/components/TemplateImportDialogs.tsx`

**Interfaces:**
- Consumes: `TemplateFlowState` from `useTemplateFlow`; the callback props listed below.
- Produces: Two presentational components (no logic, no DB access).

- [ ] **Step 1: Write the components** (presentational — these are covered indirectly by the screen wiring + hook tests; no standalone render test required, matching the `ExportDialogs.tsx` precedent which has no dedicated test).

`TemplateExportDialogs.tsx`:

```tsx
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { TemplateExportResult } from "@/src/utils/templateData";

interface TemplateExportDialogsProps {
  exporting: boolean;
  result: TemplateExportResult | null;
  errorMessage: string | null;
  onShare: () => void;
  onCloseSuccess: () => void;
  onRetry: () => void;
  onCloseError: () => void;
}

export default function TemplateExportDialogs({
  exporting,
  result,
  errorMessage,
  onShare,
  onCloseSuccess,
  onRetry,
  onCloseError,
}: TemplateExportDialogsProps) {
  return (
    <Portal>
      <Dialog visible={exporting} dismissable={false}>
        <Dialog.Title>Exporting Template</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              Building template file...
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={result !== null} onDismiss={onCloseSuccess}>
        <Dialog.Title>Template Exported</Dialog.Title>
        <Dialog.Content>
          {result && (
            <>
              <Text variant="bodyMedium">File: {result.fileName}</Text>
              <Text variant="bodyMedium">
                {result.summary.templateCount} template(s), {result.summary.sectionCount} section(s),
                {"\n"}{result.summary.fieldCount} field(s), {result.summary.deviceTypeCount} device type(s)
              </Text>
            </>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button icon="share-variant" mode="contained" onPress={onShare}>Share File</Button>
          <Button onPress={onCloseSuccess}>Close</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={errorMessage !== null} onDismiss={onCloseError}>
        <Dialog.Title>Export Failed</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{errorMessage}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseError}>Close</Button>
          <Button mode="contained" onPress={onRetry}>Retry</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", alignItems: "center" },
  progressText: { marginLeft: 16, flex: 1 },
});
```

`TemplateImportDialogs.tsx`:

```tsx
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { ParsedTemplateFile } from "@/src/utils/templateData";

interface TemplateImportDialogsProps {
  parsing: boolean;
  confirming: ParsedTemplateFile | null;
  importing: boolean;
  importedMessage: string | null;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onCloseSuccess: () => void;
  onRetry: () => void;
  onCloseError: () => void;
}

export default function TemplateImportDialogs({
  parsing,
  confirming,
  importing,
  importedMessage,
  errorMessage,
  onConfirm,
  onCancel,
  onCloseSuccess,
  onRetry,
  onCloseError,
}: TemplateImportDialogsProps) {
  return (
    <Portal>
      <Dialog visible={parsing} dismissable={false}>
        <Dialog.Title>Importing Template</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              Reading template file...
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={confirming !== null} onDismiss={onCancel}>
        <Dialog.Title>Import Template?</Dialog.Title>
        <Dialog.Content>
          {confirming && (
            <>
              <Text variant="bodyMedium">
                Import template "{confirming.parsed.data.templates[0]?.TemplateName ?? "Untitled"}"?
              </Text>
              <Text variant="bodyMedium" style={styles.body}>
                This will replace the current form:
                {"\n"}{confirming.parsed.summary.templateCount} template(s),
                {"\n"}{confirming.parsed.summary.sectionCount} section(s),
                {"\n"}{confirming.parsed.summary.fieldCount} field(s),
                {"\n"}{confirming.parsed.summary.deviceTypeCount} device type(s).
              </Text>
              <Text variant="bodySmall" style={styles.warn}>
                Existing inspection data will NOT be deleted.
              </Text>
            </>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button mode="contained" onPress={onConfirm}>Import</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={importing} dismissable={false}>
        <Dialog.Title>Applying Template</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              Applying template...
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={importedMessage !== null} onDismiss={onCloseSuccess}>
        <Dialog.Title>Template Imported</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{importedMessage}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseSuccess}>Close</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={errorMessage !== null} onDismiss={onCloseError}>
        <Dialog.Title>Import Failed</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{errorMessage}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseError}>Close</Button>
          <Button mode="contained" onPress={onRetry}>Retry</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", alignItems: "center" },
  progressText: { marginLeft: 16, flex: 1 },
  body: { marginTop: 8 },
  warn: { marginTop: 8, color: "#D32F2F" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/settings/components/TemplateExportDialogs.tsx app/settings/components/TemplateImportDialogs.tsx
git commit -m "feat(template): add export and import modal dialog components"
```

---

### Task 6: Wire the settings screen

**Files:**
- Modify: `frontend/app/settings/index.tsx`

**Interfaces:**
- Consumes: `useTemplateFlow` (Task 4), `TemplateExportDialogs` + `TemplateImportDialogs` (Task 5).
- Produces: the two list items trigger the export/import modal flows.

- [ ] **Step 1: Rewrite the handlers**

Replace the `handleExportTemplate` / `handleImportTemplate` functions and the `loading` state with the flow hook. Remove now-unused imports (`exportDefaultTemplate`, `importTemplate`, `ActivityIndicator` if unused).

```tsx
import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator } from "react-native-paper";
import { useRouter } from "expo-router";
import { useTemplateFlow } from "@/src/components/template/useTemplateFlow";
import TemplateExportDialogs from "./components/TemplateExportDialogs";
import TemplateImportDialogs from "./components/TemplateImportDialogs";

export default function SettingsScreen() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const flow = useTemplateFlow();

  const handleResetToDefault = () => { /* unchanged */ };

  const performReset = async () => { /* unchanged */ };

  const exporting = flow.state.phase === "exporting";
  const parsing = flow.state.phase === "parsing";
  const importing = flow.state.phase === "importing";
  const busy = flow.busy;

  const exportResult = flow.state.phase === "exported" ? flow.state.result : null;
  const confirming = flow.state.phase === "confirming" ? flow.state.parsed : null;
  const importedMessage = flow.state.phase === "imported" ? flow.state.message : null;
  const errorMessage = flow.state.phase === "error" ? flow.state.message : null;
```

Keep the `loading`/`resetting` list-item `right` renderer logic, but drive it from `flow.busy` for the two template items.

- [ ] **Step 2: Render the dialog components**

At the bottom of the `SafeAreaView` (before its closing tag), add:

```tsx
<TemplateExportDialogs
  exporting={exporting}
  result={exportResult}
  errorMessage={flow.state.phase === "error" ? flow.state.message : null}
  onShare={() => { void flow.shareExported(); }}
  onCloseSuccess={flow.dismissExport}
  onRetry={() => { void flow.retry(); }}
  onCloseError={flow.dismissError}
/>
<TemplateImportDialogs
  parsing={parsing}
  confirming={confirming}
  importing={importing}
  importedMessage={importedMessage}
  errorMessage={flow.state.phase === "error" ? flow.state.message : null}
  onConfirm={() => { void flow.confirmImport(); }}
  onCancel={flow.cancelImport}
  onCloseSuccess={flow.dismissImport}
  onRetry={() => { void flow.retry(); }}
  onCloseError={flow.dismissError}
/>
```

And wire the two `List.Item` `onPress`:

```tsx
<List.Item
  title="Export Template"
  description="Export inspection template with sections, fields and options as JSON file"
  left={(props) => <List.Icon {...props} icon="file-export" />}
  right={(props) => (flow.busy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
  onPress={() => { void flow.beginExport(); }}
  disabled={flow.busy}
/>

<List.Item
  title="Import Template"
  description="Import inspection template from a JSON file"
  left={(props) => <List.Icon {...props} icon="file-import" />}
  right={(props) => (flow.busy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
  onPress={() => { void flow.beginImport(); }}
  disabled={flow.busy}
/>
```

Note: both the export and import error dialogs are separate `Portal` instances — when the import flow errors, `exportResult`/`importedMessage` are null so only the correct dialog shows. Keep `errorMessage` as the same `flow.state.message` for both — only one flow is active at a time.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run full test suite + lint**

Run: `npx jest 2>&1 | Select-Object -Last 8`
Expected: all suites pass.
Run: `npx expo lint` (via corepack if needed)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/settings/index.tsx
git commit -m "feat(template): wire export/import modal flows into settings screen"
```

---

### Task 7: Isolation regression test

**Files:**
- Create: `frontend/src/__tests__/database/templateIsolation.test.ts`

**Interfaces:**
- Consumes: `setActiveProject` / `getDatabase` from `@/src/database/db`, `applyTemplateImport` from `@/src/utils/templateData`.
- Produces: proof that importing a template into Project B does not leak into Project A.

- [ ] **Step 1: Write the failing test**

Mirror `isolation.test.ts` (mocks `expo-sqlite` and `expo-file-system/legacy`), but drive it through `applyTemplateImport`:

```ts
jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: false, size: 100 }),
}));

import type { SQLiteDatabase } from "expo-sqlite";

const PROJECT_A = "/mock/documents/Projects/ProjectAlpha/inspection.db";
const PROJECT_B = "/mock/documents/Projects/ProjectBeta/inspection.db";

describe("Template import isolation", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function seedProject(dbPath: string, templateName: string, sectionKey: string) {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");
    await dbModule.setActiveProject(dbPath);
    const db: SQLiteDatabase = await dbModule.getDatabase();
    await db.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault, IsActive) VALUES (?, ?, 1, 1)`,
      [templateName, "desc"]
    );
    const template = await db.getFirstAsync<{ TemplateID: number }>(
      "SELECT TemplateID FROM InspectionTemplates LIMIT 1"
    );
    await db.runAsync(
      `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, Icon, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
       VALUES (?, ?, ?, NULL, NULL, 1, 0, 1, 1, 1)`,
      [template!.TemplateID, sectionKey, sectionKey]
    );
    return { db };
  }

  it("does not leak an imported custom form from Project B back into Project A", async () => {
    const dbModule = require("@/src/database/db") as typeof import("@/src/database/db");

    await seedProject(PROJECT_A, "Project A Template", "section_a");

    await dbModule.setActiveProject(PROJECT_B);
    const dbB: SQLiteDatabase = await dbModule.getDatabase();
    await dbB.runAsync(
      `INSERT INTO InspectionTemplates (TemplateName, Description, IsDefault, IsActive) VALUES (?, ?, 1, 1)`,
      ["Project B Template", "desc"]
    );

    const { applyTemplateImport } = require("@/src/utils/templateData") as typeof import("@/src/utils/templateData");
    const importedForm = {
      version: "2.0",
      exportedAt: "2024-01-01T00:00:00.000Z",
      templates: [
        {
          TemplateName: "Shared Custom Form",
          Description: null,
          IsDefault: 1,
          sections: [
            {
              SectionName: "Shared Section",
              SectionKey: "shared_section",
              Description: null,
              Icon: null,
              DisplayOrder: 1,
              IsRepeatable: 0,
              IsVisible: 1,
              fields: [],
            },
          ],
          deviceTypes: [{ DeviceType: "UPS", FieldName: "UPSMake", Label: "UPS Make", FieldType: "dropdown", IsRequired: 0, DisplayOrder: 1 }],
          deviceOptions: [],
        },
      ],
      projectDeviceTypes: ["Camera", "UPS"],
    };

    const result = await applyTemplateImport(importedForm);
    expect(result.success).toBe(true);

    const sectionsInB = await dbB.getAllAsync<{ SectionKey: string }>("SELECT SectionKey FROM InspectionSections");
    expect(sectionsInB.some((s) => s.SectionKey === "shared_section")).toBe(true);

    await dbModule.setActiveProject(PROJECT_A);
    const dbA: SQLiteDatabase = await dbModule.getDatabase();
    const sectionsInA = await dbA.getAllAsync<{ SectionKey: string }>("SELECT SectionKey FROM InspectionSections");
    expect(sectionsInA.some((s) => s.SectionKey === "shared_section")).toBe(false);
    expect(sectionsInA.some((s) => s.SectionKey === "section_a")).toBe(true);

    const devicesInA = await dbA.getAllAsync<{ DeviceType: string }>("SELECT DeviceType FROM DeviceFieldDefinitions");
    expect(devicesInA.some((d) => d.DeviceType === "UPS")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/__tests__/database/templateIsolation.test.ts`
Expected: The `applyTemplateImport` behavior must be verified — if the project DB path isolation is broken (single mock handle), the "does not leak" assertions fail. Confirm the in-memory mock in `__mocks__/expo-sqlite.ts` is path-aware (it should be, per AGENTS.md). If any test fails because the mock is not path-aware, fix the mock first (see Step 4 note).

- [ ] **Step 3: Make it pass**

No production code change should be required if the DB mock is path-aware. If the failure is due to a shared mock handle, update `__mocks__/expo-sqlite.ts` so `openDatabaseAsync` returns a distinct in-memory store keyed by the DB path (this must be path-aware per AGENTS.md — verify it already is; if so, the test passes as-is).

- [ ] **Step 4: Verify the mock is path-aware**

Run: `npx jest src/__tests__/database/isolation.test.ts`
Expected: PASS (existing isolation tests confirm the mock is path-aware). Then re-run the new test.

Run: `npx jest src/__tests__/database/templateIsolation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/database/templateIsolation.test.ts
git commit -m "test(template): add import isolation regression test"
```

---

### Task 8: Final verification + changelog

**Files:**
- Modify: `frontend/docs/07-Changelog.md`
- Modify: `frontend/docs/09-Decisions.md` (append a decision entry for template transfer v2.0)

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Run the full suite**

Run: `npx jest 2>&1 | Select-Object -Last 8`
Expected: all suites pass (should be ≥ 21 suites, ≥ 210 tests).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx expo lint` (via corepack if `yarnpkg` not on PATH: `corepack yarn expo lint`)
Expected: no errors.

- [ ] **Step 3: Update the changelog**

Append a v0.x entry to `frontend/docs/07-Changelog.md`:

```md
## [Unreleased]
### Added
- Template Export/Import (v2.0): export all templates, sections, fields, options, custom device types, device options, and project device type mappings to a JSON file; import replaces the current form in-place (deactivate + add) while preserving existing inspection data.
- Full modal UI for export (progress, success, share) and import (picker, parse, confirmation, progress, success, error with retry).
- Isolation regression test for template import across projects.
```

- [ ] **Step 4: Append a decision to `09-Decisions.md`**

Add an ADR entry: Template transfer uses a v2.0 JSON format with an array of templates plus device data; import is replace-in-place (deactivate + add) to preserve existing inspection records; `ProjectDeviceTypes` is handled without a `ProjectID` column because the inline schema in `schema.ts` defines it without one.

- [ ] **Step 5: Commit**

```bash
git add docs/07-Changelog.md docs/09-Decisions.md
git commit -m "docs: document template import/export feature and decision"
```

---

## Self-Review Notes

- **Spec coverage:** Every spec requirement maps to a task — full export (T1), share (T2), parse+apply replace-in-place (T3), modal UI (T4/T5), settings wiring (T6), isolation regression (T7), docs (T8).
- **Backward compat:** v1.0 files normalized in `pickAndParseTemplate` (T3); `exportDefaultTemplate`/`importTemplate` retained as wrappers so existing tests keep passing.
- **Schema quirk:** `ProjectDeviceTypes` has no `ProjectID` in the inline schema — all SQL avoids it (`SELECT ... WHERE IsActive = 1`, upsert by `DeviceType`).
- **Type consistency:** `TemplateExportResult`, `ParsedTemplateFile`, `TemplateFlowState`, and the dialog prop shapes are defined once (T1/T3) and reused verbatim in T4/T5/T6.
