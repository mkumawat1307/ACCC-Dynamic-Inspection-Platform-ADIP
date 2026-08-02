import React from "react";
import TestRenderer from "react-test-renderer";
import DashboardCardGrid from "@/src/components/dashboard/DashboardCardGrid";
import { DashboardService, CardWithCount } from "@/src/database/repositories/DashboardService";

jest.mock("@/src/database/repositories/DashboardService");

const mockedService = DashboardService as jest.Mocked<typeof DashboardService>;

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
        BreakdownField: "foundation_cond",
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
        BreakdownField: "foundation_cond",
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

  it("renders section headers for grouped default cards", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_inspection_done", Title: "Inspection Done", SectionLabel: "Total", count: 8 }),
      cardWithCount({ CardID: 2, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: "Total", count: 17 }),
      cardWithCount({ CardID: 3, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: "Today's", count: 2 }),
      cardWithCount({ CardID: 4, CardKey: "today_camera_count", Title: "Camera Count", SectionLabel: "Today's", count: 5 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total");
    expect(strings).toContain("Today's");
    expect(strings.indexOf("Total")).toBeLessThan(strings.indexOf("Inspection Done"));
    expect(strings.indexOf("Today's")).toBeGreaterThan(strings.indexOf("Inspection Done"));
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
    expect(strings).not.toContain("Total");
    expect(strings).not.toContain("Today's");
  });

  it("does not pair the last card of one section with the first of the next", async () => {
    mockedService.getEnabledCardsWithCounts.mockResolvedValue([
      cardWithCount({ CardID: 1, CardKey: "total_camera_count", Title: "Camera Count", SectionLabel: "Total", count: 17 }),
      cardWithCount({ CardID: 2, CardKey: "today_inspection_done", Title: "Inspection Done", SectionLabel: "Today's", count: 2 }),
    ]);
    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DashboardCardGrid projectId={1} />);
      await flushPromises();
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total");
    expect(strings).toContain("Today's");
    expect(strings.indexOf("Today's")).toBeGreaterThan(strings.indexOf("Camera Count"));
  });
});
