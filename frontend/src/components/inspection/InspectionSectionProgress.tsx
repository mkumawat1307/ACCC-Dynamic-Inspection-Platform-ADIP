//frontend\src\components\inspection\InspectionSectionProgress.tsx
//
// Inline progress shown in every section header, between the section title and
// the expand/collapse indicator:
//
//   [Section Name]   [3 / 3 completed]  [✓]  [⌄]
//                    [0 remaining]
//
// It only renders already-calculated progress data — all calculation lives in
// InspectionProgressService. When no progress is attached (e.g. the Photos
// section or a section with nothing to complete) the header keeps its normal
// chevron-only look. The reference column is left-aligned; when a section is
// complete a green check sits immediately beside the chevron, and the chevron
// always holds the far-right edge.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { InspectionSectionProgress as InspectionSectionProgressData } from "@/src/database/repositories/InspectionProgressService";
import { COLORS, SPACING } from "@/src/constants/ui";

interface Props {
  progress: InspectionSectionProgressData | null | undefined;
  expanded: boolean;
}

export default function InspectionSectionProgress({ progress, expanded }: Props) {
  const hasProgress = !!progress && progress.total > 0;
  const complete = hasProgress && progress.remaining === 0;
  return (
    <View style={styles.row}>
      {hasProgress && (
        <View style={styles.progressBlock}>
          <Text style={styles.completed} numberOfLines={1}>
            {progress.completed} / {progress.total} completed
          </Text>
          <Text style={styles.remaining} numberOfLines={1}>
            {progress.remaining} remaining
          </Text>
        </View>
      )}
      {complete && (
        <View style={styles.iconSlot}>
          <MaterialCommunityIcons
            name="check"
            size={20}
            color={COLORS.summaryToday}
          />
        </View>
      )}
      <View style={styles.iconSlot}>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={COLORS.textMuted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    paddingRight: SPACING.xs,
  },
  progressBlock: {
    alignItems: "flex-start",
    flexShrink: 0,
    marginRight: SPACING.xs,
  },
  completed: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  remaining: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.xs,
  },
});