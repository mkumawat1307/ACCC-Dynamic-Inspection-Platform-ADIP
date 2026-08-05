import React from "react";
import { StyleSheet, View, Text } from "react-native";

export interface WatermarkMetrics {
  fSize: number;
  lh: number;
  padY: number;
  rPad: number;
  gapX: number;
  gapY: number;
}

export function computeWatermarkMetrics(
  width: number,
  height: number
): WatermarkMetrics {
  const baseSize = Math.min(width, height);
  const fSize = Math.max(22, Math.round(baseSize / 18));
  return {
    fSize,
    lh: Math.round(fSize * 1.15),
    padY: Math.round(fSize * 0.35),
    rPad: Math.round(fSize * 0.4),
    gapX: Math.max(16, Math.round(fSize * 0.75)),
    gapY: Math.max(20, Math.round(fSize * 1.0)),
  };
}

interface Props {
  width: number;
  height: number;
  poleId: string;
  districtBlock: string;
  dateLine: string;
  gpsLine: string;
  addressLines?: string[];
}

export default function WatermarkOverlay({
  width,
  height,
  poleId,
  districtBlock,
  dateLine,
  gpsLine,
  addressLines,
}: Props) {
  const m = computeWatermarkMetrics(width, height);
  const lines = [poleId, districtBlock, dateLine, gpsLine, ...(addressLines ?? [])];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.box,
        {
          bottom: m.gapY,
          left: m.gapX,
          paddingVertical: m.padY,
          paddingHorizontal: m.rPad,
          borderRadius: 8,
        },
      ]}
    >
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize: m.fSize,
            lineHeight: m.lh,
            color: "#76FF03",
            fontWeight: "bold",
            fontFamily: "monospace",
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
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});
