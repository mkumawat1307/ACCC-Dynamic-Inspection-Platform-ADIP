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
  it("clamps to fSize 40 for 1080x1920", () => {
    expect(computeWatermarkMetrics(1080, 1920)).toEqual({
      fSize: 40,
      lh: 56,
      padY: 20,
      rPad: 24,
      gap: 28,
    });
  });

  it("scales up for 4000x3000", () => {
    expect(computeWatermarkMetrics(4000, 3000)).toEqual({
      fSize: 86,
      lh: 120,
      padY: 43,
      rPad: 52,
      gap: 60,
    });
  });

  it("scales beyond the floor for 7000x7000", () => {
    expect(computeWatermarkMetrics(7000, 7000)).toEqual({
      fSize: 200,
      lh: 280,
      padY: 100,
      rPad: 120,
      gap: 140,
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
});
