import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { SQLiteDatabase } from "expo-sqlite";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import DeviceRecordsRepository from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import { setActiveProject, getDatabase } from "@/src/database/db";
import { createProjectSchema } from "@/src/database/schema";

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
    scrollFocusedFieldIntoView: jest.fn(),
  }),
  InspectionScrollProvider: ({ children }: { children: React.ReactNode }) => children,
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
const optionsRepo = DeviceOptionsRepository as jest.Mocked<typeof DeviceOptionsRepository>;

const cameraTypeDef = {
  FieldDefID: 10,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "CameraType",
  Label: "Camera Type",
  FieldType: "dropdown",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
  IsVisible: 1,
};

function findDropdown(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll(
    (n) => (n as { type?: unknown }).type === "Dropdown"
  )[0] as unknown as {
    props: {
      value: string;
      data: Array<{ label: string; value: string; isClear?: boolean }>;
      onChange: (item: any) => void;
    };
  };
}

let pathCounter = 0;

function uniqueProjectPath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/DeletedOption${pathCounter}/inspection.db`;
}

async function seedCameraRecord(
  db: SQLiteDatabase,
  data: Record<string, string>,
  deviceNo = 1
) {
  await db.runAsync(
    `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData, DisplayOrder, IsActive)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [42, "Camera", deviceNo, JSON.stringify(data), deviceNo, 1]
  );
}

describe("DeviceSection — deleted option on an ACTIVE device field stays selectable for historical inspections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useFakeTimers();
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useRealTimers();
  });

  it("existing inspection keeps a soft-deleted dropdown option that matches its saved DeviceData", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [cameraTypeDef] : [cameraTypeDef])
    );
    optionsRepo.getDropdownData.mockImplementation(async (_dt, _f, _t, includeInactive) => {
      const all = [
        { label: "Fixed", value: "Fixed", isDefault: 0, IsActive: 1 },
        { label: "Bullet", value: "Bullet", isDefault: 0, IsActive: 0 },
      ];
      return includeInactive ? all : all.filter((o) => o.IsActive === 1);
    });

    await setActiveProject(uniqueProjectPath());
    const db = await getDatabase();
    await createProjectSchema();
    await seedCameraRecord(db, { CameraType: "Bullet" });

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const dd = findDropdown(tree);
    expect(dd.props.value).toBe("Bullet");
    expect(dd.props.data.map((i) => i.label)).toEqual(["Fixed", "Bullet", "Clear selection"]);
  });

  it("re-selecting the deleted option on an existing inspection persists it", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [cameraTypeDef] : [cameraTypeDef])
    );
    optionsRepo.getDropdownData.mockImplementation(async (_dt, _f, _t, includeInactive) => {
      const all = [
        { label: "Fixed", value: "Fixed", isDefault: 0, IsActive: 1 },
        { label: "Bullet", value: "Bullet", isDefault: 0, IsActive: 0 },
      ];
      return includeInactive ? all : all.filter((o) => o.IsActive === 1);
    });

    await setActiveProject(uniqueProjectPath());
    const db = await getDatabase();
    await createProjectSchema();
    await seedCameraRecord(db, { CameraType: "Fixed" }, 1);
    await seedCameraRecord(db, { CameraType: "Bullet" }, 2);

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={2} existing />
      );
    });

    let dd = findDropdown(tree);
    expect(dd.props.value).toBe("Fixed");
    expect(dd.props.data.map((i) => i.label)).toContain("Bullet");

    await act(async () => {
      dd.props.onChange({ label: "Bullet", value: "Bullet" });
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    const rows = await db.getAllAsync<{ DeviceNo: number; DeviceData: string | null }>(
      `SELECT DeviceNo, DeviceData FROM DeviceRecords WHERE InspectionID = ? AND DeviceType = ?`,
      [42, "Camera"]
    );
    expect(rows.find((r) => r.DeviceNo === 1)!.DeviceData ?? "").toContain('"CameraType":"Bullet"');
  });

  it("a new inspection does NOT expose the deleted option (active options only)", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [cameraTypeDef] : [cameraTypeDef])
    );
    optionsRepo.getDropdownData.mockImplementation(async (_dt, _f, _t, includeInactive) => {
      const all = [
        { label: "Fixed", value: "Fixed", isDefault: 0, IsActive: 1 },
        { label: "Bullet", value: "Bullet", isDefault: 0, IsActive: 0 },
      ];
      return includeInactive ? all : all.filter((o) => o.IsActive === 1);
    });

    await setActiveProject(uniqueProjectPath());

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    const dd = findDropdown(tree);
    expect(optionsRepo.getDropdownData).toHaveBeenCalledWith("Camera", "CameraType", undefined);
    expect(dd.props.data.map((i) => i.label)).toEqual(["Fixed"]);
  });
});