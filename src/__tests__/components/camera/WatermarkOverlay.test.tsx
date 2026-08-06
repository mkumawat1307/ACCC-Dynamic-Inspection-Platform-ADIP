import React from "react";
import TestRenderer from "react-test-renderer";
import WatermarkOverlay from "@/src/components/camera/WatermarkOverlay";
import { computeWatermarkMetrics } from "@/src/utils/watermarkStyle";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

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

describe("computeWatermarkMetrics (mirrors watermarkHtml.ts canvas math)", () => {
  it("scales to fSize 60 for 1080x1920 at default config", () => {
    expect(
      computeWatermarkMetrics(1080, 1920, {
        fontScale: 1,
        position: "bottomLeft",
        bgOpacity: 0.5,
        textColor: "#76FF03",
      })
    ).toEqual({
      fSize: 60,
      lh: 69,
      padY: 21,
      rPad: 24,
      gapX: 45,
      gapY: 60,
      corner: 12,
    });
  });

  it("scales up for 4000x3000", () => {
    expect(
      computeWatermarkMetrics(4000, 3000, {
        fontScale: 1,
        position: "bottomLeft",
        bgOpacity: 0.5,
        textColor: "#76FF03",
      })
    ).toEqual({
      fSize: 167,
      lh: 192,
      padY: 58,
      rPad: 67,
      gapX: 125,
      gapY: 167,
      corner: 33,
    });
  });

  it("scales beyond the floor for 7000x7000", () => {
    expect(
      computeWatermarkMetrics(7000, 7000, {
        fontScale: 1,
        position: "bottomLeft",
        bgOpacity: 0.5,
        textColor: "#76FF03",
      })
    ).toEqual({
      fSize: 389,
      lh: 447,
      padY: 136,
      rPad: 156,
      gapX: 292,
      gapY: 389,
      corner: 78,
    });
  });
});

describe("WatermarkOverlay", () => {
  it("renders the watermark lines in order", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          lines={["P-101", "04-Aug-2026 10:00 AM", "Acquiring GPS…"]}
          settings={DEFAULT_WATERMARK_SETTINGS}
        />
      );
    });
    const texts = collectStrings(tree.toJSON());
    expect(texts).toEqual(["P-101", "04-Aug-2026 10:00 AM", "Acquiring GPS…"]);
  });

  it("renders the full spec layout", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          lines={[
            "SIK/001",
            "Sikar, Sikar-01",
            "05-Aug-2026 06:02 PM",
            "27.608123N 75.151703E",
            "Accuracy : ±12 m",
            "Police Lines",
            "Sikar",
            "Rajasthan",
          ]}
          settings={DEFAULT_WATERMARK_SETTINGS}
        />
      );
    });
    const texts = collectStrings(tree.toJSON());
    expect(texts).toEqual([
      "SIK/001",
      "Sikar, Sikar-01",
      "05-Aug-2026 06:02 PM",
      "27.608123N 75.151703E",
      "Accuracy : ±12 m",
      "Police Lines",
      "Sikar",
      "Rajasthan",
    ]);
  });

  it("renders no text when the lines array is empty", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          lines={[]}
          settings={DEFAULT_WATERMARK_SETTINGS}
        />
      );
    });
    const texts = collectStrings(tree.toJSON());
    expect(texts).toEqual([]);
  });

  it("anchors bottomRight box to the right edge", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          lines={["X"]}
          settings={{ ...DEFAULT_WATERMARK_SETTINGS, position: "bottomRight" }}
        />
      );
    });
    const json = tree.toJSON() as unknown as {
      props?: { style?: (Record<string, unknown> | number)[] | Record<string, unknown> };
    };
    const styleArr = Array.isArray(json?.props?.style)
      ? json.props.style
      : json?.props?.style
      ? [json.props.style]
      : [];
    const box = styleArr.find(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null && "bottom" in s
    );
    expect(box).toMatchObject({
      bottom: 48,
      right: 36,
      paddingVertical: 17,
      paddingHorizontal: 19,
      borderRadius: 10,
    });
  });
});
