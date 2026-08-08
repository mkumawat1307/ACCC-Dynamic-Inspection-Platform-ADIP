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

/** Extra transparency kept around the box so the box/text shadow survives a tight overlay crop. */
export const WATERMARK_OVERLAY_SHADOW_MARGIN = 12;

export interface WatermarkOverlayLayout {
  metrics: WatermarkMetrics;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  overX: number;
  overY: number;
  overW: number;
  overH: number;
  textLeft: number;
  textBase: number;
}

export function computeWatermarkOverlayLayout(
  imgWidth: number,
  imgHeight: number,
  maxTextWidthPx: number,
  lineCount: number,
  config: WatermarkStyleConfig
): WatermarkOverlayLayout {
  const metrics = computeWatermarkMetrics(imgWidth, imgHeight, config);
  const boxW = Math.max(1, Math.round(maxTextWidthPx + metrics.rPad * 2));
  const boxH = Math.max(1, lineCount * metrics.lh + metrics.padY * 2);
  const boxX = Math.max(
    0,
    config.position === "bottomRight" ? imgWidth - boxW - metrics.gapX : metrics.gapX
  );
  const boxY = Math.max(0, imgHeight - boxH - metrics.gapY);
  const margin = WATERMARK_OVERLAY_SHADOW_MARGIN;
  const overX = Math.max(0, boxX - margin);
  const overY = Math.max(0, boxY - margin);
  const overW = Math.min(imgWidth - overX, boxW + margin * 2);
  const overH = Math.min(imgHeight - overY, boxH + margin * 2);
  return {
    metrics,
    boxX,
    boxY,
    boxW,
    boxH,
    overX: overX,
    overY: overY,
    overW: overW,
    overH: overH,
    textLeft: boxX + metrics.rPad,
    textBase: boxY + metrics.padY + Math.round(metrics.fSize * 0.8),
  };
}