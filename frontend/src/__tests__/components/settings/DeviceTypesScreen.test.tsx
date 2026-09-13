import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import DeviceTypesScreen from "@/app/settings/device-types";
import DeviceFieldDefinitionsRepository from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import ProjectDeviceTypesRepository from "@/src/database/repositories/ProjectDeviceTypesRepository";
import { getDatabase } from "@/src/database/db";

type HostComponent = ((props: Record<string, unknown>) => React.ReactElement) &
  Record<string, unknown>;

jest.mock("react-native-safe-area-context", () => {
  const ReactMock = require("react");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactMock.createElement(ReactMock.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("react-native-paper", () => {
  const ReactPaper = require("react");
  const make = (name: string): HostComponent => {
    const Comp = (props: Record<string, unknown>) => ReactPaper.createElement(name, props);
    return Comp as HostComponent;
  };
  const Appbar = make("Appbar");
  Appbar.Header = make("AppbarHeader");
  Appbar.BackAction = make("AppbarBackAction");
  Appbar.Content = make("AppbarContent");
  Appbar.Action = make("AppbarAction");
  const Dialog = make("Dialog");
  Dialog.Icon = make("DialogIcon");
  Dialog.Title = make("DialogTitle");
  Dialog.Content = make("DialogContent");
  Dialog.Actions = make("DialogActions");
  return {
    Text: make("Text"),
    TextInput: make("TextInput"),
    Chip: make("Chip"),
    Button: make("Button"),
    IconButton: make("IconButton"),
    Appbar,
    Dialog,
    Portal: ({ children }: { children: React.ReactNode }) =>
      ReactPaper.createElement(ReactPaper.Fragment, null, children),
  };
});

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ deviceType: undefined })),
}));

jest.mock("@react-navigation/native", () => {
  let lastCb: (() => void) | null = null;
  return {
    useFocusEffect: jest.fn((cb: () => void) => {
      if (cb !== lastCb) {
        lastCb = cb;
        cb();
      }
    }),
  };
});

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("@/src/database/repositories/DeviceFieldDefinitionsRepository", () => ({
  __esModule: true,
  default: {
    getDeviceTypes: jest.fn(),
    getByDeviceType: jest.fn(),
    add: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    moveUp: jest.fn(),
    moveDown: jest.fn(),
    typeNameExists: jest.fn(),
  },
}));

jest.mock("@/src/database/repositories/ProjectDeviceTypesRepository", () => ({
  __esModule: true,
  default: {
    getRequired: jest.fn(),
    setRequired: jest.fn(),
  },
}));

jest.mock("@/src/components/app/settings/components/DeviceTypeBody", () => {
  const ReactMock = require("react");
  const { Button, Text } = require("react-native-paper");
  return {
    __esModule: true,
    default: (props: {
      selectedType: string;
      fields: unknown[];
      onAddField: () => void;
      onEditField: (field: unknown) => void;
    }) =>
      ReactMock.createElement(
        ReactMock.Fragment,
        null,
        ReactMock.createElement(Text, null, `Body:${props.selectedType}`),
        ReactMock.createElement(Button, { onPress: () => props.onAddField() }, "Add Field"),
        props.fields.length > 0
          ? ReactMock.createElement(
              Button,
              { onPress: () => props.onEditField(props.fields[0]) },
              "Edit Field"
            )
          : null
      ),
  };
});

const dfRepo = DeviceFieldDefinitionsRepository as jest.Mocked<
  typeof DeviceFieldDefinitionsRepository
>;
const typesRepo = ProjectDeviceTypesRepository as jest.Mocked<
  typeof ProjectDeviceTypesRepository
>;

interface TestNode {
  type?: unknown;
  props: Record<string, unknown>;
}

function nodeByText(tree: ReturnType<typeof TestRenderer.create>, type: string, text: string) {
  const node = tree.root.findAll((n) => {
    const inst = n as TestNode;
    return inst.type === type && inst.props.children === text;
  })[0];
  return node?.props as Record<string, unknown> | undefined;
}

function textInputByLabel(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  const node = tree.root.findAll((n) => {
    const inst = n as TestNode;
    return inst.type === "TextInput" && inst.props.label === label;
  })[0];
  return node?.props as { label: string; value?: string } | undefined;
}

async function renderScreen(fields: unknown[] = []) {
  (dfRepo.getDeviceTypes as jest.Mock).mockResolvedValue(["NVR"]);
  (dfRepo.getByDeviceType as jest.Mock).mockResolvedValue(fields);
  (typesRepo.getRequired as jest.Mock).mockResolvedValue([]);
  (getDatabase as jest.Mock).mockResolvedValue({
    getFirstAsync: jest.fn().mockResolvedValue({ TemplateID: 1 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue(undefined),
  });
  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(<DeviceTypesScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

const SAMPLE_DF = (overrides: Record<string, unknown> = {}) => ({
  FieldDefID: 1,
  DeviceType: "NVR",
  FieldName: "CurrentSample",
  Label: "Current Sample",
  FieldType: "number",
  Placeholder: null,
  DisplayOrder: 1,
  IsRequired: 1,
  IsVisible: 1,
  IsActive: 1,
  CreatedAt: "",
  UpdatedAt: "",
  ...overrides,
});

describe("DeviceTypesScreen (Device Field definitions)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("types into the field label without a separate Field Name input and derives FieldName at Save (create)", async () => {
    (dfRepo.add as jest.Mock).mockResolvedValue(1);
    const tree = await renderScreen();
    act(() => {
      (nodeByText(tree, "Button", "Add Field")?.onPress as () => void)();
    });
    expect(textInputByLabel(tree, "Field Name")).toBeUndefined();
    act(() => {
      (textInputByLabel(tree, "Display Label") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Current Sample");
    });
    expect(textInputByLabel(tree, "Display Label")?.value).toBe("Current Sample");
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dfRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({ Label: "Current Sample", FieldName: "CurrentSample" }),
      1
    );
  });

  it("renaming a device field preserves its original FieldName (no live derivation)", async () => {
    (dfRepo.update as jest.Mock).mockResolvedValue(undefined);
    const tree = await renderScreen([SAMPLE_DF()]);
    act(() => {
      (nodeByText(tree, "Button", "Edit Field")?.onPress as () => void)();
    });
    expect(textInputByLabel(tree, "Display Label")?.value).toBe("Current Sample");
    act(() => {
      (textInputByLabel(tree, "Display Label") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Current Sample AC");
    });
    expect(textInputByLabel(tree, "Display Label")?.value).toBe("Current Sample AC");
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dfRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ Label: "Current Sample AC", FieldName: "CurrentSample" })
    );
  });
});