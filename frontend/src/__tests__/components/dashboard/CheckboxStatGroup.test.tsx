import React from "react";
import { StyleSheet } from "react-native";
import TestRenderer from "react-test-renderer";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import CheckboxStatGroup from "@/src/components/dashboard/CheckboxStatGroup";
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

describe("CheckboxStatGroup", () => {
  it("renders a single group card with each checkbox option, icon, and count", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CheckboxStatGroup
          items={[
            { title: "Online", count: 4 },
            { title: "Offline", count: 6 },
          ]}
        />
      );
    });
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "checkbox-group-card")).toHaveLength(1);
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "checkbox-option-Online")).toHaveLength(1);
    expect(tree!.root.findAll((node) => isHostNode(node) && node.props?.testID === "checkbox-option-Offline")).toHaveLength(1);
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("Online");
    expect(strings).toContain("4");
    expect(strings).toContain("Offline");
    expect(strings).toContain("6");
  });

  it("shows a filled checkbox icon marked in the default color", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CheckboxStatGroup items={[{ title: "Online", count: 4 }]} />
      );
    });
    const icon = tree!.root.findByType(MaterialCommunityIcons as never);
    expect(icon.props.name).toBe("checkbox-marked");
    expect(icon.props.color).toBe(COLORS.primary);
    const count = tree!.root.find((node) => node.props?.testID === "checkbox-option-count-Online");
    const style = StyleSheet.flatten(count.props.style as never) as { color?: string };
    expect(style.color).toBe(COLORS.primary);
  });

  it("uses each item's color when provided", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CheckboxStatGroup items={[{ title: "Online", count: 4, color: "#FD7E14" }]} />
      );
    });
    const icon = tree!.root.findByType(MaterialCommunityIcons as never);
    expect(icon.props.color).toBe("#FD7E14");
  });

  it("truncates option labels to one line", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CheckboxStatGroup items={[{ title: "Online", count: 4 }]} />
      );
    });
    const label = tree!.root.find((node) => node.props?.testID === "checkbox-option-label-Online");
    expect(label.props.numberOfLines).toBe(1);
  });

  it("renders nothing when there are no items", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CheckboxStatGroup items={[]} />);
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders a section title header above the options when provided", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CheckboxStatGroup
          title="RF Details"
          items={[
            { title: "RF Yes", count: 1 },
            { title: "RF No", count: 2 },
          ]}
        />
      );
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).toContain("RF Details");
    expect(strings.indexOf("RF Details")).toBeLessThan(strings.indexOf("RF Yes"));
  });

  it("omits the section title header when title is not provided", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CheckboxStatGroup items={[{ title: "RF Yes", count: 1 }]} />);
    });
    const strings = collectStrings(tree!.toJSON());
    expect(strings).not.toContain("RF Details");
    expect(strings.filter((s) => s === "RF Yes")).toHaveLength(1);
  });
});