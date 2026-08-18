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
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/components/inspection/renderFieldInput", () => ({
  ...jest.requireActual("@/src/components/inspection/renderFieldInput"),
  autoScrollDropdown: jest.fn(),
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

function SectionHost({ count }: { count: number }) {
  return count > 0 ? (
    <DeviceSection inspectionId={42} deviceType="Camera" count={count} />
  ) : null;
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

    expect(findVoltageInputs(tree)).toHaveLength(4);
    expect(findVoltageInputs(tree)[0].props.value).toBe("10");
    expect(findVoltageInputs(tree)[1].props.value).toBe("20");
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
});
