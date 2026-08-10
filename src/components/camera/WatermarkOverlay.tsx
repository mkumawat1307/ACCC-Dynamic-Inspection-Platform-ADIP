import React from "react";
import { StyleSheet, View, Text } from "react-native";
import {
  computeWatermarkMetrics,
  toWatermarkStyleConfig,
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

  // WYSIWYG: If photo dimensions are known, compute metrics at photo scale then scale to preview
  let m: ReturnType<typeof computeWatermarkMetrics>;

  if (photoWidth && photoHeight && photoWidth > 0 && photoHeight > 0) {
    // Compute metrics at photo resolution (source of truth)
    const photoMetrics = computeWatermarkMetrics(photoWidth, photoHeight, config);
    // Uniform scale factor from photo to preview (preserves aspect)
    const scaleX = width / photoWidth;
    const scaleY = height / photoHeight;
    const scale = Math.min(scaleX, scaleY);

    // Scale all metrics uniformly
    m = {
      fSize: Math.max(12, Math.round(photoMetrics.fSize * scale)),
      lh: Math.max(14, Math.round(photoMetrics.lh * scale)),
      padY: Math.max(4, Math.round(photoMetrics.padY * scale)),
      rPad: Math.max(4, Math.round(photoMetrics.rPad * scale)),
      gapX: Math.max(8, Math.round(photoMetrics.gapX * scale)),
      gapY: Math.max(10, Math.round(photoMetrics.gapY * scale)),
      corner: Math.max(2, Math.round(photoMetrics.corner * scale)),
    };

    if (__DEV__) {
      logger.debug(
        `[Watermark:preview] scale=${scale.toFixed(3)} photo=${photoWidth}x${photoHeight} preview=${width}x${height}`
      );
      logger.debug(
        `[Watermark:preview] box fs=${m.fSize} lh=${m.lh} padY=${m.padY} rPad=${m.rPad} gapX=${m.gapX} gapY=${m.gapY} corner=${m.corner}`
      );
    }
  } else {
    // Fallback: compute directly at preview resolution (legacy behavior)
    m = computeWatermarkMetrics(width, height, config);
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.box,
        {
          bottom: m.gapY,
          [config.position === "bottomRight" ? "right" : "left"]: m.gapX,
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