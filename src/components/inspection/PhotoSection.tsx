import React, {
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";
import {
  Text,
  ActivityIndicator,
} from "react-native-paper";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Photo } from "@/src/models/Photo";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { deletePhoto as safDelete } from "@/src/utils/storageManager";
import { usePhotoCapture } from "./usePhotoCapture";
import { useWatermarkProcessor } from "./useWatermarkProcessor";
import PhotoCard from "./PhotoCard";
import PhotoPreviewModal from "./PhotoPreviewModal";
import PhotoSectionHeader from "./PhotoSectionHeader";

import { logger } from "@/src/utils/logger";

interface Props {
  inspectionId: number;
  locked?: boolean;
}

export default function PhotoSection({ inspectionId, locked = false }: Props) {
  const { project, poleId: contextPoleId } = useInspection();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    loadPhotos();
    loadBlock();
  }, [inspectionId]);

  async function loadBlock() {
    if (!inspectionId) return;
    try {
      const data = await InspectionRepository.getInspectionValues(inspectionId);
      if (data.block) {
        setBlock(data.block);
      }
    } catch (error) {
      logger.error("Load Block Error:", error);
    }
  }

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await PhotoRepository.getByInspection(inspectionId);
      setPhotos(data);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  const {
    watermarkState,
    watermarkHtml,
    webViewRef,
    handleWebViewMessage,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  } = useWatermarkProcessor({ project, onPhotosUpdated: loadPhotos });

  const { capturing, capturePhoto } = usePhotoCapture({
    inspectionId,
    project,
    contextPoleId,
    block,
    onPhotoCaptured: (newPhotoId, assetUri, fileName, lines) => {
      enqueueWatermark(newPhotoId, assetUri, fileName, lines);
      loadPhotos();
    },
  });

  async function deletePhoto(photoId: number) {
    const state = watermarkState[photoId];
    if (state === "processing") {
      Alert.alert("Please Wait", "Cannot delete a photo while it is being watermarked.");
      return;
    }

    Alert.alert("Delete Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const photo = photos.find((p) => p.PhotoID === photoId);
            if (photo?.FilePath) {
              if (photo.FilePath.startsWith("content://")) {
                await safDelete(photo.FilePath);
              } else {
                await FileSystem.deleteAsync(photo.FilePath, { idempotent: true });
              }
            }
            await PhotoRepository.delete(photoId);
            clearWatermarkState(photoId);
            await loadPhotos();
          } catch (error) {
            logger.error("Delete Error:", error);
          }
        },
      },
    ]);
  }

  const hasMinPhotos = photos.length >= 1;
  const allComplete = photos.length > 0 && photos.every(
    p => watermarkState[p.PhotoID!] === "completed"
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {watermarkHtml && (
        <WebView
          ref={webViewRef}
          source={{ html: watermarkHtml }}
          style={styles.watermarkWebView}
          javaScriptEnabled
          originWhitelist={["*"]}
          onMessage={handleWebViewMessage}
        />
      )}

      <PhotoPreviewModal
        photo={previewPhoto}
        visible={!!previewPhoto}
        onClose={() => setPreviewPhoto(null)}
        contextPoleId={contextPoleId}
        block={block}
        project={project}
      />

      <PhotoSectionHeader
        photoCount={photos.length}
        hasMinPhotos={hasMinPhotos}
        allComplete={allComplete}
        capturing={capturing}
        onCapture={locked ? () => Alert.alert("Pole ID Required", "Please enter Pole ID first before filling the inspection details.") : capturePhoto}
      />

      {photos.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{'\uD83D\uDCF7'}</Text>
          <Text style={styles.emptyTitle}>No Photos Captured</Text>
          <Text style={styles.emptySubtitle}>
            Tap Capture to take the first photo.
            Minimum 1 photo required.
          </Text>
        </View>
      )}

      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.PhotoID}
          photo={photo}
          index={index}
          state={watermarkState[photo.PhotoID!]}
          onPreview={setPreviewPhoto}
          onDelete={deletePhoto}
          onRetry={retryWatermark}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  watermarkWebView: {
    position: "absolute",
    top: -9999,
    width: 1,
    height: 1,
  },
  loading: {
    paddingVertical: 30,
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 30,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#777",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});

