import React from "react";
import { View } from "react-native";
import { Divider, List, SegmentedButtons, Switch } from "react-native-paper";

import { useWatermarkSettings } from "@/src/context/WatermarkSettingsContext";
import {
  WatermarkDateFormat,
  WatermarkPosition,
  WatermarkSize,
  WatermarkTextColor,
  WatermarkTimeFormat,
} from "@/src/utils/watermarkSettings";

const DATE_FORMAT_LABELS: Record<WatermarkDateFormat, string> = {
  "dd-MMM-yyyy": "05-Aug-2026",
  "dd/MM/yyyy": "05/08/2026",
  "yyyy-MM-dd": "2026-08-05",
};

export default function WatermarkSettingsForm() {
  const { settings, setSetting } = useWatermarkSettings();

  return (
    <View>
      <List.Section>
        <List.Subheader>Size</List.Subheader>
        <SegmentedButtons
          value={settings.size}
          onValueChange={(v) => setSetting("size", v as WatermarkSize)}
          buttons={[
            { value: "small", label: "Small", testID: "wmk-size-small" },
            { value: "medium", label: "Medium", testID: "wmk-size-medium" },
            { value: "large", label: "Large", testID: "wmk-size-large" },
          ]}
        />

        <List.Subheader>Position</List.Subheader>
        <SegmentedButtons
          value={settings.position}
          onValueChange={(v) => setSetting("position", v as WatermarkPosition)}
          buttons={[
            { value: "bottomLeft", label: "Bottom Left", testID: "wmk-position-bottomLeft" },
            { value: "bottomRight", label: "Bottom Right", testID: "wmk-position-bottomRight" },
          ]}
        />

        <List.Subheader>Background Opacity</List.Subheader>
        <SegmentedButtons
          value={String(Math.round(settings.opacity * 100))}
          onValueChange={(v) => setSetting("opacity", Number(v) / 100)}
          buttons={[
            { value: "20", label: "20%", testID: "wmk-opacity-20" },
            { value: "35", label: "35%", testID: "wmk-opacity-35" },
            { value: "50", label: "50%", testID: "wmk-opacity-50" },
            { value: "65", label: "65%", testID: "wmk-opacity-65" },
            { value: "80", label: "80%", testID: "wmk-opacity-80" },
          ]}
        />

        <List.Subheader>Text Color</List.Subheader>
        <SegmentedButtons
          value={settings.textColor}
          onValueChange={(v) => setSetting("textColor", v as WatermarkTextColor)}
          buttons={[
            { value: "green", label: "Green", testID: "wmk-color-green" },
            { value: "white", label: "White", testID: "wmk-color-white" },
            { value: "yellow", label: "Yellow", testID: "wmk-color-yellow" },
          ]}
        />

        <Divider />

        <List.Item
          title="Show GPS Accuracy"
          description="Show accuracy on the photo watermark"
          right={() => (
            <Switch
              testID="wmk-switch-gps-accuracy"
              value={settings.showGpsAccuracy}
              onValueChange={(v) => setSetting("showGpsAccuracy", v)}
            />
          )}
        />

        <Divider />

        <List.Item
          title="Show Reverse Address"
          description="Show the street address on the photo watermark"
          right={() => (
            <Switch
              testID="wmk-switch-show-address"
              value={settings.showAddress}
              onValueChange={(v) => setSetting("showAddress", v)}
            />
          )}
        />

        <Divider />

        <List.Subheader>Date Format</List.Subheader>
        <SegmentedButtons
          value={settings.dateFormat}
          onValueChange={(v) => setSetting("dateFormat", v as WatermarkDateFormat)}
          buttons={Object.entries(DATE_FORMAT_LABELS).map(([value, label]) => ({
            value,
            label,
            testID: `wmk-date-${value}`,
          }))}
        />

        <List.Subheader>Time Format</List.Subheader>
        <SegmentedButtons
          value={settings.timeFormat}
          onValueChange={(v) => setSetting("timeFormat", v as WatermarkTimeFormat)}
          buttons={[
            { value: "12h", label: "12 Hour", testID: "wmk-time-12h" },
            { value: "24h", label: "24 Hour", testID: "wmk-time-24h" },
          ]}
        />
      </List.Section>
    </View>
  );
}
