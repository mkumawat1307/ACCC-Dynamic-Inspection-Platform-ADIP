import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import StatCard from "@/src/components/StatCard";

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

describe("StatCard", () => {
  it("renders its title and numeric value", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatCard title="Total Poles" value={12} icon="transmission-tower" />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Total Poles");
    expect(strings).toContain("12");
  });

  it("renders a string value as-is", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatCard title="Status" value="Done" icon="check" />
      );
    });
    expect(collectStrings(tree!.toJSON())).toContain("Done");
  });

  it("stretches to fill its row without adding its own margin", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StatCard title="Total Poles" value={12} icon="transmission-tower" />
      );
    });
    const card = tree!.root.findByType(Card as never);
    const style = StyleSheet.flatten(
      (card as unknown as { props: { style: ViewStyle } }).props.style
    );
    expect(style.flex).toBe(1);
    expect(style.margin).toBeUndefined();
  });
});
