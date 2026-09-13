import React from "react";
import { Alert } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import FieldsScreen from "@/app/settings/fields";
import { CREATEABLE_FIELD_TYPES, FieldRepository } from "@/src/database/repositories/FieldRepository";
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
    Card,
    Appbar,
    Dialog,
    Portal: ({ children }: { children: React.ReactNode }) =>
      ReactPaper.createElement(ReactPaper.Fragment, null, children),
  };
});

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({ sectionId: "1", sectionName: "Test Section" })),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb: () => void) => cb()),
}));

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("@/src/database/repositories/FieldRepository", () => {
  const actual = jest.requireActual("@/src/database/repositories/FieldRepository");
  return {
    ...actual,
    FieldRepository: {
      getBySection: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      hardDelete: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
    },
  };
});

const repo = FieldRepository as jest.Mocked<typeof FieldRepository>;

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

function nodesByType(tree: ReturnType<typeof TestRenderer.create>, type: string) {
  return tree.root.findAll((n) => (n as TestNode).type === type);
}

function textInputByLabel(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  const node = tree.root.findAll((n) => {
    const inst = n as TestNode;
    return inst.type === "TextInput" && inst.props.label === label;
  })[0];
  return node?.props as { label: string; value?: string } | undefined;
}

async function renderScreen(fields: unknown[] = [], sectionRow: unknown = null) {
  (repo.getBySection as jest.Mock).mockResolvedValue(fields);
  (getDatabase as jest.Mock).mockResolvedValue({
    getFirstAsync: jest.fn().mockResolvedValue(sectionRow),
  });
  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(<FieldsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

const SAMPLE_FIELD = (overrides: Record<string, unknown> = {}) => ({
  FieldID: 1,
  SectionID: 1,
  FieldName: "Voltage",
  FieldKey: "voltage",
  FieldType: "number",
  Placeholder: null,
  DefaultValue: null,
  HelpText: null,
  ValidationRule: null,
  DisplayOrder: 1,
  IsRequired: 1,
  IsVisible: 1,
  IsReadOnly: 0,
  IsSystemField: 0,
  DataSourceType: null,
  DataSource: null,
  ParentFieldID: null,
  Width: 12,
  Icon: null,
  IsActive: 1,
  CreatedAt: "",
  UpdatedAt: "",
  ...overrides,
});

describe("FieldsScreen (Sections -> Fields)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Add Field button as a contained button in the header row (not a FAB)", async () => {
    const tree = await renderScreen();
    expect(nodeByText(tree, "Button", "Add Field")?.mode).toBe("contained");
    expect(nodesByType(tree, "FAB").length).toBe(0);
  });

  it("tapping Add Field opens the dialog with the five createable field types in order", async () => {
    const tree = await renderScreen();
    act(() => {
      (nodeByText(tree, "Button", "Add Field")?.onPress as () => void)();
    });
    const dialogChips = nodesByType(tree, "Chip")
      .filter((n) => typeof (n as TestNode).props.selected === "boolean")
      .map((n) => (n as TestNode).props.children);
    expect(dialogChips.slice(0, 5)).toEqual(CREATEABLE_FIELD_TYPES.map((t) => t.label));
  });

  it("tapping Add Field opens the dialog with Sections configuration fields present", async () => {
    const tree = await renderScreen();
    act(() => {
      (nodeByText(tree, "Button", "Add Field")?.onPress as () => void)();
    });
    for (const label of ["Field Name *", "Placeholder"]) {
      expect(textInputByLabel(tree, label)).toBeDefined();
    }
    expect(textInputByLabel(tree, "Default Value")).toBeUndefined();
    const chipTexts = nodesByType(tree, "Chip").map((n) => (n as TestNode).props.children);
    expect(chipTexts).toContain("Required");
    expect(chipTexts).toContain("Visible");
    expect(nodeByText(tree, "Button", "Cancel")).toBeDefined();
    expect(nodeByText(tree, "Button", "Save")).toBeDefined();
  });

  it("selecting a type chip in the dialog updates the selected type", async () => {
    const tree = await renderScreen();
    act(() => {
      (nodeByText(tree, "Button", "Add Field")?.onPress as () => void)();
    });
    const dropdown = nodeByText(tree, "Chip", "Dropdown");
    expect(dropdown?.selected).toBe(false);
    act(() => {
      (dropdown?.onPress as () => void)();
    });
    expect(nodeByText(tree, "Chip", "Dropdown")?.selected).toBe(true);
  });

  it("shows the Section name in the app bar and renders existing field cards", async () => {
    const tree = await renderScreen([SAMPLE_FIELD()]);
    expect(
      nodesByType(tree, "AppbarContent").filter(
        (n) => (n as TestNode).props.title === "Test Section"
      ).length
    ).toBe(1);
    const texts = nodesByType(tree, "Text").map((n) => (n as TestNode).props.children);
    expect(texts).toContain("Voltage");
    expect(texts).toContain("Numbers");
  });

  it("still renders legacy field types (e.g. GPS) on existing field cards", async () => {
    const tree = await renderScreen([
      SAMPLE_FIELD({ FieldID: 2, FieldName: "GpsCoord", FieldKey: "gps", FieldType: "GPS" }),
    ]);
    const texts = nodesByType(tree, "Text").map((n) => (n as TestNode).props.children);
    expect(texts).toContain("GpsCoord");
    expect(texts).toContain("GPS");
  });

  it("editing a legacy field locks its type and preserves it on save (no accidental rewrite)", async () => {
    const tree = await renderScreen([
      SAMPLE_FIELD({ FieldID: 2, FieldName: "GpsCoord", FieldKey: "gps", FieldType: "GPS" }),
    ]);

    const editButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "pencil"
    );
    expect(editButton).toBeDefined();
    act(() => {
      ((editButton as unknown as TestNode).props as { onPress: () => void }).onPress();
    });

    // Legacy indicator chip is shown and selected; the createable chips are locked.
    const gpsChips = nodesByType(tree, "Chip").filter(
      (n) => (n as TestNode).props.children === "GPS"
    );
    expect(gpsChips.some((n) => (n as TestNode).props.selected === true)).toBe(true);
    const textChip = nodeByText(tree, "Chip", "Text Input");
    expect(textChip?.selected).toBe(false);
    expect(textChip?.onPress).toBeUndefined();

    // Saving must not rewrite the legacy type to one of the createable types.
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(repo.update).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ FieldType: "GPS", FieldName: "GpsCoord" })
    );
  });

  it("shows a Delete button for a field inside a default (non-locked) section", async () => {
    const tree = await renderScreen([SAMPLE_FIELD()], { SectionKey: "pole_structure" });
    const deleteButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "delete"
    );
    expect(deleteButton).toBeDefined();
  });

  it("hides the Delete button for a field inside a locked section", async () => {
    const tree = await renderScreen([SAMPLE_FIELD()], { SectionKey: "general_information" });
    const deleteButtons = nodesByType(tree, "IconButton").filter(
      (n) => (n as TestNode).props.icon === "delete"
    );
    expect(deleteButtons.length).toBe(0);
  });

  it("pressing Delete on a field calls FieldRepository.delete (soft), not hardDelete", async () => {
    const tree = await renderScreen([SAMPLE_FIELD()], { SectionKey: "pole_structure" });
    const deleteButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "delete"
    );
    expect(deleteButton).toBeDefined();
    const spy = jest.spyOn(Alert, "alert");
    act(() => {
      ((deleteButton as unknown as TestNode).props as { onPress: () => void }).onPress();
    });
    const call = spy.mock.calls.find(([title]) => title === "Delete Field");
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

  it("types into Field Name without deriving the key live and derives FieldKey at Save (create)", async () => {
    (repo.create as jest.Mock).mockResolvedValue(1);
    const tree = await renderScreen();
    act(() => {
      (nodeByText(tree, "Button", "Add Field")?.onPress as () => void)();
    });
    expect(textInputByLabel(tree, "Field Key")).toBeUndefined();
    act(() => {
      (textInputByLabel(tree, "Field Name *") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Voltage AC");
    });
    expect(textInputByLabel(tree, "Field Name *")?.value).toBe("Voltage AC");
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
      expect.objectContaining({ FieldName: "Voltage AC", FieldKey: "voltage_ac" })
    );
  });

  it("renaming a field preserves its original FieldKey (no live key regeneration)", async () => {
    (repo.update as jest.Mock).mockResolvedValue(undefined);
    const tree = await renderScreen([SAMPLE_FIELD()]);
    const editButton = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "pencil"
    );
    expect(editButton).toBeDefined();
    act(() => {
      ((editButton as unknown as TestNode).props as { onPress: () => void }).onPress();
    });
    act(() => {
      (textInputByLabel(tree, "Field Name *") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Voltage AC");
    });
    expect(textInputByLabel(tree, "Field Name *")?.value).toBe("Voltage AC");
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
      expect.objectContaining({ FieldName: "Voltage AC", FieldKey: "voltage" })
    );
  });
});