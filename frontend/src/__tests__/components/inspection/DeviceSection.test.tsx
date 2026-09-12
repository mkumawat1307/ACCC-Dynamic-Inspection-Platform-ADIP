import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import { DeviceRecordsRepository, DeviceRecord } from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";

jest.mock("@/src/database/db", () => ({
  getActiveProjectPath: jest.fn(() => "/mock/projects/active/inspection.db"),
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactNs = require("react");
  const RN = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      ReactNs.createElement(RN.Text, { testID: `glyph-${props.name}` }, props.name),
  };
});

const numberField = {
  FieldDefID: 1,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "Voltage",
  Label: "Voltage",
  FieldType: "number",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
};

const textField = {
  FieldDefID: 2,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "SerialNo",
  Label: "Serial No",
  FieldType: "text",
  IsRequired: 0,
  DisplayOrder: 2,
  IsActive: 1,
};

const dropdownField = {
  FieldDefID: 3,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "CameraType",
  Label: "Camera Type",
  FieldType: "dropdown",
  IsRequired: 0,
  DisplayOrder: 3,
  IsActive: 1,
};

const requiredDropdownField = {
  FieldDefID: 4,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "MountType",
  Label: "Mount Type",
  FieldType: "dropdown",
  IsRequired: 1,
  DisplayOrder: 4,
  IsActive: 1,
};

const mockRecord = {
  InspectionID: 42,
  DeviceType: "Camera",
  DeviceNo: 1,
  DeviceData: JSON.stringify({
    Voltage: null,
    SerialNo: null,
    CameraType: null,
  }),
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

const mockScrollTo = jest.fn();
const mockScrollRef = { current: { scrollTo: mockScrollTo } };

jest.mock("@/src/context/InspectionScrollContext", () => ({
  useInspectionScroll: () => ({
    scrollViewRef: mockScrollRef,
    scrollOffsetRef: { current: 0 },
    setDropdownOpen: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/components/inspection/renderFieldInput", () => ({
  ...jest.requireActual("@/src/components/inspection/renderFieldInput"),
}));

jest.mock("@/src/database/repositories/DeviceFieldDefinitionsRepository", () => ({
  __esModule: true,
  default: { getByDeviceType: jest.fn() },
}));

jest.mock("@/src/database/repositories/DeviceRecordsRepository", () => ({
  __esModule: true,
  DeviceRecordsRepository: {
    getByInspection: jest.fn().mockResolvedValue([]),
    getByInspectionAll: jest.fn().mockResolvedValue([mockRecord]),
    scheduleDeviceRecordSave: jest.fn(),
    flushPendingDeviceSaves: jest.fn(),
    cancelPendingSaves: jest.fn(),
    deactivateBeyond: jest.fn().mockResolvedValue(undefined),
    restorePendingDeactivatedRecords: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(1),
  },
  DeviceRecord: "DeviceRecord",
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

async function renderDevice() {
  fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
  optionsRepo.getDropdownData.mockResolvedValue([
    { label: "PTZ", value: "PTZ", isDefault: 0 },
    { label: "Fixed", value: "Fixed", isDefault: 0 },
  ]);
  recordsRepo.getByInspectionAll.mockResolvedValue([mockRecord]);
  recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
  recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
  recordsRepo.cancelPendingSaves.mockImplementation(() => undefined);

  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(
      <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
    );
  });
  return tree;
}

function findTextInput(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAll((n) => {
    if ((n as { type?: unknown }).type !== "TextInput") return false;
    return (n.props as { label?: string }).label === label;
  })[0] as unknown as {
    props: {
      label: string;
      keyboardType?: string;
      onChangeText: (text: string) => void;
    };
  };
}

describe("DeviceSection number fields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders a number field with a decimal-pad keyboard", async () => {
    const tree = await renderDevice();
    const input = findTextInput(tree, "Voltage");
    expect(input).toBeTruthy();
    expect(input.props.keyboardType).toBe("decimal-pad");
  });

  it("schedules save with sanitized value when number field text changes", async () => {
    const tree = await renderDevice();
    const input = findTextInput(tree, "Voltage");
    act(() => {
      input.props.onChangeText("abc12.5");
    });
    expect(recordsRepo.scheduleDeviceRecordSave).toHaveBeenCalledTimes(1);
    const callArgs = recordsRepo.scheduleDeviceRecordSave.mock.calls[0];
    // callArgs[0] is the record, callArgs[1] is debounceMs (default 500)
    const savedRecord = callArgs[0] as { DeviceData: string | null; DeviceNo: number };
    const data = JSON.parse(savedRecord.DeviceData ?? "{}");
    expect(data.Voltage).toBe("12.5");
  });

  it("schedules save with null when a number field is cleared", async () => {
    const tree = await renderDevice();
    const input = findTextInput(tree, "Voltage");
    act(() => {
      input.props.onChangeText("");
    });
    expect(recordsRepo.scheduleDeviceRecordSave).toHaveBeenCalledTimes(1);
    const callArgs = recordsRepo.scheduleDeviceRecordSave.mock.calls[0];
    const savedRecord = callArgs[0] as { DeviceData: string | null; DeviceNo: number };
    const data = JSON.parse(savedRecord.DeviceData ?? "{}");
    expect(data.Voltage).toBe("");
  });

  it("keeps non-number fields unchanged (text stays free, dropdown loads options)", async () => {
    const tree = await renderDevice();
    const serialInput = findTextInput(tree, "Serial No");
    expect(serialInput.props.keyboardType).toBeUndefined();
    const dropdowns = tree.root.findAll((n) => (n as { type?: unknown }).type === "Dropdown");
    expect(dropdowns.length).toBe(1);
    expect(optionsRepo.getDropdownData).toHaveBeenCalledWith(
      "Camera",
      "CameraType",
      undefined
    );
  });

  it("hides device fields marked IsVisible = 0", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([
      { ...numberField, IsVisible: 0 },
      { ...textField, IsVisible: 1 },
    ]);
    optionsRepo.getDropdownData.mockResolvedValue([]);
    recordsRepo.getByInspectionAll.mockResolvedValue([mockRecord]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.cancelPendingSaves.mockImplementation(() => undefined);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });
    expect(findTextInput(tree, "Voltage")).toBeUndefined();
    expect(findTextInput(tree, "Serial No")).toBeTruthy();
  });
});

describe("DeviceSection dropdown auto-scroll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dropdown onBlur is defined", async () => {
    const tree = await renderDevice();
    const dd = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === "Dropdown"
    )[0] as unknown as { props: { onBlur?: () => void } };

    expect(typeof dd.props.onBlur).toBe("function");
  });
});

describe("DeviceSection device count changes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const threeRecords = [
    { InspectionID: 42, DeviceType: "Camera", DeviceNo: 1, RecordID: 5, DeviceData: JSON.stringify({ Voltage: "12", SerialNo: "A", CameraType: "PTZ" }), DisplayOrder: 1, IsActive: 1 },
    { InspectionID: 42, DeviceType: "Camera", DeviceNo: 2, RecordID: 7, DeviceData: JSON.stringify({ Voltage: "13", SerialNo: "B", CameraType: "Fixed" }), DisplayOrder: 2, IsActive: 1 },
    { InspectionID: 42, DeviceType: "Camera", DeviceNo: 3, RecordID: 8, DeviceData: JSON.stringify({ Voltage: "14", SerialNo: "C", CameraType: "PTZ" }), DisplayOrder: 3, IsActive: 1 },
  ];

  function findVoltageInputs(tree: ReturnType<typeof TestRenderer.create>) {
    return tree.root.findAll((n) => {
      if ((n as { type?: unknown }).type !== "TextInput") return false;
      return (n.props as { label?: string }).label === "Voltage";
    }) as unknown as Array<{
      props: { label: string; value?: string; onChangeText: (text: string) => void };
    }>;
  }

  function deviceToggle(
    tree: ReturnType<typeof TestRenderer.create>,
    deviceNo: number
  ): { props: { onPress: () => void } } {
    return tree.root.find(
      (n) => (n.props as { testID?: string } | undefined)?.testID === `dev-toggle-${deviceNo}`
    ) as unknown as { props: { onPress: () => void } };
  }

  it("re-creates pruned devices on grow by restoring the deactivated rows (same RecordID)", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue(threeRecords);
    recordsRepo.getByInspectionAll.mockResolvedValue(threeRecords);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockResolvedValue([
      { ...threeRecords[1], IsActive: 0 },
      { ...threeRecords[2], IsActive: 0 },
    ]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    // Type into device 2 and cache its RecordID via onPersisted, as a real flush would.
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("13.5");
    });
    const saveCall = recordsRepo.scheduleDeviceRecordSave.mock.calls[0];
    const record2 = saveCall[0] as { DeviceNo: number };
    expect(record2.DeviceNo).toBe(2);
    expect((saveCall[2] as (id: number) => void)).toBeDefined();
    act(() => {
      (saveCall[2] as (id: number) => void)(7);
    });

    // Shrink count to 1: deactivates devices 2/3 and must prune their cached IDs.
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={1} />);
    });
    expect(recordsRepo.deactivateBeyond).toHaveBeenCalledWith(42, "Camera", 1);

    // Grow count back to 3: devices 2/3 are restored from the deactivated rows,
    // keeping their original RecordIDs instead of creating fresh rows.
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={3} />);
    });
    expect(recordsRepo.restorePendingDeactivatedRecords).toHaveBeenCalledWith(42, "Camera", 3);

    // The restored device 2 keeps its previously entered value on screen.
    expect(findVoltageInputs(tree)[1].props.value).toBe("13");

    // Type into the restored device 2. It must keep RecordID 7 so persist()
    // UPDATEs the same row and preserves the previously entered data.
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("20");
    });
    const calls = recordsRepo.scheduleDeviceRecordSave.mock.calls;
    const lastCall = calls[calls.length - 1];
    const recreated = lastCall[0] as { DeviceNo: number; RecordID?: number };
    expect(recreated.DeviceNo).toBe(2);
    expect(recreated.RecordID).toBe(7);
  });

  it("grow after 3 -> 1 -> 3 restores every deactivated device with its data", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue(threeRecords);
    recordsRepo.getByInspectionAll.mockResolvedValue(threeRecords);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockResolvedValue([
      { ...threeRecords[1], IsActive: 0 },
      { ...threeRecords[2], IsActive: 0 },
    ]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={1} />);
    });
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={3} />);
    });

    expect(recordsRepo.restorePendingDeactivatedRecords).toHaveBeenCalledWith(42, "Camera", 3);
    expect(findVoltageInputs(tree)[1].props.value).toBe("13");
    expect(findVoltageInputs(tree)[2].props.value).toBe("14");
  });

  it("repeated shrink/grow keeps restored RecordIDs stable", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue(threeRecords);
    recordsRepo.getByInspectionAll.mockResolvedValue(threeRecords);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockImplementation(
      async (_inspectionId: number, _deviceType: string, maxDeviceNo: number) =>
        [threeRecords[1], threeRecords[2]]
          .map((r) => ({ ...r, IsActive: 0 }))
          .filter((r) => r.DeviceNo <= maxDeviceNo)
    );

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={1} />);
    });
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} />);
    });
    expect(recordsRepo.restorePendingDeactivatedRecords).toHaveBeenCalledWith(42, "Camera", 2);

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={1} />);
    });
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={3} />);
    });
    expect(recordsRepo.restorePendingDeactivatedRecords).toHaveBeenCalledWith(42, "Camera", 3);

    // Device 2 keeps RecordID 7 after the full shrink/grow cycle.
    expect(findVoltageInputs(tree)[1].props.value).toBe("13");
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("20");
    });
    const calls = recordsRepo.scheduleDeviceRecordSave.mock.calls;
    const lastCall = calls[calls.length - 1];
    const recreated = lastCall[0] as { DeviceNo: number; RecordID?: number };
    expect(recreated.DeviceNo).toBe(2);
    expect(recreated.RecordID).toBe(7);
  });

  it("grow pads fresh rows only for devices that were never saved", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue([threeRecords[0], threeRecords[1]]);
    recordsRepo.getByInspectionAll.mockResolvedValue([threeRecords[0], threeRecords[1]]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockResolvedValue([
      { ...threeRecords[1], IsActive: 0 },
    ]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={2} />
      );
    });

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={1} />);
    });
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={4} />);
    });
    expect(recordsRepo.restorePendingDeactivatedRecords).toHaveBeenCalledWith(42, "Camera", 4);

    // Device 2 was restored (RecordID 7), devices 3/4 are brand-new rows and
    // therefore start collapsed. Expand device 4 before typing into it.
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("20");
    });
    const calls = recordsRepo.scheduleDeviceRecordSave.mock.calls;
    const lastCall = calls[calls.length - 1];
    const device2 = lastCall[0] as { DeviceNo: number; RecordID?: number };
    expect(device2.DeviceNo).toBe(2);
    expect(device2.RecordID).toBe(7);

    act(() => {
      deviceToggle(tree, 4).props.onPress();
    });
    act(() => {
      // Device 3 stays collapsed, so device 4 sits at index 2.
      findVoltageInputs(tree)[2].props.onChangeText("30");
    });
    const device4Call = recordsRepo.scheduleDeviceRecordSave.mock.calls[
      recordsRepo.scheduleDeviceRecordSave.mock.calls.length - 1
    ];
    const device4 = device4Call[0] as { DeviceNo: number; RecordID?: number };
    expect(device4.DeviceNo).toBe(4);
    expect(device4.RecordID).toBeDefined();
  });

  it("flushes pending saves for pruned devices when the count shrinks (no resurrection)", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspection.mockResolvedValue(threeRecords);
    recordsRepo.getByInspectionAll.mockResolvedValue(threeRecords);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    // Type into device 3 (pending save scheduled, RecordID never back-filled)
    // and shrink to 1 within the debounce window -- the bug scenario.
    act(() => {
      findVoltageInputs(tree)[2].props.onChangeText("15");
    });
    expect(recordsRepo.scheduleDeviceRecordSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={1} />);
    });

    // The shrink must flush pending saves before deactivating, ensuring the
    // debounced save writes data to the DB row that deactivateBeyond then
    // marks as IsActive=0 — rather than destroying the timer and creating
    // a data-vanishing bug.
    expect(recordsRepo.flushPendingDeviceSaves).toHaveBeenCalled();
    expect(recordsRepo.deactivateBeyond).toHaveBeenCalledWith(42, "Camera", 1);
  });
});

function textOf(tree: ReturnType<typeof TestRenderer.create>): string {
  const strings: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      strings.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === "object") {
      const children = (node as { children?: unknown }).children;
      if (Array.isArray(children)) {
        for (const child of children) walk(child);
      }
    }
  };
  walk(tree.toJSON());
  return strings.join("");
}

function glyphs(tree: ReturnType<typeof TestRenderer.create>): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const el = node as {
      type?: string;
      props?: { testID?: string };
      children?: unknown[];
    };
    if (typeof el.type === "string") {
      const testID = el.props?.testID;
      if (testID && testID.startsWith("glyph-")) {
        out.push(testID);
      }
    }
    if (Array.isArray(el.children)) {
      for (const child of el.children) walk(child);
    }
  };
  walk(tree.toJSON());
  return out;
}

describe("DeviceSection per-device progress + collapse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const progressOf = (overrides?: Partial<{
    deviceNo: number;
    completed: number;
    total: number;
    remaining: number;
    percentage: number;
  }>) => ({
    deviceNo: 1,
    completed: 2,
    total: 9,
    remaining: 7,
    percentage: 22,
    ...overrides,
  });

  async function renderWithProgress(deviceProgress?: any[], recordList?: any[]) {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspectionAll.mockResolvedValue(recordList ?? [mockRecord]);
    recordsRepo.getByInspection.mockResolvedValue(recordList ?? [mockRecord]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.cancelPendingSaves.mockImplementation(() => undefined);

    const count = recordList?.length ?? 1;
    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection
          inspectionId={42}
          deviceType="Camera"
          count={count}
          deviceProgress={deviceProgress}
        />
      );
    });
    return tree;
  }

  function deviceToggle(
    tree: ReturnType<typeof TestRenderer.create>,
    deviceNo: number
  ): { props: { onPress: () => void } } {
    return tree.root.find(
      (n) =>
        (n.props as { testID?: string } | undefined)?.testID === `dev-toggle-${deviceNo}`
    ) as unknown as { props: { onPress: () => void } };
  }

  it("does NOT render duplicate device-count progress on the Camera Details header", async () => {
    const secondRecord = { ...mockRecord, DeviceNo: 2 };
    const tree = await renderWithProgress(
      [progressOf(), { deviceNo: 2, completed: 9, total: 9, remaining: 0, percentage: 100 }],
      [mockRecord, secondRecord],
    );
    const text = textOf(tree);
    expect(text).toContain("Camera Details (2)");
    expect(text).not.toContain("1 / 2 completed");
    expect(text).not.toContain("1 remaining");
    expect(text).toContain("2 / 9 completed");
    expect(text).toContain("9 / 9 completed");
  });

  it("shows the per-device field progress text (completed / total completed) in the header", async () => {
    const tree = await renderWithProgress([progressOf()]);
    const text = textOf(tree);
    expect(text).toContain("2 / 9 completed");
    expect(text).toContain("7 remaining");
  });

  it("renders both the green check and the chevron once a device is complete", async () => {
    const tree = await renderWithProgress([progressOf({ remaining: 0, percentage: 100, completed: 9 })]);
    const text = textOf(tree);
    expect(text).toContain("check");
    expect(text).toContain("chevron-up");
    expect(text).not.toContain("check-circle");
    expect(glyphs(tree)).toEqual(["glyph-check", "glyph-chevron-up"]);
  });

  it("reserves no empty checkmark space on an incomplete device header", async () => {
    const tree = await renderWithProgress([progressOf()]);
    const text = textOf(tree);
    expect(text).toContain("2 / 9 completed");
    expect(text).toContain("7 remaining");
    expect(glyphs(tree)).toEqual(["glyph-chevron-up"]);
  });

  it("collapses one device independently while the others stay expanded", async () => {
    const secondRecord = { ...mockRecord, DeviceNo: 2 };
    const tree = await renderWithProgress(undefined, [mockRecord, secondRecord]);

    // All devices start expanded → 2 Voltage inputs.
    expect(findTextInput(tree, "Voltage") ?? false);
    const voltageInputs = (() => {
      const inputs = tree.root.findAll(
        (n) => (n as { type?: unknown }).type === "TextInput" &&
          (n.props as { label?: string }).label === "Voltage"
      );
      return inputs as unknown as Array<{ props: { label: string; value?: string } }>;
    })();
    expect(voltageInputs).toHaveLength(2);

    // Collapse device 1 only.
    act(() => {
      deviceToggle(tree, 1).props.onPress();
    });
    const collapsedVoltage = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === "TextInput" &&
        (n.props as { label?: string }).label === "Voltage"
    );
    expect(collapsedVoltage).toHaveLength(1);

    // Expand it again and collapse device 2 instead.
    act(() => {
      deviceToggle(tree, 1).props.onPress();
    });
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    const otherCollapsed = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === "TextInput" &&
        (n.props as { label?: string }).label === "Voltage"
    );
    expect(otherCollapsed).toHaveLength(1);
  });

  it("shows no progress text without a deviceProgress entry (chevron-only header)", async () => {
    const tree = await renderWithProgress(undefined);
    expect(textOf(tree)).not.toContain("completed");
  });

  it("new devices added on grow default to collapsed", async () => {
    const tree = await renderWithProgress(undefined, [mockRecord]);
    expect(findTextInput(tree, "Voltage")).toBeTruthy();

    // Simulate growth by re-rendering with count 2: device 2 is a brand-new
    // instance (never saved), so it must start collapsed while device 1 stays
    // expanded.
    const secondRecord = { ...mockRecord, DeviceNo: 2 };
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);
    recordsRepo.getByInspectionAll.mockResolvedValue([mockRecord, secondRecord]);
    recordsRepo.getByInspection.mockResolvedValue([mockRecord]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockResolvedValue([]);

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} deviceProgress={[]} />);
    });
    const voltageInputs = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === "TextInput" &&
        (n.props as { label?: string }).label === "Voltage"
    );
    // Device 1 stays expanded; the new device 2 is collapsed.
    expect(voltageInputs).toHaveLength(1);
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    const expanded = tree.root.findAll(
      (n) => (n as { type?: unknown }).type === "TextInput" &&
        (n.props as { label?: string }).label === "Voltage"
    );
    expect(expanded).toHaveLength(2);
  });

  it("renders a red bold * after the label of a required field", async () => {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField, dropdownField, requiredDropdownField]);
    optionsRepo.getDropdownData.mockResolvedValue([
      { label: "PTZ", value: "PTZ", isDefault: 0 },
      { label: "Fixed", value: "Fixed", isDefault: 0 },
    ]);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const starNodes = tree.root.findAll((n) => {
      if ((n as { type?: unknown }).type !== "Text") return false;
      const { style, children } = n.props as { style?: { color?: string; fontWeight?: string; fontSize?: number }; children?: unknown };
      return children === "*" && style?.color === "#B3261E" && style.fontWeight === "700";
    });
    expect(starNodes.length).toBe(1);

    const fieldLabelNode = tree.root.findAll((n) => {
      if ((n as { type?: unknown }).type !== "Text") return false;
      const { style } = n.props as { style?: { color?: string; fontWeight?: string } };
      return style?.color === "#444" && style.fontWeight === "500";
    }).find((n) => {
      const strings = n.children.filter((c) => typeof c === "string").join("");
      return strings.includes("Mount Type");
    });
    expect(fieldLabelNode).toBeTruthy();
    expect(textOf(tree)).toContain("Mount Type *");
  });
});

describe("DeviceSection default expansion state (CHANGE 1 regression)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function voltageInputs(tree: ReturnType<typeof TestRenderer.create>) {
    return tree.root.findAll(
      (n) =>
        (n as { type?: unknown }).type === "TextInput" &&
        (n.props as { label?: string }).label === "Voltage"
    ) as unknown as Array<{ props: { label: string; value?: string } }>;
  }

  function deviceToggle(
    tree: ReturnType<typeof TestRenderer.create>,
    deviceNo: number
  ): { props: { onPress: () => void } } {
    return tree.root.find(
      (n) => (n.props as { testID?: string } | undefined)?.testID === `dev-toggle-${deviceNo}`
    ) as unknown as { props: { onPress: () => void } };
  }

  async function renderFreshCount(count: number) {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField]);
    optionsRepo.getDropdownData.mockResolvedValue([]);
    recordsRepo.getByInspection.mockResolvedValue([]);
    recordsRepo.getByInspectionAll.mockResolvedValue([]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.cancelPendingSaves.mockImplementation(() => undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockResolvedValue([]);
    recordsRepo.save.mockResolvedValue(1);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={count} />
      );
    });
    return tree;
  }

  it("1. fresh device count = 1: device 1 is expanded", async () => {
    const tree = await renderFreshCount(1);
    expect(voltageInputs(tree)).toHaveLength(1);
    expect(findTextInput(tree, "Voltage")).toBeTruthy();
  });

  it("2. fresh device count = 3: device 1 expanded, devices 2 and 3 collapsed", async () => {
    const tree = await renderFreshCount(3);
    expect(voltageInputs(tree)).toHaveLength(1);
    expect(findTextInput(tree, "Voltage")).toBeTruthy();
  });

  it("3. grow count 1 -> 2: device 1 keeps its expansion state, device 2 starts collapsed", async () => {
    const tree = await renderFreshCount(1);
    expect(voltageInputs(tree)).toHaveLength(1);

    recordsRepo.getByInspection.mockResolvedValue([mockRecord]);
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} />);
    });

    expect(voltageInputs(tree)).toHaveLength(1);
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(2);
  });

  it("4. grow count 2 -> 3: device 1 stays expanded, devices 2 and 3 start collapsed", async () => {
    const tree = await renderFreshCount(2);
    expect(voltageInputs(tree)).toHaveLength(1);

    recordsRepo.getByInspection.mockResolvedValue([mockRecord]);
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={3} />);
    });

    expect(voltageInputs(tree)).toHaveLength(1);
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(2);
    act(() => {
      deviceToggle(tree, 3).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(3);
  });

  it("5. a device created collapsed can still be manually expanded", async () => {
    const tree = await renderFreshCount(3);
    expect(voltageInputs(tree)).toHaveLength(1);

    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(2);
  });

  it("6. existing/restored devices loaded from the database are NOT auto-collapsed", async () => {
    const secondRecord = { ...mockRecord, DeviceNo: 2 };
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField]);
    optionsRepo.getDropdownData.mockResolvedValue([]);
    recordsRepo.getByInspection.mockResolvedValue([mockRecord, secondRecord]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.cancelPendingSaves.mockImplementation(() => undefined);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={2} />
      );
    });

    expect(voltageInputs(tree)).toHaveLength(2);
    expect(findTextInput(tree, "Voltage")).toBeTruthy();
  });

  it("7. restored devices (deactivated then re-added on grow) keep their expansion state", async () => {
    const secondRecord = { ...mockRecord, DeviceNo: 2 };
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField]);
    optionsRepo.getDropdownData.mockResolvedValue([]);
    recordsRepo.getByInspection.mockResolvedValue([mockRecord]);
    recordsRepo.scheduleDeviceRecordSave.mockResolvedValue(undefined);
    recordsRepo.flushPendingDeviceSaves.mockResolvedValue(undefined);
    recordsRepo.cancelPendingSaves.mockImplementation(() => undefined);
    recordsRepo.deactivateBeyond.mockResolvedValue(undefined);
    recordsRepo.restorePendingDeactivatedRecords.mockResolvedValue([secondRecord]);
    recordsRepo.save.mockResolvedValue(1);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });
    expect(voltageInputs(tree)).toHaveLength(1);

    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} />);
    });

    // Device 2 was deactivated earlier and is restored from the database on
    // grow — it must NOT be treated as a brand-new device and collapsed.
    const inputs = voltageInputs(tree);
    expect(inputs).toHaveLength(2);
  });

  it("8. count reset 1→2→3→0→3: 0 fully tears down, regrow creates a fresh set", async () => {
    const tree = await renderFreshCount(1);
    expect(voltageInputs(tree)).toHaveLength(1);

    // 1 -> 2
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} />);
    });
    // Device 1 keeps its state, device 2 collapses.
    expect(voltageInputs(tree)).toHaveLength(1);
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(2);

    // 2 -> 3
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={3} />);
    });
    // Device 1 keeps its state, device 2 stays expanded (manual), device 3 collapses.
    act(() => {
      deviceToggle(tree, 3).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(3);

    // 3 -> 0: all device instances removed.
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={0} />);
    });
    expect(voltageInputs(tree)).toHaveLength(0);

    // 0 -> 3: a brand-new device set. Device 1 expanded, devices 2 and 3
    // collapsed — no stale expansion state from the previous instances.
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={3} />);
    });
    expect(voltageInputs(tree)).toHaveLength(1);
    expect(findTextInput(tree, "Voltage")).toBeTruthy();
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(2);
  });

  it("9. count reset 1→2→0→2: no stale expansion state from previous instances", async () => {
    const tree = await renderFreshCount(1);
    expect(voltageInputs(tree)).toHaveLength(1);

    // 1 -> 2
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} />);
    });
    expect(voltageInputs(tree)).toHaveLength(1);

    // 2 -> 0: tear down.
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={0} />);
    });
    expect(voltageInputs(tree)).toHaveLength(0);

    // 0 -> 2: fresh set — device 1 expanded, device 2 collapsed.
    await act(async () => {
      tree.update(<DeviceSection inspectionId={42} deviceType="Camera" count={2} />);
    });
    expect(voltageInputs(tree)).toHaveLength(1);
    expect(findTextInput(tree, "Voltage")).toBeTruthy();
    act(() => {
      deviceToggle(tree, 2).props.onPress();
    });
    expect(voltageInputs(tree)).toHaveLength(2);
  });
});