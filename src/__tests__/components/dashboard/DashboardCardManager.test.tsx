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

jest.mock("@/src/database/repositories/InspectionFieldRepository", () => ({
  __esModule: true,
  default: {
    getActiveTemplateFields: jest.fn(),
  },
}));

import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";

const repo = DashboardCardRepository as jest.Mocked<typeof DashboardCardRepository>;
const fieldRepo = InspectionFieldRepository as jest.Mocked<typeof InspectionFieldRepository>;

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
    fieldRepo.getActiveTemplateFields.mockResolvedValue([
      { FieldKey: "foundation_cond", FieldName: "Foundation Condition" },
      { FieldKey: "pole_status", FieldName: "Pole Status" },
    ]);
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

  it("reorders cards by moving one down", async () => {
    repo.reorderCards.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf(),
      cardOf({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras" }),
    ]);
    await pressButton(tree, "arrow-down");
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

  it("blocks saving when the title is empty", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Save");
    const strings = collectStrings(tree.toJSON());
    expect(strings.join(" ")).toContain("Title is required.");
    expect(repo.createCard).not.toHaveBeenCalled();
  });

  it("creates a card after the form is filled", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const textInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    expect(textInputs.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => {
      (textInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("Total Switches");
      await flushPromises();
    });
    await pressButton(tree, "Save");
    expect(repo.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        Title: "Total Switches",
        EntityType: "inspections",
        CounterType: "total",
      })
    );
  });

  it("edit form populates existing values and calls updateCard", async () => {
    repo.updateCard.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf({ CardID: 7, Title: "Custom Card", EntityType: "cameras", CounterType: "today" }),
    ]);
    await pressButton(tree, "pencil");
    const textInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    expect((textInputs[0].props as { value?: string }).value).toBe("Custom Card");
    await TestRenderer.act(async () => {
      (textInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("Renamed Card");
      await flushPromises();
    });
    await pressButton(tree, "Save");
    expect(repo.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({ CardID: 7, Title: "Renamed Card", EntityType: "cameras" })
    );
  });

  it("entity selection updates available distinct columns", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Inspections");
    await pressButton(tree, "Cameras");
    await pressButton(tree, "Count");
    await pressButton(tree, "Distinct");
    await pressButton(tree, "Select column");
    const distinctOptions = tree.root.findAll((node) => {
      const props = node.props as { title?: string };
      return props && (props.title === "c.CameraID" || props.title === "i.PoleID");
    });
    expect(distinctOptions.length).toBeGreaterThan(0);
  });

  it("add and remove filter rows", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Add Filter");
    const valueInputs = tree.root.findAll((node) => {
      const props = node.props as { placeholder?: string };
      return props && props.placeholder === "value";
    });
    expect(valueInputs.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => {
      (valueInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("Offline");
      await flushPromises();
    });
    const closeButtons = tree.root.findAll((node) => {
      const props = node.props as { icon?: string };
      return props && props.icon === "close";
    });
    expect(closeButtons.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => {
      (closeButtons[0].props as { onPress?: () => void }).onPress?.();
      await flushPromises();
    });
  });

  it("cancel closes the delete dialog without deleting", async () => {
    repo.deleteCard.mockResolvedValue(undefined);
    const tree = await renderManager([cardOf()]);
    await pressButton(tree, "delete");
    await pressButton(tree, "Cancel");
    expect(repo.deleteCard).not.toHaveBeenCalled();
  });

  it("cancel closes the editor without saving", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Cancel");
    expect(repo.createCard).not.toHaveBeenCalled();
  });

  it("selecting count mode back to Count hides distinct column", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Count");
    await pressButton(tree, "Distinct");
    await pressButton(tree, "Distinct");
    await pressButton(tree, "Count");
    const distinctLabel = tree.root.findAll((node) => {
      const props = node.props as { children?: unknown };
      return typeof props.children === "string" && props.children === "Distinct Column";
    });
    expect(distinctLabel.length).toBe(0);
  });

  it("updates an existing card's filter json via edit save", async () => {
    repo.updateCard.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf({ CardID: 7, Title: "Custom Card", EntityType: "cameras", CounterType: "today" }),
    ]);
    await pressButton(tree, "pencil");
    await pressButton(tree, "Add Filter");
    const valueInputs = tree.root.findAll((node) => {
      const props = node.props as { placeholder?: string };
      return props && props.placeholder === "value";
    });
    await TestRenderer.act(async () => {
      (valueInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("PTZ");
      await flushPromises();
    });
    await pressButton(tree, "Save");
    expect(repo.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        CardID: 7,
        EntityType: "cameras",
        FilterJson: JSON.stringify({ CameraType: "PTZ" }),
      })
    );
  });

  it("selects an icon and color for a new card", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const titleInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    await TestRenderer.act(async () => {
      (titleInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("My Card");
      await flushPromises();
    });
    await pressButton(tree, "cctv");
    const colorButtons = tree.root.findAll((node) => {
      const props = node.props as { containerColor?: string; onPress?: () => void };
      return props && typeof props.onPress === "function" && props.containerColor === "#DC3545";
    });
    expect(colorButtons.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => {
      (colorButtons[0].props as { onPress?: () => void }).onPress?.();
      await flushPromises();
    });
    await pressButton(tree, "Save");
    expect(repo.createCard).toHaveBeenCalledWith(
      expect.objectContaining({ Title: "My Card", Icon: "cctv", Color: "#DC3545" })
    );
  });

  it("selects a counter type for a new card", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    const titleInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    await TestRenderer.act(async () => {
      (titleInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("Today's Poles");
      await flushPromises();
    });
    await pressButton(tree, "Total");
    await pressButton(tree, "Today's");
    await pressButton(tree, "Save");
    expect(repo.createCard).toHaveBeenCalledWith(
      expect.objectContaining({ Title: "Today's Poles", CounterType: "today" })
    );
  });

  it("changes a filter row's column key via the picker", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Inspections");
    await pressButton(tree, "Cameras");
    await pressButton(tree, "Add Filter");
    await pressButton(tree, "CameraType");
    await pressButton(tree, "CameraStatus");
    const titleInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    await TestRenderer.act(async () => {
      (titleInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("Offline Cameras");
      await flushPromises();
    });
    const valueInputs = tree.root.findAll((node) => {
      const props = node.props as { placeholder?: string };
      return props && props.placeholder === "value";
    });
    await TestRenderer.act(async () => {
      (valueInputs[0].props as { onChangeText?: (t: string) => void }).onChangeText?.("Offline");
      await flushPromises();
    });
    await pressButton(tree, "Save");
    expect(repo.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        EntityType: "cameras",
        FilterJson: JSON.stringify({ CameraStatus: "Offline" }),
      })
    );
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

  it("edit populates existing filter rows from FilterJson", async () => {
    repo.updateCard.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf({
        CardID: 7,
        Title: "Custom",
        EntityType: "inspections",
        FilterJson: JSON.stringify({ Status: "Done" }),
      }),
    ]);
    await pressButton(tree, "pencil");
    const strings = collectStrings(tree.toJSON());
    expect(strings).toContain("Status");
    const valueInputs = tree.root.findAll((node) => {
      const props = node.props as { placeholder?: string };
      return props && props.placeholder === "value";
    });
    expect((valueInputs[0].props as { value?: string }).value).toBe("Done");
  });

  it("creates a breakdown card by picking a form field", async () => {
    repo.createCard.mockResolvedValue(5);
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Count");
    await pressButton(tree, "Breakdown");
    await pressButton(tree, "Foundation Condition");
    const titleInputs = tree.root.findAll((node) => {
      const props = node.props as { label?: string };
      return props && props.label === "Title";
    });
    expect((titleInputs[0].props as { value?: string }).value).toBe("Foundation Condition");
    await pressButton(tree, "Save");
    expect(repo.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        Title: "Foundation Condition",
        EntityType: "inspections",
        CountMode: "count",
        DistinctColumn: null,
        BreakdownField: "foundation_cond",
      })
    );
  });

  it("requires a field before saving a breakdown card", async () => {
    const tree = await renderManager([]);
    await pressButton(tree, "Add Card");
    await pressButton(tree, "Count");
    await pressButton(tree, "Breakdown");
    await pressButton(tree, "Save");
    const strings = collectStrings(tree.toJSON());
    expect(strings.join(" ")).toContain("Select a field to group by.");
    expect(repo.createCard).not.toHaveBeenCalled();
  });

  it("edit loads an existing breakdown card's field into the picker", async () => {
    repo.updateCard.mockResolvedValue(undefined);
    const tree = await renderManager([
      cardOf({
        CardID: 7,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        EntityType: "inspections",
        CountMode: "count",
        BreakdownField: "foundation_cond",
      }),
    ]);
    await pressButton(tree, "pencil");
    const strings = collectStrings(tree.toJSON());
    expect(strings).toContain("Foundation Condition");
    await pressButton(tree, "Save");
    expect(repo.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        CardID: 7,
        BreakdownField: "foundation_cond",
      })
    );
  });
});
