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
import { PoleRenameService } from "@/src/database/repositories/PoleRenameService";
import { InspectionLiveValues } from "@/src/database/repositories/InspectionLiveValues";
import type { InspectionField } from "@/src/database/repositories/InspectionTypes";

jest.mock("@/src/database/db");

jest.mock("react-native-safe-area-context", () => {
  const ReactMock = require("react");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactMock.createElement(ReactMock.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    initialWindowMetrics: {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    },
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
  useRouter: jest.fn(() => ({
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  })),
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
    scheduleFieldValueSave: jest.fn(),
    flushPendingFieldValueSaves: jest.fn(),
    cancelPendingFieldValueSaves: jest.fn(),
  },
}));

jest.mock("@/src/database/repositories/PhotoRepository", () => ({
  __esModule: true,
  default: { getByInspection: jest.fn() },
}));

jest.mock("@/src/utils/location", () => ({ getCurrentLocation: jest.fn() }));
jest.mock("@/src/utils/geo", () => ({
  reverseGeocode: jest.fn(),
  formatAddressLines: jest.requireActual("@/src/utils/geo").formatAddressLines,
}));
jest.mock("@/src/utils/date", () => ({
  getTodayDateString: jest.fn(() => "10-Sep-2026"),
}));

jest.mock("@/src/components/inspection/FieldRenderer", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      ReactMock.createElement(
        Text,
        { testID: "field" },
        String(props.value ?? ""),
      ),
  };
});

jest.mock("@/src/database/repositories/PoleRenameService", () => ({
  PoleRenameService: {
    renamePoleId: jest.fn(),
    prepareRename: jest.fn(),
    writeRenameInTransaction: jest.fn(),
  },
}));

const useInspectionMock = useInspection as jest.Mock;
const repo = InspectionRepository as jest.Mocked<typeof InspectionRepository>;
const photoRepo = PhotoRepository as unknown as { getByInspection: jest.Mock };
const mockRenameService = PoleRenameService as jest.Mocked<
  typeof PoleRenameService
>;

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

function makeIdentityPhoto(
  id: number,
  block: string,
  poleId: string,
  district = "Sikar",
) {
  return {
    ...makePhoto(id),
    FileName: `${district}_${block}_${poleId}_14AUG2026_103000_photo${id}.jpg`,
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

async function renderComponent(
  props: Record<string, unknown> = {},
): Promise<ReturnType<typeof TestRenderer.create>> {
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
  const dialogs = tree.root.findAll(
    (n) => (n as { type?: unknown }).type === Dialog,
  );
  if (dialogs.length === 0) return false;
  return (
    (dialogs[dialogs.length - 1].props as { visible?: boolean }).visible ===
    true
  );
}

async function pressButton(
  tree: ReturnType<typeof TestRenderer.create>,
  label: string,
): Promise<void> {
  const candidates: { props: Record<string, unknown>; children?: unknown[] }[] =
    [];
  tree.root.findAll((node) => {
    const props = node.props as { onPress?: unknown };
    if (props && typeof props.onPress === "function") candidates.push(node);
    return false;
  });
  const target =
    candidates.find((node) =>
      collectStringsFromInstance(node).includes(label),
    ) ?? candidates[0];
  expect(target).toBeDefined();
  await act(async () => {
    (target.props as { onPress?: () => void }).onPress?.();
    await flushPromises();
  });
}

function collectStringsFromInstance(
  node: { children?: unknown[]; props?: Record<string, unknown> } | string,
  out: string[] = [],
): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  const children = (node.children ?? []) as (
    { children?: unknown[]; props?: Record<string, unknown> } | string
  )[];
  for (const child of children) collectStringsFromInstance(child, out);
  return out;
}

function renderedFieldValues(
  tree: ReturnType<typeof TestRenderer.create>,
): string[] {
  return tree.root
    .findAll((n) => (n as { type?: unknown }).type === FieldRenderer)
    .map((n) => (n.props as { value?: string }).value ?? "");
}

function editableOf(
  tree: ReturnType<typeof TestRenderer.create>,
  index: number,
): boolean | undefined {
  const nodes = tree.root.findAll(
    (n) => (n as { type?: unknown }).type === FieldRenderer,
  );
  const props = nodes[index]?.props as { editable?: boolean } | undefined;
  return props?.editable;
}

async function changePoleId(
  tree: ReturnType<typeof TestRenderer.create>,
  text: string,
): Promise<void> {
  const nodes = tree.root.findAll(
    (n) => (n as { type?: unknown }).type === FieldRenderer,
  );
  const node = nodes[0]!;
  await act(async () => {
    await (node.props as { onChange: (t: string) => Promise<void> }).onChange(
      text,
    );
    await new Promise((resolve) => setTimeout(resolve, 620));
  });
}

async function setPoleText(
  tree: ReturnType<typeof TestRenderer.create>,
  text: string,
): Promise<void> {
  const nodes = tree.root.findAll(
    (n) => (n as { type?: unknown }).type === FieldRenderer,
  );
  const node = nodes[0]!;
  await act(async () => {
    await (node.props as { onChange: (t: string) => Promise<void> }).onChange(
      text,
    );
    await flushPromises();
  });
}

async function typePoleRapid(
  tree: ReturnType<typeof TestRenderer.create>,
  texts: string[],
): Promise<void> {
  const nodes = tree.root.findAll(
    (n) => (n as { type?: unknown }).type === FieldRenderer,
  );
  const node = nodes[0]!;
  await act(async () => {
    for (const text of texts) {
      await (node.props as { onChange: (t: string) => Promise<void> }).onChange(
        text,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 620));
  });
}

async function flushSettle(
  tree: ReturnType<typeof TestRenderer.create>,
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
    expect(
      tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer)
        .length,
    ).toBe(1);
    expect(dialogVisible(tree)).toBe(false);
  });

  it("saves the pole id directly after the settled check and skips the dialog when the inspection has no photos", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderComponent({ existing: true });
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
    expect(dialogVisible(tree)).toBe(false);
  });

  it("alerts and reverts the field when the direct save fails", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    repo.updatePoleIdDirectSave.mockRejectedValue(new Error("boom"));
    const tree = await renderComponent({ existing: true });
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(Alert.alert).toHaveBeenCalledWith(
      "Save Failed",
      expect.stringContaining("Could not update the Site ID"),
    );
    expect(setPoleId).toHaveBeenCalledWith("OLD");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("direct-saves even when photos exist â€” typing never opens the rename dialog", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderComponent({ existing: true });
    await changePoleId(tree, "SIK101");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "SIK101");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("direct-saves when clearing the pole id and no photos exist", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderComponent({ existing: true });
    await changePoleId(tree, "");

    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "");
    expect(dialogVisible(tree)).toBe(false);
  });

  it("settles rapid typing into a single duplicate check + save of the latest value", async () => {
    const tree = await renderComponent({ existing: true });
    await typePoleRapid(tree, ["1", "1001"]);

    expect(repo.getInspectionByPoleId).toHaveBeenCalledTimes(1);
    expect(repo.getInspectionByPoleId).toHaveBeenCalledWith("1001");
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(42, 1, "1001");
  });

  it("ignores a stale settled result if the Site ID changed again mid-check", async () => {
    let resolveFirst!: (
      row: { InspectionID: number; PoleID: string; Status: string } | null,
    ) => void;
    repo.getInspectionByPoleId.mockImplementation((poleId: string) =>
      poleId === "1001"
        ? new Promise((res) => {
            resolveFirst = res;
          })
        : Promise.resolve(null),
    );
    const tree = await renderComponent({ existing: true });

    // First settled check for "1001" parks on the duplicate query.
    await typePoleRapid(tree, ["1001"]);

    await act(async () => {
      await setPoleText(tree, "1002");
      // The stale "1001" result lands as a duplicate AFTER the user moved on â€”
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
      expect.stringContaining("already exists"),
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

  it("creates a draft lazily after a unique Site ID passes the duplicate check, without persisting the Site ID", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ ensureDraft, releaseAbandonedDraft });

    await changePoleId(tree, "SIK101");

    expect(ensureDraft).toHaveBeenCalledTimes(1);
    // CREATE entry never persists the Site ID â€” it stays in React state until
    // checkIdentityBeforeSave commits it at Save.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
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
      ([title]: string[]) => title === "Inspection Already Exists",
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
      ([title]: string[]) => title === "Inspection Already Exists",
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

describe("GeneralInformation duplicate Site ID -> Cancel preserves all data", () => {
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
    tree: ReturnType<typeof TestRenderer.create>,
  ): Promise<void> {
    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists",
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

  it("TEST 1/5: Cancel preserves the Site ID and all other field values", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");
    await pressDuplicateCancel(tree);

    // Site ID field keeps "SIK101"; the division field (default "Sikar") is untouched.
    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("SIK101");
    expect(values[1]).toBe("Sikar");

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
    // CREATE entry never persists the Site ID â€” only the draft row is created.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    // The old duplicate must never have been persisted.
    const allCalls = [
      ...(repo.updatePoleIdDirectSave as jest.Mock).mock.calls,
      ...(repo.saveFieldValue as jest.Mock).mock.calls,
      ...(repo.updateInspectionPoleId as jest.Mock).mock.calls,
    ].map((c) => String(c[2] ?? c[1] ?? ""));
    expect(allCalls).not.toContain("SIK101");
  });

  it("TEST 3: pending settled duplicate save is cancelled - duplicate value stays on screen after Cancel", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const tree = await renderComponent({ ensureDraft });

    await changePoleId(tree, "SIK101");

    // Press Cancel, then flush all pending async work.
    await pressDuplicateCancel(tree);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("SIK101");
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "SIK101",
    );
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "SIK101",
    );
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalledWith(
      expect.anything(),
      "SIK101",
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
    // Cancel dismisses the alert only â€” the Site ID stays on screen.
    expect(renderedFieldValues(tree)[0]).toBe("SIK101");
  });

  it("TEST 6 (Edit Existing only): Edit Existing from the duplicate alert remains unchanged", async () => {
    const ensureDraft = jest.fn().mockResolvedValue(101);
    const releaseAbandonedDraft = jest.fn().mockResolvedValue(undefined);
    const tree = await renderComponent({ ensureDraft, releaseAbandonedDraft });

    await changePoleId(tree, "SIK101");

    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists",
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
      ...(ctxState.poleId !== undefined
        ? { poleId: ctxState.poleId }
        : { poleId: "" }),
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
    tree: ReturnType<typeof TestRenderer.create>,
  ): Promise<void> {
    const call = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists",
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

  it("TEST 1: Cancel preserves every form value (regression)", async () => {
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
      ([title]: string[]) => title === "Inspection Already Exists",
    );
    const cancelBtn = (
      call![2] as { text: string; onPress: () => void }[]
    ).find((b) => b.text === "Cancel");
    await act(async () => {
      cancelBtn!.onPress();
      await flushPromises();
    });

    // Pole ID stays on screen; every other value preserved.
    const values = renderedFieldValues(tree);
    expect(values[0]).toBe("SIK201");
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
          : {}) as Record<string, string>,
      ),
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
          : {}) as Record<string, string>,
      ),
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
    // CREATE entry never persists the Site ID â€” only the draft row is created.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    // The abandoned inspection's values are never loaded for the new one.
    const loadedIds = (repo.getInspectionValues as jest.Mock).mock.calls.map(
      (c) => c[0],
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
    repo.getInspectionValues.mockImplementation((id: number | null) =>
      id != null
        ? new Promise((res) => {
            resolveOld = res;
          })
        : Promise.resolve({}),
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
    mockContext({
      inspectionId: 42,
      project: { ...mockProject, DivisionName: "", DistrictName: "" },
    });
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

  async function renderWithRef(): Promise<
    ReturnType<typeof TestRenderer.create>
  > {
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
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
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
    mockContext({
      inspectionId: 42,
      project: { ...mockProject, DistrictName: "" },
    });
    repo.getInspectionValues.mockResolvedValue({});
    const tree = await renderWithRef();

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "cancelled" });
    expect(dialogVisible(tree)).toBe(false);
  });

  it("returns duplicate and leaves on-screen and staged identity untouched (duplicate value stays visible)", async () => {
    repo.getInspectionByPoleId.mockImplementation((poleId: string) =>
      poleId === "SIK101"
        ? Promise.resolve({
            InspectionID: 99,
            PoleID: "SIK101",
            Status: "draft",
          })
        : Promise.resolve(null),
    );
    const tree = await renderWithRef();

    // Simulate a stale staged value captured by an earlier settled typing save
    // (the real updatePoleIdDirectSave stages the pole into the session, which
    // is mocked out here â€” so seed the session directly).
    InspectionEditSessionState.stagePoleId("SOKAY");
    InspectionEditSessionState.stageFieldValue(poleField.FieldID, "SOKAY");

    // Then a duplicate is typed and the user saves inside the debounce window.
    await setPoleText(tree, "SIK101");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "duplicate", duplicatePoleId: "SIK101" });
    // The duplicate alert is deferred to the caller (new.tsx) â€” never here.
    expect(Alert.alert).not.toHaveBeenCalled();
    // The duplicate value must never be written to the database.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalledWith(
      42,
      poleField.FieldID,
      "SIK101",
    );
    // Rename must never execute when a duplicate is found at save time.
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();

    // The on-screen value and staged identity are left untouched â€” the user
    // can see the duplicate and edit it.
    expect(setPoleId).toHaveBeenLastCalledWith("SIK101");
    expect(InspectionEditSessionState.getStagedPoleId()).toBe("SOKAY");
    expect(
      InspectionEditSessionState.getStagedFieldValues().get(poleField.FieldID),
    ).toBe("SOKAY");

    // The settle-cancelled typing timer must never fire afterwards.
    await flushSettle(tree);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalledWith(
      42,
      poleField.FieldID,
      "SIK101",
    );
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

    expect(decision).toEqual({
      type: "proceed",
      renameFiles: true,
      updateReports: true,
    });
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
    expect(
      InspectionEditSessionState.getStagedFieldValues().get(blockField.FieldID),
    ).toBe("Old Block");
    expect(
      InspectionEditSessionState.getStagedFieldValues().get(
        districtField.FieldID,
      ),
    ).toBe("Sikar");

    await flushSettle(tree);
  });

  it("cancelling the dialog preserves the on-screen and staged identity", async () => {
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
    expect(dialogVisible(tree)).toBe(false);
    // Cancel only declines the rename â€” it must never erase the user's edits.
    expect(setPoleId).toHaveBeenLastCalledWith("SIK101");
    expect(renderedFieldValues(tree)[0]).toBe("SIK101");
    const staged = InspectionEditSessionState.getStagedFieldValues();
    expect(staged.get(poleField.FieldID)).toBe("SIK101");
    expect(staged.get(blockField.FieldID)).toBe("Old Block");
    expect(InspectionEditSessionState.getStagedPoleId()).toBe("SIK101");
    expect(InspectionEditSessionState.getPendingRename()).toBeNull();
    // No rename ever executes on cancel â€” photos stay untouched.
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();

    await flushSettle(tree);
  });

  it("cancelling the dialog preserves a changed Block and District in form and session", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderWithRef();
    // Change the Block (index 2) and the Site ID â€” both are identity fields.
    const blockNode = tree.root.findAll(
      (node) => (node as { type?: unknown }).type === FieldRenderer,
    )[2]!;
    await act(async () => {
      await (
        blockNode.props as { onChange: (t: string) => Promise<void> }
      ).onChange("New Block");
      await flushPromises();
    });
    await setPoleText(tree, "SIK101");

    let promise!: Promise<IdentityRenameDecision>;
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);

    await pressButton(tree, "Cancel");
    await act(async () => {
      await promise;
    });

    const staged = InspectionEditSessionState.getStagedFieldValues();
    // Block must retain the user's edit, not revert to "Old Block".
    expect(staged.get(blockField.FieldID)).toBe("New Block");
    expect(staged.get(districtField.FieldID)).toBe("Sikar");
    expect(staged.get(poleField.FieldID)).toBe("SIK101");
    expect(InspectionEditSessionState.getStagedPoleId()).toBe("SIK101");
    expect(InspectionEditSessionState.getPendingRename()).toBeNull();
    expect(renderedFieldValues(tree)[2]).toBe("New Block");

    await flushSettle(tree);
  });

  it("re-offers the rename dialog when the user saves again after cancelling", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderWithRef();
    await setPoleText(tree, "SIK101");

    // First save â†’ cancel.
    let promise!: Promise<IdentityRenameDecision>;
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);
    await pressButton(tree, "Cancel");
    await act(async () => {
      expect(await promise).toEqual({ type: "cancelled" });
    });

    // Second save re-detects the change and offers the rename again.
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);

    await pressButton(tree, "Rename");
    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await promise;
    });
    expect(decision).toEqual({
      type: "proceed",
      renameFiles: true,
      updateReports: true,
    });

    await flushSettle(tree);
  });

  it("does not rename photos or files when the dialog is cancelled", async () => {
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
    await act(async () => {
      await promise;
    });

    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
    await flushSettle(tree);
  });

  it("shows the rename dialog when the persisted Block is empty and the Site ID changed", async () => {
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      district: "Sikar",
      block: "",
    });
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
    expect(dialogText).toContain("SIK101");

    await pressButton(tree, "Cancel");
    await act(async () => {
      await promise;
    });

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
    repo.getFieldsByKey.mockResolvedValue([
      dateField,
      divisionField,
      districtField,
      inspectorField,
    ]);
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
    repo.getFieldsByKey.mockResolvedValue([
      dateField,
      divisionField,
      districtField,
      inspectorField,
      poleField,
    ]);
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
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      dateField,
      divisionField,
      districtField,
      inspectorField,
    ]);
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

describe("GeneralInformation NEW inspection save-time identity rename", () => {
  const ref = React.createRef<GeneralInformationHandle>();

  async function renderNew(): Promise<ReturnType<typeof TestRenderer.create>> {
    return renderComponent({
      existing: false,
      ref,
      ensureDraft: jest.fn().mockResolvedValue(101),
    });
  }

  async function invokeConfirm(): Promise<IdentityRenameDecision> {
    let decision: IdentityRenameDecision = { type: "no-change" };
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });
    return decision;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    await InspectionEditSession.discard();
    mockContext({ inspectionId: 101 });
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "P1",
      district: "Sikar",
      block: "B1",
    });
    repo.getInspectionPoleId.mockResolvedValue("P1");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
    mockRenameService.renamePoleId.mockReset();
    mockRenameService.renamePoleId.mockResolvedValue({
      renamedFiles: 1,
      updatedRecords: 1,
      missingFiles: 0,
    });
  });

  it("first CREATE save commits the typed Site ID without a rename dialog even when photos exist", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderNew();
    await changePoleId(tree, "P2");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    // The Site ID was never persisted during entry, so the first save is the
    // authoritative commit. Filenames already carry the live token â€” no rename.
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "P2",
    );
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });

  it("first CREATE save never opens a rename dialog nor reverts the typed Site ID", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderNew();
    await changePoleId(tree, "P2");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    // Nothing was persisted during entry, so there is nothing to revert â€” the
    // typed Site ID stays on screen and is committed as the first save.
    expect(renderedFieldValues(tree)[0]).toBe("P2");
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "P2",
    );
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });

  it("commits the row's existing Site ID without a dialog when the identity was never changed during entry", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    const tree = await renderNew();

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
    // The persisted identity starts empty for a CREATE draft; the first save
    // commits the row's existing Site ID (idempotent for the captured value).
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "P1",
    );
  });

  it("returns no-rename when the identity changed but no photos exist", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderNew();
    await changePoleId(tree, "P2");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });

  it("persists the latest Site ID when save happens inside the debounce window (Bug 2 regression)", async () => {
    photoRepo.getByInspection.mockResolvedValue([]);
    const tree = await renderNew();
    // Type without waiting for the 500ms settled save to fire.
    await setPoleText(tree, "P2");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    // The settle cancelled the pending typing save, so checkIdentityBeforeSave
    // must persist P2 itself â€” otherwise the database keeps the stale P1.
    expect(repo.updatePoleIdDirectSave).toHaveBeenLastCalledWith(
      101,
      poleField.FieldID,
      "P2",
    );
  });

  it("returns duplicate and leaves the new Site ID on screen when the Site ID already exists at save time", async () => {
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);
    repo.getInspectionByPoleId
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ InspectionID: 99, PoleID: "P2", Status: "draft" });
    const tree = await renderNew();
    await changePoleId(tree, "P2");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "duplicate", duplicatePoleId: "P2" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
    // The duplicate value is never persisted, reverting is skipped, and the
    // value stays on screen so the user can edit it.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(setPoleId).toHaveBeenLastCalledWith("P2");
    expect(renderedFieldValues(tree)[0]).toBe("P2");
  });
});

describe("GeneralInformation CREATE photo identity rename", () => {
  const ref = React.createRef<GeneralInformationHandle>();

  async function renderCreate(): Promise<
    ReturnType<typeof TestRenderer.create>
  > {
    return renderComponent({
      existing: false,
      ref,
      ensureDraft: jest.fn().mockResolvedValue(101),
    });
  }

  async function confirmAndRename(
    tree: ReturnType<typeof TestRenderer.create>,
  ): Promise<IdentityRenameDecision> {
    let pending!: Promise<IdentityRenameDecision>;
    await act(async () => {
      pending = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);
    await pressButton(tree, "Rename");
    return pending;
  }

  async function changeBlock(
    tree: ReturnType<typeof TestRenderer.create>,
    value: string,
  ): Promise<void> {
    const blockNode = tree.root.findAll(
      (node) => (node as { type?: unknown }).type === FieldRenderer,
    )[2]!;
    await act(async () => {
      await (
        blockNode.props as { onChange: (text: string) => Promise<void> }
      ).onChange(value);
      await flushPromises();
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    await InspectionEditSession.discard();
    mockContext({ inspectionId: 101 });
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "SIK001",
      district: "Sikar",
      block: "SIKAR",
    });
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    repo.saveFieldValue.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
    mockRenameService.renamePoleId.mockResolvedValue({
      renamedFiles: 1,
      updatedRecords: 1,
      missingFiles: 0,
    });
  });

  afterEach(async () => {
    await InspectionEditSession.discard();
    jest.restoreAllMocks();
    InspectionLiveValues.reset();
  });

  it.each([
    ["Site ID", "SIKAR", "SIK001", "SIKAR", "SIK002"],
    ["Block", "SIKAR", "SIK001", "JAIPUR", "SIK001"],
    ["both", "SIKAR", "SIK001", "JAIPUR", "SIK002"],
  ])(
    "renames on CREATE when %s changes",
    async (_label, oldBlock, oldPoleId, newBlock, newPoleId) => {
      photoRepo.getByInspection.mockResolvedValue([
        makeIdentityPhoto(1, oldBlock, oldPoleId),
      ]);
      const tree = await renderCreate();
      if (newBlock !== oldBlock) await changeBlock(tree, newBlock);
      await changePoleId(tree, newPoleId);

      const decision = await confirmAndRename(tree);

      expect(decision).toEqual({
        type: "proceed",
        renameFiles: true,
        updateReports: true,
      });
      expect(mockRenameService.renamePoleId).toHaveBeenCalledWith(
        101,
        oldPoleId,
        newPoleId,
        { renameFiles: true, updateReports: true },
        {
          oldDistrict: "Sikar",
          oldBlock,
          newDistrict: "Sikar",
          newBlock,
        },
      );
      expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
      expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
        101,
        poleField.FieldID,
        newPoleId,
      );
    },
  );

  it("does not rename when CREATE Block and Site ID both match the captured photo", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "SIKAR", "SIK001"),
    ]);
    const tree = await renderCreate();
    await changePoleId(tree, "SIK001");

    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
  });

  it("renames multiple photos only when all captured identities agree", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "SIKAR", "SIK001"),
      makeIdentityPhoto(2, "SIKAR", "SIK001"),
    ]);
    const tree = await renderCreate();
    await changePoleId(tree, "SIK002");

    await confirmAndRename(tree);

    expect(mockRenameService.renamePoleId).toHaveBeenCalledWith(
      101,
      "SIK001",
      "SIK002",
      { renameFiles: true, updateReports: true },
      expect.objectContaining({ oldBlock: "SIKAR", newBlock: "SIKAR" }),
    );
  });

  it("does not guess when CREATE photos contain conflicting identities", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "SIKAR", "SIK001"),
      makeIdentityPhoto(2, "JAIPUR", "SIK001"),
    ]);
    const tree = await renderCreate();
    await changePoleId(tree, "SIK002");

    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });

  it("does not guess when CREATE photos carry conflicting old Site ID tokens", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "SIKAR", "SIK001"),
      makeIdentityPhoto(2, "SIKAR", "SIK003"),
    ]);
    const tree = await renderCreate();
    await changePoleId(tree, "SIK002");

    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });

  it("shows the rename dialog on CREATE when Block is empty and only the Site ID changed", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "NA", "SIK001"),
    ]);
    const tree = await renderCreate();
    await changeBlock(tree, "");
    await changePoleId(tree, "SIK002");

    const decision = await confirmAndRename(tree);

    expect(decision).toEqual({
      type: "proceed",
      renameFiles: true,
      updateReports: true,
    });
    expect(mockRenameService.renamePoleId).toHaveBeenCalledWith(
      101,
      "SIK001",
      "SIK002",
      { renameFiles: true, updateReports: true },
      {
        oldDistrict: "Sikar",
        oldBlock: "",
        newDistrict: "Sikar",
        newBlock: "",
      },
    );
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "SIK002",
    );
  });

  it("does not rename on CREATE when Block is empty and the Site ID is unchanged", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "NA", "SIK001"),
    ]);
    const tree = await renderCreate();
    await changeBlock(tree, "");
    await changePoleId(tree, "SIK001");

    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "SIK001",
    );
  });

  it("renames multiple photos with an empty Block when all captured identities agree", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "NA", "SIK001"),
      makeIdentityPhoto(2, "NA", "SIK001"),
    ]);
    const tree = await renderCreate();
    await changeBlock(tree, "");
    await changePoleId(tree, "SIK002");

    const decision = await confirmAndRename(tree);

    expect(decision).toEqual({
      type: "proceed",
      renameFiles: true,
      updateReports: true,
    });
    expect(mockRenameService.renamePoleId).toHaveBeenCalledWith(
      101,
      "SIK001",
      "SIK002",
      { renameFiles: true, updateReports: true },
      expect.objectContaining({ oldBlock: "", newBlock: "" }),
    );
    expect(mockRenameService.renamePoleId).toHaveBeenCalledTimes(1);
  });

  it("does not guess on CREATE when empty-Block photos carry conflicting Site ID tokens", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "NA", "SIK001"),
      makeIdentityPhoto(2, "NA", "SIK003"),
    ]);
    const tree = await renderCreate();
    await changeBlock(tree, "");
    await changePoleId(tree, "SIK002");

    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });

  it("does not rename when the captured filename carries no usable Site ID", async () => {
    photoRepo.getByInspection.mockResolvedValue([
      makeIdentityPhoto(1, "NA", "NA"),
    ]);
    const tree = await renderCreate();
    await changeBlock(tree, "");
    await changePoleId(tree, "SIK002");

    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await ref.current!.confirmIdentityRename();
    });

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });
});

describe("GeneralInformation fetchCurrentLocation â€” GPS button", () => {
  const gpsField: InspectionField = {
    FieldID: 50,
    SectionID: 1,
    FieldName: "GPS Coordinates",
    FieldKey: "gps",
    FieldType: "text",
    Placeholder: null,
    DefaultValue: null,
    HelpText: null,
    ValidationRule: null,
    DisplayOrder: 50,
    IsRequired: 0,
    IsVisible: 1,
    IsActive: 1,
    CreatedAt: "2026-01-01T00:00:00",
    UpdatedAt: "2026-01-01T00:00:00",
  };

  const locationField: InspectionField = {
    FieldID: 51,
    SectionID: 1,
    FieldName: "Location",
    FieldKey: "location",
    FieldType: "text",
    Placeholder: null,
    DefaultValue: null,
    HelpText: null,
    ValidationRule: null,
    DisplayOrder: 51,
    IsRequired: 0,
    IsVisible: 1,
    IsActive: 1,
    CreatedAt: "2026-01-01T00:00:00",
    UpdatedAt: "2026-01-01T00:00:00",
  };

  const getCurrentLocationMock = jest.requireMock("@/src/utils/location")
    .getCurrentLocation as jest.Mock;
  const reverseGeocodeMock = jest.requireMock("@/src/utils/geo")
    .reverseGeocode as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    InspectionLiveValues.reset();
    mockContext({ inspectionId: 42 });
    repo.getFieldsByKey.mockResolvedValue([poleField, gpsField, locationField]);
    repo.getInspectionValues.mockResolvedValue({});
    repo.getInspectionPoleId.mockResolvedValue("OLD");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  afterEach(() => {
    InspectionLiveValues.reset();
    jest.restoreAllMocks();
  });

  it("saves gps coordinates and the selected address components on success", async () => {
    getCurrentLocationMock.mockResolvedValue({
      latitude: 34.05,
      longitude: -118.25,
    });
    reverseGeocodeMock.mockResolvedValue({
      address: {
        streetNumber: "123",
        street: "Main St",
        district: "Downtown",
        city: "Los Angeles",
        region: "California",
        postalCode: "90001",
        country: "United States",
      },
      formatted:
        "123 Main St, Downtown, Los Angeles, California, 90001, United States",
    });
    const tree = await renderComponent();

    await pressButton(tree, "Get Current Location");
    await act(async () => {
      await flushPromises();
    });

    expect(repo.saveFieldValue).toHaveBeenCalledWith(
      42,
      gpsField.FieldID,
      "34.050000, -118.250000",
    );
    expect(repo.saveFieldValue).toHaveBeenCalledWith(
      42,
      locationField.FieldID,
      "123, Downtown, Los Angeles, California",
    );
    expect(getCurrentLocationMock).toHaveBeenCalledTimes(1);
    expect(reverseGeocodeMock).toHaveBeenCalledWith(34.05, -118.25);
    expect(
      InspectionLiveValues.getLiveFieldValues()?.get(gpsField.FieldID),
    ).toBe("34.050000, -118.250000");
    expect(
      InspectionLiveValues.getLiveFieldValues()?.get(locationField.FieldID),
    ).toBe("123, Downtown, Los Angeles, California");
  });

  it("does not save the address field when reverse geocoding returns no usable components", async () => {
    getCurrentLocationMock.mockResolvedValue({
      latitude: 34.05,
      longitude: -118.25,
    });
    reverseGeocodeMock.mockResolvedValue({ address: {}, formatted: "" });
    const tree = await renderComponent();

    await pressButton(tree, "Get Current Location");
    await act(async () => {
      await flushPromises();
    });

    expect(repo.saveFieldValue).toHaveBeenCalledWith(
      42,
      gpsField.FieldID,
      "34.050000, -118.250000",
    );
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      42,
      locationField.FieldID,
      expect.anything(),
    );
  });

  it("does nothing when no location fix is available", async () => {
    getCurrentLocationMock.mockResolvedValue(null);
    const tree = await renderComponent();

    await pressButton(tree, "Get Current Location");

    expect(reverseGeocodeMock).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(InspectionLiveValues.getLiveFieldValues()).toBeUndefined();
  });

  it("does nothing when reverse geocoding throws (gps saved, address skipped)", async () => {
    getCurrentLocationMock.mockResolvedValue({
      latitude: 34.05,
      longitude: -118.25,
    });
    reverseGeocodeMock.mockRejectedValue(new Error("network"));
    const tree = await renderComponent();

    await pressButton(tree, "Get Current Location");
    await act(async () => {
      await flushPromises();
    });

    expect(repo.saveFieldValue).toHaveBeenCalledWith(
      42,
      gpsField.FieldID,
      "34.050000, -118.250000",
    );
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      42,
      locationField.FieldID,
      expect.anything(),
    );
  });

  it("cancels an in-flight fetch when the component unmounts (stale seq guard)", async () => {
    let resolveLocation!: (value: {
      latitude: number;
      longitude: number;
    }) => void;
    getCurrentLocationMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLocation = resolve;
      }),
    );
    const tree = await renderComponent();

    await pressButton(tree, "Get Current Location");
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      resolveLocation({ latitude: 34.05, longitude: -118.25 });
      await flushPromises();
    });

    expect(reverseGeocodeMock).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(InspectionLiveValues.getLiveFieldValues()).toBeUndefined();
  });
});

describe("GeneralInformation checking indicator lifecycle", () => {
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hides the checking indicator when an inspection switch bumps the version mid-check (must not orphan the indicator)", async () => {
    let resolveFirst!: (
      row: { InspectionID: number; PoleID: string; Status: string } | null,
    ) => void;
    repo.getInspectionByPoleId.mockImplementation(
      () =>
        new Promise((res) => {
          resolveFirst = res;
        }),
    );
    let tree!: ReturnType<typeof TestRenderer.create>;
    tree = await renderComponent();

    // First settled check for "SIK101" parks on the duplicate query.
    await act(async () => {
      await (
        tree.root.findAll(
          (n) => (n as { type?: unknown }).type === FieldRenderer,
        )[0].props as { onChange: (t: string) => Promise<void> }
      ).onChange("SIK101");
      await new Promise((resolve) => setTimeout(resolve, 620));
    });
    expect(collectStrings(tree.root)).toContain("Checking SITE ID...");

    // Mirrors new.tsx adopting a lazy draft mid-check: inspectionId changes via
    // context, which tears down the [inspectionId] effect (version bump).
    await act(async () => {
      mockContext({ inspectionId: 101 });
      tree.update(<GeneralInformation existing={false} />);
      await flushPromises();
    });

    // The parked check resolves AFTER the switch. It must not leave the
    // indicator stuck â€” the check is stale and must not control the UI.
    await act(async () => {
      resolveFirst(null);
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 620));
    });

    expect(collectStrings(tree.root)).not.toContain("Checking SITE ID...");
  });

  it("hides the checking indicator when the new-inspection duplicate check completes (no draft created)", async () => {
    repo.getInspectionByPoleId.mockResolvedValue({
      InspectionID: 99,
      PoleID: "ABC123",
      Status: "draft",
    });
    const tree = await renderComponent();

    await changePoleId(tree, "ABC123");

    const duplicateCall = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]: string[]) => title === "Inspection Already Exists",
    );
    expect(duplicateCall).toBeDefined();
    expect(String(duplicateCall[1])).toContain("ABC123");
    expect(collectStrings(tree.root)).not.toContain("Checking SITE ID...");
  });
});

describe("GeneralInformation Bug 1 & Bug 2 regressions (block + persisted identity)", () => {
  const ref = React.createRef<GeneralInformationHandle>();
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
      ...(ctxState.poleId !== undefined
        ? { poleId: ctxState.poleId }
        : { poleId: "" }),
    }));
  }

  function ensureDraftFor(id: number): jest.Mock<Promise<number>, never[]> {
    return jest.fn(async () => {
      statefulSetInspectionId(id);
      return id;
    }) as unknown as jest.Mock<Promise<number>, never[]>;
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
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
    mockRenameService.renamePoleId.mockReset();
  });

  afterEach(async () => {
    await InspectionEditSession.discard();
    jest.restoreAllMocks();
    InspectionLiveValues.reset();
  });

  it("keeps a Block typed BEFORE the draft exists when the draft re-init reads an empty DB (Bug 1 regression)", async () => {
    statefulContext(null);
    const ensureDraft = ensureDraftFor(101);
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({});

    const tree = await renderComponent({ existing: false, ensureDraft, ref });

    // User types Block before any draft exists â€” it lives only in state.
    const nodes = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === FieldRenderer,
    );
    await act(async () => {
      await (
        nodes[2].props as { onChange: (t: string) => Promise<void> }
      ).onChange("Sikar");
    });
    expect(renderedFieldValues(tree)[2]).toBe("Sikar");

    // Typing a Site ID lazily creates the draft but never persists the pole â€”
    // it stays in React state until Save (root-cause fix).
    await changePoleId(tree, "SIK-BLOCK1");
    expect(ensureDraft).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();

    // new.tsx adopts the lazily-created draft: the context inspectionId flips to
    // 101, the [inspectionId] effect re-runs init, and the DB read races the
    // just-written values (stale empty read = block not yet persisted).
    await act(async () => {
      tree.update(
        <GeneralInformation
          existing={false}
          ensureDraft={ensureDraft}
          ref={ref}
        />,
      );
      await flushPromises();
    });

    const after = renderedFieldValues(tree);
    expect(after[2]).toBe("Sikar");
    // The merged, not the default, Block reaches the draft row.
    expect(repo.saveFieldValue).toHaveBeenCalledWith(
      101,
      blockField.FieldID,
      "Sikar",
    );
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      101,
      blockField.FieldID,
      "Block A",
    );
  });

  it("routes a Block typed AFTER the draft exists through the debounced scheduler, not a direct write", async () => {
    statefulContext(null);
    const ensureDraft = ensureDraftFor(101);
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({});

    const tree = await renderComponent({ existing: false, ensureDraft, ref });
    await changePoleId(tree, "SIK-BLOCK1");

    // Adopt the draft (inspectionId 101) so the form no longer targets null.
    await act(async () => {
      tree.update(
        <GeneralInformation
          existing={false}
          ensureDraft={ensureDraft}
          ref={ref}
        />,
      );
      await flushPromises();
    });
    repo.saveFieldValue.mockClear();
    repo.scheduleFieldValueSave.mockClear();

    const nodes = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === FieldRenderer,
    );
    await act(async () => {
      await (
        nodes[2].props as { onChange: (t: string) => Promise<void> }
      ).onChange("NewBlock");
    });

    expect(repo.scheduleFieldValueSave).toHaveBeenCalledWith(
      101,
      blockField.FieldID,
      "NewBlock",
    );
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      101,
      blockField.FieldID,
      "NewBlock",
    );
  });

  it.each(["empty-first", "written", "stale-after-write"] as const)(
    "the first CREATE save commits the typed identity without a false rename when the DB read resolves %s (Bug 2)",
    async (ordering) => {
      statefulContext(null);
      const ensureDraft = ensureDraftFor(101);
      repo.getFieldsByKey.mockResolvedValue([
        poleField,
        districtField,
        blockField,
      ]);
      repo.getInspectionPoleId.mockResolvedValue("");
      repo.getInspectionByPoleId.mockResolvedValue(null);
      mockRenameService.renamePoleId.mockResolvedValue({
        renamedFiles: 1,
        updatedRecords: 1,
        missingFiles: 0,
      });
      photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);

      let resolveStale!: (v: Record<string, string>) => void;
      if (ordering === "written") {
        repo.getInspectionValues.mockResolvedValue({ pole_id: "SIK101" });
      } else if (ordering === "empty-first") {
        repo.getInspectionValues.mockResolvedValue({});
      } else {
        repo.getInspectionValues.mockImplementation(
          () =>
            new Promise<Record<string, string>>((resolve) => {
              resolveStale = resolve;
            }),
        );
      }

      const tree = await renderComponent({ existing: false, ensureDraft, ref });
      await changePoleId(tree, "SIK101");
      expect(ensureDraft).toHaveBeenCalledTimes(1);
      // CREATE entry never persists â€” the typed identity lives only in state.
      expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();

      if (ordering === "stale-after-write") {
        // Adopt the draft; the re-init read parks. Release it with an EMPTY
        // snapshot â€” the latest typed identity must survive the empty read.
        await act(async () => {
          tree.update(
            <GeneralInformation
              existing={false}
              ensureDraft={ensureDraft}
              ref={ref}
            />,
          );
        });
        await act(async () => {
          resolveStale({});
          await flushPromises();
        });
      } else {
        await act(async () => {
          tree.update(
            <GeneralInformation
              existing={false}
              ensureDraft={ensureDraft}
              ref={ref}
            />,
          );
          await flushPromises();
        });
      }

      const decision = await invokeConfirm();

      expect(decision).toEqual({ type: "no-rename" });
      expect(dialogVisible(tree)).toBe(false);
      expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
      // Exactly one authoritative commit of the typed identity at save time.
      expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
      expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
        101,
        poleField.FieldID,
        "SIK101",
      );
    },
  );

  it("a stale empty read after the draft is adopted neither reverts the typed Site ID nor re-writes it (regression)", async () => {
    statefulContext(null);
    const ensureDraft = ensureDraftFor(101);
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    let resolveStale!: (v: Record<string, string>) => void;
    repo.getInspectionValues.mockImplementation(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveStale = resolve;
        }),
    );

    const tree = await renderComponent({ existing: false, ensureDraft, ref });
    await changePoleId(tree, "P9");
    // CREATE entry persisted nothing.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();

    // Re-init parks on the read; the stale empty snapshot lands after entry.
    await act(async () => {
      tree.update(
        <GeneralInformation
          existing={false}
          ensureDraft={ensureDraft}
          ref={ref}
        />,
      );
    });
    await act(async () => {
      resolveStale({});
      await flushPromises();
    });

    expect(renderedFieldValues(tree)[0]).toBe("P9");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    // The first save commits the typed Site ID exactly once.
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "P9",
    );
  });

  it("EDIT: an existing inspection whose Site ID changed with photos still prompts and executes the rename", async () => {
    mockContext({ inspectionId: 42 });
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      district: "Sikar",
      block: "Old Block",
    });
    repo.getInspectionPoleId.mockResolvedValue("OLD");
    photoRepo.getByInspection.mockResolvedValue([makePhoto(1)]);

    const tree = await renderComponent({ existing: true, ref });
    await changePoleId(tree, "SIK101");

    let promise!: Promise<IdentityRenameDecision>;
    await act(async () => {
      promise = ref.current!.confirmIdentityRename();
      await flushPromises();
    });
    expect(dialogVisible(tree)).toBe(true);

    await pressButton(tree, "Rename");
    let decision!: IdentityRenameDecision;
    await act(async () => {
      decision = await promise;
    });

    expect(decision).toEqual({
      type: "proceed",
      renameFiles: true,
      updateReports: true,
    });
    expect(mockRenameService.renamePoleId).toHaveBeenCalledWith(
      42,
      "OLD",
      "SIK101",
      { renameFiles: true, updateReports: true },
      {
        oldDistrict: "Sikar",
        oldBlock: "Old Block",
        newDistrict: "Sikar",
        newBlock: "Old Block",
      },
    );
  });

  it("EDIT: an existing inspection whose Site ID changed with no photos never opens the dialog", async () => {
    mockContext({ inspectionId: 42 });
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({
      pole_id: "OLD",
      district: "Sikar",
      block: "Old Block",
    });
    repo.getInspectionPoleId.mockResolvedValue("OLD");
    photoRepo.getByInspection.mockResolvedValue([]);

    const tree = await renderComponent({ existing: true, ref });
    await changePoleId(tree, "SIK101");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
  });
});

describe("GeneralInformation CREATE entry never persists the Site ID (root cause)", () => {
  const ref = React.createRef<GeneralInformationHandle>();
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
      ...(ctxState.poleId !== undefined
        ? { poleId: ctxState.poleId }
        : { poleId: "" }),
    }));
  }

  function ensureDraftFor(id: number): jest.Mock<Promise<number>, never[]> {
    return jest.fn(async () => {
      statefulSetInspectionId(id);
      return id;
    }) as unknown as jest.Mock<Promise<number>, never[]>;
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
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
    mockRenameService.renamePoleId.mockReset();
  });

  afterEach(async () => {
    await InspectionEditSession.discard();
    jest.restoreAllMocks();
    InspectionLiveValues.reset();
  });

  it("typing a partial Site ID during CREATE never writes any pole value to the database", async () => {
    statefulContext(null);
    const ensureDraft = ensureDraftFor(101);
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({});

    const tree = await renderComponent({ existing: false, ensureDraft, ref });

    await changePoleId(tree, "SIK");

    // The draft is created lazily, but for a NEW inspection the Site ID stays
    // in React state only â€” no pole write can happen while typing.
    expect(ensureDraft).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "SIK",
    );
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
    expect(renderedFieldValues(tree)[0]).toBe("SIK");
  });

  it("root cause: a partial Site ID survives a draft-adopting re-init with an empty snapshot and is committed exactly once at Save", async () => {
    statefulContext(null);
    const ensureDraft = ensureDraftFor(101);
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({});

    const tree = await renderComponent({ existing: false, ensureDraft, ref });
    await changePoleId(tree, "SIK");
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();

    // new.tsx adopts the lazily-created draft: context inspectionId flips to
    // 101 and init re-runs against an EMPTY DB snapshot. Without Option B the
    // partial "SIK" persisted during entry (Approach X) would be clobbered back
    // to an empty pole by this re-init on first render â€” the reported bug.
    await act(async () => {
      tree.update(
        <GeneralInformation
          existing={false}
          ensureDraft={ensureDraft}
          ref={ref}
        />,
      );
      await flushPromises();
    });

    expect(renderedFieldValues(tree)[0]).toBe("SIK");

    const decision = await invokeConfirm();

    expect(decision).toEqual({ type: "no-rename" });
    expect(dialogVisible(tree)).toBe(false);
    expect(mockRenameService.renamePoleId).not.toHaveBeenCalled();
    // Exactly one authoritative commit of the typed identity at Save time.
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledTimes(1);
    expect(repo.updatePoleIdDirectSave).toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "SIK",
    );
  });

  it("clearing the Site ID during CREATE persists nothing and leaves the field empty", async () => {
    statefulContext(null);
    const ensureDraft = ensureDraftFor(101);
    repo.getFieldsByKey.mockResolvedValue([
      poleField,
      districtField,
      blockField,
    ]);
    repo.getInspectionValues.mockResolvedValue({});

    const tree = await renderComponent({ existing: false, ensureDraft, ref });
    await changePoleId(tree, "SIK");
    expect(ensureDraft).toHaveBeenCalledTimes(1);

    await setPoleText(tree, "");

    expect(renderedFieldValues(tree)[0]).toBe("");
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalledWith(
      101,
      poleField.FieldID,
      "SIK",
    );
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();

    const decision = await invokeConfirm();

    // Nothing was ever persisted, so there is nothing to rename or revert.
    expect(decision).toEqual({ type: "no-change" });
    expect(dialogVisible(tree)).toBe(false);
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
  });
});

describe("GeneralInformation CREATE remount recovery â€” Option-B live Site ID overlay", () => {
  const TYPED = "SIK098/076sik/09845/123";

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    setPoleId.mockReset();
    setInspectionId.mockReset();
    getPhotoStates.mockReset();
    getPhotoStates.mockReturnValue({});
    await InspectionEditSession.discard();
    InspectionLiveValues.reset();
    mockContext({ inspectionId: 101 });
    // CREATE Option-B: the DB pole_id stays empty until Save commits it.
    repo.getFieldsByKey.mockResolvedValue([poleField]);
    repo.getInspectionValues.mockResolvedValue({});
    repo.getInspectionPoleId.mockResolvedValue("");
    repo.getInspectionByPoleId.mockResolvedValue(null);
    repo.saveFieldValue.mockResolvedValue(undefined);
    repo.updateInspectionPoleId.mockResolvedValue(undefined);
    repo.updatePoleIdDirectSave.mockResolvedValue(undefined);
    photoRepo.getByInspection.mockResolvedValue([]);
  });

  afterEach(() => {
    InspectionLiveValues.reset();
  });

  it("collapse remount restores the typed Site ID from the live overlay while the DB stays empty", async () => {
    const tree = await renderComponent();
    expect(renderedFieldValues(tree)[0]).toBe("");

    await changePoleId(tree, TYPED);

    // Option-B: typing persists nothing â€” the value exists only in the overlay.
    expect(
      InspectionLiveValues.getLiveFieldValues()?.get(poleField.FieldID),
    ).toBe(TYPED);
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();

    // paper List.Accordion unmounts GeneralInformation when the section is
    // collapsed â€” simulate that with a full remount.
    await act(async () => {
      tree.unmount();
    });
    const remounted = await renderComponent();

    // F2: the typed value is restored purely from memory, never from SQLite.
    expect(renderedFieldValues(remounted)[0]).toBe(TYPED);
    expect(setPoleId).toHaveBeenLastCalledWith(TYPED);
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
    expect(repo.updateInspectionPoleId).not.toHaveBeenCalled();
  });

  it("repeated collapse/expand cycles always return to the same typed Site ID", async () => {
    let tree = await renderComponent();
    await changePoleId(tree, TYPED);
    await act(async () => {
      tree.unmount();
    });

    for (let cycle = 0; cycle < 3; cycle++) {
      tree = await renderComponent();
      expect(renderedFieldValues(tree)[0]).toBe(TYPED);
      expect(setPoleId).toHaveBeenLastCalledWith(TYPED);
      expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
      expect(repo.saveFieldValue).not.toHaveBeenCalled();
      await act(async () => {
        tree.unmount();
      });
    }
  });

  it("returning from the camera screen (screen-stack remount) keeps the typed Site ID and never loses it to the empty DB", async () => {
    const first = await renderComponent();
    await changePoleId(first, TYPED);
    expect(
      InspectionLiveValues.getLiveFieldValues()?.get(poleField.FieldID),
    ).toBe(TYPED);
    await act(async () => {
      first.unmount();
    });

    // capture.tsx opens as a separate route; returning re-activates the mounted
    // inspection screen while the CREATE draft (inspectionId 101) still exists.
    const returned = await renderComponent();
    expect(renderedFieldValues(returned)[0]).toBe(TYPED);
    expect(
      InspectionLiveValues.getLiveFieldValues()?.get(poleField.FieldID),
    ).toBe(TYPED);
    // Recovery restored from the overlay; SQLite was never asked to hold it yet.
    expect(repo.updatePoleIdDirectSave).not.toHaveBeenCalled();
    expect(repo.saveFieldValue).not.toHaveBeenCalled();
  });

  it("EDIT is untouched: a stale live overlay never leaks into an existing inspection and is cleared after init", async () => {
    InspectionLiveValues.setFieldValue(poleField.FieldID, "STALE-LEAK");
    repo.getInspectionValues.mockResolvedValue({ pole_id: "OLD" });
    repo.getInspectionPoleId.mockResolvedValue("OLD");

    const tree = await renderComponent({ existing: true });

    expect(renderedFieldValues(tree)[0]).toBe("OLD");
    expect(setPoleId).toHaveBeenLastCalledWith("OLD");
    // The existing-init path clears the module overlay so a stale snapshot from
    // a previously typed CREATE can never bleed into another inspection.
    expect(InspectionLiveValues.getLiveFieldValues()).toBeUndefined();
  });

  it("project/inspection isolation: 'Create New' clears the overlay so a fresh inspection starts with an empty Site ID", async () => {
    const first = await renderComponent();
    await changePoleId(first, TYPED);
    expect(
      InspectionLiveValues.getLiveFieldValues()?.get(poleField.FieldID),
    ).toBe(TYPED);
    await act(async () => {
      first.unmount();
    });

    // A remount before the reset still sees the typed value (the recovery path).
    const restored = await renderComponent();
    expect(renderedFieldValues(restored)[0]).toBe(TYPED);
    await act(async () => {
      restored.unmount();
    });

    // new.tsx resets the screen-level overlay on "Create New" / screen init â€” a
    // fresh CREATE must not inherit the previous inspection's Site ID.
    await act(async () => {
      InspectionLiveValues.reset();
      mockContext({ inspectionId: null });
    });
    const fresh = await renderComponent();
    expect(renderedFieldValues(fresh)[0]).toBe("");
    expect(setPoleId).toHaveBeenLastCalledWith("");
    expect(InspectionLiveValues.getLiveFieldValues()).toBeUndefined();
  });
});

