import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { SQLiteDatabase } from "expo-sqlite";

jest.mock("expo-sqlite");
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  cacheDirectory: "file:///mock/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
}));

jest.mock("react-native-paper", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    TextInput: (props: any) => R.createElement(RN.TextInput, props),
    HelperText: (props: any) => R.createElement(RN.Text, null, props.children),
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const R = require("react");
    return R.createElement("Dropdown", props);
  },
}));

jest.mock("@/src/context/InspectionContext", () => ({
  useInspection: () => ({ poleId: "P123" }),
}));

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: { current: { scrollTo: jest.fn() } },
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/components/inspection/DeviceSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("DeviceSection") };
});

jest.mock("@/src/components/inspection/PhotoSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("PhotoSection") };
});

jest.mock("@/src/database/repositories/ProjectDeviceTypesRepository", () => ({
  __esModule: true,
  default: { getRequired: jest.fn().mockResolvedValue([]) },
}));

jest.mock("@/src/components/inspection/FieldRenderer", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => R.createElement(RN.TextInput, { testID: `field-${props.fieldKey}`, value: props.value }),
  };
});

jest.mock("@/src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import SectionRenderer from "@/src/components/inspection/SectionRenderer";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";
import { FieldRepository } from "@/src/database/repositories/FieldRepository";
import { FieldOptionRepository } from "@/src/database/repositories/FieldOptionRepository";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { setActiveProject, getDatabase } from "@/src/database/db";
import { createProjectSchema } from "@/src/database/schema";

let pathCounter = 0;
function uniquePath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/ExistingSavedOnly${pathCounter}/inspection.db`;
}

async function openSeededProject(): Promise<{ db: SQLiteDatabase }> {
  await setActiveProject(uniquePath());
  await createProjectSchema();
  const templateSeed = require("@/src/database/seeds/inspection-template.seed");
  await templateSeed.seedInspectionTemplate();
  const sectionsSeed = require("@/src/database/seeds/inspection-sections.seed");
  await sectionsSeed.seedInspectionSections();
  const fieldsSeed = require("@/src/database/seeds/inspection-fields.seed");
  await fieldsSeed.seedInspectionFields();
  const optionsSeed = require("@/src/database/seeds/field-options.seed");
  await optionsSeed.seedFieldOptions();
  const deviceOptionsSeed = require("@/src/database/seeds/device-options.seed");
  await deviceOptionsSeed.seedDeviceOptions();
  const deviceDefsSeed = require("@/src/database/seeds/device-field-definitions.seed");
  await deviceDefsSeed.seedDeviceFieldDefinitions();
  const db: SQLiteDatabase = await getDatabase();
  return { db };
}

async function createCustomSection(
  db: SQLiteDatabase,
  name: string,
  key: string,
  order: number
): Promise<number> {
  const tpl = await db.getFirstAsync<{ TemplateID: number }>(
    "SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1"
  );
  const inserted = await db.runAsync(
    `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, DisplayOrder, IsDefault, IsActive, IsVisible)
     VALUES (?, ?, ?, ?, 0, 1, 1)`,
    [tpl!.TemplateID, name, key, order]
  );
  return inserted.lastInsertRowId as number;
}

async function createStatusField(sectionId: number): Promise<number> {
  return FieldRepository.create({
    SectionID: sectionId,
    FieldName: "Status",
    FieldKey: "status",
    FieldType: "dropdown",
  });
}

async function addDropdownOptions(
  fieldId: number,
  defaultIs: string
): Promise<void> {
  await FieldOptionRepository.create({
    FieldID: fieldId,
    OptionLabel: "Yes",
    OptionValue: "Yes",
    IsDefault: defaultIs === "Yes" ? 1 : 0,
  });
  await FieldOptionRepository.create({
    FieldID: fieldId,
    OptionLabel: "No",
    OptionValue: "No",
    IsDefault: defaultIs === "No" ? 1 : 0,
  });
}

async function createInspection(date: string): Promise<number> {
  return InspectionRepository.createInspection(1, 1, date);
}

function findFieldValue(tree: any, fieldKey: string): string {
  return tree.root.findByProps({ testID: `field-${fieldKey}` }).props.value;
}

describe("Existing inspection — current defaults are ignored (saved-only display, explicit-Save persistence)", () => {
  beforeEach(() => {
    InspectionEditSession.discard();
  });

  afterEach(() => {
    InspectionEditSession.discard();
  });

  it("NULL value + default Yes: open shows EMPTY with DB NULL and nothing staged; explicit selection + Save persists Yes; reopen shows Yes", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "RF", "rf", 4);
    const statusFieldId = await createStatusField(sectionId);
    await addDropdownOptions(statusFieldId, "Yes");
    const inspectionId = await createInspection("2026-09-01");

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={inspectionId} sectionId={sectionId} sectionKey="rf" existing />
      );
    });

    expect(findFieldValue(tree!, "status")).toBe("");
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);
    expect(await InspectionValueRepository.getValue(inspectionId, statusFieldId)).toBeNull();

    // Explicit user selection stages and an explicit Save commits it
    InspectionEditSession.activate(inspectionId);
    InspectionEditSession.stageFieldValue(statusFieldId, "Yes");
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const saved = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(saved).not.toBeNull();
    expect(saved!.FieldValue).toBe("Yes");

    await InspectionEditSession.discard();
    let reopened: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      reopened = TestRenderer.create(
        <SectionRenderer inspectionId={inspectionId} sectionId={sectionId} sectionKey="rf" existing />
      );
    });

    expect(findFieldValue(reopened!, "status")).toBe("Yes");
    const persisted = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(persisted!.FieldValue).toBe("Yes");
  });

  it("saved value always wins over the current default; opening never stages or overwrites it", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "RF", "rf", 4);
    const statusFieldId = await createStatusField(sectionId);
    await addDropdownOptions(statusFieldId, "Yes");
    const inspectionId = await createInspection("2026-09-01");
    await InspectionValueRepository.saveValue(inspectionId, statusFieldId, "No");

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={inspectionId} sectionId={sectionId} sectionKey="rf" existing />
      );
    });

    expect(findFieldValue(tree!, "status")).toBe("No");
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);

    InspectionEditSession.activate(inspectionId);
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const saved = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(saved).not.toBeNull();
    expect(saved!.FieldValue).toBe("No");
  });

  it("Cancel/Back discards an explicit selection: DB stays NULL and reopen stays EMPTY", async () => {
    const { db } = await openSeededProject();
    const sectionId = await createCustomSection(db, "RF", "rf", 4);
    const statusFieldId = await createStatusField(sectionId);
    await addDropdownOptions(statusFieldId, "Yes");
    const inspectionId = await createInspection("2026-09-01");

    await act(async () => {
      TestRenderer.create(
        <SectionRenderer inspectionId={inspectionId} sectionId={sectionId} sectionKey="rf" existing />
      );
    });

    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);
    expect(await InspectionValueRepository.getValue(inspectionId, statusFieldId)).toBeNull();

    InspectionEditSession.activate(inspectionId);
    InspectionEditSession.stageFieldValue(statusFieldId, "Yes");
    await InspectionEditSession.discard();

    const after = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(after).toBeNull();
  });

  it("field with default added after the inspection exists: old inspection opens EMPTY/DB NULL with nothing staged; explicit selection persists", async () => {
    const { db } = await openSeededProject();
    const inspectionId = await createInspection("2026-08-20");
    const sectionId = await createCustomSection(db, "RF", "rf", 4);
    const statusFieldId = await createStatusField(sectionId);
    await addDropdownOptions(statusFieldId, "Yes");

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <SectionRenderer inspectionId={inspectionId} sectionId={sectionId} sectionKey="rf" existing />
      );
    });

    expect(findFieldValue(tree!, "status")).toBe("");
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);
    expect(await InspectionValueRepository.getValue(inspectionId, statusFieldId)).toBeNull();

    InspectionEditSession.activate(inspectionId);
    InspectionEditSession.stageFieldValue(statusFieldId, "Yes");
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const saved = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(saved).not.toBeNull();
    expect(saved!.FieldValue).toBe("Yes");
  });
});