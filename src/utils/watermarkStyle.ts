import {
  WatermarkPosition,
  WatermarkSettings,
  WatermarkSize,
  WatermarkTextColor,
} from "@/src/utils/watermarkSettings";

export interface WatermarkStyleConfig {
  fontScale: number;
  position: WatermarkPosition;
  bgOpacity: number;
  textColor: string;
}

export const WATERMARK_SIZE_FONT_SCALE: Record<WatermarkSize, number> = {
  small: 0.5,
  medium: 0.8,
  large: 1.0,
};

export const WATERMARK_TEXT_COLORS: Record<WatermarkTextColor, string> = {
  green: "#76FF03",
  white: "#FFFFFF",
  yellow: "#FFEB3B",
};

export function toWatermarkStyleConfig(s: WatermarkSettings): WatermarkStyleConfig {
  return {
    fontScale: WATERMARK_SIZE_FONT_SCALE[s.size],
    position: s.position,
    bgOpacity: s.opacity,
    textColor: WATERMARK_TEXT_COLORS[s.textColor],
  };
}

export interface WatermarkMetrics {
  fSize: number;
  lh: number;
  padY: number;
  rPad: number;
  gapX: number;
  gapY: number;
  corner: number;
}

export function computeWatermarkMetrics(
  width: number,
  height: number,
  config: WatermarkStyleConfig
): WatermarkMetrics {
  const baseSize = Math.min(width, height);
  const fSize = Math.max(22, Math.round((baseSize / 18) * config.fontScale));
  return {
    fSize,
    lh: Math.round(fSize * 1.15),
    padY: Math.round(fSize * 0.35),
    rPad: Math.round(fSize * 0.4),
    gapX: Math.max(16, Math.round(fSize * 0.75)),
    gapY: Math.max(20, Math.round(fSize * 1.0)),
    corner: Math.max(4, Math.round(fSize * 0.2)),
  };
}