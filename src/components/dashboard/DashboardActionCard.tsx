import React from "react";
import { StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

interface Props {
  title: string;
  subtitle: string;
  icon: string;
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
        <MaterialCommunityIcons
          name={icon as any}
          size={36}
          color="#1976D2"
        />

        <Text variant="titleMedium" style={styles.title}>
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
    marginBottom: 14,
    borderRadius: 14,
  },

  content: {
    paddingVertical: 18,
    alignItems: "center",
  },

  title: {
    marginTop: 10,
    fontWeight: "700",
  },

  subtitle: {
    marginTop: 6,
    textAlign: "center",
    color: "#666",
  },
});