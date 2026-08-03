import React from "react";
import TestRenderer from "react-test-renderer";
import DashboardCardGrid from "@/src/components/dashboard/DashboardCardGrid";
import StatCard from "@/src/components/StatCard";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";
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
});
