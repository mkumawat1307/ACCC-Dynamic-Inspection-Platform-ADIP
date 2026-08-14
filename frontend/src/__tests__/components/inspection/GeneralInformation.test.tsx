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

async function renderComponent(): Promise<ReturnType<typeof TestRenderer.create>> {
  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(<GeneralInformation />);
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
  const node = tree.root.findByType(FieldRenderer as never);
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

  it("renders no fields when there is no inspection id, so no popup is possible", async () => {
    mockContext({ inspectionId: null });
    const tree = await renderComponent();
    expect(tree.root.findAll((n) => (n as { type?: unknown }).type === FieldRenderer).length).toBe(0);
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
