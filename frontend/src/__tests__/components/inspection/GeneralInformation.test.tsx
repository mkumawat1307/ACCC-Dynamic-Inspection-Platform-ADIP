import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { Dialog } from "react-native-paper";
import GeneralInformation, {
  GeneralInformationHandle,
  IdentityRenameDecision,
} from "@/src/components/inspection/GeneralInformation";
import FieldRenderer from "@/src/components/inspection/FieldRenderer";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
import { InspectionEditSessionState } from "@/src/database/repositories/InspectionEditSessionState";
import type { InspectionField } from "@/src/database/repositories/InspectionTypes";

jest.mock("@/src/database/db");

jest.mock("react-native-safe-area-context", () => {
  const ReactMock = require("react");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactMock.createElement(ReactMock.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

jest.mock("react-native-paper", () => {
  const actual = jest.requireActual("react-native-paper");
  const ReactPaper = require("react");
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) =>
      ReactPaper.createElement(ReactPaper.Fragment, null, children),
  };
});

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() })),
}));

jest.mock("@/src/context/InspectionContext", () => ({
  useInspection: jest.fn(),
}));

jest.mock("@/src/database/repositories/InspectionRepository", () => ({
  InspectionRepository: {
    getFieldsByKey: jest.fn(),
    getInspectionValues: jest.fn(),
    getInspectionPoleId: jest.fn(),
    getInspectionByPoleId: jest.fn(),
    saveFieldValue: jest.fn(),
    updateInspectionPoleId: jest.fn(),
    updatePoleIdDirectSave: jest.fn(),
  },
}));

jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: { getByInspection: jest.fn() },
}));

jest.mock("@/src/utils/location", () => ({ getCurrentLocation: jest.fn() }));
jest.mock("@/src/utils/geo", () => ({ reverseGeocode: jest.fn() }));
jest.mock("@/src/utils/date", () => ({
  getTodayDateString: jest.fn(() => "10-Sep-2026"),
}));

jest.mock("@/src/components/inspection/FieldRenderer", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      ReactMock.createElement(Text, { testID: "field" }, String(props.value ?? "")),
  };
});

const useInspectionMock = useInspection as jest.Mock;
const repo = InspectionRepository as jest.Mocked<typeof InspectionRepository>;
const photoRepo = (PhotoRepository as unknown as { getByInspection: jest.Mock });

const poleField: InspectionField = {
  FieldID: 1,
  SectionID: 1,
  FieldName: "Site ID",
  FieldKey: "pole_id",
  FieldType: "text",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 1,
  IsRequired: 1,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "2026-01-01T00:00:00",
  UpdatedAt: "2026-01-01T00:00:00",
};

const divisionField: InspectionField = {
  FieldID: 2,
  SectionID: 1,
  FieldName: "Division",
  FieldKey: "division",
  FieldType: "text",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 2,
  IsRequired: 0,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "2026-01-01T00:00:00",
  UpdatedAt: "2026-01-01T00:00:00",
};

const dateField: InspectionField = {
  FieldID: 30,
  SectionID: 1,
  FieldName: "Date",
  FieldKey: "date",
  FieldType: "DATE_AUTO",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 1,
  IsRequired: 1,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "2026-01-01T00:00:00",
  UpdatedAt: "2026-01-01T00:00:00",
};

const districtField: InspectionField = {
  FieldID: 31,
  SectionID: 1,
  FieldName: "District",
  FieldKey: "district",
  FieldType: "text",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 3,
  IsRequired: 1,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "2026-01-01T00:00:00",
  UpdatedAt: "2026-01-01T00:00:00",
};

const inspectorField: InspectionField = {
  FieldID: 32,
  SectionID: 1,
  FieldName: "Inspector Name",
  FieldKey: "inspector_name",
  FieldType: "text",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 4,
  IsRequired: 1,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "2026-01-01T00:00:00",
  UpdatedAt: "2026-01-01T00:00:00",
};

const blockField: InspectionField = {
  FieldID: 33,
  SectionID: 1,
  FieldName: "Block",
  FieldKey: "block",
  FieldType: "text",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 5,
  IsRequired: 0,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "2026-01-01T00:00:00",
  UpdatedAt: "2026-01-01T00:00:00",
};

const mockProject = {
  ProjectID: 1,
  TemplateID: 1,
  DivisionName: "Sikar",
  DistrictName: "Sikar",
  Block: "Block A",
  InspectorName: "Inspector",
};

function makePhoto(id: number) {
  return {
    PhotoID: id,
    InspectionID: 42,
    PhotoType: "Pole",
    FileName: `${id}.jpg`,
    FilePath: `content://media/${id}.jpg`,
    Latitude: 1,
    Longitude: 1,
    CapturedAt: "2026-08-14T10:30:00",
    Remarks: null,
  };
}

const setPoleId = jest.fn();
const setInspectionId = jest.fn();
const getPhotoStates = jest.fn(() => ({}));

function mockContext(overrides: Record<string, unknown> = {}): void {
  useInspectionMock.mockReturnValue({
    project: mockProject,
    inspectionDate: "14-Aug-2026",
    inspectionId: 42,
    setInspectionId,
    setPoleId,
    getPhotoStates,
    ...overrides,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderComponent(props: Record<string, unknown> = {}): Promise<ReturnType<typeof TestRenderer.create>> {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(<GeneralInformation {...props} />);
    await flushPromises();
  });
  return tree!;
}

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) collectStrings(child, out);
    }
  }
  return out;
}

function dialogVisible(tree: ReturnType<typeof TestRenderer.create>): boolean {
  const dialogs = tree.root.findAll((n) => (n as { type?: unknown }).type === Dialog);
  if (dialogs.length === 0) return false;
  return (dialogs[dialogs.length - 1].props as { visible?: boolean }).visible === true;
}

async function pressButton(
  tree: ReturnType<typeof TestRenderer.create>,
  label: string
): Promise<void> {
  const candidates: { props: Record<string, unknown>; children?: unknown[] }[] = [];
  tree.root.findAll((node) => {
    const props = node.props as { onPress?: unknown };
    if (props && typeof props.onPress === "function") candidates.push(node);
    return false;
  });
  const target = candidates.find((node) =>
    collectStringsFromInstance(node).includes(label)
  ) ?? candidates[0];
  expect(target).toBeDefined();
  await act(async () => {
    (target.props as { onPress?: () => void }).onPress?.();
    await flushPromises();
  });
}

function collectStringsFromInstance(
  node: { children?: unknown[]; props?: Record<string, unknown> } | string,
  out: string[] = []
): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  const children = (node.children ?? []) as (
    | { children?: unknown[]; props?: Record<string, unknown> }
    | string
  )[];
  for (const child of children) collectStringsFromInstance(child, out);
  return out;
}

function renderedFieldValues(
  tree: ReturnType<typeof TestRenderer.create>
): string[] {
  return tree.root
    .findAll((n) => (n as { type?: unknown }).type === FieldRenderer)
    .map((n) => (n.props as { value?: string }).value ?? "");
}

function editableOf(
  tree: ReturnType<typeof TestRenderer.create>,
  index: number
): boolean | undefined {
  const nodes = tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer);
  const props = nodes[index]?.props as { editable?: boolean } | undefined;
  return props?.editable;
}

async function changePoleId(
  tree: ReturnType<typeof TestRenderer.create>,
  text: string
): Promise<void> {
  const nodes = tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer);
  const node = nodes[0]!;
  await act(async () => {
    await (node.props as { onChange: (t: string) => Promise<void> }).onChange(text);
    await new Promise((resolve) => setTimeout(resolve, 620));
  });
}

async function setPoleText(
  tree: ReturnType<typeof TestRenderer.create>,
  text: string
): Promise<void> {
  const nodes = tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer);
  const node = nodes[0]!;
  await act(async () => {
    await (node.props as { onChange: (t: string) => Promise<void> }).onChange(text);
    await flushPromises();
  });
}

async function typePoleRapid(
  tree: ReturnType<typeof TestRenderer.create>,
  texts: string[]
): Promise<void> {
  const nodes = tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer);
  const node = nodes[0]!;
  await act(async () => {
    for (const text of texts) {
      await (node.props as { onChange: (t: string) => Promise<void> }).onChange(text);
    }
    await new Promise((resolve) => setTimeout(resolve, 620));
  });
}

async function flushSettle(
  tree: ReturnType<typeof TestRenderer.create>
): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 620));
  });
}

describe("GeneralInformation pole id settled save", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    mockContext();
    repo.getFieldsByKey.mockResolvedValue([poleField]);
    repo.getInspectionValues.mockResolvedValue({ pole_id: "OLD" });
    repo.getInspectionPoleId.mockResolvedValue("OLD");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the Site ID field with no inspection id (no draft yet), and no popup is possible", async () => {
    mockContext({ inspectionId: null });
    const tree = await renderComponent();
    expect(tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer).length).toBe(1);
    expect(dialogVisible(tree)).toBe(false);
  });

  it("saves the pole id directly after the settled check and skips the dialog when the inspection has no photos", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
    expect(dialogVisible(tree)).toBe(false);
  });

  it("alerts and reverts the field when the direct save fails", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    repo.updatePoleIdDirectSave.mockRejectedValue(new Error("boom"));
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(Alert.alert).toHaveBeenCalledWith(
      "Save Failed",
      expect.stringContaining("Could not update the Site ID")
    );
    expect(setPoleId).toHaveBeenCalledWith("OLD");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("direct-saves even when photos exist — typing never opens the rename dialog", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("direct-saves when clearing the pole id and no photos exist", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderComponent();
    await changePoleId(tree, "");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("settles rapid typing into a single duplicate check + save of the latest value", async () => {
    const tree = await renderComponent();
    await typePoleRapid(tree, ["1", "1001"]);

    expect(repo.getInspectionByPoleId).toHaveBeenCalledTimes(1);
    expect(repo.getInspectionByPoleId).toHaveBeenCalledWith("1001");
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "1001");
  });

  it("ignores a stale settled result if the Site ID changed again mid-check", async () => {
    let resolveFirst!: (row: { InspectionID: number; PoleID: string; Status: string } | null) => void;
    repo.getInspectionByPoleId.mockImplementation((poleId: string) =>
      poleId === "1001"
        ? new Promise((res) => {
            resolveFirst = res;
          })
        : Promise.resolve(null)
    );
    const tree = await renderComponent();

    // First settled check for "1001" parks on the duplicate query.
    await typePoleRapid(tree, ["1001"]);

    await act(async () => {
      await setPoleText(tree, "1002");
      // The stale "1001" result lands as a duplicate AFTER the user moved on —
      // it must never alert, revert, or persist anything.
      resolveFirst({ InspectionID: 99, PoleID: "1001", Status: "draft" });
      await new Promise((resolve) => setTimeout(resolve, 620));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "1002");
  });

  it("existing inspections alert and revert the Site ID on a duplicate", async () => {
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "SIK101",
      Status: "draft",
    });
    const tree = await renderComponent({ existing: true });
    await changePoleId(tree, "SIK101");

    expect(Alert.alert).toHaveBeenCalledWith(
      "Duplicate Site ID",
      expect.stringContaining("already exists")
    );
    expect(setPoleId).toHaveBeenLastCalledWith("OLD");
    expect(renderedFieldValues(tree)[0]).toBe("OLD");
  });
});

describe("GeneralInformation lazy draft + duplicate flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    mockContext({ inspectionId: null });
    repo.getFieldsByKey.mockResolvedValue([poleField]);
    repo.getInspectionValues.mockResolvedValue({});
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  it("creates a draft lazily only after a unique Site ID passes the duplicate check", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ ensureDraft, releaseAbandonedDraft });

    await changePoleId(tree, "SIK101");

    expect(ensureDraft).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      expect.any(Number),
      "SIK101"
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("does NOT create a draft when the Site ID is a duplicate, and keeps the typed value", async () => {
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "SIK101",
      Status: "draft",
    });
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");

    const duplicateCall = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists"
    );
    expect(duplicateCall).toBeDefined();
    expect(String(duplicateCall[1])).toContain("SIK101");
    // No revert on the NEW-capture path: the field keeps the typed value so the
    // user can pick a different Site ID without re-typing.
    expect(setPoleId).toHaveBeenLastCalledWith("SIK101");
    expect(renderedFieldValues(tree)[0]).toBe("SIK101");
  });

  it("cleans up the abandoned draft when Edit Existing is chosen from the duplicate alert", async () => {
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "SIK101",
      Status: "draft",
    });
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ releaseAbandonedDraft });

    await changePoleId(tree, "SIK101");

    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists"
    );
    expect(call).toBeDefined();
    const buttons = call[2] as { text: string; onPress: () => void }[];
    const editButton = buttons.find((b) => b.text === "Edit Existing");
    expect(editButton).toBeDefined();

    await act(async () => {
      await editButton!.onPress();
    });

    expect(releaseAbandonedDraft).toHaveBeenCalledTimes(1);
  });
});

describe("GeneralInformation duplicate Site ID -> Cancel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    mockContext({ inspectionId: null });
    repo.getFieldsByKey.mockResolvedValue([poleField, divisionField]);
    repo.getInspectionValues.mockResolvedValue({});
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "SIK101",
      Status: "draft",
    });
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  async function pressDuplicateCancel(
    tree: ReturnType<typeof TestRenderer.create>
  ): Promise<void> {
    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists"
    );
    expect(call).toBeDefined();
    const buttons = call[2] as { text: string; onPress: () => void }[];
    const cancelButton = buttons.find((b) => b.text === "Cancel");
    expect(cancelButton).toBeDefined();
    await act(async () => {
      cancelButton!.onPress?.();
      await flushPromises();
    });
  }

  it("TEST 1/5: Cancel clears ONLY the Site ID and preserves other field values", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");
    await pressDuplicateCancel(tree);

    // Site ID field is empty; the division field (default "Sikar") is untouched.
    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("");
    expect(values[1]).toBe("Sikar");
    expect(setPoleId).toHaveBeenLastCalledWith("");

    // Nothing was persisted for the duplicate and no draft was created.
    expect(ensureDraft).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
    expect(setInspectionId).not.toHaveBeenCalled();
  });

  it("TEST 2: after Cancel a new unique Site ID is accepted and the old duplicate is not in the DB", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");
    await pressDuplicateCancel(tree);

    // Now enter a fresh, unique Site ID.
    repo.getInspectionByPoleId.mockResolvedValue(null);
    await changePoleId(tree, "NEW1");

    expect(ensureDraft).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      expect.any(Number),
      "NEW1"
    );
    // The old duplicate must never have been persisted.
    const allCalls = [
      ...(repo.updatePoleIdDirectSave as jest.Mock).mock.calls,
      ...(repo.saveFieldValue as jest.Mock).mock.calls,
      ...(repo.updateInspectionPoleId as jest.Mock).mock.calls,
    ].map((c) => String(c[2] ?? c[1] ?? ""));
    expect(allCalls).not.toContain("SIK101");
  });

  it("TEST 3: pending settled duplicate save is cancelled - duplicate is not restored after Cancel", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");

    // Press Cancel, then flush all pending async work.
    await pressDuplicateCancel(tree);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("");
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "SIK101"
    );
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "SIK101"
    );
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalledWith(
      expect.anything(),
      "SIK101"
    );
  });

  it("TEST 4: no draft/persisted Site ID exists when the inspection was never created", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");
    await pressDuplicateCancel(tree);

    // Blank new inspection: draft must not be created, so nothing is persisted.
    expect(ensureDraft).not.toHaveBeenCalled();
    expect(setInspectionId).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
    expect(renderedFieldValues(tree)[0]).toBe("");
  });

  it("TEST 6 (Edit Existing only): Edit Existing from the duplicate alert remains unchanged", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ ensureDraft, releaseAbandonedDraft });

    await changePoleId(tree, "SIK101");

    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists"
    );
    const buttons = call![2] as { text: string; onPress: () => void }[];

    // Edit Existing releases the abandoned draft and navigates away.
    const editButton = buttons.find((b) => b.text === "Edit Existing")!;
    await act(async () => {
      await editButton.onPress();
    });
    expect(releaseAbandonedDraft).toHaveBeenCalledTimes(1);
    expect(setInspectionId).toHaveBeenCalledWith(99);
  });
});

describe("GeneralInformation duplicate Site ID -> Create New", () => {
  let ctxState: { inspectionId: number | null; poleId: string };
  let statefulSetInspectionId: jest.Mock;
  let statefulSetPoleId: jest.Mock;

  function statefulContext(initialInspectionId: number | null): void {
    ctxState = { inspectionId: initialInspectionId, poleId: "" };
    statefulSetInspectionId = jest.fn((id: number | null) => {
      ctxState.inspectionId = id;
    });
    statefulSetPoleId = jest.fn((pole: string) => {
      ctxState.poleId = pole;
    });
    useInspectionMock.mockImplementation(() => ({
      project: mockProject,
      inspectionDate: "14-Aug-2026",
      inspectionId: ctxState.inspectionId,
      setInspectionId: statefulSetInspectionId,
      setPoleId: statefulSetPoleId,
      getPhotoStates,
      ...(ctxState.poleId !== undefined ? { poleId: ctxState.poleId } : { poleId: "" }),
    }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    repo.getFieldsByKey.mockResolvedValue([poleField, divisionField]);
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "SIK201",
      Status: "draft",
    });
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  async function pressCreateNew(
    tree: ReturnType<typeof TestRenderer.create>
  ): Promise<void> {
    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists"
    );
    expect(call).toBeDefined();
    const buttons = call![2] as { text: string; onPress: () => void }[];
    const createNew = buttons.find((b) => b.text === "Create New");
    expect(createNew).toBeDefined();
    await act(async () => {
      await createNew!.onPress();
      await flushPromises();
    });
  }

  it("TEST 1: Cancel still preserves every other form value (regression)", async () => {
    // A draft has already persisted saved values for this duplicate inspection.
    statefulContext(42);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "SIK101",
      division: "GivenDivision",
    });
    const tree = await renderComponent();

    // Change Site ID to the duplicate, then Cancel.
    await changePoleId(tree, "SIK201");
    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists"
    );
    const cancelBtn = (call![2] as { text: string; onPress: () => void }[]).find(
      (b) => b.text === "Cancel"
    );
    await act(async () => {
      cancelBtn!.onPress();
      await flushPromises();
    });

    // Pole ID cleared; every other value preserved.
    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("");
    expect(values[1]).toBe("GivenDivision");
    // inspectionId untouched (Cancel keeps the current inspection).
    expect(statefulSetInspectionId).not.toHaveBeenCalled();
  });

  it("TEST 2: Create New resets the whole inspection to a blank new lifecycle", async () => {
    // A draft exists with previously saved/selected values. getInspectionValues
    // returns those old values only for the live draft (id 42); a reset (null)
    // must yield a clean form, exactly as the app's loadInspectionValues does.
    statefulContext(42);
    repo.getInspectionValues.mockImplementation((id: number | null) =>
      Promise.resolve(
        (id != null
          ? { pole_id: "SIK101", division: "OldDivision" }
          : {}) as Record<string, string>
      )
    );
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ releaseAbandonedDraft });

    await changePoleId(tree, "SIK201");
    await pressCreateNew(tree);

    // inspectionId reset to null -> new.tsx re-locks sections / unmounts renderers
    expect(statefulSetInspectionId).toHaveBeenLastCalledWith(null);
    // orphan draft is released/deleted
    expect(releaseAbandonedDraft).toHaveBeenCalledTimes(1);
    // GeneralInformation values reset to clean config defaults; old saved values gone
    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("");
    expect(values[1]).toBe("Sikar");
    expect(statefulSetPoleId).toHaveBeenLastCalledWith("");
  });

  it("TEST 3: old values do not reappear after waiting following Create New", async () => {
    statefulContext(42);
    repo.getInspectionValues.mockImplementation((id: number | null) =>
      Promise.resolve(
        (id != null
          ? { pole_id: "SIK101", division: "OldDivision" }
          : {}) as Record<string, string>
      )
    );
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ releaseAbandonedDraft });

    await changePoleId(tree, "SIK201");
    await pressCreateNew(tree);

    // Wait for any stale debounce/init to attempt a restore.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await flushPromises();
    });

    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("");
    expect(values[1]).toBe("Sikar");
    expect(renderedFieldValues(tree)[1]).not.toBe("OldDivision");
  });

  it("TEST 4: after Create New a new unique Site ID starts an entirely new inspection", async () => {
    statefulContext(null);
    repo.getInspectionValues.mockResolvedValue({});
    const ensureDraft = jest.fn().mockResolvedValue(201);
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ ensureDraft, releaseAbandonedDraft });

    // Duplicate first (no draft), then Create New.
    await changePoleId(tree, "SIK201");
    await pressCreateNew(tree);
    // fresh lifecycle: the cleanup path always runs (releaseAbandonedDraft is
    // idempotent and no-ops when no draft exists), but the duplicate never
    // created a draft and inspectionId is reset to null.
    expect(ensureDraft).not.toHaveBeenCalled();
    expect(releaseAbandonedDraft).toHaveBeenCalledTimes(1);
    expect(statefulSetInspectionId).toHaveBeenLastCalledWith(null);

    // Now enter a new unique Site ID.
    repo.getInspectionByPoleId.mockResolvedValue(null);
    await changePoleId(tree, "BRAND-NEW");
    expect(ensureDraft).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      201,
      expect.any(Number),
      "BRAND-NEW"
    );
    // The abandoned inspection's values are never loaded for the new one.
    const loadedIds = (repo.getInspectionValues as jest.Mock).mock.calls.map(
      (c) => c[0]
    );
    expect(loadedIds).not.toContain(201);
  });

  it("TEST 5: no orphan draft is left behind after Create New", async () => {
    statefulContext(42);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "SIK101",
      division: "OldDivision",
    });
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ releaseAbandonedDraft });

    await changePoleId(tree, "SIK201");
    await pressCreateNew(tree);

    // The persisted draft for the abandoned inspection is released/deleted.
    expect(releaseAbandonedDraft).toHaveBeenCalledTimes(1);
    // Before Create New the draft was live; after reset the id is null.
    expect(statefulSetInspectionId).toHaveBeenLastCalledWith(null);
  });

  it("TEST 6: async race - a stale init load cannot repopulate old values after Create New", async () => {
    statefulContext(42);
    // Old inspection's async load stays pending until we resolve it later.
    let resolveOld!: (v: Record<string, string>) => void;
    repo.getInspectionValues.mockImplementation(
      (id: number | null) =>
        id != null
          ? new Promise((res) => {
              resolveOld = res;
            })
          : Promise.resolve({})
    );
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ releaseAbandonedDraft });

    // Old init(42) is pending (getInspectionValues(42) unresolved).
    // Type the duplicate; the alert appears; then Create New.
    await changePoleId(tree, "SIK201");
    await pressCreateNew(tree);

    // Now let the OLD inspection's load resolve with its old values.
    await act(async () => {
      resolveOld({ pole_id: "OLD-REPO", division: "OldDivision" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();
    });

    // The stale load must NOT repopulate the reset form.
    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("");
    expect(values[0]).not.toBe("OLD-REPO");
  });
});

describe("GeneralInformation existing inspection display", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    mockContext({ inspectionId: 42 });
    repo.getFieldsByKey.mockResolvedValue([
      dateField,
      divisionField,
      districtField,
      blockField,
      inspectorField,
      poleField,
    ]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      date: "01-Aug-2026",
      division: "Jaipur",
      district: "Jaipur",
      block: "Old Block",
      inspector_name: "Inspector",
    });
    repo.getInspectionPoleId.mockResolvedValue("OLD");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  it("shows CURRENT project division/district but the saved block, inspector and pole", async () => {
    const tree = await renderComponent({ existing: true });

    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("01-Aug-2026");
    expect(values[1]).toBe("Sikar");
    expect(values[2]).toBe("Sikar");
    expect(values[3]).toBe("Old Block");
    expect(values[4]).toBe("Inspector");
    expect(values[5]).toBe("OLD");
  });

  it("falls back to persisted division/district when the project has none", async () => {
    mockContext({ inspectionId: 42, project: { ...mockProject, DivisionName: "", DistrictName: "" } });
    const tree = await renderComponent({ existing: true });

    const values = renderedFieldValues(tree);
    expect(values[1]).toBe("Jaipur");
    expect(values[2]).toBe("Jaipur");
  });

  it("unlocks block/inspector but keeps date/division/district locked", async () => {
    const tree = await renderComponent({ existing: true });

    expect(editableOf(tree, 0)).toBe(false);
    expect(editableOf(tree, 1)).toBe(false);
    expect(editableOf(tree, 2)).toBe(false);
    expect(editableOf(tree, 3)).toBe(true);
    expect(editableOf(tree, 4)).toBe(true);
    expect(editableOf(tree, 5)).toBe(true);
  });
});

describe("GeneralInformation confirmIdentityRename at save time", () => {
  const ref = React.createRef<GeneralInformationHandle>();

  async function renderWithRef(): Promise<ReturnType<typeof TestRenderer.create>> {
    return renderComponent({ existing: true, ref });
  }

  async function invokeConfirm(): Promise<IdentityRenameDecision> {
    let decision: IdentityRenameDecision = { type: "no-change" };
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });
    return decision;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    InspectionEditSession.activate(42);
    mockContext({ inspectionId: 42 });
    repo.getFieldsByKey.mockResolvedValue([poleField, districtField, blockField]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      district: "Sikar",
      block: "Old Block",
    });
    repo.getInspectionPoleId.mockResolvedValue("OLD");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  afterEach(async () => {
    await InspectionEditSession.discard();
  });

  it("returns no-change when the form identity matches the persisted identity", async () => {
    const tree = await renderWithRef();

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-change" });
    expect(dialogVisible(tree)).toBe(false);
    expect(InspectionEditSessionState.getPendingRename()).toBeNull();
  });

  it("returns cancelled when the form identity is blank", async () => {
    mockContext({ inspectionId: 42, project: { ...mockProject, DistrictName: "" } });
    repo.getInspectionValues.mockResolvedValue({});
    const tree = await renderWithRef();

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "cancelled" });
    expect(dialogVisible(tree)).toBe(false);
  });

  it("returns duplicate and the settled save alerts + reverts when the Site ID matches another inspection", async () => {
    repo.getInspectionByPoleId.mockImplementation((poleId: string) =>
      poleId === "SIK101"
        ? Promise.resolve({ InspectionID: 99, PoleID: "SIK101", Status: "draft" })
        : Promise.resolve(null)
    );
    const tree = await renderWithRef();
    await setPoleText(tree, "SIK101");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "duplicate", duplicatePoleId: "SIK101" });

    // The pending settled save (existing mode) then hits the same duplicate.
    await flushSettle(tree);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Duplicate Site ID",
      expect.stringContaining("already exists")
    );
    expect(setPoleId).toHaveBeenLastCalledWith("OLD");
  });

  it("shows the rename dialog and stages the pending rename + identity on confirm", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderWithRef();
    await setPoleText(tree, "SIK101");

    let promise!: Promise<IdentityRenameDecision>;
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);
    const dialogText = collectStrings(tree.toJSON()).join(" ");
    expect(dialogText).toContain("photo file");
    expect(dialogText).toContain("will be renamed");

    await pressButton(tree, "Rename");
    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await promise;
    });

    expect(decision).toEqual({ type: "proceed", renameFiles: true, updateReports: true });
    expect(InspectionEditSessionState.getPendingRename()).toEqual({
      oldPoleId: "OLD",
      newPoleId: "SIK101",
      renameFiles: true,
      updateReports: true,
      oldDistrict: "Sikar",
      oldBlock: "Old Block",
      newDistrict: "Sikar",
      newBlock: "Old Block",
    });
    const staged = InspectionEditSessionState.getStagedFieldValues();
    expect(staged.get(poleField.FieldID)).toBe("SIK101");
    expect(staged.get(districtField.FieldID)).toBe("Sikar");
    expect(staged.get(blockField.FieldID)).toBe("Old Block");
    expect(InspectionEditSessionState.getStagedPoleId()).toBe("SIK101");

    await flushSettle(tree);
  });

  it("stages the identity without a dialog when changed but no photos exist", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderWithRef();
    await setPoleText(tree, "SIK101");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(InspectionEditSessionState.getPendingRename()).toBeNull();
    expect(InspectionEditSessionState.getStagedPoleId()).toBe("SIK101");
    expect(InspectionEditSessionState.getStagedFieldValues().get(blockField.FieldID)).toBe("Old Block");
    expect(InspectionEditSessionState.getStagedFieldValues().get(districtField.FieldID)).toBe("Sikar");

    await flushSettle(tree);
  });

  it("cancelling the dialog reverts the on-screen and staged identity", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderWithRef();
    await setPoleText(tree, "SIK101");

    let promise!: Promise<IdentityRenameDecision>;
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);

    await pressButton(tree, "Cancel");
    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await promise;
    });

    expect(decision).toEqual({ type: "cancelled" });
    expect(setPoleId).toHaveBeenLastCalledWith("OLD");
    expect(renderedFieldValues(tree)[0]).toBe("OLD");
    const staged = InspectionEditSessionState.getStagedFieldValues();
    expect(staged.get(poleField.FieldID)).toBe("OLD");
    expect(staged.get(blockField.FieldID)).toBe("Old Block");
    expect(InspectionEditSessionState.getStagedPoleId()).toBe("OLD");
    expect(InspectionEditSessionState.getPendingRename()).toBeNull();

    await flushSettle(tree);
  });

  it("prompts when the persisted district differs from the current project district", async () => {
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      district: "OldDistrict",
      block: "Old Block",
    });
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderWithRef();

    let promise!: Promise<IdentityRenameDecision>;
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);
    const strings = collectStrings(tree.toJSON()).join(" ");
    expect(strings).toContain("OldDistrict");
    expect(strings).toContain("Sikar");

    await pressButton(tree, "Cancel");
    await act(async () => {
      await promise;
    });
  });
});

describe("GeneralInformation locked fields (date, division, district)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  it("NEW inspection: date/division/district are non-editable and app values auto-populate", async () => {
    mockContext({ inspectionId: null });
    repo.getFieldsByKey.mockResolvedValue([dateField, divisionField, districtField, inspectorField]);
    repo.getInspectionValues.mockResolvedValue({});
    const tree = await renderComponent();

    expect(editableOf(tree, 0)).toBe(false);
    expect(editableOf(tree, 1)).toBe(false);
    expect(editableOf(tree, 2)).toBe(false);

    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("14-Aug-2026");
    expect(values[1]).toBe("Sikar");
    expect(values[2]).toBe("Sikar");
  });

  it("auto-assigns today's date when the context date is empty (app-driven fallback)", async () => {
    mockContext({ inspectionId: null, inspectionDate: "" });
    repo.getFieldsByKey.mockResolvedValue([dateField]);
    repo.getInspectionValues.mockResolvedValue({});
    const tree = await renderComponent();

    expect(editableOf(tree, 0)).toBe(false);
    expect(renderedFieldValues(tree)[0]).toBe("10-Sep-2026");
  });

  it("EDIT/unlocked inspection: locked fields stay non-editable while other fields unlock", async () => {
    mockContext({ inspectionId: 42 });
    repo.getFieldsByKey.mockResolvedValue([dateField, divisionField, districtField, inspectorField, poleField]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      date: "01-Aug-2026",
      division: "Jaipur",
      district: "Jaipur",
      inspector_name: "Inspector",
    });
    const tree = await renderComponent();

    expect(editableOf(tree, 0)).toBe(false);
    expect(editableOf(tree, 1)).toBe(false);
    expect(editableOf(tree, 2)).toBe(false);
    expect(editableOf(tree, 3)).toBe(true);
    expect(editableOf(tree, 4)).toBe(true);

    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("01-Aug-2026");
    expect(values[1]).toBe("Jaipur");
    expect(values[2]).toBe("Jaipur");
    expect(values[3]).toBe("Inspector");
  });

  it("typing a Site ID unlocks the form but the locked fields remain non-editable", async () => {
    mockContext({ inspectionId: null });
    repo.getFieldsByKey.mockResolvedValue([poleField, dateField, divisionField, districtField, inspectorField]);
    repo.getInspectionValues.mockResolvedValue({});
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK9");

    expect(editableOf(tree, 0)).toBe(true);
    expect(editableOf(tree, 1)).toBe(false);
    expect(editableOf(tree, 2)).toBe(false);
    expect(editableOf(tree, 3)).toBe(false);
    expect(editableOf(tree, 4)).toBe(true);
  });
});