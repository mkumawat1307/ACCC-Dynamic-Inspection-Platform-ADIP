import {
  computeWatermarkMetrics,
  computeWatermarkOverlayLayout,
  toWatermarkStyleConfig,
  WATERMARK_SIZE_FONT_SCALE,
  WATERMARK_TEXT_COLORS,
  WATERMARK_OVERLAY_SHADOW_MARGIN,
} from "@/src/utils/watermarkStyle";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

describe("toWatermarkStyleConfig", () => {
  it("resolves defaults to the current visual", () => {
    expect(toWatermarkStyleConfig(DEFAULT_WATERMARK_SETTINGS)).toEqual({
      fontScale: 0.5,
      position: "bottomLeft",
      bgOpacity: 0.5,
      textColor: "#76FF03",
    });
  });

  it("resolves overrides", () => {
    expect(
      toWatermarkStyleConfig({
        ...DEFAULT_WATERMARK_SETTINGS,
        size: "large",
        position: "bottomRight",
        opacity: 0.8,
        textColor: "yellow",
      })
    ).toEqual({
      fontScale: 1.0,
      position: "bottomRight",
      bgOpacity: 0.8,
      textColor: "#FFEB3B",
    });
  });

  it("returns a fresh object each call", () => {
    const a = toWatermarkStyleConfig(DEFAULT_WATERMARK_SETTINGS);
    const b = toWatermarkStyleConfig(DEFAULT_WATERMARK_SETTINGS);
    expect(a).not.toBe(b);
  });

  it("maps all size and color options", () => {
    expect(WATERMARK_SIZE_FONT_SCALE).toEqual({ small: 0.5, medium: 0.8, large: 1.0 });
    expect(WATERMARK_TEXT_COLORS).toEqual({ green: "#76FF03", white: "#FFFFFF", yellow: "#FFEB3B" });
  });
});

describe("computeWatermarkMetrics", () => {
  it("scales medium (0.8) at 1080x1920", () => {
    expect(
      computeWatermarkMetrics(1080, 1920, {
        fontScale: 0.8,
        position: "bottomLeft",
        bgOpacity: 0.5,
        textColor: "#76FF03",
      })
    ).toEqual({
      fSize: 48,
      lh: 55,
      padY: 17,
      rPad: 19,
      gapX: 36,
      gapY: 48,
      corner: 10,
    });
  });

  it("scales font by the size factor", () => {
    const small = computeWatermarkMetrics(1080, 1920, {
      fontScale: 0.5,
      position: "bottomLeft",
      bgOpacity: 0.5,
      textColor: "#76FF03",
    });
    const large = computeWatermarkMetrics(1080, 1920, {
      fontScale: 1.0,
      position: "bottomLeft",
      bgOpacity: 0.5,
      textColor: "#76FF03",
    });
    expect(small.fSize).toBe(30);
    expect(large.fSize).toBe(60);
  });

  it("maps the Small size to a 0.5 font scale", () => {
    expect(
      toWatermarkStyleConfig({ ...DEFAULT_WATERMARK_SETTINGS, size: "small" }).fontScale
    ).toBe(0.5);
  });

  it("applies the corner radius class", () => {
    expect(
      computeWatermarkMetrics(4000, 3000, {
        fontScale: 1,
        position: "bottomLeft",
        bgOpacity: 0.5,
        textColor: "#76FF03",
      }).corner
    ).toBe(33);
  });
});

describe("computeWatermarkOverlayLayout", () => {
  const config = {
    fontScale: 0.5,
    position: "bottomLeft" as const,
    bgOpacity: 0.5,
    textColor: "#76FF03",
  };

  it("clamps the clip rect inside the image bounds", () => {
    const layout = computeWatermarkOverlayLayout(400, 600, 300, 2, config);
    expect(layout.boxX).toBeGreaterThanOrEqual(0);
    expect(layout.boxY).toBeGreaterThanOrEqual(0);
    expect(layout.overX).toBeGreaterThanOrEqual(0);
    expect(layout.overY).toBeGreaterThanOrEqual(0);
    expect(layout.overX + layout.overW).toBeLessThanOrEqual(400);
    expect(layout.overY + layout.overH).toBeLessThanOrEqual(600);
  });

  it("positions the clip rect around the box including the shadow margin", () => {
    const layout = computeWatermarkOverlayLayout(4000, 3000, 420, 6, config);
    expect(layout.overX).toBe(layout.boxX - WATERMARK_OVERLAY_SHADOW_MARGIN);
    expect(layout.overY).toBe(layout.boxY - WATERMARK_OVERLAY_SHADOW_MARGIN);
    expect(layout.overW).toBe(layout.boxW + WATERMARK_OVERLAY_SHADOW_MARGIN * 2);
    expect(layout.overH).toBe(layout.boxH + WATERMARK_OVERLAY_SHADOW_MARGIN * 2);
  });

  it("mirrors the box to the right edge for bottomRight", () => {
    const right = computeWatermarkOverlayLayout(4000, 3000, 420, 6, {
      ...config,
      position: "bottomRight",
    });
    expect(right.boxX).toBe(4000 - right.boxW - right.metrics.gapX);
    expect(right.overX + right.overW).toBe(
      right.boxX + right.boxW + WATERMARK_OVERLAY_SHADOW_MARGIN
    );
  });

  it("derives text baseline and left from the box geometry", () => {
    const layout = computeWatermarkOverlayLayout(4000, 3000, 420, 6, config);
    expect(layout.textLeft).toBe(layout.boxX + layout.metrics.rPad);
    expect(layout.textBase).toBe(
      layout.boxY + layout.metrics.padY + Math.round(layout.metrics.fSize * 0.8)
    );
  });

  it("reuses the same metric math as the preview overlay (WYSIWYG)", () => {
    const layout = computeWatermarkOverlayLayout(1080, 1920, 300, 3, config);
    expect(layout.metrics).toEqual(
      computeWatermarkMetrics(1080, 1920, {
        fontScale: 0.5,
        position: "bottomLeft",
        bgOpacity: 0.5,
        textColor: "#76FF03",
      })
    );
  });
});