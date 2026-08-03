import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
}

export default function StatCard({
  title,
  value,
  icon,
  color = COLORS.primary,
}: StatCardProps) {
  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={icon} size={28} color={color} />
        </View>

        <Text variant="headlineMedium" style={styles.value}>
          {value}
        </Text>

        <Text variant="bodyMedium" style={styles.title}>
          {title}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: RADIUS.md,
  },

  content: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },

  iconContainer: {
    alignItems: "center",
    marginBottom: SPACING.xs,
  },

  value: {
    textAlign: "center",
    fontWeight: "bold",
  },

  title: {
    textAlign: "center",
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
