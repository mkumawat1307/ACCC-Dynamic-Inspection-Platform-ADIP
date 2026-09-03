import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { Dialog } from "react-native-paper";
import GeneralInformation from "@/src/components/inspection/GeneralInformation";
import FieldRenderer from "@/src/components/inspection/FieldRenderer";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { PoleRenameService } from "@/src/database/repositories/PoleRenameService";
import type { InspectionField } from "@/src/database/repositories/InspectionTypes";

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

jest.mock("@/src/database/repositories/PoleRenameService", () => ({
  PoleRenameService: { renamePoleId: jest.fn() },
}));

jest.mock("@/src/utils/location", () => ({ getCurrentLocation: jest.fn() }));
jest.mock("@/src/utils/geo", () => ({ reverseGeocode: jest.fn() }));

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
const service = PoleRenameService as jest.Mocked<typeof PoleRenameService>;

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

async function changePoleId(
  tree: ReturnType<typeof TestRenderer.create>,
  text: string
): Promise<void> {
  const nodes = tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer);
  const node = nodes[0]!;
  await act(async () => {
    (node.props as { onChange: (t: string) => void }).onChange(text);
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
}

describe("GeneralInformation pole id rename dialog", () => {
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
    service.renamePoleId.mockResolvedValue({
      renamedFiles: 0,
      updatedRecords: 0,
      missingFiles: 0,
    });
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

  it("saves the pole id directly and skips the dialog when the inspection has no photos", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
    expect(service.renamePoleId).not.toHaveBeenCalled();
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
    expect(service.renamePoleId).not.toHaveBeenCalled();
    expect(dialogVisible(tree)).toBe(false);
  });

  it("shows the rename dialog when the inspection has at least one photo", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    expect(dialogVisible(tree)).toBe(true);
    expect(collectStrings(tree.toJSON()).join(" ")).toContain("Rename Site ID");
    expect(service.renamePoleId).not.toHaveBeenCalled();
  });

  it("routes clearing the pole id through the gate instead of silently direct-saving", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderComponent();
    await changePoleId(tree, "");

    expect(dialogVisible(tree)).toBe(true);
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(service.renamePoleId).not.toHaveBeenCalled();
  });

  it("direct-saves when clearing the pole id and no photos exist", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderComponent();
    await changePoleId(tree, "");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("restores the old value when the dialog is cancelled", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");
    expect(dialogVisible(tree)).toBe(true);

    await pressButton(tree, "Cancel");

    expect(setPoleId).toHaveBeenCalledWith("OLD");
    expect(service.renamePoleId).not.toHaveBeenCalled();
    expect(dialogVisible(tree)).toBe(false);
  });

  it("runs the cascading rename when the dialog is confirmed", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    await pressButton(tree, "Rename");

    expect(service.renamePoleId).toHaveBeenCalledWith(42, "OLD", "SIK101", {
      renameFiles: true,
      updateReports: true,
    });
  });

  it("blocks the rename while a photo is still processing", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    getPhotoStates.mockReturnValue({ 1: "processing" });
    const tree = await renderComponent();
    await changePoleId(tree, "SIK101");

    expect(Alert.alert).toHaveBeenCalledWith(
      "Rename Blocked",
      expect.stringContaining("Wait for all photos")
    );
    expect(setPoleId).toHaveBeenCalledWith("OLD");
    expect(service.renamePoleId).not.toHaveBeenCalled();
    expect(dialogVisible(tree)).toBe(false);
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
    service.renamePoleId.mockResolvedValue({
      renamedFiles: 0,
      updatedRecords: 0,
      missingFiles: 0,
    });
  });

  it("creates a draft lazily only after a unique Site ID passes the duplicate check", async () => {
    const ensureDraft = jest
      .fn()
      .mockResolvedValue(101);
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

  it("does NOT create a draft when the Site ID is a duplicate", async () => {
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "SIK101",
      Status: "draft",
    });
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");

    expect(ensureDraft).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(setPoleId).toHaveBeenCalledWith("");
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
    service.renamePoleId.mockResolvedValue({
      renamedFiles: 0,
      updatedRecords: 0,
      missingFiles: 0,
    });
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

  function renderedFieldValues(
    tree: ReturnType<typeof TestRenderer.create>
  ): string[] {
    return tree.root
      .findAll((n) => (n as { type?: unknown }).type === FieldRenderer)
      .map((n) => (n.props as { value?: string }).value ?? "");
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

  it("TEST 3: pending debounced duplicate save is cancelled - duplicate is not restored after Cancel", async () => {
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
    service.renamePoleId.mockResolvedValue({
      renamedFiles: 0,
      updatedRecords: 0,
      missingFiles: 0,
    });
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

  function renderedFieldValues(
    tree: ReturnType<typeof TestRenderer.create>
  ): string[] {
    return tree.root
      .findAll((n) => (n as { type?: unknown }).type === FieldRenderer)
      .map((n) => (n.props as { value?: string }).value ?? "");
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
