import React from "react";
import { Image, Modal, StyleSheet, View } from "react-native";
import { Text, Button, IconButton } from "react-native-paper";
import { Photo } from "@/src/models/Photo";
import { Project } from "@/src/models/Project";
import { formatLocation, getFileUri } from "./photoUtils";

interface PhotoPreviewModalProps {
  photo: Photo | null;
  visible: boolean;
  onClose: () => void;
  contextPoleId: string | undefined;
  block: string;
  project: Project | null;
}

export default function PhotoPreviewModal({
  photo,
  visible,
  onClose,
}: PhotoPreviewModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.title}>
              Photo Preview
            </Text>
            <IconButton
              icon="close"
              size={24}
              iconColor="#FFF"
              onPress={onClose}
            />
          </View>

          {photo?.FilePath && (
            <Image
              source={{ uri: getFileUri(photo.FilePath) }}
              style={styles.image}
              resizeMode="contain"
            />
          )}

          <View style={styles.info}>
            <Text variant="bodySmall" style={styles.infoText}>
              {formatLocation(photo?.Latitude ?? null, photo?.Longitude ?? null)} | {photo?.FileName ?? ""}
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={onClose}
            style={styles.closeButton}
          >
            Close Preview
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "92%",
    maxHeight: "90%",
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  title: {
    color: "#FFF",
    fontWeight: "700",
  },
  image: {
    width: "100%",
    height: 400,
  },
  info: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  infoText: {
    color: "#AAA",
    fontSize: 11,
  },
  closeButton: {
    margin: 12,
  },
});
