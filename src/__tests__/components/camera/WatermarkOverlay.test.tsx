import React from "react";
import TestRenderer from "react-test-renderer";
import WatermarkOverlay, {
  computeWatermarkMetrics,
} from "@/src/components/camera/WatermarkOverlay";

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
  it("scales to fSize 60 for 1080x1920", () => {
    expect(computeWatermarkMetrics(1080, 1920)).toEqual({
      fSize: 60,
      lh: 69,
      padY: 21,
      rPad: 24,
      gapX: 45,
      gapY: 60,
    });
  });

  it("scales up for 4000x3000", () => {
    expect(computeWatermarkMetrics(4000, 3000)).toEqual({
      fSize: 167,
      lh: 192,
      padY: 58,
      rPad: 67,
      gapX: 125,
      gapY: 167,
    });
  });

  it("scales beyond the floor for 7000x7000", () => {
    expect(computeWatermarkMetrics(7000, 7000)).toEqual({
      fSize: 389,
      lh: 447,
      padY: 136,
      rPad: 156,
      gapX: 292,
      gapY: 389,
    });
  });
});

describe("WatermarkOverlay", () => {
  it("renders the 4 watermark lines in order", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          poleId="P-101"
          districtBlock="North, B3"
          dateLine="04-Aug-2026 10:00 AM"
          gpsLine="Acquiring GPS…"
        />
      );
    });
    const texts = collectStrings(tree.toJSON());
    expect(texts).toEqual([
      "P-101",
      "North, B3",
      "04-Aug-2026 10:00 AM",
      "Acquiring GPS…",
    ]);
  });

  it("renders the reverse-geocoded address lines after the GPS line", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          poleId="SIK/001"
          districtBlock="Alwar, XYZ"
          dateLine="05-Aug-2026 05:33 PM"
          gpsLine="27.608829, 75.151686"
          addressLines={["Near Collector Office", "Station Road", "Alwar, Rajasthan"]}
        />
      );
    });
    const texts = collectStrings(tree.toJSON());
    expect(texts).toEqual([
      "SIK/001",
      "Alwar, XYZ",
      "05-Aug-2026 05:33 PM",
      "27.608829, 75.151686",
      "Near Collector Office",
      "Station Road",
      "Alwar, Rajasthan",
    ]);
  });

  it("does not render an address section when no address lines are given", () => {
    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <WatermarkOverlay
          width={1080}
          height={1920}
          poleId="P-101"
          districtBlock="North, B3"
          dateLine="04-Aug-2026 10:00 AM"
          gpsLine="Acquiring GPS…"
        />
      );
    });
    const texts = collectStrings(tree.toJSON());
    expect(texts).toHaveLength(4);
  });
});
