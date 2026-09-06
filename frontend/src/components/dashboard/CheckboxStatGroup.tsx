import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

export interface CheckboxStatItem {
  title: string;
  count: number;
  color?: string;
  icon?: string;
}

interface CheckboxStatGroupProps {
  items: CheckboxStatItem[];
  title?: string;
}

export default function CheckboxStatGroup({ items, title }: CheckboxStatGroupProps) {
  if (items.length === 0) return null;

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        {title ? (
          <>
            <View style={styles.headerRow}>
              <Text variant="titleMedium" style={styles.title}>
                {title}
              </Text>
            </View>
            <View style={styles.divider} />
          </>
        ) : null}
        <View style={styles.grid} testID="checkbox-group-card">
          {items.map((item) => {
            const color = item.color ?? COLORS.primary;
            return (
              <View
                key={item.title}
                style={styles.option}
                testID={`checkbox-option-${item.title}`}
              >
                <View style={styles.optionLine}>
                  <MaterialCommunityIcons name="checkbox-marked" size={20} color={color} />
                  <Text
                    variant="bodyMedium"
                    style={styles.optionLabel}
                    numberOfLines={1}
                    testID={`checkbox-option-label-${item.title}`}
                  >
                    {item.title}
                  </Text>
                </View>
                <Text
                  variant="headlineMedium"
                  style={[styles.optionCount, { color }]}
                  testID={`checkbox-option-count-${item.title}`}
                >
                  {item.count}
                </Text>
              </View>
            );
          })}
        </View>
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
    paddingHorizontal: SPACING.sm,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },

  title: {
    fontWeight: "bold",
    flex: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginBottom: SPACING.xs,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },

  option: {
    flexBasis: "48%",
    flexGrow: 1,
    maxWidth: "48%",
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0E0E0",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },

  optionLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  optionLabel: {
    color: COLORS.textSecondary,
    flexShrink: 1,
  },

  optionCount: {
    fontWeight: "bold",
    marginTop: SPACING.xs,
  },
});