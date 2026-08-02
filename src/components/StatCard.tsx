import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

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
  color = "#0B5ED7",
}: StatCardProps) {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name={icon}
            size={28}
            color={color}
          />
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
    margin: 6,
    borderRadius: 12,
  },

  iconContainer: {
    alignItems: "center",
    marginBottom: 8,
  },

  value: {
    textAlign: "center",
    fontWeight: "bold",
  },

  title: {
    textAlign: "center",
    color: "#666",
    marginTop: 4,
  },
});
