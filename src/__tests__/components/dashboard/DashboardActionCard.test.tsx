import React from "react";
import TestRenderer from "react-test-renderer";
import { Card } from "react-native-paper";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";

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

describe("DashboardActionCard", () => {
  it("renders title and subtitle and fires onPress", () => {
    const onPress = jest.fn();
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <DashboardActionCard
          title="New Inspection"
          subtitle="Start a pole inspection"
          icon="clipboard-plus"
          onPress={onPress}
        />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("New Inspection");
    expect(strings).toContain("Start a pole inspection");
    const card = tree!.root.findByType(Card as never);
    TestRenderer.act(() => {
      (card as unknown as { props: { onPress: () => void } }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
