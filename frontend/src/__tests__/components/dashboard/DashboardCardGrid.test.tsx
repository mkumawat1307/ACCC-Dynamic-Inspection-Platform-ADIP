import React from "react";
import { StyleSheet } from "react-native";
import TestRenderer from "react-test-renderer";
import DashboardCardGrid from "@/src/components/dashboard/DashboardCardGrid";
import StatCard from "@/src/components/StatCard";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";
import CheckboxStatGroup from "@/src/components/dashboard/CheckboxStatGroup";
import { DashboardService, CardWithCount } from "@/src/database/repositories/DashboardService";
import { InspectionDataBus } from "@/src/utils/InspectionDataBus";
import useDashboardAutoRefresh from "@/src/hooks/useDashboardAutoRefresh";
import useSectionCollapse from "@/src/hooks/useSectionCollapse";
import { SECTION_LABEL_TODAY, SECTION_LABEL_TOTAL } from "@/src/database/seeds/dashboard-cards.seed";

jest.mock("@/src/database/repositories/DashboardService");
jest.mock("@/src/hooks/useDashboardAutoRefresh");
jest.mock("@/src/hooks/useSectionCollapse", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedHook = useDashboardAutoRefresh as jest.MockedFunction<typeof useDashboardAutoRefresh>;

const mockedCollapse = useSectionCollapse as jest.MockedFunction<typeof useSectionCollapse>;

const mockedService = DashboardService as jest.Mocked<typeof DashboardService>;

function findPressable(tree: ReturnType<typeof TestRenderer.create>): { props: { onPress: () => void } } {
  let found: unknown;
  tree.root.findAll((node) => {
    const props = node.props as { onPress?: () => void; disabled?: boolean };
    if (props && typeof props.onPress === "function" && typeof props.disabled === "boolean") {
      found = node;
    }
    return false;
  });
  expect(found).toBeDefined();
  return found as { props: { onPress: () => void } };
}

function findChevrons(tree: ReturnType<typeof TestRenderer.create>): { props: { name: string } }[] {
  const chevrons: { props: { name: string } }[] = [];
  tree.root.findAll((node) => {
    if (typeof (node as unknown as { type?: unknown }).type !== "function") return false;
    const name = (node.props as { name?: string }).name ?? "";
    if (name === "chevron-up" || name === "chevron-down") chevrons.push(node as never);
    return false;
  });
  return chevrons;
}

function cardWithCount(overrides: Partial<CardWithCount> = {}): CardWithCount {
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
    SectionLabel: null,
    AggregateField: null,
    SortOrder: 0,
    Enabled: 1,
    IsDefault: 1,
    count: 12,
    ...overrides,
  };
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

function getCheckboxGroups(
  tree: ReturnType<typeof TestRenderer.create>
): { title?: string; items: { title: string; count: number }[] }[] {
  const groups: { title?: string; items: { title: string; count: number }[] }[] = [];
  tree.root.findAll((node) => {
    const type = (node as unknown as { type?: unknown }).type;
    if (typeof type === "function" && type === CheckboxStatGroup) {
      const props = node.props as { title?: string; items: { title: string; count: number }[] };
      groups.push({ title: props.title, items: props.items });
    }
    return false;
  });
  return groups;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("DashboardCardGrid", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedHook.mockReturnValue(0);
    mockedCollapse.mockReturnValue({
      isCollapsed: jest.fn().mockReturnValue(false),
      toggle: jest.fn(),
    });
    InspectionDataBus.__reset();
  });

  it("renders a card's title and count", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([cardWithCount()]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("12");
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledWith(1);
  });

  it("renders multiple cards in the grid", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
      cardWithCount({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras", count: 40 }),
      cardWithCount({ CardID: 3, CardKey: "today_poles", Title: "Today's Poles", count: 5 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("Total Cameras");
    expect(strings).toContain("Today's Poles");
    expect(strings).toContain("40");
    expect(strings).toContain("5");
  });

  it("shows the empty state when no cards are configured", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("No dashboard cards configured.");
  });

  it("shows the Manage Cards hint with real curly quotes", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("Use \u201CManage Cards\u201D to add statistic cards.");
  });

  it("shows an ActivityIndicator while loading", () => {
    mockedService.getEnabledCardsWithCounts.mockReturnValue(new Promise(() => {}));
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
    });
    const nodes = tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && (type as { name?: string }).name === "ActivityIndicator";
    });
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("renders a failed card count as zero without breaking the grid", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
      cardWithCount({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras", count: 0 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("Total Cameras");
    expect(strings).toContain("12");
  });

  it("renders a breakdown card's value rows", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({
        CardID: 9,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        CardMode: "dropdown",
        count: undefined,
        breakdown: [
          { label: "Good", count: 42 },
          { label: "Bad", count: 7 },
          { label: "Fair", count: 3 },
        ],
      }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Foundation Condition");
    expect(strings).toContain("Good");
    expect(strings).toContain("42");
    expect(strings).toContain("Bad");
    expect(strings).toContain("7");
    expect(strings).toContain("Fair");
    expect(strings).toContain("3");
  });

  it("renders (No data) for an empty breakdown", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({
        CardID: 9,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        CardMode: "dropdown",
        count: undefined,
        breakdown: [],
      }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings.join(" ")).toContain("No data");
  });

  it("renders dropdown/datebreakdown cards as StatBreakdownCard and other modes as StatCard", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "entity_count", Title: "Entity Count", CardMode: "entitycount", count: 12 }),
      cardWithCount({ CardID: 2, CardKey: "sum_card", Title: "Sum Card", CardMode: "sum", count: 40 }),
      cardWithCount({ CardID: 3, CardKey: "field_count", Title: "Field Count", CardMode: "fieldcount", count: 5 }),
      cardWithCount({
        CardID: 4,
        CardKey: "dropdown_card",
        Title: "Dropdown Card",
        CardMode: "dropdown",
        count: undefined,
        breakdown: [{ label: "Good", count: 42 }],
      }),
      cardWithCount({
        CardID: 5,
        CardKey: "date_breakdown",
        Title: "Date Breakdown",
        CardMode: "datebreakdown",
        count: undefined,
        breakdown: [{ label: "Today", count: 9 }],
      }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const statCards = tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === StatCard;
    });
    const breakdownCards = tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === StatBreakdownCard;
    });
    expect(breakdownCards).toHaveLength(2);
    expect(statCards).toHaveLength(3);
  });

  it("renders section headers for grouped default cards", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
      cardWithCount({ CardID: 2, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: SECTION_LABEL_TOTAL, count: 17 }),
      cardWithCount({ CardID: 3, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TODAY, count: 2 }),
      cardWithCount({ CardID: 4, CardKey: "today_camera_count", Title: "Camera Count", SectionLabel: SECTION_LABEL_TODAY, count: 5 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain(SECTION_LABEL_TOTAL);
    expect(strings).toContain(SECTION_LABEL_TODAY);
    expect(strings.indexOf(SECTION_LABEL_TOTAL)).toBeLessThan(strings.indexOf("Inspection Done"));
    expect(strings.indexOf(SECTION_LABEL_TODAY)).toBeGreaterThan(strings.indexOf("Inspection Done"));
  });

  it("renders no section headers for cards with null SectionLabel", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
      cardWithCount({ CardID: 2, CardKey: "total_cameras", Title: "Total Cameras", count: 40 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).not.toContain(SECTION_LABEL_TOTAL);
    expect(strings).not.toContain(SECTION_LABEL_TODAY);
  });

  it("does not pair the last card of one section with the first of the next", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: SECTION_LABEL_TOTAL, count: 17 }),
      cardWithCount({ CardID: 2, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TODAY, count: 2 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain(SECTION_LABEL_TOTAL);
    expect(strings).toContain(SECTION_LABEL_TODAY);
    expect(strings.indexOf(SECTION_LABEL_TODAY)).toBeGreaterThan(strings.indexOf("Camera Count"));
  });

  it("renders a collapsible chevron header for a summary section", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain(SECTION_LABEL_TOTAL);
    const chevrons = findChevrons(tree!);
    expect(chevrons.length).toBeGreaterThan(0);
    expect(chevrons.every((c) => c.props.name === "chevron-up")).toBe(true);
  });

  it("hides a collapsed summary section's cards but keeps the header", async () => {
    mockedCollapse.mockReturnValue({
      isCollapsed: jest.fn((label: string) => label === SECTION_LABEL_TOTAL),
      toggle: jest.fn(),
    });
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
      cardWithCount({ CardID: 2, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TODAY, count: 2 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain(SECTION_LABEL_TOTAL);
    expect(strings).toContain(SECTION_LABEL_TODAY);
    expect(strings.filter((s) => s === "Inspection Done")).toHaveLength(1);
    expect(strings.filter((s) => s === "8")).toHaveLength(0);
    expect(strings.filter((s) => s === "2")).toHaveLength(1);
  });

  it("toggles a summary section on header tap", async () => {
    const toggle = jest.fn();
    mockedCollapse.mockReturnValue({
      isCollapsed: jest.fn().mockReturnValue(false),
      toggle,
    });
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const pressable = findPressable(tree!);
    await TestRenderer.act(async () => {
      pressable.props.onPress();
    });
    expect(toggle).toHaveBeenCalledWith(SECTION_LABEL_TOTAL);
  });

  it("renders custom sections as plain headers without a chevron", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "custom_card", Title: "Custom Card", SectionLabel: "My Section", count: 8 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("My Section");
    expect(findChevrons(tree!)).toHaveLength(0);
  });

  it("wraps each summary section in a single colored panel", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TOTAL, count: 8 }),
      cardWithCount({ CardID: 2, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: SECTION_LABEL_TOTAL, count: 17 }),
      cardWithCount({ CardID: 3, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: SECTION_LABEL_TODAY, count: 2 }),
      cardWithCount({ CardID: 4, CardKey: "custom_card", Title: "Custom Card", SectionLabel: "My Section", count: 5 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const panels: { label: string; borderColor?: string }[] = [];
    const seen = new Set<string>();
    tree!.root.findAll((node) => {
      const props = node.props as { testID?: string; style?: unknown };
      if (typeof props.testID === "string" && props.testID.startsWith("dashboard-section-panel-")) {
        const label = props.testID.replace("dashboard-section-panel-", "");
        if (!seen.has(label)) {
          seen.add(label);
          const flattened = StyleSheet.flatten(props.style) as { borderColor?: string };
          panels.push({ label, borderColor: flattened.borderColor });
        }
      }
      return false;
    });
    expect(panels).toHaveLength(2);
    expect(panels.find((p) => p.label === SECTION_LABEL_TOTAL)?.borderColor).toBe("#0B5ED7");
    expect(panels.find((p) => p.label === SECTION_LABEL_TODAY)?.borderColor).toBe("#198754");
  });

  it("reloads when the auto-refresh hook bumps its key (bus-triggered)", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledTimes(1);

    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 99 }),
    ]);
    mockedHook.mockReturnValue(1);
    await TestRenderer.act(async () => {
      tree.update(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("99");
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledTimes(2);
  });

  it("does not reload when autoKey stays the same (non-matching project event)", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, Title: "Total Poles", count: 12 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    await TestRenderer.act(async () => {
      tree.update(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    expect(mockedService.getEnabledCardsWithCounts).toHaveBeenCalledTimes(1);
  });

  it("groups checkbox cards of a section into a single checkbox group block", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "online", Title: "Online", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF Details", count: 4 }),
      cardWithCount({ CardID: 2, CardKey: "offline", Title: "Offline", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF Details", count: 6 }),
      cardWithCount({
        CardID: 3,
        CardKey: "foundation_breakdown",
        Title: "Foundation Condition",
        CardMode: "dropdown",
        count: undefined,
        breakdown: [
          { label: "Good", count: 42 },
          { label: "Bad", count: 7 },
        ],
      }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const groupCards = tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === CheckboxStatGroup;
    });
    expect(groupCards).toHaveLength(1);
    const groups = getCheckboxGroups(tree!);
    expect(groups[0].title).toBe("RF Details");
    const breakdownCards = tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === StatBreakdownCard;
    });
    expect(breakdownCards).toHaveLength(1);
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("RF Details");
    expect(strings).toContain("Online");
    expect(strings).toContain("Offline");
    expect(strings).toContain("4");
    expect(strings).toContain("6");
    expect(strings.indexOf("Online")).toBeLessThan(strings.indexOf("Foundation Condition"));
    expect(strings.join(" ")).not.toContain("No data");
  });

  it("groups checkbox cards under a custom section and keeps the dropdown below", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "online", Title: "Online", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF Details", count: 4, SectionLabel: "RF Details" }),
      cardWithCount({
        CardID: 2,
        CardKey: "rf_status",
        Title: "RF Status",
        CardMode: "dropdown",
        count: undefined,
        breakdown: [{ label: "Installed", count: 40 }],
        SectionLabel: "RF Details",
      }),
      cardWithCount({ CardID: 3, CardKey: "offline", Title: "Offline", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF Details", count: 6, SectionLabel: "RF Details" }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("RF Details");
    expect(tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === CheckboxStatGroup;
    })).toHaveLength(1);
    expect(tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === StatBreakdownCard;
    })).toHaveLength(1);
    expect(strings.indexOf("Offline")).toBeLessThan(strings.indexOf("RF Status"));
  });

  it("keeps checkbox fields of different parent sections in separate groups", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "rf_yes", Title: "RF Yes", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF", count: 1 }),
      cardWithCount({ CardID: 2, CardKey: "nvr_yes", Title: "NVR Yes", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "NVR", count: 1 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const groups = getCheckboxGroups(tree!);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("RF");
    expect(groups[0].items.map((i) => i.title)).toEqual(["RF Yes"]);
    expect(groups[1].title).toBe("NVR");
    expect(groups[1].items.map((i) => i.title)).toEqual(["NVR Yes"]);
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("RF");
    expect(strings).toContain("RF Yes");
    expect(strings).toContain("NVR");
    expect(strings).toContain("NVR Yes");
    expect(strings.filter((s) => s === "1")).toHaveLength(2);
  });

  it("keeps multiple checkbox fields of one section in a single group", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "rf_yes", Title: "RF Yes", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF", count: 1 }),
      cardWithCount({ CardID: 2, CardKey: "rf_no", Title: "RF No", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF", count: 2 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const groups = getCheckboxGroups(tree!);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("RF");
    expect(groups[0].items.map((i) => i.title)).toEqual(["RF Yes", "RF No"]);
    expect(groups[0].items.map((i) => i.count)).toEqual([1, 2]);
  });

  it("splits mixed-section checkbox fields into per-section groups, never merging them", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "rf_yes", Title: "RF Yes", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF", count: 1 }),
      cardWithCount({ CardID: 2, CardKey: "rf_no", Title: "RF No", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF", count: 2 }),
      cardWithCount({ CardID: 3, CardKey: "nvr_yes", Title: "NVR Yes", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "NVR", count: 3 }),
      cardWithCount({ CardID: 4, CardKey: "nvr_no", Title: "NVR No", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "NVR", count: 4 }),
      cardWithCount({ CardID: 5, CardKey: "power_ok", Title: "Power OK", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "Power Supply", count: 5 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const groups = getCheckboxGroups(tree!);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.title)).toEqual(["RF", "NVR", "Power Supply"]);
    expect(groups[0].items.map((i) => i.title)).toEqual(["RF Yes", "RF No"]);
    expect(groups[1].items.map((i) => i.title)).toEqual(["NVR Yes", "NVR No"]);
    expect(groups[2].items.map((i) => i.title)).toEqual(["Power OK"]);
    const strings = collectStrings(tree!.toJSON());
    expect(strings.filter((s) => s === "RF")).toHaveLength(1);
    expect(strings.filter((s) => s === "NVR")).toHaveLength(1);
    expect(strings.filter((s) => s === "Power Supply")).toHaveLength(1);
    expect(strings.filter((s) => s === "1")).toHaveLength(1);
    expect(strings.filter((s) => s === "2")).toHaveLength(1);
    expect(strings.filter((s) => s === "3")).toHaveLength(1);
    expect(strings.filter((s) => s === "4")).toHaveLength(1);
    expect(strings.filter((s) => s === "5")).toHaveLength(1);
  });

  it("renders a section title above its checkbox options", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "nvr_yes", Title: "NVR Yes", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "NVR", count: 1 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const groups = getCheckboxGroups(tree!);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("NVR");
    const strings = collectStrings(tree!.toJSON());
    expect(strings.indexOf("NVR")).toBeLessThan(strings.indexOf("NVR Yes"));
    expect(strings.indexOf("1")).toBeGreaterThan(strings.indexOf("NVR Yes"));
  });

  it("does not render checkbox cards as individual stat cards or pair them", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_poles", Title: "Total Poles", count: 12 }),
      cardWithCount({ CardID: 2, CardKey: "online", Title: "Online", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF Details", count: 4 }),
      cardWithCount({ CardID: 3, CardKey: "offline", Title: "Offline", CardMode: "dropdown", fieldType: "checkbox", fieldSectionName: "RF Details", count: 6 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const statCards = tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === StatCard;
    });
    expect(statCards).toHaveLength(1);
    expect(tree!.root.findAll((node) => {
      const type = (node as unknown as { type?: unknown }).type;
      return typeof type === "function" && type === CheckboxStatGroup;
    })).toHaveLength(1);
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("12");
    expect(strings).toContain("Online");
    expect(strings).toContain("4");
    expect(strings).toContain("Offline");
    expect(strings).toContain("6");
  });
});
