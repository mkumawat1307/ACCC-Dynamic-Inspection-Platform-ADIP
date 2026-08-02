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
}

export default function DashboardActionCard({
  title,
  subtitle,
  icon,
  onPress,
}: Props) {
  return (
    <Card style={styles.card} onPress={onPress}>
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
    paddingVertical: SPACING.lg,
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
