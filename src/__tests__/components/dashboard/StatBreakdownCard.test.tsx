import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import StatBreakdownCard from "@/src/components/dashboard/StatBreakdownCard";

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
});
