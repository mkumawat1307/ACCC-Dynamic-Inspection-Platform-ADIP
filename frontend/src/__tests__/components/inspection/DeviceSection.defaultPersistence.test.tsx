import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { SQLiteDatabase } from "expo-sqlite";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import { DeviceRecordsRepository } from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import { InspectionEditSession } from "@/src/database/repositories/InspectionEditSession";
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
  const R = require("react");
  const { Text, View } = require("react-native");
  const Card = ({ children }: { children: React.ReactNode }) =>
    R.createElement(View, null, children);
  Card.Title = (props: Record<string, unknown>) => R.createElement("CardTitle", props);
  Card.Content = ({ children }: { children: React.ReactNode }) =>
    R.createElement(View, null, children);
  return {
    Text,
    TextInput: (props: Record<string, unknown>) => R.createElement("TextInput", props),
    Card,
  };
});

jest.mock("react-native-element-dropdown", () => ({
  Dropdown: (props: any) => {
    const R = require("react");
    return R.createElement("Dropdown", props);
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
  FieldDefID: 1, TemplateID: 1, DeviceType: "Camera",
  FieldName: "Voltage", Label: "Voltage", FieldType: "number",
  IsRequired: 0, DisplayOrder: 1, IsActive: 1,
};

const dropdownField = {
  FieldDefID: 3, TemplateID: 1, DeviceType: "Camera",
  FieldName: "CameraType", Label: "Camera Type", FieldType: "dropdown",
  IsRequired: 0, DisplayOrder: 2, IsActive: 1,
};

const batteryVoltageField = {
  FieldDefID: 10, TemplateID: 1, DeviceType: "Battery",
  FieldName: "Capacity", Label: "Capacity", FieldType: "number",
  IsRequired: 0, DisplayOrder: 1, IsActive: 1,
};

const batteryDropdownField = {
  FieldDefID: 11, TemplateID: 1, DeviceType: "Battery",
  FieldName: "BatteryType", Label: "Battery Type", FieldType: "dropdown",
  IsRequired: 0, DisplayOrder: 2, IsActive: 1,
};

type DeviceRow = {
  RecordID: number;
  InspectionID: number;
  DeviceType: string;
  DeviceNo: number;
  DeviceData: string | null;
  IsActive: number;
  DisplayOrder: number;
};

let pathCounter = 0;
function uniquePath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/DefaultPersist${pathCounter}/inspection.db`;
}

async function queryDeviceRows(db: SQLiteDatabase, deviceType: string): Promise<DeviceRow[]> {
  return db.getAllAsync<DeviceRow>(
    `SELECT RecordID, InspectionID, DeviceType, DeviceNo, DeviceData, IsActive
     FROM DeviceRecords WHERE DeviceType = ? ORDER BY DeviceNo`,
    [deviceType]
  );
}

describe("DeviceSection default persistence — Phase 7A regression (10 tests)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useFakeTimers();
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useRealTimers();
  });

  async function setup(db?: SQLiteDatabase) {
    fieldDefsRepo.getByDeviceType.mockImplementation(async (_dt: string) => {
      if (_dt === "Battery") return [batteryVoltageField, batteryDropdownField];
      return [numberField, dropdownField];
    });
    optionsRepo.getDropdownData.mockImplementation(async (_dt: string, fieldName: string) => {
      if (_dt === "Camera" && fieldName === "CameraType") {
        return [
          { label: "PTZ", value: "PTZ", isDefault: 1 },
          { label: "Fixed", value: "Fixed", isDefault: 0 },
        ];
      }
      if (_dt === "Battery" && fieldName === "BatteryType") {
        return [
          { label: "Li-Ion", value: "Li-Ion", isDefault: 1 },
          { label: "Lead-Acid", value: "Lead-Acid", isDefault: 0 },
        ];
      }
      return [];
    });
    if (!db) {
      await setActiveProject(uniquePath());
      return getDatabase();
    }
    return db;
  }

  it("1. new device with dropdown default: DB DeviceData contains default value", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rows = await queryDeviceRows(db, "Camera");
    expect(rows.length).toBe(1);
    const data = JSON.parse(rows[0].DeviceData!);
    expect(data.CameraType).toBe("PTZ");
  });

  it("2. new device with no default: DB DeviceData has null for dropdown field", async () => {
    const db = await setup();

    optionsRepo.getDropdownData.mockImplementation(async (_dt: string, fieldName: string) => {
      if (_dt === "Camera" && fieldName === "CameraType") {
        return [
          { label: "PTZ", value: "PTZ", isDefault: 0 },
          { label: "Fixed", value: "Fixed", isDefault: 0 },
        ];
      }
      return [];
    });

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rows = await queryDeviceRows(db, "Camera");
    expect(rows.length).toBe(1);
    const data = JSON.parse(rows[0].DeviceData!);
    expect(data.CameraType).toBeNull();
    expect(data.Voltage).toBeNull();
  });

  it("3. user changes value: DB DeviceData reflects user value, not default", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rowsBefore = await queryDeviceRows(db, "Camera");
    expect(rowsBefore.length).toBe(1);
    expect(JSON.parse(rowsBefore[0].DeviceData!).CameraType).toBe("PTZ");

    const rec = { ...rowsBefore[0] };
    const data = JSON.parse(rec.DeviceData!);
    data.CameraType = "Fixed";
    rec.DeviceData = JSON.stringify(data);
    await DeviceRecordsRepository.save(rec);

    const rowsAfter = await queryDeviceRows(db, "Camera");
    expect(rowsAfter.length).toBe(1);
    expect(JSON.parse(rowsAfter[0].DeviceData!).CameraType).toBe("Fixed");
  });

  it("4. multiple devices all get defaults in DB on creation", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    const rows = await queryDeviceRows(db, "Camera");
    expect(rows.length).toBe(3);
    for (const row of rows) {
      const data = JSON.parse(row.DeviceData!);
      expect(data.CameraType).toBe("PTZ");
      expect(data.Voltage).toBeNull();
    }
  });

  it("5. existing record with user value preserved when config default changes", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rowsBefore = await queryDeviceRows(db, "Camera");
    const rec = { ...rowsBefore[0] };
    const data = JSON.parse(rec.DeviceData!);
    data.CameraType = "Fixed";
    rec.DeviceData = JSON.stringify(data);
    await DeviceRecordsRepository.save(rec);

    const check1 = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(check1[0].DeviceData!).CameraType).toBe("Fixed");

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rowsAfter = await queryDeviceRows(db, "Camera");
    expect(rowsAfter.length).toBe(1);
    expect(JSON.parse(rowsAfter[0].DeviceData!).CameraType).toBe("Fixed");
  });

  it("6. device-type isolation: Camera defaults don't affect Battery records", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <>
          <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
          <DeviceSection inspectionId={42} deviceType="Battery" count={1} />
        </>
      );
    });

    const camRows = await queryDeviceRows(db, "Camera");
    expect(camRows.length).toBe(1);
    expect(JSON.parse(camRows[0].DeviceData!).CameraType).toBe("PTZ");

    const batRows = await queryDeviceRows(db, "Battery");
    expect(batRows.length).toBe(1);
    expect(JSON.parse(batRows[0].DeviceData!).BatteryType).toBe("Li-Ion");
    expect(JSON.parse(batRows[0].DeviceData!).CameraType).toBeUndefined();
  });

  it("7. grow from 1→3: new devices get defaults in DB, existing unchanged", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rowsBefore = await queryDeviceRows(db, "Camera");
    expect(rowsBefore.length).toBe(1);
    const rec = { ...rowsBefore[0] };
    const data = JSON.parse(rec.DeviceData!);
    data.CameraType = "Fixed";
    rec.DeviceData = JSON.stringify(data);
    await DeviceRecordsRepository.save(rec);

    await act(async () => {
      tree.update(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    const rows = await queryDeviceRows(db, "Camera");
    const activeRows = rows.filter((r) => r.IsActive === 1);
    expect(activeRows.length).toBe(3);

    const cam1 = activeRows.find((r) => r.DeviceNo === 1)!;
    expect(JSON.parse(cam1.DeviceData!).CameraType).toBe("Fixed");

    const cam2 = activeRows.find((r) => r.DeviceNo === 2)!;
    expect(JSON.parse(cam2.DeviceData!).CameraType).toBe("PTZ");

    const cam3 = activeRows.find((r) => r.DeviceNo === 3)!;
    expect(JSON.parse(cam3.DeviceData!).CameraType).toBe("PTZ");
  });

  it("8. number field defaults are null in DB (not zero)", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const rows = await queryDeviceRows(db, "Camera");
    const data = JSON.parse(rows[0].DeviceData!);
    expect(data.Voltage).toBeNull();
  });

  it("9. 3→1→3 restore: deactivated record retains original user data in DB", async () => {
    const db = await setup();

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    const findVoltageInputs = (t: ReturnType<typeof TestRenderer.create>) =>
      t.root.findAll((n) => {
        if ((n as any).type !== "TextInput") return false;
        return (n.props as any).label === "Voltage";
      });

    const expandDevice = (t: ReturnType<typeof TestRenderer.create>, deviceNo: number) => {
      const toggle = t.root.find(
        (n) => (n.props as any)?.testID === `dev-toggle-${deviceNo}`
      );
      act(() => {
        (toggle.props as any).onPress();
      });
    };

    // Freshly created devices 2 and 3 start collapsed; expand them first.
    expandDevice(tree, 2);
    expandDevice(tree, 3);
    act(() => {
      const inputs = findVoltageInputs(tree);
      (inputs[1].props as any).onChangeText("20");
    });
    await act(async () => { jest.advanceTimersByTime(600); });

    act(() => {
      const inputs = findVoltageInputs(tree);
      (inputs[2].props as any).onChangeText("30");
    });
    await act(async () => { jest.advanceTimersByTime(600); });

    await act(async () => {
      tree.update(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    await act(async () => {
      tree.update(
        <DeviceSection inspectionId={42} deviceType="Camera" count={3} />
      );
    });

    const rows = await queryDeviceRows(db, "Camera");
    const activeRows = rows.filter((r) => r.IsActive === 1);
    expect(activeRows).toHaveLength(3);

    const cam2 = activeRows.find((r) => r.DeviceNo === 2)!;
    expect(JSON.parse(cam2.DeviceData!).Voltage).toBe("20");
    const cam3 = activeRows.find((r) => r.DeviceNo === 3)!;
    expect(JSON.parse(cam3.DeviceData!).Voltage).toBe("30");
  });

  it("10. multiple inspections: each gets independent defaults in DB", async () => {
    const db = await setup();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={99} deviceType="Camera" count={1} />
      );
    });

    const rows42 = await db.getAllAsync<DeviceRow>(
      `SELECT * FROM DeviceRecords WHERE InspectionID = 42 AND DeviceType = ? AND IsActive = 1`,
      ["Camera"]
    );
    const rows99 = await db.getAllAsync<DeviceRow>(
      `SELECT * FROM DeviceRecords WHERE InspectionID = 99 AND DeviceType = ? AND IsActive = 1`,
      ["Camera"]
    );

    expect(rows42.length).toBe(1);
    expect(rows99.length).toBe(1);
    expect(JSON.parse(rows42[0].DeviceData!).CameraType).toBe("PTZ");
    expect(JSON.parse(rows99[0].DeviceData!).CameraType).toBe("PTZ");
  });
});

describe("DeviceSection existing inspection — defaults are NEVER shown or staged (saved-only display)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useFakeTimers();
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useRealTimers();
  });

  async function seedCameraRecord(
    db: SQLiteDatabase,
    inspectionId: number,
    deviceNo: number,
    data: Record<string, string | null>
  ): Promise<void> {
    await DeviceRecordsRepository.save({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceNo: deviceNo,
      DeviceData: JSON.stringify(data),
      DisplayOrder: deviceNo,
      IsActive: 1,
    });
    expect((await queryDeviceRows(db, "Camera")).length).toBe(deviceNo);
  }

  async function setup(db?: SQLiteDatabase) {
    fieldDefsRepo.getByDeviceType.mockImplementation(async (_dt: string) => {
      if (_dt === "Battery") return [batteryVoltageField, batteryDropdownField];
      return [numberField, dropdownField];
    });
    optionsRepo.getDropdownData.mockImplementation(async (_dt: string, fieldName: string) => {
      if (_dt === "Camera" && fieldName === "CameraType") {
        return [
          { label: "PTZ", value: "PTZ", isDefault: 1 },
          { label: "Fixed", value: "Fixed", isDefault: 0 },
        ];
      }
      if (_dt === "Battery" && fieldName === "BatteryType") {
        return [
          { label: "Li-Ion", value: "Li-Ion", isDefault: 1 },
          { label: "Lead-Acid", value: "Lead-Acid", isDefault: 0 },
        ];
      }
      return [];
    });
    if (!db) {
      await setActiveProject(uniquePath());
      return getDatabase();
    }
    return db;
  }

  function findDropdowns(tree: ReturnType<typeof TestRenderer.create>) {
    return tree.root.findAll((n) => (n as any).type === "Dropdown");
  }

  it("existing + empty dropdown field: renders EMPTY (no default shown), DB DeviceData stays null", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: null });

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const dropdowns = findDropdowns(tree!);
    expect(dropdowns.length).toBe(1);
    expect(dropdowns[0].props.value).toBeNull();
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(0);

    const rows = await queryDeviceRows(db, "Camera");
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBeNull();
    expect(JSON.parse(rows[0].DeviceData!).Voltage).toBeNull();
  });

  it("existing + saved dropdown value: saved value wins over the current default", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: "12", CameraType: "Fixed" });

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const dropdowns = findDropdowns(tree!);
    expect(dropdowns[0].props.value).toBe("Fixed");

    const rows = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBe("Fixed");
    expect(JSON.parse(rows[0].DeviceData!).Voltage).toBe("12");
  });

  it("existing inspection: opening never creates device records from the count alone", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: null });

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={2} existing />
      );
    });

    await act(async () => {
      jest.runAllTimers();
    });

    const rows = await queryDeviceRows(db, "Camera");
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBeNull();
  });

  it("existing inspection: device defaults stay per inspection (no cross-inspection leakage)", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: null });

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={99} deviceType="Camera" count={1} existing />
      );
    });

    await act(async () => {
      jest.runAllTimers();
    });

    const rows42 = await db.getAllAsync<DeviceRow>(
      `SELECT * FROM DeviceRecords WHERE InspectionID = 42 AND DeviceType = ? AND IsActive = 1`,
      ["Camera"]
    );
    const rows99 = await db.getAllAsync<DeviceRow>(
      `SELECT * FROM DeviceRecords WHERE InspectionID = 99 AND DeviceType = ? AND IsActive = 1`,
      ["Camera"]
    );
    expect(rows42.length).toBe(1);
    expect(rows99.length).toBe(0);
  });
});

describe("DeviceSection existing inspection — explicit user edits persist on Save, cancel discards (defaults never auto-staged)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DeviceRecordsRepository.cancelPendingSaves();
    InspectionEditSession.discard();
    jest.useFakeTimers();
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    InspectionEditSession.discard();
    jest.useRealTimers();
  });

  async function seedCameraRecord(
    db: SQLiteDatabase,
    inspectionId: number,
    deviceNo: number,
    data: Record<string, string | null>
  ): Promise<void> {
    await DeviceRecordsRepository.save({
      InspectionID: inspectionId,
      DeviceType: "Camera",
      DeviceNo: deviceNo,
      DeviceData: JSON.stringify(data),
      DisplayOrder: deviceNo,
      IsActive: 1,
    });
    expect((await queryDeviceRows(db, "Camera")).length).toBe(deviceNo);
  }

  async function setup(db?: SQLiteDatabase) {
    fieldDefsRepo.getByDeviceType.mockImplementation(async (_dt: string) => {
      if (_dt === "Battery") return [batteryVoltageField, batteryDropdownField];
      return [numberField, dropdownField];
    });
    optionsRepo.getDropdownData.mockImplementation(async (_dt: string, fieldName: string) => {
      if (_dt === "Camera" && fieldName === "CameraType") {
        return [
          { label: "PTZ", value: "PTZ", isDefault: 1 },
          { label: "Fixed", value: "Fixed", isDefault: 0 },
        ];
      }
      if (_dt === "Battery" && fieldName === "BatteryType") {
        return [
          { label: "Li-Ion", value: "Li-Ion", isDefault: 1 },
          { label: "Lead-Acid", value: "Lead-Acid", isDefault: 0 },
        ];
      }
      return [];
    });
    if (!db) {
      await setActiveProject(uniquePath());
      return getDatabase();
    }
    return db;
  }

  function findDropdowns(tree: ReturnType<typeof TestRenderer.create>) {
    return tree.root.findAll((n) => (n as any).type === "Dropdown");
  }

  it("NULL saved + default Yes: opens EMPTY with DB null and nothing staged; explicit selection + Save persists Yes; reopen shows Yes", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: null });

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const dropdowns = findDropdowns(tree!);
    expect(dropdowns.length).toBe(1);
    expect(dropdowns[0].props.value).toBeNull();
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(0);

    const before = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(before[0].DeviceData!).CameraType).toBeNull();

    // Explicit user selection stages through the edit session
    InspectionEditSession.activate(42);
    await act(async () => {
      (dropdowns[0].props as any).onChange({ label: "PTZ", value: "PTZ" });
    });
    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const after = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(after[0].DeviceData!).CameraType).toBe("PTZ");
    expect(JSON.parse(after[0].DeviceData!).Voltage).toBeNull();

    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });
    const reopened = findDropdowns(tree!);
    expect(reopened[0].props.value).toBe("PTZ");
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(0);
  });

  it("user selects a value then Save: DB becomes that value", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: null });
    InspectionEditSession.activate(42);

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    let dropdowns = findDropdowns(tree!);
    expect(dropdowns[0].props.value).toBeNull();

    await act(async () => {
      (dropdowns[0].props as any).onChange({ label: "Fixed", value: "Fixed" });
    });

    dropdowns = findDropdowns(tree!);
    expect(dropdowns[0].props.value).toBe("Fixed");

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const rows = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBe("Fixed");
    expect(JSON.parse(rows[0].DeviceData!).Voltage).toBeNull();
  });

  it("user selects a value then Cancels: DB stays null, reopen stays EMPTY", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: null });
    InspectionEditSession.activate(42);

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    let dropdowns = findDropdowns(tree!);
    expect(dropdowns[0].props.value).toBeNull();

    await act(async () => {
      (dropdowns[0].props as any).onChange({ label: "Fixed", value: "Fixed" });
    });

    dropdowns = findDropdowns(tree!);
    expect(dropdowns[0].props.value).toBe("Fixed");

    await InspectionEditSession.discard();

    let rows = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBeNull();

    await act(async () => {
      TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    rows = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBeNull();
  });

  it("saved No + default Yes: opens No and Save keeps No (saved value always wins)", async () => {
    const db = await setup();
    await seedCameraRecord(db, 42, 1, { Voltage: null, CameraType: "Fixed" });
    InspectionEditSession.activate(42);

    let tree: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const dropdowns = findDropdowns(tree!);
    expect(dropdowns[0].props.value).toBe("Fixed");
    expect(InspectionEditSession.getStagedDeviceRecords().length).toBe(0);

    const committed = await InspectionEditSession.commit();
    expect(committed).toBe(true);

    const rows = await queryDeviceRows(db, "Camera");
    expect(JSON.parse(rows[0].DeviceData!).CameraType).toBe("Fixed");
  });
});
