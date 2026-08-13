import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BreakdownRow } from "@/src/database/repositories/DashboardService";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

const MAX_OPTIONS = 6;
const MAX_LABEL_LENGTH = 15;

interface StatBreakdownCardProps {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  rows: BreakdownRow[];
}

export default function StatBreakdownCard({
  title,
  icon,
  color = COLORS.primary,
  rows,
}: StatBreakdownCardProps) {
  const useCardLayout =
    rows.length > 0 &&
    rows.length <= MAX_OPTIONS &&
    rows.every((row) => row.label.length <= MAX_LABEL_LENGTH);

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
          <Text variant="titleMedium" style={styles.title}>
            {title}
          </Text>
        </View>
        <View style={styles.divider} />
        {rows.length === 0 ? (
          <Text variant="bodyMedium" style={styles.empty}>
            No data
          </Text>
        ) : useCardLayout ? (
          <View style={styles.cardGrid} testID="breakdown-card-grid">
            {rows.map((row) => (
              <Card
                key={row.label}
                elevation={0}
                style={styles.optionCard}
                testID={`breakdown-option-${row.label}`}
              >
                <Card.Content style={styles.optionContent}>
                  <Text
                    variant="bodyMedium"
                    numberOfLines={1}
                    style={styles.optionLabel}
                    testID={`breakdown-option-label-${row.label}`}
                  >
                    {row.label}
                  </Text>
                  <Text
                    variant="headlineMedium"
                    style={[styles.optionCount, { color }]}
                    testID={`breakdown-option-count-${row.label}`}
                  >
                    {row.count}
                  </Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        ) : (
          <View testID="breakdown-list">
            {rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text variant="bodyMedium" style={styles.rowLabel}>
                  {row.label}
                </Text>
                <Text variant="bodyMedium" style={[styles.rowCount, { color }]}>
                  {row.count}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
  },

  content: {
    paddingVertical: SPACING.sm,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },

  title: {
    marginLeft: SPACING.sm,
    fontWeight: "bold",
    flex: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.xs,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
  },

  rowLabel: {
    color: COLORS.textSecondary,
  },

  rowCount: {
    fontWeight: "bold",
  },

  empty: {
    color: COLORS.textMuted,
    textAlign: "center",
    paddingVertical: SPACING.sm,
  },

  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },

  optionCard: {
    flexBasis: "48%",
    flexGrow: 1,
    maxWidth: "48%",
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0E0E0",
  },

  optionContent: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },

  optionLabel: {
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  optionCount: {
    fontWeight: "bold",
    marginTop: SPACING.xs,
  },
});
