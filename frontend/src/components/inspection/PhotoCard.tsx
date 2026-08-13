import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Text, IconButton, ActivityIndicator } from "react-native-paper";
import { Photo } from "@/src/models/Photo";

export type WatermarkState = "pending" | "processing" | "completed" | "failed";

interface PhotoCardProps {
  photo: Photo;
  index: number;
  state?: WatermarkState;
  onPreview: (photo: Photo) => void;
  onDelete: (photoId: number) => void;
  onRetry?: (photoId: number) => void;
}

export default function PhotoCard({
  photo,
  index,
  state,
  onPreview,
  onDelete,
  onRetry,
}: PhotoCardProps) {
  return (
    <Card key={photo.PhotoID} style={styles.card}>
      <View style={styles.row}>
        <Pressable onPress={() => onPreview(photo)} style={styles.labelPressable}>
          <Text variant="titleMedium" style={styles.label}>
            Photo {index + 1}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          {state === "processing" && (
            <ActivityIndicator size="small" style={{ marginRight: 4 }} />
          )}
          {state === "completed" && (
            <Text style={styles.completedIcon}>{"\u2713"}</Text>
          )}
          {state === "failed" && (
            <Text style={styles.failedIcon}>{"!"}</Text>
          )}
          {state === "failed" && onRetry && (
            <IconButton
              icon="refresh"
              iconColor="#F57C00"
              size={20}
              onPress={() => onRetry(photo.PhotoID!)}
            />
          )}
          <IconButton
            icon="eye"
            iconColor="#1976D2"
            size={20}
            onPress={() => onPreview(photo)}
          />
          <IconButton
            icon="delete"
            iconColor="#D32F2F"
            size={20}
            onPress={() => onDelete(photo.PhotoID!)}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    borderRadius: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  labelPressable: {
    flex: 1,
  },
  label: {
    fontWeight: "600",
    color: "#1976D2",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  completedIcon: {
    color: "#2E7D32",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 4,
  },
  failedIcon: {
    color: "#D32F2F",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 4,
  },
});
