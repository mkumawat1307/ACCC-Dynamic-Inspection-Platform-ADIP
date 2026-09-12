import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { SQLiteDatabase } from "expo-sqlite";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import { setActiveProject, getDatabase } from "@/src/database/db";

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

jest.mock("@/src/database/repositories/DeviceOptionsRepository", () => ({
  __esModule: true,
  default: { getDropdownData: jest.fn() },
}));

const fieldDefsRepo = DeviceFieldDefinitionsRepository as jest.Mocked<
  typeof DeviceFieldDefinitionsRepository
>;
const optionsRepo = DeviceOptionsRepository as jest.Mocked<
  typeof DeviceOptionsRepository
>;

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

type DeviceRow = {
  RecordID: number;
  InspectionID: number;
  DeviceType: string;
  DeviceNo: number;
  DeviceData: string | null;
  IsActive: number;
};

let pathCounter = 0;

function uniqueProjectPath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/Integration${pathCounter}/inspection.db`;
}

function findVoltageInputs(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll((n) => {
    if ((n as { type?: unknown }).type !== "TextInput") return false;
    return (n.props as { label?: string }).label === "Voltage";
  }) as unknown as Array<{
    props: { label: string; value?: string; onChangeText: (text: string) => void };
  }>;
}

function SectionHost({ count, resetStamp = 0 }: { count: number; resetStamp?: number }) {
  return count > 0 ? (
    <DeviceSection inspectionId={42} deviceType="Camera" count={count} resetStamp={resetStamp} />
  ) : null;
}

function expandDevice(tree: ReturnType<typeof TestRenderer.create>, deviceNo: number) {
  const toggle = tree.root.find(
    (n) => (n.props as { testID?: string } | undefined)?.testID === `dev-toggle-${deviceNo}`
  ) as unknown as { props: { onPress: () => void } };
  act(() => {
    toggle.props.onPress();
  });
}

describe("DeviceSection integration — flush-before-deactivate fix (11 regression tests)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useFakeTimers();
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useRealTimers();
  });

  async function setup() {
    fieldDefsRepo.getByDeviceType.mockResolvedValue([numberField, textField]);
    optionsRepo.getDropdownData.mockResolvedValue([]);
    await setActiveProject(uniqueProjectPath());
    return getDatabase();
  }

  async function cameraRows(db: SQLiteDatabase): Promise<DeviceRow[]> {
    return db.getAllAsync<DeviceRow>(
      `SELECT RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive
       FROM DeviceRecords WHERE DeviceType = ? ORDER BY DeviceNo`,
      ["Camera"]
    );
  }

  async function batteryRows(db: SQLiteDatabase): Promise<DeviceRow[]> {
    return db.getAllAsync<DeviceRow>(
      `SELECT RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive
       FROM DeviceRecords WHERE DeviceType = ? ORDER BY DeviceNo`,
      ["Battery"]
    );
  }

  it("1. 3→1→3 within debounce window preserves cam2/cam3 typed data", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });
    // Fresh devices 2 and 3 start collapsed (only device 1 is expanded).
    expect(findVoltageInputs(tree)).toHaveLength(1);
    expandDevice(tree, 2);
    expandDevice(tree, 3);
    expect(findVoltageInputs(tree)).toHaveLength(3);

    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("15");
      findVoltageInputs(tree)[2].props.onChangeText("16");
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    const rows = await cameraRows(db);
    const cam2 = rows.filter((r) => r.DeviceNo === 2);
    const cam3 = rows.filter((r) => r.DeviceNo === 3);

    expect(cam2).toHaveLength(1);
    expect(cam3).toHaveLength(1);
    expect(cam2[0].DeviceData ?? "").toContain('"15"');
    expect(cam3[0].DeviceData ?? "").toContain('"16"');

    // Restored devices keep their expanded state after the grow (they were
    // expanded before the shrink, and restored rows are not auto-collapsed).
    expect(findVoltageInputs(tree)[1].props.value).toBe("15");
    expect(findVoltageInputs(tree)[2].props.value).toBe("16");
  });

  it("2. 3→0→1 keeps already-flushed cam1 data and drops never-persisted rows", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });

    act(() => {
      findVoltageInputs(tree)[0].props.onChangeText("11");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expandDevice(tree, 2);
    expandDevice(tree, 3);
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("15");
      findVoltageInputs(tree)[2].props.onChangeText("16");
    });

    await act(async () => {
      tree.update(<SectionHost count={0} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    expect(findVoltageInputs(tree)).toHaveLength(1);
    expect(findVoltageInputs(tree)[0].props.value).toBe("11");

    const rows = await cameraRows(db);
    const cam1 = rows.filter((r) => r.DeviceNo === 1);
    expect(cam1).toHaveLength(1);
    expect(cam1[0].DeviceData ?? "").toContain('"11"');
  });

  it("3. 3→1 flush writes data to DB before deactivation", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });

    expandDevice(tree, 2);
    expandDevice(tree, 3);
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("15");
      findVoltageInputs(tree)[2].props.onChangeText("16");
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {});
    await act(async () => {});

    const rows = await cameraRows(db);
    const cam2 = rows.find((r) => r.DeviceNo === 2);
    const cam3 = rows.find((r) => r.DeviceNo === 3);

    expect(cam2).toBeDefined();
    expect(cam2!.IsActive).toBe(0);
    expect(cam2!.DeviceData ?? "").toContain('"15"');

    expect(cam3).toBeDefined();
    expect(cam3!.IsActive).toBe(0);
    expect(cam3!.DeviceData ?? "").toContain('"16"');
  });

  it("4. grow restores deactivated rows with same RecordID and DeviceData", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });

    expandDevice(tree, 2);
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("15");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    const beforeShrink = await cameraRows(db);
    const cam2Before = beforeShrink.find((r) => r.DeviceNo === 2);
    expect(cam2Before).toBeDefined();
    const originalRecordID = cam2Before!.RecordID;

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    const afterGrow = await cameraRows(db);
    const cam2After = afterGrow.find((r) => r.DeviceNo === 2 && r.IsActive === 1);

    expect(cam2After).toBeDefined();
    expect(cam2After!.RecordID).toBe(originalRecordID);
    expect(cam2After!.DeviceData ?? "").toContain('"15"');
  });

  it("5. 1→3 creates fresh rows when no deactivated data exists", async () => {
    await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={1} />);
    });

    expect(findVoltageInputs(tree)).toHaveLength(1);

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    // Fresh devices 2 and 3 exist but start collapsed; device 1 stays open.
    expect(findVoltageInputs(tree)).toHaveLength(1);
    expandDevice(tree, 2);
    expandDevice(tree, 3);
    expect(findVoltageInputs(tree)).toHaveLength(3);

    expect(findVoltageInputs(tree)[0].props.value).toBe("");
    expect(findVoltageInputs(tree)[1].props.value).toBe("");
    expect(findVoltageInputs(tree)[2].props.value).toBe("");
  });

  it("6. 2→4 produces mixed restored + fresh rows", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={2} />);
    });

    expandDevice(tree, 2);
    act(() => {
      findVoltageInputs(tree)[0].props.onChangeText("10");
      findVoltageInputs(tree)[1].props.onChangeText("20");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={4} />);
    });

    // Device 2 was restored (kept expanded); devices 3 and 4 are fresh and
    // start collapsed.
    expect(findVoltageInputs(tree)).toHaveLength(2);
    expect(findVoltageInputs(tree)[0].props.value).toBe("10");
    expect(findVoltageInputs(tree)[1].props.value).toBe("20");
    expandDevice(tree, 3);
    expandDevice(tree, 4);
    expect(findVoltageInputs(tree)).toHaveLength(4);
    expect(findVoltageInputs(tree)[2].props.value).toBe("");
    expect(findVoltageInputs(tree)[3].props.value).toBe("");

    const rows = await cameraRows(db);
    const activeRows = rows.filter((r) => r.IsActive === 1);
    expect(activeRows.length).toBeGreaterThanOrEqual(2);
  });

  it("7. device-type isolation: Camera shrink doesn't deactivate Battery rows", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <>
          <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
          <DeviceSection inspectionId={42} deviceType="Battery" count={2} />
        </>
      );
    });

    // Fresh devices: Camera 1 and Battery 1 are expanded; cameras 2/3 and
    // battery 2 start collapsed. Expand cameras 2/3 so the Camera voltage
    // inputs sit at indexes 0-2 (not interleaved with Battery inputs).
    // Camera renders first, so the first dev-toggle-2 / dev-toggle-3 match
    // belongs to the Camera section.
    const expandCameraDevice = (deviceNo: number) => {
      const toggles = tree.root.findAll(
        (n) => (n.props as { testID?: string } | undefined)?.testID === `dev-toggle-${deviceNo}`
      );
      act(() => {
        (toggles[0].props as { onPress: () => void }).onPress();
      });
    };
    expandCameraDevice(2);
    expandCameraDevice(3);

    const voltageInputs = tree.root.findAll((n) => {
      if ((n as { type?: unknown }).type !== "TextInput") return false;
      return (n.props as { label?: string }).label === "Voltage";
    });
    expect(voltageInputs.length).toBeGreaterThanOrEqual(3);

    act(() => {
      (voltageInputs[1].props as { onChangeText: (t: string) => void }).onChangeText("99");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {
      tree.update(
        <>
          <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
          <DeviceSection inspectionId={42} deviceType="Battery" count={2} />
        </>
      );
    });

    const camRows = await cameraRows(db);
    const cam2 = camRows.find((r) => r.DeviceNo === 2 && r.IsActive === 0);
    expect(cam2).toBeDefined();
    expect(cam2!.DeviceData ?? "").toContain('"99"');

    const batRows = await batteryRows(db);
    expect(batRows.length).toBe(2);
    expect(batRows.every((r) => r.IsActive === 1)).toBe(true);
  });

  it("8. M-1 resurrection: flush consumes timers so deactivate blocks resurrection", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });

    expandDevice(tree, 2);
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("15");
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {});

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    const rows = await cameraRows(db);
    const cam2Active = rows.filter((r) => r.DeviceNo === 2 && r.IsActive === 1);
    expect(cam2Active).toHaveLength(1);

    expect(findVoltageInputs(tree)[1].props.value).toBe("15");
  });

  it("9. rapid 3→1→3 serialized queue produces correct final state", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });

    expandDevice(tree, 2);
    expandDevice(tree, 3);
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("15");
      findVoltageInputs(tree)[2].props.onChangeText("16");
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {});

    expect(findVoltageInputs(tree)).toHaveLength(3);
    expect(findVoltageInputs(tree)[1].props.value).toBe("15");
    expect(findVoltageInputs(tree)[2].props.value).toBe("16");

    const rows = await cameraRows(db);
    const cam2 = rows.find((r) => r.DeviceNo === 2 && r.IsActive === 1);
    expect(cam2).toBeDefined();
    expect(cam2!.DeviceData ?? "").toContain('"15"');

    const cam3 = rows.find((r) => r.DeviceNo === 3 && r.IsActive === 1);
    expect(cam3).toBeDefined();
    expect(cam3!.DeviceData ?? "").toContain('"16"');
  });

  it("10. rapid 3→1→0→3 unmount/remount preserves data", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={3} />);
    });

    act(() => {
      findVoltageInputs(tree)[0].props.onChangeText("11");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={0} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    const rows = await cameraRows(db);
    const cam1 = rows.find((r) => r.DeviceNo === 1);
    expect(cam1).toBeDefined();
    expect(cam1!.DeviceData ?? "").toContain('"11"');

    expect(findVoltageInputs(tree)[0].props.value).toBe("11");
  });

  it("11. rapid 1→3→1→3 multiple grow/shrink cycles preserve data", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={1} />);
    });

    act(() => {
      findVoltageInputs(tree)[0].props.onChangeText("10");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    // Devices 2 and 3 were freshly created by the 1→3 grow, so they start
    // collapsed; expand them before typing into their fields.
    expandDevice(tree, 2);
    expandDevice(tree, 3);
    act(() => {
      findVoltageInputs(tree)[1].props.onChangeText("20");
      findVoltageInputs(tree)[2].props.onChangeText("30");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await act(async () => {
      tree.update(<SectionHost count={1} />);
    });

    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });

    expect(findVoltageInputs(tree)[0].props.value).toBe("10");
    expect(findVoltageInputs(tree)[1].props.value).toBe("20");
    expect(findVoltageInputs(tree)[2].props.value).toBe("30");

    const rows = await cameraRows(db);
    const activeRows = rows.filter((r) => r.IsActive === 1);
    expect(activeRows).toHaveLength(3);

    const cam1 = rows.find((r) => r.DeviceNo === 1 && r.IsActive === 1);
    expect(cam1!.DeviceData ?? "").toContain('"10"');
    const cam2 = rows.find((r) => r.DeviceNo === 2 && r.IsActive === 1);
    expect(cam2!.DeviceData ?? "").toContain('"20"');
    const cam3 = rows.find((r) => r.DeviceNo === 3 && r.IsActive === 1);
    expect(cam3!.DeviceData ?? "").toContain('"30"');
  });

  it("12. count reset 1→2→3→0→3: remount after 0 collapses devices 2 and 3 when resetStamp is set", async () => {
    await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={1} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    // 1 -> 2: device 2 starts collapsed.
    await act(async () => {
      tree.update(<SectionHost count={2} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    // 2 -> 3: device 3 starts collapsed.
    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    // 3 -> 0: SectionRenderer hides DeviceSection entirely (count must be > 0).
    await act(async () => {
      tree.update(<SectionHost count={0} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(0);

    // 0 -> 3 WITHOUT the reset stamp reproduces the bug being fixed: the prior
    // set's records are still active in the DB, so the remount treats them as
    // existing and devices 1, 2 and 3 all render expanded.
    await act(async () => {
      tree.update(<SectionHost count={3} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(3);

    // 0 -> 3 WITH the reset stamp (SectionRenderer records that the count hit
    // 0): the set is treated as brand new — device 1 expanded, 2 and 3
    // collapsed, with no expansion state leaking from the previous set.
    await act(async () => {
      tree.update(<SectionHost count={0} />);
    });
    await act(async () => {
      tree.update(<SectionHost count={3} resetStamp={1} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    expandDevice(tree, 2);
    expect(findVoltageInputs(tree)).toHaveLength(2);
    expandDevice(tree, 3);
    expect(findVoltageInputs(tree)).toHaveLength(3);
  });

  it("13. count reset 1→2→0→2: remount after 0 collapses device 2 when resetStamp is set", async () => {
    await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(<SectionHost count={1} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    await act(async () => {
      tree.update(<SectionHost count={2} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    await act(async () => {
      tree.update(<SectionHost count={0} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(0);

    // Without the reset stamp the prior set's records remain expanded (bug).
    await act(async () => {
      tree.update(<SectionHost count={2} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(2);

    // With the reset stamp device 2 starts collapsed.
    await act(async () => {
      tree.update(<SectionHost count={0} />);
    });
    await act(async () => {
      tree.update(<SectionHost count={2} resetStamp={1} />);
    });
    expect(findVoltageInputs(tree)).toHaveLength(1);

    expandDevice(tree, 2);
    expect(findVoltageInputs(tree)).toHaveLength(2);
  });
});
