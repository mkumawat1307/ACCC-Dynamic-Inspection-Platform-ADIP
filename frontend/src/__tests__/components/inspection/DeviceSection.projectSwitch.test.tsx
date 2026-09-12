import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import DeviceSection from "@/src/components/inspection/DeviceSection";
import {
  DeviceRecord,
  DeviceRecordsRepository,
} from "@/src/database/repositories/DeviceRecordsRepository";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import DeviceOptionsRepository from "@/src/database/repositories/DeviceOptionsRepository";
import { clearActiveProject, getDatabase, setActiveProject } from "@/src/database/db";

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
const optionsRepo = DeviceOptionsRepository as jest.Mocked<
  typeof DeviceOptionsRepository
>;

describe("DeviceSection project-switch isolation", () => {
  afterEach(() => {
    DeviceRecordsRepository.cancelPendingSaves();
    jest.restoreAllMocks();
  });

  it("does not create device records in another project when the project switches during mount fill", async () => {
    const pathA = "/mock/documents/Projects/DevA/inspection.db";
    const pathB = "/mock/documents/Projects/DevB/inspection.db";

    fieldDefsRepo.getByDeviceType.mockResolvedValue([]);
    optionsRepo.getDropdownData.mockResolvedValue([]);

    await setActiveProject(pathA);
    const dbA = await getDatabase();

    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    jest
      .spyOn(DeviceRecordsRepository, "getByInspection")
      .mockImplementationOnce(async () => {
        await gate;
        return [] as DeviceRecord[];
      });

    let tree!: ReturnType<typeof TestRenderer.create>;
    await act(async () => {
      tree = TestRenderer.create(
        <DeviceSection inspectionId={42} deviceType="Camera" count={2} />
      );
    });
    await act(async () => {});

    await act(async () => {
      await clearActiveProject();
    });
    await act(async () => {
      await setActiveProject(pathB);
    });
    const dbB = await getDatabase();

    resolveGate();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const rowsInB = await dbB.getAllAsync<{ RecordID: number }>(
      "SELECT RecordID FROM DeviceRecords"
    );
    expect(rowsInB).toHaveLength(0);

    const rowsInA = await dbA.getAllAsync<{ RecordID: number }>(
      "SELECT RecordID FROM DeviceRecords"
    );
    expect(rowsInA).toHaveLength(0);

    act(() => {
      tree.unmount();
    });
    await act(async () => {
      await clearActiveProject();
    });
  });
});