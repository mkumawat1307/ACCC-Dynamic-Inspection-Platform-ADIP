import React from "react";
import { Alert } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import OptionsScreen from "@/app/settings/options";
import { FieldOptionRepository } from "@/src/database/repositories/FieldOptionRepository";
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
  const Card = make("Card");
  Card.Content = make("CardContent");
  Card.Actions = make("CardActions");
  const Dialog = make("Dialog");
  Dialog.Title = make("DialogTitle");
  Dialog.Content = make("DialogContent");
  Dialog.Actions = make("DialogActions");
  return {
    Text: make("Text"),
    TextInput: make("TextInput"),
    Chip: make("Chip"),
    Button: make("Button"),
    IconButton: make("IconButton"),
    Switch: make("Switch"),
    Card,
    Appbar,
    Dialog,
    Portal: ({ children }: { children: React.ReactNode }) =>
      ReactPaper.createElement(ReactPaper.Fragment, null, children),
  };
});

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ fieldId: "1", fieldName: "Status" })),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb: () => void) => cb()),
}));

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("@/src/database/repositories/FieldOptionRepository", () => {
  const actual = jest.requireActual("@/src/database/repositories/FieldOptionRepository");
  return {
    ...actual,
    FieldOptionRepository: {
      getByField: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      hardDelete: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
    },
  };
});

const repo = FieldOptionRepository as jest.Mocked<typeof FieldOptionRepository>;

interface TestNode {
  type?: unknown;
  props: Record<string, unknown>;
}

function nodesByType(tree: ReturnType<typeof TestRenderer.create>, type: string) {
  return tree.root.findAll((n) => (n as TestNode).type === type);
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

async function renderScreen(options: unknown[] = [], sectionRow: unknown = null) {
  (repo.getByField as jest.Mock).mockResolvedValue(options);
  (getDatabase as jest.Mock).mockResolvedValue({
    getFirstAsync: jest.fn().mockResolvedValue(sectionRow),
  });
  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(<OptionsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

const SAMPLE_OPTION = (overrides: Record<string, unknown> = {}) => ({
  OptionID: 1,
  FieldID: 1,
  OptionLabel: "Yes",
  OptionValue: "Yes",
  DisplayOrder: 1,
  IsDefault: 1,
  IsActive: 1,
  CreatedAt: "",
  UpdatedAt: "",
  ...overrides,
});

describe("OptionsScreen (Fields -> Dropdown values)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the field name in the app bar and lists option rows", async () => {
    const tree = await renderScreen([SAMPLE_OPTION()]);
    expect(
      nodesByType(tree, "AppbarContent").filter(
        (n) => (n as TestNode).props.title === "Status"
      ).length
    ).toBe(1);
    const texts = nodesByType(tree, "Text").map((n) => (n as TestNode).props.children);
    expect(texts).toContain("Yes");
  });

  it("shows a Delete button for a dropdown value inside a default (non-locked) section", async () => {
    const tree = await renderScreen([SAMPLE_OPTION()], { SectionKey: "rf" });
    const deleteButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "delete"
    );
    expect(deleteButton).toBeDefined();
  });

  it("hides the Delete button for a dropdown value inside a locked section", async () => {
    const tree = await renderScreen([SAMPLE_OPTION()], { SectionKey: "remarks" });
    const deleteButtons = nodesByType(tree, "IconButton").filter(
      (n) => (n as TestNode).props.icon === "delete"
    );
    expect(deleteButtons.length).toBe(0);
  });

  it("pressing Delete on a dropdown value calls FieldOptionRepository.delete (soft), not hardDelete", async () => {
    const tree = await renderScreen([SAMPLE_OPTION()], { SectionKey: "rf" });
    const deleteButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "delete"
    );
    expect(deleteButton).toBeDefined();
    const spy = jest.spyOn(Alert, "alert");
    act(() => {
      ((deleteButton as unknown as TestNode).props as { onPress: () => void }).onPress();
    });
    const call = spy.mock.calls.find(([title]) => title === "Delete Option");
    expect(call).toBeDefined();
    const buttons = call![2] as { text: string; onPress: () => Promise<void> }[];
    const confirm = buttons.find((b) => b.text === "Delete");
    expect(confirm).toBeDefined();
    await act(async () => {
      await confirm!.onPress();
    });
    expect((repo.delete as jest.Mock).mock.calls[0][0]).toBe(1);
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it("types into the label without a separate value input and derives OptionValue at Save (create)", async () => {
    (repo.create as jest.Mock).mockResolvedValue(1);
    const tree = await renderScreen();
    act(() => {
      (nodeByText(tree, "Button", "Add Option")?.onPress as () => void)();
    });
    expect(textInputByLabel(tree, "Value *")).toBeUndefined();
    act(() => {
      (textInputByLabel(tree, "Label *") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Load Factor");
    });
    expect(textInputByLabel(tree, "Label *")?.value).toBe("Load Factor");
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ OptionLabel: "Load Factor", OptionValue: "Load Factor" })
    );
  });

  it("renaming an option edits only the label and preserves the original OptionValue", async () => {
    (repo.update as jest.Mock).mockResolvedValue(undefined);
    const tree = await renderScreen([SAMPLE_OPTION()]);
    const editButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "pencil"
    );
    expect(editButton).toBeDefined();
    act(() => {
      ((editButton as unknown as TestNode).props as { onPress: () => void }).onPress();
    });
    act(() => {
      (textInputByLabel(tree, "Label *") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("No");
    });
    expect(textInputByLabel(tree, "Label *")?.value).toBe("No");
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ OptionLabel: "No", OptionValue: "Yes" })
    );
  });
});