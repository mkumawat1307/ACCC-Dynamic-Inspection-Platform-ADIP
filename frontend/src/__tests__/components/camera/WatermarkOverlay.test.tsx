import React from "react";
import TestRenderer from "react-test-renderer";
import WatermarkOverlay from "@/src/components/camera/WatermarkOverlay";
import { computeWatermarkMetrics } from "@/src/utils/watermarkStyle";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

function collectFontSizes(node: unknown, out: number[] = []): number[] {
  if (!node || typeof node !== "object") return out;
  if (typeof node === "string") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectFontSizes(child, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  const style = (obj.props as Record<string, unknown> | undefined)?.style as
    | Record<string, unknown>
    | undefined;
  if (style && typeof style.fontSize === "number") {
    out.push(style.fontSize);
  }
  const children = obj.children as unknown[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) collectFontSizes(child, out);
  }
  return out;
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
      bottom: 30,
      right: 23,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 6,
    });
  });

  it("portrait and landscape photo dimensions produce consistent font size in a portrait container", () => {
    const lines = ["P-101", "04-Aug-2026 10:00 AM"];
    const settings = DEFAULT_WATERMARK_SETTINGS;

    let portraitTree!: ReturnType<typeof TestRenderer.create>;
    let landscapeTree!: ReturnType<typeof TestRenderer.create>;

    TestRenderer.act(() => {
      portraitTree = TestRenderer.create(
        <WatermarkOverlay
          width={375}
          height={500}
          lines={lines}
          settings={settings}
          photoWidth={3024}
          photoHeight={4032}
        />
      );
    });

    TestRenderer.act(() => {
      landscapeTree = TestRenderer.create(
        <WatermarkOverlay
          width={375}
          height={500}
          lines={lines}
          settings={settings}
          photoWidth={4032}
          photoHeight={3024}
        />
      );
    });

    const portraitFontSizes = collectFontSizes(portraitTree.toJSON());
    const landscapeFontSizes = collectFontSizes(landscapeTree.toJSON());

    expect(portraitFontSizes.length).toBeGreaterThan(0);
    expect(landscapeFontSizes.length).toBeGreaterThan(0);

    const portraitFontSize = portraitFontSizes[0];
    const landscapeFontSize = landscapeFontSizes[0];

    expect(portraitFontSize).toBe(12);
    expect(landscapeFontSize).toBe(15);
  });

  it("matched orientations produce identical font size in matched containers", () => {
    const lines = ["P-101", "04-Aug-2026 10:00 AM"];
    const settings = DEFAULT_WATERMARK_SETTINGS;

    let portraitTree!: ReturnType<typeof TestRenderer.create>;
    let landscapeTree!: ReturnType<typeof TestRenderer.create>;

    TestRenderer.act(() => {
      portraitTree = TestRenderer.create(
        <WatermarkOverlay
          width={375}
          height={500}
          lines={lines}
          settings={settings}
          photoWidth={3024}
          photoHeight={4032}
        />
      );
    });

    TestRenderer.act(() => {
      landscapeTree = TestRenderer.create(
        <WatermarkOverlay
          width={500}
          height={375}
          lines={lines}
          settings={settings}
          photoWidth={4032}
          photoHeight={3024}
        />
      );
    });

    const portraitFontSizes = collectFontSizes(portraitTree.toJSON());
    const landscapeFontSizes = collectFontSizes(landscapeTree.toJSON());

    expect(portraitFontSizes[0]).toBe(landscapeFontSizes[0]);
  });
});
