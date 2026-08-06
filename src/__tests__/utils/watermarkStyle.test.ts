import {
  computeWatermarkMetrics,
  toWatermarkStyleConfig,
  WATERMARK_SIZE_FONT_SCALE,
  WATERMARK_TEXT_COLORS,
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