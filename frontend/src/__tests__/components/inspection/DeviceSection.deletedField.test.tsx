import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { SQLiteDatabase } from "expo-sqlite";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import DeviceRecordsRepository from "@/src/database/repositories/DeviceRecordsRepository";
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

const activeDef = {
  FieldDefID: 10,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "Brand",
  Label: "Brand",
  FieldType: "text",
  IsRequired: 0,
  DisplayOrder: 1,
  IsActive: 1,
  IsVisible: 1,
};

const deletedCameraTypeDef = {
  FieldDefID: 11,
  TemplateID: 1,
  DeviceType: "Camera",
  FieldName: "CameraType",
  Label: "Camera Type",
  FieldType: "text",
  IsRequired: 0,
  DisplayOrder: 2,
  IsActive: 0,
  IsVisible: 1,
};

function findInputs(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  return tree.root.findAll((n) => {
    if ((n as { type?: unknown }).type !== "TextInput") return false;
    return (n.props as { label?: string }).label === label;
  }) as unknown as Array<{
    props: { label: string; value?: string; editable?: boolean; onChangeText: (text: string) => void };
  }>;
}

let pathCounter = 0;

function uniqueProjectPath(): string {
  pathCounter += 1;
  return `/mock/documents/Projects/DeletedField${pathCounter}/inspection.db`;
}

async function seedCameraRecord(db: SQLiteDatabase, data: Record<string, string>) {
  await db.runAsync(
    `INSERT INTO DeviceRecords (InspectionID, DeviceType, DeviceNo, DeviceData, DisplayOrder, IsActive)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [42, "Camera", 1, JSON.stringify(data), 1, 1]
  );
}

type DeviceRow = {
  DeviceData: string | null;
};

describe("DeviceSection — individually-deleted device field reconstruction for old inspections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useFakeTimers();
  });

  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.useRealTimers();
  });

  it("renders a deleted device field for an existing inspection, labeled 'Deleted <Name>', with its historical value, editable (case 7)", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [activeDef, deletedCameraTypeDef] : [activeDef])
    );
    optionsRepo.getDropdownData.mockResolvedValue([]);
    await setActiveProject(uniqueProjectPath());
    const db = await getDatabase();
    await seedCameraRecord(db, { Brand: "Hikvision", CameraType: "Bullet" });

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const deletedInputs = findInputs(tree, "Deleted Camera Type");
    expect(deletedInputs).toHaveLength(1);
    expect(deletedInputs[0].props.value).toBe("Bullet");
    expect(deletedInputs[0].props.editable).not.toBe(false);
  });

  it("does not render the deleted device field when the record has no historical value for it (case 8)", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [activeDef, deletedCameraTypeDef] : [activeDef])
    );
    optionsRepo.getDropdownData.mockResolvedValue([]);
    await setActiveProject(uniqueProjectPath());
    const db = await getDatabase();
    await seedCameraRecord(db, { Brand: "Hikvision" });

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    expect(findInputs(tree, "Deleted Camera Type")).toHaveLength(0);
    expect(findInputs(tree, "Brand")).toHaveLength(1);
  });

  it("editing the deleted field's historical value persists the change (case 9)", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [activeDef, deletedCameraTypeDef] : [activeDef])
    );
    optionsRepo.getDropdownData.mockResolvedValue([]);
    await setActiveProject(uniqueProjectPath());
    const db = await getDatabase();
    await seedCameraRecord(db, { Brand: "Hikvision", CameraType: "Bullet" });

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} existing />
      );
    });

    const deletedInputs = findInputs(tree, "Deleted Camera Type");
    act(() => {
      deletedInputs[0].props.onChangeText("Dome");
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    const rows = await db.getAllAsync<DeviceRow>(
      `SELECT DeviceData FROM DeviceRecords WHERE InspectionID = ? AND DeviceType = ?`,
      [42, "Camera"]
    );
    expect(rows[0].DeviceData ?? "").toContain('"CameraType":"Dome"');
  });

  it("does not expose the deleted device field to a new inspection even when the def is inactive (case 10)", async () => {
    fieldDefsRepo.getByDeviceType.mockImplementation((_dt, _tid, includeInactive) =>
      Promise.resolve(includeInactive ? [activeDef, deletedCameraTypeDef] : [activeDef])
    );
    optionsRepo.getDropdownData.mockResolvedValue([]);
    await setActiveProject(uniqueProjectPath());
    const db = await getDatabase();
    await seedCameraRecord(db, { Brand: "Hikvision", CameraType: "Bullet" });

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={1} />
      );
    });

    expect(findInputs(tree, "Deleted Camera Type")).toHaveLength(0);
    expect(findInputs(tree, "Brand")).toHaveLength(1);
  });
});