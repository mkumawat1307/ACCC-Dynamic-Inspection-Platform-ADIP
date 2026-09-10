//frontend\src\components\inspection\OverallProgressCard.tsx
//
// Compact single card at the top of the inspection form summarizing overall
// progress across every section:
//
//   [Overall Inspection]              [3 / 5 completed]
//   [=============-------------- 60%]
//   [2 remaining]
//
// All numbers come from InspectionProgressService — the component never
// calculates or queries anything itself.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, ProgressBar } from "react-native-paper";
import type { InspectionProgress } from "@/src/database/repositories/InspectionProgressService";
import { COLORS, SPACING } from "@/src/constants/ui";

interface Props {
  progress: InspectionProgress;
}

export default function OverallProgressCard({ progress }: Props) {
  return (
    <Card style={styles.card} testID="overall-progress-card">
      <Card.Content style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Overall Inspection</Text>
          <Text style={styles.completed} numberOfLines={1}>
            {progress.completed} / {progress.total} completed
          </Text>
        </View>
        <ProgressBar
          progress={progress.percentage / 100}
          color={COLORS.summaryToday}
          style={styles.bar}
        />
        <View style={styles.footerRow}>
          <Text style={styles.percentage}>{progress.percentage}%</Text>
          <Text style={styles.remaining} numberOfLines={1}>
            {progress.remaining} remaining
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: SPACING.md,
    marginBottom: 16,
  },
  content: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  completed: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  bar: {
    marginTop: SPACING.sm - 2,
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.xs - 2,
  },
  percentage: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.summaryToday,
  },
  remaining: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});