//frontend\src\__tests__\components\inspection\InspectionSectionProgress.test.tsx
//
// Inline per-section progress shown in every section header: "X / Y completed"
// with "N remaining" directly below, followed by the expand/collapse chevron.
// Also keeps guardrails for the removed top-level dashboard.

import React from "react";
import TestRenderer from "react-test-renderer";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import InspectionSectionProgress from "@/src/components/inspection/InspectionSectionProgress";
import type { InspectionSectionProgress as ProgressData } from "@/src/database/repositories/InspectionProgressService";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactNs = require("react");
  const RN = require("react-native");
  return {
    __esModule: true,
    default: (props: any) =>
      ReactNs.createElement(RN.Text, { testID: `glyph-${props.name}` }, props.name),
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

function progressData(overrides?: Partial<ProgressData>): ProgressData {
  return {
    key: "camera_information",
    label: "Camera",
    completed: 0,
    total: 1,
    remaining: 1,
    percentage: 0,
    ...overrides,
  };
}

// react-test-renderer findAll() visits host nodes twice on React 19, so host
// structure is asserted through the de-duplicated JSON tree instead.
function hosts(tree: ReturnType<typeof TestRenderer.create>): { type: string; props: { style?: unknown; testID?: string } }[] {
  const out: { type: string; props: { style?: unknown; testID?: string } }[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const el = node as { type?: string; props?: { style?: unknown; testID?: string }; children?: unknown[] };
    if (typeof el.type === "string") {
      out.push({ type: el.type, props: el.props ?? {} });
    }
    if (Array.isArray(el.children)) {
      for (const child of el.children) walk(child);
    }
  };
  walk(tree.toJSON());
  return out;
}

describe("InspectionSectionProgress", () => {
  it("shows 'X / Y completed' and 'N remaining' with a chevron-down when collapsed", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress progress={progressData()} expanded={false} />
      );
    });
    const text = textOf(tree!);
    expect(text).toContain("0 / 1 completed");
    expect(text).toContain("1 remaining");
    const icon = tree!.root.findByType(MaterialCommunityIcons as never);
    expect(icon.props.name).toBe("chevron-down");
  });

  it("shows a chevron-up when expanded", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress progress={progressData()} expanded={true} />
      );
    });
    const icon = tree!.root.findByType(MaterialCommunityIcons as never);
    expect(icon.props.name).toBe("chevron-up");
  });

  it("renders partial progress with the remaining count", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 1, total: 3, remaining: 2, percentage: 33 })}
          expanded={false}
        />
      );
    });
    const text = textOf(tree!);
    expect(text).toContain("1 / 3 completed");
    expect(text).toContain("2 remaining");
  });

  it("renders both the green check and the chevron when the section is complete", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 2, total: 2, remaining: 0, percentage: 100 })}
          expanded={false}
        />
      );
    });
    const text = textOf(tree!);
    expect(text).toContain("2 / 2 completed");
    expect(text).toContain("0 remaining");
    const glyphs = hosts(tree!)
      .filter((node) => (node.props.testID ?? "").startsWith("glyph-"))
      .map((node) => node.props.testID as string);
    expect(glyphs).toEqual(expect.arrayContaining(["glyph-check", "glyph-chevron-down"]));
    expect(text).not.toContain("check-circle");
  });

  it("keeps the chevron and suppresses count text when progress has nothing to complete (total 0)", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 0, total: 0, remaining: 0, percentage: 0 })}
          expanded={false}
        />
      );
    });
    const text = textOf(tree!);
    const glyphs = hosts(tree!)
      .filter((node) => (node.props.testID ?? "").startsWith("glyph-"))
      .map((node) => node.props.testID as string);
    expect(glyphs).toEqual(["glyph-chevron-down"]);
    expect(text).not.toContain("completed");
    expect(text).not.toContain("remaining");
  });

  it("keeps the chevron when no progress is attached (e.g. Photos) and shows no count text", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress progress={null} expanded={false} />
      );
    });
    const text = textOf(tree!);
    expect(text).toContain("chevron-down");
    expect(text).not.toContain("completed");
    expect(text).not.toContain("remaining");
  });

  it("never renders the removed top-level dashboard content", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress progress={progressData()} expanded={false} />
      );
    });
    const text = textOf(tree!);
    expect(text).not.toContain("Overall Inspection");
    expect(text).not.toContain("Default Sections");
    expect(text).not.toContain("Default Device Type");
    expect(text).not.toContain("Custom Device Types");
    expect(text).not.toContain("Custom Sections");
  });

  it("keeps progress + chevron in a non-shrinking horizontal row next to the title", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress progress={progressData()} expanded={false} />
      );
    });
    const rowNodes = tree!.root.findAll(
      (node) => {
        const style = node.props?.style as { flexDirection?: string } | undefined;
        return style != null && style.flexDirection === "row";
      }
    );
    expect(rowNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("lays the progress counts out as a left-aligned column with no fixed slot width", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress progress={progressData()} expanded={false} />
      );
    });
    const blocks = hosts(tree!).filter((node) => {
      const style = (node.props.style ?? {}) as {
        alignItems?: string;
        width?: number;
      };
      return style.alignItems === "flex-start";
    });
    expect(blocks.length).toBe(1);
    expect((blocks[0].props.style as { width?: number }).width).toBeUndefined();
    const texts = textOf(tree!);
    expect(texts).toContain("0 / 1 completed");
    expect(texts).toContain("1 remaining");
    expect(texts.indexOf("0 / 1 completed")).toBeLessThan(texts.indexOf("1 remaining"));
    const row = hosts(tree!).filter((node) => {
      const style = (node.props.style ?? {}) as { flexDirection?: string };
      return style.flexDirection === "row";
    });
    expect(row.length).toBe(1);
  });

  it("reserves no empty checkmark space when the section is incomplete", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 0, total: 4, remaining: 4, percentage: 0 })}
          expanded={false}
        />
      );
    });
    const text = textOf(tree!);
    expect(text).toContain("0 / 4 completed");
    expect(text).toContain("4 remaining");
    const glyphs = hosts(tree!)
      .filter((node) => (node.props.testID ?? "").startsWith("glyph-"))
      .map((node) => node.props.testID as string);
    expect(glyphs).toEqual(["glyph-chevron-down"]);
  });

  it("shows only the chevron-up when expanded and incomplete (no empty check slot)", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 2, total: 4, remaining: 2, percentage: 50 })}
          expanded={true}
        />
      );
    });
    const glyphs = hosts(tree!)
      .filter((node) => (node.props.testID ?? "").startsWith("glyph-"))
      .map((node) => node.props.testID as string);
    expect(glyphs).toEqual(["glyph-chevron-up"]);
  });

  it("shows the check immediately before the chevron-up when expanded and complete", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 4, total: 4, remaining: 0, percentage: 100 })}
          expanded={true}
        />
      );
    });
    const glyphs = hosts(tree!)
      .filter((node) => (node.props.testID ?? "").startsWith("glyph-"))
      .map((node) => node.props.testID as string);
    expect(glyphs).toEqual(["glyph-check", "glyph-chevron-up"]);
  });

  it("keeps the chevron at the far right even when complete (check sits before it)", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <InspectionSectionProgress
          progress={progressData({ completed: 2, total: 2, remaining: 0, percentage: 100 })}
          expanded={false}
        />
      );
    });
    const glyphs = hosts(tree!)
      .filter((node) => (node.props.testID ?? "").startsWith("glyph-"))
      .map((node) => node.props.testID as string);
    expect(glyphs).toEqual(["glyph-check", "glyph-chevron-down"]);
  });
});