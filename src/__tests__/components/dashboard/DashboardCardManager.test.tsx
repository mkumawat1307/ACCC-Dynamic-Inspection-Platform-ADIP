import React from "react";
import TestRenderer from "react-test-renderer";

interface TestInstanceLike {
  children?: (TestInstanceLike | string)[];
  props: Record<string, unknown>;
}
import DashboardCardManager from "@/src/components/dashboard/DashboardCardManager";
import { DashboardCardRepository } from "@/src/database/repositories/DashboardCardRepository";
import { DashboardCard } from "@/src/models/DashboardCard";

jest.mock("react-native-safe-area-context", () => {
  const ReactMock = require("react");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactMock.createElement(ReactMock.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

jest.mock("react-native-paper", () => {
  const actual = jest.requireActual("react-native-paper");
  const ReactPaper = require("react");
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) =>
      ReactPaper.createElement(ReactPaper.Fragment, null, children),
  };
});

jest.mock("@/src/database/repositories/DashboardCardRepository");

jest.mock("@/src/database/repositories/SmartCardGenerator");

import { SmartCardGenerator, SmartFormField } from "@/src/database/repositories/SmartCardGenerator";

const repo = DashboardCardRepository as jest.Mocked<typeof DashboardCardRepository>;
const smartGen = SmartCardGenerator as jest.Mocked<typeof SmartCardGenerator>;

const mockFields: SmartFormField[] = [
  { FieldID: 1, FieldKey: "pole_status", FieldName: "Pole Status", FieldType: "dropdown", Options: [{ label: "Available", value: "Available" }] },
  { FieldID: 2, FieldKey: "camera_count", FieldName: "Camera Count", FieldType: "number", Options: [] },
  { FieldID: 101, FieldKey: "dev_Camera_Presence", FieldName: "Camera Presence", FieldType: "dropdown", Options: [], source: "device", DeviceType: "Camera", DeviceColumn: "Presence" },
  { FieldID: 102, FieldKey: "dev_Switch_State", FieldName: "Switch State", FieldType: "switch", Options: [], source: "device", DeviceType: "Switch", DeviceColumn: "State" },
];

function cardOf(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    CardID: 1,
    ProjectID: 1,
    CardKey: "total_poles",
    Title: "Total Poles",
    Icon: "transmission-tower",
    Color: "#0B5ED7",
    EntityType: "inspections",
    CounterType: "total",
    FilterJson: null,
    CountMode: "count",
    CardMode: "entitycount",
    DistinctColumn: null,
    BreakdownField: null,
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 1,
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderManager(cards: DashboardCard[]) {
  repo.getAllCards.mockResolvedValue(cards);
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<DashboardCardManager projectId={1} />);
    await flushPromises();
  });
  return tree!;
}

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  if (node && typeof node === "object") {
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) collectStrings(child, out);
    }
  }
  return out;
}

function collectStringsFromInstance(
  node: TestInstanceLike | string,
  out: string[] = []
): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  const children = (node.children ?? []) as (TestInstanceLike | string)[];
  for (const child of children) collectStringsFromInstance(child, out);
  return out;
}

async function pressButton(tree: ReturnType<typeof TestRenderer.create>, label: string): Promise<void> {
  const candidates: TestInstanceLike[] = [];
  tree.root.findAll((node) => {
    const props = node.props as { onPress?: unknown };
    if (props && typeof props.onPress === "function") candidates.push(node);
    return false;
  });
  const target =
    candidates.find((node) => {
      const props = node.props as { icon?: string; title?: string };
      if (props.icon === label || props.title === label) return true;
      return collectStringsFromInstance(node).includes(label);
    }) ?? candidates[0];
  expect(target).toBeDefined();
  await TestRenderer.act(async () => {
    (target.props as { onPress?: () => void }).onPress?.();
    await flushPromises();
  });
}

describe("DashboardCardManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    smartGen.getAvailableFields.mockResolvedValue(mockFields);
    smartGen.addSmartCardsForField.mockResolvedValue([1, 2]);
    smartGen.getSpec.mockReturnValue({
      kind: "entitycount",
      fieldKey: "test",
      fieldName: "Test",
      title: "Test",
      icon: "chart-box-outline",
      color: "#0B5ED7",
    });
  });

  it("renders all cards with entity and counter summary", async () => {
    const tree = await renderManager([
      cardOf(),
      cardOf({ CardID: 2, CardKey: "today_cameras", Title: "Today's Cameras", EntityType: "cameras", CounterType: "today" }),
    ]);
    const strings = collectStrings(tree.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("Inspections · Total");
    expect(strings).toContain("Today's Cameras");
    expect(strings).toContain("Cameras · Today's");
  });

  it("toggles a card's enabled state via the switch", async () => {
    repo.setCardEnabled.mockResolvedValue(undefined);
    const tree = await renderManager([cardOf()]);
    const switches = tree.root.findAll((node) => {
      const props = node.props as { value?: boolean };
      return props && props.value === true;
    });
    expect(switches.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => {
      (switches[0].props as { onValueChange?: (v: boolean) => void }).onValueChange?.(false);
      await flushPromises();
    });
    expect(repo.setCardEnabled).toHaveBeenCalledWith(1, false);
  });

  it("shows a warning dialog when deleting a default card", async () => {
    repo.deleteCard.mockResolvedValue(undefined);
    const tree = await renderManager([cardOf()]);
    await pressButton(tree, "delete");
    const strings = collectStrings(tree.toJSON());
    expect(strings.join(" ")).toContain("This is a default card");
    expect(strings.join(" ")).toContain("Delete anyway?");
  });

  it("deletes a card when confirmed", async () => {
    repo.deleteCard.mockResolvedValue(undefined);
    const tree = await renderManager([cardOf()]);
    await pressButton(tree, "delete");
    await pressButton(tree, "Delete");
    expect(repo.deleteCard).toHaveBeenCalledWith(1);
  });

  it("cancel closes the delete dialog without deleting", async () => {
    repo.deleteCard.mockResolvedValue(undefined);
    const tree = await renderManager([cardOf()]);
    await pressButton(tree, "delete");
    await pressButton(tree, "Cancel");
    expect(repo.deleteCard).not.toHaveBeenCalled();
  });

  it("reorders cards by moving one down", async () => {
    repo.reorderCards.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf(),
      cardOf({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras" }),
    ]);
    await pressButton(tree, "arrow-down");
    expect(repo.reorderCards).toHaveBeenCalledWith(1, [2, 1]);
  });

  it("reorders cards by moving one up", async () => {
    repo.reorderCards.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf(),
      cardOf({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras" }),
    ]);
    const upButtons = tree.root.findAll((node) => {
      const props = node.props as { icon?: string };
      return props && props.icon === "arrow-up";
    });
    expect(upButtons.length).toBeGreaterThan(1);
    await TestRenderer.act(async () => {
      (upButtons[1].props as { onPress?: () => void }).onPress?.();
      await flushPromises();
    });
    expect(repo.reorderCards).toHaveBeenCalledWith(1, [2, 1]);
  });

  it("reset calls ensureDefaultCards and reloads", async () => {
    repo.ensureDefaultCards.mockResolvedValue(undefined);
    const tree = await renderManager([cardOf()]);
    repo.getAllCards.mockClear();
    await pressButton(tree, "Reset Defaults");
    expect(repo.ensureDefaultCards).toHaveBeenCalledWith(1);
    expect(repo.getAllCards).toHaveBeenCalled();
  });

  it("does not render a Custom Card button", async () => {
    const tree = await renderManager([cardOf()]);
    const strings = collectStrings(tree.toJSON());
    expect(strings).not.toContain("Custom Card");
  });

  it("does not render a pencil edit affordance on cards", async () => {
    const tree = await renderManager([cardOf()]);
    const pencils = tree.root.findAll((node) => {
      const props = node.props as { icon?: string };
      return props && props.icon === "pencil";
    });
    expect(pencils.length).toBe(0);
  });

  it("Add Card button opens the smart field picker dialog", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const strings = collectStrings(tree.toJSON());
    expect(strings).toContain("Pole Status");
    expect(strings).toContain("Camera Count");
    expect(strings).toContain("Dropdown");
    expect(strings).toContain("Number");
  });

  it("Add Card button opens dialog titled 'Add Card'", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const { dialog } = findDialogByTitle(tree, "Add Card");
    expect((dialog.props as { visible?: boolean }).visible).toBe(true);
  });

  it("picker lists device fields with their device type", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const deviceItems = tree.root.findAll((node) => {
      const props = node.props as { title?: string };
      return props && (props.title === "Camera Presence" || props.title === "Switch State");
    });
    expect(deviceItems.length).toBe(2);
    expect((deviceItems[0].props as { description?: string }).description).toBe("Camera");
    expect((deviceItems[1].props as { description?: string }).description).toBe("Switch");
  });

  it("field picker shows empty state when no fields are available", async () => {
    smartGen.getAvailableFields.mockResolvedValue([]);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const strings = collectStrings(tree.toJSON());
    expect(strings.join(" ")).toContain("All available fields have cards configured.");
  });

  it("selecting a field in the picker creates cards and closes the dialog", async () => {
    repo.getAllCards.mockResolvedValue([]);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Pole Status");
    expect(smartGen.addSmartCardsForField).toHaveBeenCalledWith(1, "pole_status");
  });

  function findDialogByTitle(
    tree: ReturnType<typeof TestRenderer.create>,
    title: string
  ): { dialog: TestInstanceLike; cancelButton?: TestInstanceLike } {
    const dialogs: TestInstanceLike[] = [];
    tree.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      if (typeof type === "function") {
        const typeFn = type as { displayName?: string; name?: string };
        if (typeFn.displayName === "Dialog" || typeFn.name === "Dialog") dialogs.push(node as TestInstanceLike);
      }
      return false;
    });
    const matching = dialogs.filter((d) => collectStringsFromInstance(d).includes(title));
    expect(matching.length).toBeGreaterThan(0);
    const dialog = matching.reduce((deepest, candidate) => {
      const depth = (node: unknown): number => {
        let d = 0;
        let current: unknown = node;
        while (current && (current as { parent?: unknown }).parent) {
          d += 1;
          current = (current as { parent?: unknown }).parent;
        }
        return d;
      };
      return depth(candidate) > depth(deepest) ? candidate : deepest;
    }, matching[0]);
    let cancelButton: TestInstanceLike | undefined;
    tree.root.findAll((node) => {
      const props = node.props as { children?: unknown; onPress?: unknown };
      if (props && props.children === "Cancel" && typeof props.onPress === "function") {
        let current: unknown = node;
        while (current && (current as { parent?: unknown }).parent) {
          current = (current as { parent?: unknown }).parent;
          const type = (current as { type?: unknown }).type;
          if (typeof type === "function") {
            const typeFn = type as { displayName?: string; name?: string };
            if (typeFn.displayName === "Dialog" || typeFn.name === "Dialog") {
              if (current === dialog) cancelButton = node as TestInstanceLike;
              return false;
            }
          }
        }
      }
      return false;
    });
    return { dialog, cancelButton };
  }
});
