import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ScrollView } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Project } from "@/src/models/Project";

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

jest.mock("react-native-safe-area-context", () => {
  const R = require("react");
  const RN = require("react-native");
  const View = (props: any) => R.createElement(RN.View, props);
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: any) => R.createElement(RN.View, null, children),
    useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
  };
});

jest.mock("react-native-paper", () => {
  const R = require("react");
  const RN = require("react-native");
  const El = (name: string) =>
    ({ children, ...props }: any) =>
      R.createElement(RN.Text, { ...props, key: undefined }, children);
  const Button = ({ children, icon, onPress, mode, disabled, ...props }: any) =>
    R.createElement(RN.Text, {
      ...props,
      testID: `paper-button-${icon ?? "unknown"}`,
      onPress,
      children,
    });
  const Card = ({ children, ...props }: any) =>
    R.createElement(RN.Text, { ...props }, children);
  Card.Content = El("CardContent");
  const Dialog = ({ children, ...props }: any) =>
    R.createElement(RN.Text, { ...props }, children);
  Dialog.Title = El("DialogTitle");
  Dialog.Content = El("DialogContent");
  Dialog.Actions = El("DialogActions");
  return {
    Text: El("Text"),
    HelperText: El("HelperText"),
    Button,
    ActivityIndicator: (props: any) => null,
    Card,
    List: { Accordion: El("Accordion"), Icon: El("ListIcon") },
    Appbar: {
      Header: El("AppbarHeader"),
      Content: El("AppbarContent"),
      BackAction: (props: any) =>
        R.createElement(RN.Text, { testID: "back-action", onPress: props.onPress }),
    },
    IconButton: (props: any) =>
      R.createElement(RN.Text, { testID: `icon-${props.icon ?? "unknown"}`, onPress: props.onPress }),
    Checkbox: Object.assign(El("Checkbox"), { Item: El("CheckboxItem") }),
    RadioButton: Object.assign(El("RadioButton"), {
      Group: El("RadioGroup"),
      Item: El("RadioItem"),
    }),
    Portal: El("Portal"),
    Dialog,
    Surface: El("Surface"),
    Switch: El("Switch"),
    Snackbar: El("Snackbar"),
    ProgressBar: (props: any) => null,
    TextInput: (props: any) => R.createElement(RN.TextInput, props),
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, { ...props, children: String(props.value ?? "") });
  },
}));

const mockParamsState: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => {
  const ReactNs = require("react");
  return {
    useLocalSearchParams: () => mockParamsState.current,
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (cb: any) => ReactNs.useEffect(cb, []),
  };
});

const mockCtxStore: {
  project: Project | null;
  inspectionDate: string;
  inspectionId: number | null;
  poleId: string;
} = { project: null, inspectionDate: "", inspectionId: null, poleId: "" };
const mockCtxVersion = { v: 0 };
const mockCtxListeners = new Set<() => void>();
function mockCtxNotify() {
  mockCtxVersion.v++;
  for (const l of mockCtxListeners) l();
}
const mockCtxSet = {
  setProject: (p: Project | null) => {
    mockCtxStore.project = p;
    mockCtxNotify();
  },
  setInspectionDate: (d: string) => {
    mockCtxStore.inspectionDate = d;
    mockCtxNotify();
  },
  setInspectionId: (id: number | null) => {
    mockCtxStore.inspectionId = id;
    mockCtxNotify();
  },
  setPoleId: (p: string) => {
    mockCtxStore.poleId = p;
    mockCtxNotify();
  },
  getPhotoStates: () => ({}),
};
jest.mock("@/src/context/InspectionContext", () => {
  const ReactNs = require("react");
  const useInspection = () => {
    ReactNs.useSyncExternalStore(
      (cb: () => void) => {
        mockCtxListeners.add(cb);
        return () => {
          mockCtxListeners.delete(cb);
        };
      },
      () => mockCtxVersion.v
    );
    return {
      project: mockCtxStore.project,
      setProject: mockCtxSet.setProject,
      openProject: jest.fn(),
      closeProject: jest.fn(),
      removeProject: jest.fn(),
      inspectionDate: mockCtxStore.inspectionDate,
      setInspectionDate: mockCtxSet.setInspectionDate,
      inspectionId: mockCtxStore.inspectionId,
      setInspectionId: mockCtxSet.setInspectionId,
      poleId: mockCtxStore.poleId,
      setPoleId: mockCtxSet.setPoleId,
      getPhotoStates: mockCtxSet.getPhotoStates,
    };
  };
  return { useInspection, InspectionProvider: ({ children }: any) => children };
});

jest.mock("@/src/context/InspectionScrollContext", () => ({
  InspectionScrollProvider: ({ children }: any) => children,
  useInspectionScroll: () => ({
    scrollViewRef: { current: null },
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
  }),
}));

jest.mock("@/src/context/PhotoStatesContext", () => ({
  usePhotosProcessing: () => false,
  usePhotoStates: () => ({ photoStates: {}, setPhotoStates: jest.fn(), getPhotoStates: () => ({}) }),
}));

jest.mock("@/src/hooks/useProjectActivation", () => ({
  useProjectActivation: () => ({ ready: true, error: null }),
}));

jest.mock("@/src/utils/location", () => ({
  getCurrentLocation: jest.fn().mockRejectedValue(new Error("no location")),
}));
jest.mock("@/src/utils/geo", () => ({
  reverseGeocode: jest.fn().mockRejectedValue(new Error("no geo")),
}));

jest.mock("@/src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock("@/src/components/inspection/DeviceSection", () => {
  const R = require("react");
  let lastExisting: boolean | undefined;
  let lastInspectionId: number | undefined;
  const Mock = (props: any) => {
    lastExisting = props.existing;
    lastInspectionId = props.inspectionId;
    return R.createElement("DeviceSection", props);
  };
  (Mock as any).__lastProps = () => ({ existing: lastExisting, inspectionId: lastInspectionId });
  return { __esModule: true, default: Mock };
});
const mockDeviceSection = require("@/src/components/inspection/DeviceSection").default;

jest.mock("@/src/components/inspection/PhotoSection", () => {
  const R = require("react");
  return { __esModule: true, default: () => R.createElement("PhotoSection") };
});

jest.mock("@/src/components/inspection/FieldRenderer", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      R.createElement(RN.TextInput, { testID: `field-${props.fieldKey}`, value: props.value }),
  };
});

import NewInspectionScreen from "@/app/inspection/new";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
import { FieldRepository } from "@/src/database/repositories/FieldRepository";
import { FieldOptionRepository } from "@/src/database/repositories/FieldOptionRepository";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { setActiveProject, getDatabase } from "@/src/database/db";
import { createProjectSchema } from "@/src/database/schema";

let pathCounter = 0;
function uniquePath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/DefaultLifecycle${pathCounter}/inspection.db`;
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
  await db.runAsync(
    `UPDATE DeviceFieldDefinitions SET TemplateID = 1, IsActive = 1, IsVisible = 1 WHERE TemplateID IS NULL`
  );
  return { db };
}

async function findSectionId(key: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ SectionID: number }>(
    `SELECT SectionID FROM InspectionSections WHERE SectionKey = ? LIMIT 1`,
    [key]
  );
  return row!.SectionID;
}

async function findFieldKeyId(key: string): Promise<number> {
  const fields = await InspectionFieldRepository.getDefaultTemplateFields();
  const field = fields.find((f) => f.FieldKey === key);
  expect(field).toBeDefined();
  return field!.FieldID;
}

async function seedDeviceCount(
  inspectionId: number,
  type: string,
  count: string
): Promise<void> {
  const fieldId = await findFieldKeyId(`${type}_count`);
  await InspectionValueRepository.saveValue(inspectionId, fieldId, count);
}

async function addTestStatusDropdown(): Promise<number> {
  const sectionId = await findSectionId("pole_structure");
  const fieldId = await FieldRepository.create({
    SectionID: sectionId,
    FieldName: "Test Status",
    FieldKey: "_test_status",
    FieldType: "dropdown",
  });
  await FieldOptionRepository.create({
    FieldID: fieldId,
    OptionLabel: "Yes",
    OptionValue: "Yes",
    IsDefault: 1,
  });
  await FieldOptionRepository.create({
    FieldID: fieldId,
    OptionLabel: "No",
    OptionValue: "No",
    IsDefault: 0,
  });
  return fieldId;
}

async function createInspection(date: string): Promise<number> {
  return InspectionRepository.createInspection(1, 1, date);
}

function testProject(): Project {
  return {
    ProjectID: 1,
    ProjectName: "Test Project",
    DistrictID: 1,
    DistrictName: "D1",
    DivisionName: "Div1",
    Block: "B1",
    DBPath: "/mock/documents/Projects/DefaultLifecycle/inspection.db",
    CreatedAt: "2026-01-01",
    UpdatedAt: "2026-01-01",
  };
}

function findFieldValue(tree: any, fieldKey: string): string {
  return tree.root.findByProps({ testID: `field-${fieldKey}` }).props.value;
}

function collectText(node: any, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) collectText(child, out);
    }
  }
  return out;
}

const screenText = (tree: ReturnType<typeof TestRenderer.create>): string =>
  collectText(tree.toJSON()).join("");

async function settle() {
  await act(async () => {});
  await act(async () => {});
}

describe("NewInspectionScreen — real lifecycle: existing inspections show saved-only values (defaults ignored) & explicit-Save persistence", () => {
  beforeEach(() => {
    InspectionEditSession.discard();
    mockCtxStore.project = null;
    mockCtxStore.inspectionDate = "";
    mockCtxStore.inspectionId = null;
    mockCtxStore.poleId = "";
    mockCtxNotify();
    mockParamsState.current = {};
  });

  afterEach(() => {
    InspectionEditSession.discard();
  });

  it("BUG 1: mounting the NEW-inspection screen with a stale context inspectionId must NOT write defaults into that inspection", async () => {
    await openSeededProject();
    const statusFieldId = await addTestStatusDropdown();
    const staleInspectionId = await createInspection("2026-09-01");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
    };
    mockCtxStore.inspectionId = staleInspectionId;

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen />);
    });
    await settle();

    expect(mockCtxStore.inspectionId).toBeNull();
    expect(InspectionEditSession.isActive(staleInspectionId)).toBe(false);

    const leaked = await InspectionValueRepository.getValue(
      staleInspectionId,
      statusFieldId
    );
    expect(leaked).toBeNull();
    await act(async () => {
      tree!.unmount();
    });
  });

  it("BUG 2 product decision: edit existing inspection → current default IGNORED (EMPTY, nothing staged) → explicit Save persists → reopen shows saved value", async () => {
    await openSeededProject();
    const statusFieldId = await addTestStatusDropdown();
    const inspectionId = await createInspection("2026-09-03");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(inspectionId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(InspectionEditSession.isActive(inspectionId)).toBe(true);
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);
    expect(findFieldValue(tree!, "_test_status")).toBe("");
    expect(await InspectionValueRepository.getValue(inspectionId, statusFieldId)).toBeNull();

    // Explicit user selection (session-routed) then Save
    InspectionEditSession.stageFieldValue(statusFieldId, "Yes");
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const persisted = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(persisted).not.toBeNull();
    expect(persisted!.FieldValue).toBe("Yes");

    await act(async () => {
      InspectionEditSession.discard();
      tree!.unmount();
    });

    let reopened: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      reopened = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(findFieldValue(reopened!, "_test_status")).toBe("Yes");
    const stored = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(stored?.FieldValue).toBe("Yes");
    await act(async () => {
      reopened!.unmount();
    });
  });

  it("Cancel/Back discards explicit edits: the database stays NULL and reopen stays EMPTY (default ignored)", async () => {
    await openSeededProject();
    const statusFieldId = await addTestStatusDropdown();
    const inspectionId = await createInspection("2026-09-03");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(inspectionId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(findFieldValue(tree!, "_test_status")).toBe("");
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);
    expect(await InspectionValueRepository.getValue(inspectionId, statusFieldId)).toBeNull();

    // Explicit user selection, then Cancel/Back (discard) — nothing persists
    InspectionEditSession.stageFieldValue(statusFieldId, "Yes");
    await act(async () => {
      tree!.unmount();
    });
    await InspectionEditSession.discard();

    const afterBack = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(afterBack).toBeNull();

    let reopened: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      reopened = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(findFieldValue(reopened!, "_test_status")).toBe("");
    expect(await InspectionValueRepository.getValue(inspectionId, statusFieldId)).toBeNull();
    await act(async () => {
      reopened!.unmount();
    });
  });

  it("saved value always wins: existing 'No' beats the current default 'Yes' — displayed saved-only, never auto-staged, Save keeps it", async () => {
    await openSeededProject();
    const statusFieldId = await addTestStatusDropdown();
    const inspectionId = await createInspection("2026-09-03");
    await InspectionValueRepository.saveValue(inspectionId, statusFieldId, "No");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(inspectionId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(findFieldValue(tree!, "_test_status")).toBe("No");
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const saved = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(saved?.FieldValue).toBe("No");
    await act(async () => {
      tree!.unmount();
    });
  });

  it("an empty string saved value is authoritative: it is shown and never replaced by the configured default", async () => {
    await openSeededProject();
    const statusFieldId = await addTestStatusDropdown();
    const inspectionId = await createInspection("2026-09-03");
    await InspectionValueRepository.saveValue(inspectionId, statusFieldId, "");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(inspectionId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(findFieldValue(tree!, "_test_status")).toBe("");
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const saved = await InspectionValueRepository.getValue(inspectionId, statusFieldId);
    expect(saved).not.toBeNull();
    expect(saved!.FieldValue).toBe("");
    await act(async () => {
      tree!.unmount();
    });
  });

  it("device records get the SAME existing-inspection treatment (existing flags propagate to DeviceSection)", async () => {
    await openSeededProject();
    const inspectionId = await createInspection("2026-09-03");
    await seedDeviceCount(inspectionId, "camera", "1");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(inspectionId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    const lastProps = (mockDeviceSection as any).__lastProps();
    expect(lastProps.existing).toBe(true);
    expect(lastProps.inspectionId).toBe(inspectionId);
    await act(async () => {
      tree!.unmount();
    });
  });

  it("inspection-switch isolation: no auto-staging on open; edits staged for the active inspection never leak into another", async () => {
    await openSeededProject();
    const statusFieldId = await addTestStatusDropdown();
    const firstId = await createInspection("2026-09-03");
    const secondId = await createInspection("2026-09-04");

    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(firstId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(InspectionEditSession.isActive(firstId)).toBe(true);
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);

    await act(async () => {
      tree!.unmount();
    });

    mockCtxStore.inspectionId = null;
    mockCtxNotify();
    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(secondId),
    };

    let secondTree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      secondTree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    expect(InspectionEditSession.isActive(secondId)).toBe(true);
    expect(InspectionEditSession.isActive(firstId)).toBe(false);
    expect(InspectionEditSession.getStagedFieldValues().has(statusFieldId)).toBe(false);

    // Explicit selection for the active (second) inspection only
    InspectionEditSession.stageFieldValue(statusFieldId, "Yes");
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const secondSaved = await InspectionValueRepository.getValue(secondId, statusFieldId);
    expect(secondSaved?.FieldValue).toBe("Yes");
    const firstSaved = await InspectionValueRepository.getValue(firstId, statusFieldId);
    expect(firstSaved).toBeNull();
    await act(async () => {
      secondTree!.unmount();
    });
  });

  it("progress is inline per section header (accordion right slot) AND the overall card shows immediately on the fresh form", async () => {
    await openSeededProject();
    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen />);
    });
    await settle();

    // Every real section header is wired to the inline progress component
    // (rendered in the arrow/right slot, which keeps the chevron) and long
    // section names wrap via titleNumberOfLines.
    const accordions = tree!.root.findAll(
      (node) => node.props && typeof node.props.right === "function"
    );
    expect(accordions.length).toBeGreaterThanOrEqual(3);
    for (const accordion of accordions) {
      expect(accordion.props.titleNumberOfLines).toBe(2);
    }

    // Fresh (no inspectionId): the compact overall card is visible immediately
    // with the configured totals (0 / 23 completed). Progress is never hidden,
    // even before any value exists.
    // Fresh (no inspectionId): the compact overall card is visible immediately
    // with the configured totals (0 / 23 completed). Progress is never hidden,
    // even before any value exists.
    const text = screenText(tree!);
    expect(text).toContain("Overall Inspection");
    expect(text).toContain("0 / 23 completed");
    expect(text).toContain("23 remaining");
    await act(async () => {
      tree!.unmount();
    });
  });

  it("edit mode renders the compact top-level Overall Inspection card (no grouped dashboard blocks)", async () => {
    await openSeededProject();
    const inspectionId = await createInspection("2026-09-05");
    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
      inspectionId: String(inspectionId),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen title="Edit Inspection" />);
    });
    await settle();

    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain("Overall Inspection");
    expect(json).toContain("completed");
    expect(json).toContain("remaining");
    // The removed grouped dashboard blocks must not come back.
    expect(json).not.toContain("Default Sections");
    expect(json).not.toContain("Default Device Type");
    expect(json).not.toContain("Custom Device Types");
    expect(json).not.toContain("Custom Sections");
    await act(async () => {
      tree!.unmount();
    });
  });

  it("main inspection ScrollView auto-adjusts for the keyboard inset", async () => {
    await openSeededProject();
    mockParamsState.current = {
      projectId: "1",
      projectData: JSON.stringify(testProject()),
    };

    let tree: ReturnType<typeof TestRenderer.create> | undefined;
    await act(async () => {
      tree = TestRenderer.create(<NewInspectionScreen />);
    });
    await settle();

    const scrollViews = tree!.root.findAll(
      (n) => (n as { type?: unknown }).type === ScrollView
    );
    expect(scrollViews.length).toBeGreaterThan(0);
    // The top-level inspection form ScrollView must let the OS move content
    // above the keyboard when a field is focused.
    expect(scrollViews[0].props.automaticallyAdjustKeyboardInsets).toBe(true);
    await act(async () => {
      tree!.unmount();
    });
  });
});