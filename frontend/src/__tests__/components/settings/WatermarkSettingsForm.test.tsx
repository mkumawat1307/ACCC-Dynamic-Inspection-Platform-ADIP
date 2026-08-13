import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import WatermarkSettingsForm from "@/src/components/settings/WatermarkSettingsForm";
import { useWatermarkSettings } from "@/src/context/WatermarkSettingsContext";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock("@/src/context/WatermarkSettingsContext", () => ({
  useWatermarkSettings: jest.fn(),
}));

const mockedUseWatermarkSettings = useWatermarkSettings as jest.MockedFunction<typeof useWatermarkSettings>;

function findAllByText(tree: ReturnType<typeof TestRenderer.create>, text: string): unknown[] {
  const out: unknown[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const c of node) walk(c);
      return;
    }
    if (node && typeof node === "object") {
      const n = node as { children?: unknown; props?: Record<string, unknown> };
      const children = n.children;
      if (children === text || (Array.isArray(children) && children.length === 1 && children[0] === text)) {
        out.push(node);
      }
      if (Array.isArray(children)) {
        for (const c of children) {
          if (typeof c !== "string") walk(c);
        }
      }
    }
  };
  walk(tree.toJSON());
  return out;
}

function findByTestId(tree: ReturnType<typeof TestRenderer.create>, testId: string): { onPress?: () => void } {
  const nodes = tree.root.findAll((n) => n.props.testID === testId);
  expect(nodes.length).toBeGreaterThan(0);
  return nodes[0].props as { onPress?: () => void };
}

describe("WatermarkSettingsForm", () => {
  const setSetting = jest.fn();
  beforeEach(() => {
    setSetting.mockReset();
    mockedUseWatermarkSettings.mockReturnValue({ settings: DEFAULT_WATERMARK_SETTINGS, ready: true, setSetting });
  });

  it("renders all eight controls", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<WatermarkSettingsForm />); });
    for (const label of ["Small", "Medium", "Large", "Bottom Left", "Bottom Right", "Green", "White", "Yellow", "50%", "05-Aug-2026", "12 Hour", "24 Hour"]) {
      expect(findAllByText(tree, label).length).toBeGreaterThan(0);
    }
  });

  it("calls setSetting('size','large') when Large is pressed", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<WatermarkSettingsForm />); });
    const large = findByTestId(tree, "wmk-size-large");
    act(() => {
      large.onPress?.();
    });
    expect(setSetting).toHaveBeenCalledWith("size", "large");
  });

  it("calls setSetting('showGpsAccuracy',false) via the switch", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    act(() => { tree = TestRenderer.create(<WatermarkSettingsForm />); });
    const rows = tree.root.findAll((n) => n.props.testID === "wmk-switch-gps-accuracy");
    expect(rows.length).toBeGreaterThan(0);
    act(() => { (rows[0].props as { onValueChange: (v: boolean) => void }).onValueChange(false); });
    expect(setSetting).toHaveBeenCalledWith("showGpsAccuracy", false);
  });
});
