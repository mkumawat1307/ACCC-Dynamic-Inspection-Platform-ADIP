import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

const cameraDropdownField = {
  FieldDefID: 3,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "CameraType",
  Label: "Camera Type",
  FieldType: "dropdown",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
};

const nvrDropdownField = {
  FieldDefID: 9,
  TemplateID: 1,
  DeviceType: "NVR",
  FieldName: "RecorderType",
  Label: "Recorder Type",
  FieldType: "dropdown",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
};

jest.mock("react-native-paper", () => {
  const ReactPaper = require("react");
  const { Text, View } = require("react-native");
  const Card = ({ children }: { children: React.ReactNode }) =>
    ReactPaper.createElement(View, null, children);
  Card.Title = (props: Record<string, unknown>) =>
    ReactPaper.createElement("CardTitle", props);
  Card.Content = ({ children }: { children: React.ReactNode }) =>
    ReactPaper.createElement(View, null, children);
  return {
    Text,
    TextInput: (props: Record<string, unknown>) =>
      ReactPaper.createElement("TextInput", props),
    Card,
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const ReactMock = require("react");
    return ReactMock.createElement("Dropdown", props);
  },
}));

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: { current: { scrollTo: jest.fn() } },
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
    scrollFocusedFieldIntoView: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/database/repositories/DeviceFieldDefinitionsRepository", () => ({
  __esModule: true,
  default: { getByDeviceType: jest.fn() },
}));

jest.mock("@/src/database/repositories/DeviceRecordsRepository", () => ({
  __esModule: true,
  DeviceRecordsRepository: {
    getByInspection: jest.fn().mockResolvedValue([]),
    getByInspectionAll: jest.fn().mockResolvedValue([]),
    scheduleDeviceRecordSave: jest.fn(),
    flushPendingDeviceSaves: jest.fn(),
    cancelPendingSaves: jest.fn(),
    deactivateBeyond: jest.fn().mockResolvedValue(undefined),
    restorePendingDeactivatedRecords: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock("@/src/database/repositories/DeviceOptionsRepository", () => ({
  __esModule: true,
  default: { getDropdownData: jest.fn() },
}));

const fieldDefsRepo = DeviceFieldDefinitionsRepository as jest.Mocked<
  typeof DeviceFieldDefinitionsRepository
>;
const recordsRepo = DeviceRecordsRepository as jest.Mocked<
  typeof DeviceRecordsRepository
>;
const optionsRepo = DeviceOptionsRepository as jest.Mocked<
  typeof DeviceOptionsRepository
>;

function findDropdown(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll(
    (n) => (n as { type?: unknown }).type === "Dropdown"
  )[0] as unknown as {
    props: {
      value: string | null;
      data: Array<{ label: string; value: string; isClear?: boolean }>;
      onChange: (item: any) => void;
    };
  };
}

function getScheduledData(): Record<string, string> {
  const callArgs = recordsRepo.scheduleDeviceRecordSave.mock.calls[0] as unknown[];
  const savedRecord = callArgs[0] as { DeviceData: string | null };
  return JSON.parse(savedRecord.DeviceData ?? "{}");
}

describe("DeviceSection dropdown clear selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recordsRepo.scheduleDeviceRecordSave.mockImplementation(() => Promise.resolve());
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.cancelPendingSaves.mockImplementation(() => Promise.resolve());
  });

  it("device-type: selected dropdown offers Clear selection and clearing stores a plain empty value", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([cameraDropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue([
      {
        InspectionID: 42,
        DeviceType: "Camera",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ CameraType: "PTZ" }),
        DisplayOrder: 1,
        IsActive: 1,
      },
    ]);
    recordsRepo.getByInspectionAll.mockResolvedValue([]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    let dd = findDropdown(tree);
    expect(dd.props.value).toBe("PTZ");
    expect(dd.props.data).toHaveLength(3);
    const clear = dd.props.data[2];
    expect(clear.isClear).toBe(true);
    expect(clear.label).toBe("Clear selection");

    await act(async () => {
      dd.props.onChange(clear);
    });

    expect(recordsRepo.scheduleDeviceRecordSave).toHaveBeenCalledTimes(1);
    const saved = getScheduledData();
    expect(saved.CameraType).toBe("");
    expect(JSON.stringify(saved)).not.toContain("Clear selection");
    expect(JSON.stringify(saved)).not.toContain(clear.value);

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data).toHaveLength(2);
    expect(dd.props.data.some((i) => i.isClear === true)).toBe(false);
  });

  it("device-type: after clearing, selecting another option works and the clear row returns", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([cameraDropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue([
      {
        InspectionID: 42,
        DeviceType: "Camera",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ CameraType: "PTZ" }),
        DisplayOrder: 1,
        IsActive: 1,
      },
    ]);
    recordsRepo.getByInspectionAll.mockResolvedValue([]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    let dd = findDropdown(tree);
    const clear = dd.props.data[2];
    await act(async () => {
      dd.props.onChange(clear);
    });
    expect(getScheduledData().CameraType).toBe("");

    recordsRepo.scheduleDeviceRecordSave.mockClear();

    dd = findDropdown(tree);
    await act(async () => {
      dd.props.onChange({ label: "Fixed", value: "Fixed" });
    });
    expect(getScheduledData().CameraType).toBe("Fixed");

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("Fixed");
    expect(dd.props.data).toHaveLength(3);
    expect(dd.props.data[2].isClear).toBe(true);
  });

  it("custom device (NVR) type: dropdown clear is isolated to that field and empty is stored", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([nvrDropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "Dome", value: "Dome", isDefault: 0 },
      { label: "Bullet", value: "Bullet", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue([
      {
        InspectionID: 42,
        DeviceType: "NVR",
        DeviceNo: 1,
        DeviceData: JSON.stringify({ RecorderType: "Dome" }),
        DisplayOrder: 1,
        IsActive: 1,
      },
    ]);
    recordsRepo.getByInspectionAll.mockResolvedValue([]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="NVR" count={1} />
      );
    });

    let dd = findDropdown(tree);
    expect(dd.props.value).toBe("Dome");
    expect(dd.props.data).toHaveLength(3);

    await act(async () => {
      dd.props.onChange(dd.props.data[2]);
    });
    expect(getScheduledData().RecorderType).toBe("");

    dd = findDropdown(tree);
    expect(dd.props.value).toBe("");
    expect(dd.props.data.map((i) => i.label)).toEqual(["Dome", "Bullet"]);
  });
});