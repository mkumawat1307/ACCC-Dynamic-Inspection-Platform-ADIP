import React from "react";
import { StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";

interface Props {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  borderColor?: string;
  borderWidth?: number;
}

export default function DashboardActionCard({
  title,
  subtitle,
  icon,
  onPress,
  borderColor = "#D9D9D9",
  borderWidth = 1,
}: Props) {
  return (
    <Card style={[styles.card, { borderColor, borderWidth }]} onPress={onPress}>
      <Card.Content style={styles.content}>
        <MaterialCommunityIcons name={icon} size={28} color={COLORS.primary} />
        <Text variant="titleSmall" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          {subtitle}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
  },

  content: {
    paddingVertical: SPACING.md,
    alignItems: "center",
  },

  title: {
    marginTop: SPACING.sm,
    fontWeight: "700",
    textAlign: "center",
  },

  subtitle: {
    marginTop: SPACING.xs,
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 11,
  },
});
