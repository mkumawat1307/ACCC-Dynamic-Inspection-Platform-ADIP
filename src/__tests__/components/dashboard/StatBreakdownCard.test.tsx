import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";
import { COLORS } from "@/src/constants/ui";

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

function isHostNode(node: unknown): boolean {
  return typeof (node as { type?: unknown }).type === "string";
}

describe("StatBreakdownCard", () => {
  it("renders title and each breakdown row", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Foundation Condition"
          icon="home"
          rows={[
            { label: "Good", count: 42 },
            { label: "Bad", count: 7 },
          ]}
        />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Foundation Condition");
    expect(strings).toContain("Good");
    expect(strings).toContain("42");
    expect(strings).toContain("Bad");
    expect(strings).toContain("7");
  });

  it("shows a muted empty message when there are no rows", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard title="Foundation Condition" icon="home" rows={[]} />
      );
    });
    expect(collectStrings(tree!.toJSON()).join(" ")).toContain("No data");
  });

  it("renders full width without adding its own margin", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard title="Foundation Condition" icon="home" rows={[]} />
      );
    });
    const card = tree!.root.findByType(Card as never);
    const style = StyleSheet.flatten(
      (card as unknown as { props: { style: ViewStyle } }).props.style
    );
    expect(style.margin).toBeUndefined();
  });

  it("renders a grid of mini-cards for up to 6 short labels", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={[
            { label: "Yes", count: 30 },
            { label: "No", count: 12 },
            { label: "N/A", count: 3 },
          ]}
        />
      );
    });
    const grid = tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-card-grid");
    expect(grid).toHaveLength(1);
    const labels = tree!.root.findAll((node) =>
      isHostNode(node) && typeof node.props?.testID === "string" && node.props.testID.startsWith("breakdown-option-label-")
    );
    expect(labels).toHaveLength(3);
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-list")).toHaveLength(0);
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("30");
    expect(strings).toContain("12");
    expect(strings).toContain("3");
  });

  it("falls back to the list layout for more than 6 options", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={["A", "B", "C", "D", "E", "F", "G"].map((label, index) => ({ label, count: index }))}
        />
      );
    });
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-card-grid")).toHaveLength(0);
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-list")).toHaveLength(1);
  });

  it("falls back to the list layout when any label is longer than 15 characters", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={[
            { label: "1234567890123456", count: 1 },
            { label: "B", count: 2 },
          ]}
        />
      );
    });
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-card-grid")).toHaveLength(0);
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-list")).toHaveLength(1);
  });

  it("keeps the grid layout for labels up to 15 characters", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Pole Availability"
          icon="home"
          rows={[
            { label: "123456789012345", count: 1 },
            { label: "B", count: 2 },
          ]}
        />
      );
    });
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "breakdown-card-grid")).toHaveLength(1);
  });

  it("truncates mini-card labels to one line and shows the count below in the card color", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatBreakdownCard
          title="Foundation Condition"
          icon="home"
          rows={[
            { label: "Good", count: 42 },
            { label: "Bad", count: 7 },
          ]}
        />
      );
    });
    const label = tree!.root.find((node) => node.props?.testID === "breakdown-option-label-Good");
    expect(label.props.numberOfLines).toBe(1);
    const count = tree!.root.find((node) => node.props?.testID === "breakdown-option-count-Good");
    const countStyle = StyleSheet.flatten(count.props.style as ViewStyle) as {
      fontWeight?: string;
      color?: string;
    };
    expect(countStyle.fontWeight).toBe("bold");
    expect(countStyle.color).toBe(COLORS.primary);
  });
});
