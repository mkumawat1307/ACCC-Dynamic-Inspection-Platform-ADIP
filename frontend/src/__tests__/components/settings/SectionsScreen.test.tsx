import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import SectionsScreen from "@/app/settings/sections";
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
  const Card = make("Card");
  Card.Content = make("CardContent");
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
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb: () => void) => cb()),
}));

jest.mock("@/src/database/db", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("@/src/database/repositories/SectionRepository", () => {
  const actual = jest.requireActual("@/src/database/repositories/SectionRepository");
  return {
    __esModule: true,
    ...actual,
    default: {
      nameExists: jest.fn().mockResolvedValue(false),
      keyExists: jest.fn().mockResolvedValue(false),
      softDeleteSection: jest.fn(),
    },
  };
});

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

function appbarActionByIcon(tree: ReturnType<typeof TestRenderer.create>, icon: string) {
  const node = tree.root.findAll((n) => {
    const inst = n as TestNode;
    return inst.type === "AppbarAction" && inst.props.icon === icon;
  })[0];
  return node?.props as { icon: string; onPress: () => void } | undefined;
}

async function renderScreen(sections: unknown[] = []) {
  const db = {
    getAllAsync: jest.fn().mockResolvedValue(sections),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue(undefined),
  };
  (getDatabase as jest.Mock).mockResolvedValue(db);
  let tree!: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    tree = TestRenderer.create(<SectionsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { tree, db };
}

const SAMPLE_SECTION = (overrides: Record<string, unknown> = {}) => ({
  SectionID: 1,
  TemplateID: 1,
  SectionName: "Site Access",
  SectionKey: "site_access",
  Description: null,
  Icon: null,
  DisplayOrder: 1,
  IsRepeatable: 0,
  IsVisible: 1,
  IsDefault: 0,
  IsActive: 1,
  FieldCount: 0,
  ...overrides,
});

describe("SectionsScreen (Sections)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("types into Section Name without a live key preview and derives SectionKey at Save (create)", async () => {
    const { tree, db } = await renderScreen();
    act(() => {
      appbarActionByIcon(tree, "plus")?.onPress();
    });
    expect(textInputByLabel(tree, "Section Key")).toBeUndefined();
    act(() => {
      (textInputByLabel(tree, "Section Name *") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Camera Details");
    });
    expect(textInputByLabel(tree, "Section Name *")?.value).toBe("Camera Details");
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const insertCalls = db.runAsync.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO InspectionSections")
    );
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0][1][0]).toBe(1);
    expect(insertCalls[0][1][1]).toBe("Camera Details");
    expect(insertCalls[0][1][2]).toBe("camera_details");
  });

  it("renaming a section preserves its original SectionKey", async () => {
    const { tree, db } = await renderScreen([SAMPLE_SECTION()]);
    const pencil = nodesByType(tree, "IconButton").find(
      (n) => (n as TestNode).props.icon === "pencil"
    );
    expect(pencil).toBeDefined();
    act(() => {
      ((pencil as unknown as TestNode).props as { onPress: (e: object) => void }).onPress({});
    });
    expect(textInputByLabel(tree, "Section Name *")?.value).toBe("Site Access");
    act(() => {
      (textInputByLabel(tree, "Section Name *") as unknown as {
        onChangeText: (t: string) => void;
      }).onChangeText("Slab Access");
    });
    expect(textInputByLabel(tree, "Section Name *")?.value).toBe("Slab Access");
    act(() => {
      (nodeByText(tree, "Button", "Save")?.onPress as () => void)();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const updateCalls = db.runAsync.mock.calls.filter(([sql]) =>
      String(sql).includes("UPDATE InspectionSections SET SectionName")
    );
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][1][0]).toBe("Slab Access");
    expect(updateCalls[0][1][1]).toBe("site_access");
  });
});