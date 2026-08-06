import React from "react";
import { StyleSheet, View, Text } from "react-native";
import {
  computeWatermarkMetrics,
  toWatermarkStyleConfig,
} from "@/src/utils/watermarkStyle";
import { WatermarkSettings } from "@/src/utils/watermarkSettings";

interface Props {
  width: number;
  height: number;
  lines: string[];
  settings: WatermarkSettings;
}

export default function WatermarkOverlay({ width, height, lines, settings }: Props) {
  const config = toWatermarkStyleConfig(settings);
  const m = computeWatermarkMetrics(width, height, config);
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
