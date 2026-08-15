import React, { useEffect, useState } from "react";
import { Image, Modal, StyleSheet, View } from "react-native";
import { Text, Button, IconButton } from "react-native-paper";
import { Photo } from "@/src/models/Photo";
import { getFileUri } from "./photoUtils";
import { resolvePhotoStoragePath } from "@/src/utils/photoStoragePath";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";

interface PhotoPreviewModalProps {
  photo: Photo | null;
  visible: boolean;
  onClose: () => void;
  contextPoleId: string | undefined;
  block: string;
}

export default function PhotoPreviewModal({
  photo,
  visible,
  onClose,
}: PhotoPreviewModalProps) {
  const [storagePath, setStoragePath] = useState<string | null>(
    photo?.StoragePath ?? null
  );

  useEffect(() => {
    if (!photo) {
      setStoragePath(null);
      return;
    }
    if (photo.StoragePath && photo.StoragePath.trim()) {
      setStoragePath(photo.StoragePath);
      return;
    }
    let cancelled = false;
    resolvePhotoStoragePath(photo).then(async (resolved) => {
      if (cancelled) return;
      if (resolved) {
        setStoragePath(resolved);
        if (photo.PhotoID) {
          try {
            await PhotoRepository.updateStoragePath(photo.PhotoID, resolved);
          } catch {
            // non-fatal: StoragePath is display-only
          }
        }
      } else {
        setStoragePath(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photo]);

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
            {storagePath ? (
              <Text variant="bodySmall" style={styles.infoText}>
                Saved Location: {storagePath}
              </Text>
            ) : null}
            <Text variant="bodySmall" style={styles.infoText}>
              File Name: {photo?.FileName ?? ""}
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
