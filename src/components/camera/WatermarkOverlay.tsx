import React from "react";
import { StyleSheet, View, Text } from "react-native";
import {
  computeWatermarkMetrics,
  toWatermarkStyleConfig,
  computeWatermarkOverlayLayout,
} from "@/src/utils/watermarkStyle";
import { WatermarkSettings } from "@/src/utils/watermarkSettings";
import { logger } from "@/src/utils/logger";

interface Props {
  width: number;
  height: number;
  lines: string[];
  settings: WatermarkSettings;
  photoWidth?: number;
  photoHeight?: number;
}

export default function WatermarkOverlay({
  width,
  height,
  lines,
  settings,
  photoWidth,
  photoHeight,
}: Props) {
  const config = toWatermarkStyleConfig(settings);

  // If photo dimensions are known, use cover transform to match CameraView's
  // cover behavior (crop to fill). The preview shows a centered crop of the photo.
  let m: ReturnType<typeof computeWatermarkMetrics>;
  let boxX: number;
  let boxY: number;

  if (photoWidth && photoHeight && photoWidth > 0 && photoHeight > 0) {
    // Apply visual correction (~10%) so preview matches saved photo visually
    const visualCorrection = 1.10;

    // Compute metrics at photo resolution (source of truth for saved photo)
    const photoMetrics = computeWatermarkMetrics(photoWidth, photoHeight, config);
    const photoLayout = computeWatermarkOverlayLayout(
      photoWidth,
      photoHeight,
      // Use a large enough maxTextWidth to not constrain layout
      photoMetrics.fSize * 100,
      lines.length,
      config
    );

    // Cover transform: scale to fill preview, cropping excess (matches CameraView)
    const scaleX = width / photoWidth;
    const scaleY = height / photoHeight;
    const coverScale = Math.max(scaleX, scaleY);

    // Apply visual correction to coverScale
    const correctedScale = coverScale * visualCorrection;

    // Content rect: the photo area visible in the preview (centered crop)
    const contentWidth = width / coverScale;
    const contentHeight = height / coverScale;
    const contentOffsetX = (photoWidth - contentWidth) / 2;
    const contentOffsetY = (photoHeight - contentHeight) / 2;

    // Watermark position in photo space (from layout).
    // boxX is a left offset; boxY is a TOP-origin Y (0 = top of image).
    const photoBoxX = photoLayout.boxX;
    const photoBoxY = photoLayout.boxY;

    // Transform to preview space: apply corrected coverScale and content offset.
    // Left edge stays a left offset:
    boxX = Math.round((photoBoxX - contentOffsetX) * correctedScale);
    // Top-origin Y => bottom offset (distance from the bottom edge of the
    // visible content rect), matching the style's `bottom` property:
    const photoBoxBottom = photoBoxY + photoLayout.boxH;
    const contentBottom = contentOffsetY + contentHeight;
    boxY = Math.round((contentBottom - photoBoxBottom) * correctedScale);

    // Scale all metrics uniformly by correctedScale
    m = {
      fSize: Math.max(12, Math.round(photoMetrics.fSize * correctedScale)),
      lh: Math.max(14, Math.round(photoMetrics.lh * correctedScale)),
      padY: Math.max(4, Math.round(photoMetrics.padY * correctedScale)),
      rPad: Math.max(4, Math.round(photoMetrics.rPad * correctedScale)),
      gapX: Math.max(8, Math.round(photoMetrics.gapX * correctedScale)),
      gapY: Math.max(10, Math.round(photoMetrics.gapY * correctedScale)),
      corner: Math.max(2, Math.round(photoMetrics.corner * correctedScale)),
    };

if (__DEV__) {
      logger.debug(
        `[Watermark:preview] position=${config.position} fitScale=${Math.min(width / photoWidth, height / photoHeight).toFixed(3)} coverScale=${coverScale.toFixed(3)} visualCorrection=${visualCorrection.toFixed(2)} photo=${photoWidth}x${photoHeight} preview=${width}x${height}`
      );
      logger.debug(
        `[Watermark:preview] contentRect=photo(${contentOffsetX.toFixed(0)},${contentOffsetY.toFixed(0)}) ${contentWidth.toFixed(0)}x${contentHeight.toFixed(0)}`
      );
      logger.debug(
        `[Watermark:preview] finalVisualScale=${correctedScale.toFixed(3)} boxX=${boxX} boxY=${boxY} width=${Math.round(photoLayout.boxW * correctedScale)} height=${Math.round(photoLayout.boxH * correctedScale)} fs=${m.fSize} lh=${m.lh} padY=${m.padY} rPad=${m.rPad} gapX=${m.gapX} gapY=${m.gapY} corner=${m.corner}`
      );
    }
  } else {
    // Fallback: compute directly at preview resolution (legacy behavior)
    // Uses gapX/gapY directly for positioning (matches legacy behavior)
    m = computeWatermarkMetrics(width, height, config);
    boxX = config.position === "bottomRight" ? m.gapX : m.gapX;
    boxY = m.gapY;
  }

  // Clamp to preview bounds
  const finalBoxX = Math.max(0, Math.min(width - 1, boxX));
  const finalBoxY = Math.max(0, Math.min(height - 1, boxY));

  return (
    <View
      pointerEvents="none"
      style={[
        styles.box,
        {
          bottom: finalBoxY,
          [config.position === "bottomRight" ? "right" : "left"]: finalBoxX,
          paddingVertical: m.padY,
          paddingHorizontal: m.rPad,
          borderRadius: m.corner,
          backgroundColor: `rgba(0,0,0,${config.bgOpacity})`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        },
      ]}
    >
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize: m.fSize,
            lineHeight: m.lh,
            color: config.textColor,
            fontWeight: "bold",
            fontFamily: "sans-serif",
            textShadowColor: "rgba(0,0,0,0.9)",
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 2,
          }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
  },
});