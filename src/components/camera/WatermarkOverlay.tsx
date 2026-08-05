import React from "react";
import { StyleSheet, View, Text } from "react-native";

export interface WatermarkMetrics {
  fSize: number;
  lh: number;
  padY: number;
  rPad: number;
  gap: number;
}

export function computeWatermarkMetrics(
  width: number,
  height: number
): WatermarkMetrics {
  const baseSize = Math.min(width, height);
  const fSize = Math.max(40, Math.round(baseSize / 35));
  return {
    fSize,
    lh: Math.round(fSize * 1.4),
    padY: Math.round(fSize * 0.5),
    rPad: Math.round(fSize * 0.6),
    gap: Math.round(fSize * 0.7),
  };
}

interface Props {
  width: number;
  height: number;
  poleId: string;
  districtBlock: string;
  dateLine: string;
  gpsLine: string;
}

export default function WatermarkOverlay({
  width,
  height,
  poleId,
  districtBlock,
  dateLine,
  gpsLine,
}: Props) {
  const m = computeWatermarkMetrics(width, height);
  const lines = [poleId, districtBlock, dateLine, gpsLine];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.box,
        {
          bottom: m.gap,
          left: m.gap,
          paddingVertical: m.padY,
          paddingHorizontal: m.rPad,
          borderRadius: 10,
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
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
