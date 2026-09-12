//frontend\src\__tests__\components\inspection\OverallProgressCard.test.tsx
//
// Compact single overall-progress card at the top of the inspection form:
// title + "X / Y completed", a determinate ProgressBar, the percentage, and
// "N remaining". Deliberately small — no group-level blocks or totals.

import React from "react";
import TestRenderer from "react-test-renderer";
import OverallProgressCard from "@/src/components/inspection/OverallProgressCard";
import type { InspectionProgress } from "@/src/database/repositories/InspectionProgressService";

jest.mock("react-native-paper", () => {
  const ReactPaper = require("react");
  const { View, Text } = require("react-native");
  const Card = ({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: unknown }) =>
    ReactPaper.createElement(View, { testID, style }, children);
  Card.Content = (props: Record<string, unknown>) =>
    ReactPaper.createElement(View, props);
  return {
    Text,
    Card,
    ProgressBar: (props: Record<string, unknown>) =>
      ReactPaper.createElement("ProgressBar", props),
  };
});

function textOf(tree: ReturnType<typeof TestRenderer.create>): string {
  const strings: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      strings.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === "object") {
      const children = (node as { children?: unknown }).children;
      if (Array.isArray(children)) {
        for (const child of children) walk(child);
      }
    }
  };
  walk(tree.toJSON());
  return strings.join("");
}

function progressData(overrides?: Partial<InspectionProgress>): InspectionProgress {
  return {
    percentage: 60,
    completed: 3,
    total: 5,
    remaining: 2,
    groups: [],
    sections: [],
    ...overrides,
  };
}

// react-test-renderer findAll() visits host nodes twice on React 19, so host
// structure is asserted through the de-duplicated JSON tree instead.
function hosts(tree: ReturnType<typeof TestRenderer.create>): { style?: Record<string, unknown> }[] {
  const out: { style?: Record<string, unknown> }[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const el = node as { type?: string; props?: { style?: Record<string, unknown> }; children?: unknown[] };
    if (typeof el.type === "string" && el.props?.style) {
      out.push({ style: el.props.style });
    }
    if (Array.isArray(el.children)) {
      for (const child of el.children) walk(child);
    }
  };
  walk(tree.toJSON());
  return out;
}

describe("OverallProgressCard", () => {
  it("renders the compact summary: title, X/Y, percentage, remaining", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const text = textOf(tree!);
    expect(text).toContain("Overall Inspection");
    expect(text).toContain("3 / 5 completed");
    expect(text).toContain("60%");
    expect(text).toContain("2 remaining");
  });

  it("keeps the card compact with tight content padding", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const content = hosts(tree!).filter(
      (node) => node.style?.paddingVertical === 10
    );
    expect(content.length).toBe(1);
    expect(content[0].style).toEqual({
      paddingVertical: 10,
      paddingHorizontal: 14,
    });
  });

  it("drives the ProgressBar with percentage/100 in the summary green", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const bar = tree!.root.findAll(
      (n) => (n as { type?: unknown }).type === "ProgressBar"
    )[0]!;
    expect(bar.props.progress).toBe(0.6);
    expect(bar.props.color).toBe("#198754");
  });

  it("renders 0% with an empty bar when nothing is complete", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OverallProgressCard progress={progressData({ percentage: 0, completed: 0, total: 5, remaining: 5 })} />
      );
    });
    const bar = tree!.root.findAll(
      (n) => (n as { type?: unknown }).type === "ProgressBar"
    )[0]!;
    expect(bar.props.progress).toBe(0);
    expect(textOf(tree!)).toContain("0%");
    expect(textOf(tree!)).toContain("5 remaining");
  });

  it("renders 100% with a full bar when everything is complete", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OverallProgressCard progress={progressData({ percentage: 100, completed: 5, total: 5, remaining: 0 })} />
      );
    });
    const bar = tree!.root.findAll(
      (n) => (n as { type?: unknown }).type === "ProgressBar"
    )[0]!;
    expect(bar.props.progress).toBe(1);
    expect(textOf(tree!)).toContain("100%");
    expect(textOf(tree!)).toContain("0 remaining");
  });

  it("never renders the removed group-level dashboard blocks", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const text = textOf(tree!);
    expect(text).not.toContain("Default Sections");
    expect(text).not.toContain("Default Device Type");
    expect(text).not.toContain("Custom Device Types");
    expect(text).not.toContain("Custom Sections");
  });

  it("uses no horizontal margin so the card aligns with the section cards (parent padding handles width)", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const rootCard = hosts(tree!).find((node) => {
      const s = node.style ?? {};
      return s.borderRadius === 12 && s.overflow === "hidden";
    });
    expect(rootCard).toBeTruthy();
    const style = rootCard!.style!;
    expect(style.marginHorizontal).toBeUndefined();
  });

  it("shares the section-card visual chrome: 12pt corners, hidden overflow, no top margin, 12pt bottom spacing", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const rootCard = hosts(tree!).find((node) => {
      const s = node.style ?? {};
      return s.borderRadius === 12 && s.overflow === "hidden";
    });
    expect(rootCard).toBeTruthy();
    const style = rootCard!.style!;
    expect(style.marginBottom).toBe(12);
    expect(style.marginTop).toBeUndefined();
    expect(style.marginHorizontal).toBeUndefined();
  });

  it("draws the progress bar with an explicit height and rounded corners", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OverallProgressCard progress={progressData()} />);
    });
    const bar = tree!.root.findAll(
      (n) => (n as { type?: unknown }).type === "ProgressBar"
    )[0]!;
    expect(bar.props.style).toMatchObject({ height: 6, borderRadius: 4 });
  });
});