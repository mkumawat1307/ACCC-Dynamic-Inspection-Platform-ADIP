import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BreakdownRow } from "@/src/database/repositories/DashboardService";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

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
  return (
    <Card style={styles.card}>
      <Card.Content>
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
        ) : (
          rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text variant="bodyMedium" style={styles.rowLabel}>
                {row.label}
              </Text>
              <Text variant="bodyMedium" style={[styles.rowCount, { color }]}>
                {row.count}
              </Text>
            </View>
          ))
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },

  title: {
    marginLeft: SPACING.sm,
    fontWeight: "bold",
    flex: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.sm,
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
});
