import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import {
  Card,
  Text,
  Button,
  IconButton,
  ActivityIndicator,
  Chip,
} from "react-native-paper";

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import ViewShot from "react-native-view-shot";

import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Photo } from "@/src/models/Photo";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { getActiveProjectPath } from "@/src/database/db";
import { getProjectFolderPath } from "@/src/database/helpers/ProjectDBManager";

interface Props {
  inspectionId: number;
}

export default function PhotoSection({
  inspectionId,
}: Props) {
  const { project, poleId: contextPoleId } = useInspection();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [block, setBlock] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);

  const viewShotRef = useRef<ViewShot>(null);
  const [watermarkReady, setWatermarkReady] = useState(false);
  const [watermarkTarget, setWatermarkTarget] = useState<{
    filePath: string;
    latitude: number;
    longitude: number;
    timestamp: string;
    poleId: string;
    block: string;
  } | null>(null);

  useEffect(() => {
    loadPhotos();
    loadBlock();
  }, [inspectionId]);

  async function loadBlock() {
    if (!inspectionId) return;

    try {
      const data =
        await InspectionRepository.getInspectionValues(
          inspectionId
        );
      if (data.block) {
        setBlock(data.block);
      }
    } catch (error) {
      console.error("Load Block Error:", error);
    }
  }

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await PhotoRepository.getByInspection(
        inspectionId
      );
      setPhotos(data);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  async function requestCameraPermission() {
    const { status } =
      await ImagePicker.requestCameraPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Camera permission is required to capture photos."
      );
      return false;
    }

    return true;
  }

  async function getCurrentLocation(): Promise<{
    latitude: number | null;
    longitude: number | null;
  }> {
    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return { latitude: null, longitude: null };
      }

      const location =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch {
      return { latitude: null, longitude: null };
    }
  }

  async function requestLocationPermission(): Promise<boolean> {
    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "GPS Required",
          "GPS location is mandatory for photo capture. Please enable location permissions in your device settings."
        );
        return false;
      }

      return true;
    } catch {
      Alert.alert(
        "GPS Required",
        "Unable to access GPS. Please ensure location services are enabled."
      );
      return false;
    }
  }

  function generateFileName(
    district: string,
    blockName: string,
    pole: string,
    timestamp: string
  ): string {
    const d = new Date(timestamp);
    const day = d.getDate().toString().padStart(2, "0");
    const monthNames = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear().toString();
    const time =
      d.getHours().toString().padStart(2, "0") +
      d.getMinutes().toString().padStart(2, "0") +
      d.getSeconds().toString().padStart(2, "0");

    const cleanDistrict = (district || "NA")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 20);
    const cleanBlock = (blockName || "NA")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 20);
    const cleanPole = (pole || "NA")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 20);

    return `${cleanDistrict}_${cleanBlock}_${cleanPole}_${day}${month}${year}_${time}.jpg`;
  }

  function getDistrictFolder(): string {
    return (project?.DistrictName || "Unknown")
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  async function saveToGallery(sourceUri: string) {
    try {
      await MediaLibrary.saveToLibraryAsync(sourceUri);
    } catch (error) {
      console.warn("Save to gallery skipped:", error);
    }
  }

  async function capturePhoto() {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    const hasLocation = await requestLocationPermission();
    if (!hasLocation) return;

    setCapturing(true);

    try {
      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.8,
          allowsEditing: false,
        });

      if (result.canceled || !result.assets?.[0]) {
        setCapturing(false);
        return;
      }

      const asset = result.assets[0];
      const timestamp = new Date().toISOString();
      const location = await getCurrentLocation();

      if (!location.latitude || !location.longitude) {
        Alert.alert(
          "GPS Required",
          "Unable to get GPS coordinates. Please ensure GPS is enabled and try again."
        );
        setCapturing(false);
        return;
      }

      // Read latest values from DB right before capture
      let latestPoleId = contextPoleId || "NA";
      let latestBlock = block || "NA";
      try {
        const values = await InspectionRepository.getInspectionValues(inspectionId);
        if (values.pole_id) latestPoleId = values.pole_id;
        if (values.block) latestBlock = values.block;
      } catch {}

      const fileName = generateFileName(
        project?.DistrictName || "",
        latestBlock,
        latestPoleId,
        timestamp
      );

      const projectFolder = getProjectFolderPath(project?.ProjectName || "Unknown");
      const destDir = `${projectFolder}photos/`;
      await FileSystem.makeDirectoryAsync(destDir, {
        intermediates: true,
      });

      const destPath = `${destDir}${fileName}`;
      await FileSystem.copyAsync({
        from: asset.uri,
        to: destPath,
      });

      const photo: Photo = {
        InspectionID: inspectionId,
        PhotoType: "Pole",
        FileName: fileName,
        FilePath: destPath,
        Latitude: location.latitude,
        Longitude: location.longitude,
        CapturedAt: timestamp,
        Remarks: null,
      };

      await PhotoRepository.create(photo);
      await loadPhotos();

      setWatermarkTarget({
        filePath: destPath,
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp,
        poleId: latestPoleId,
        block: latestBlock,
      });
      setWatermarkReady(false);
    } catch (error) {
      console.error("Capture Error:", error);
      Alert.alert("Error", "Failed to capture photo.");
      setCapturing(false);
    }
  }

  useEffect(() => {
    if (!watermarkTarget || !watermarkReady) return;

    const timer = setTimeout(async () => {
      try {
        if (viewShotRef.current?.capture) {
          const uri = await viewShotRef.current.capture();

          if (uri) {
            saveToGallery(uri);

            const projectFolder = getProjectFolderPath(project?.ProjectName || "Unknown");
            const downloadDir =
              `${projectFolder}Download/Inspection/`;
            await FileSystem.makeDirectoryAsync(downloadDir, {
              intermediates: true,
            });

            const fileName = generateFileName(
              project?.DistrictName || "",
              watermarkTarget.block,
              watermarkTarget.poleId,
              watermarkTarget.timestamp
            );

            await FileSystem.copyAsync({
              from: uri,
              to: `${downloadDir}${fileName}`,
            });
          }
        }
      } catch (error) {
        console.warn("Watermark save skipped:", error);
      } finally {
        setWatermarkTarget(null);
        setWatermarkReady(false);
        setCapturing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [watermarkTarget, watermarkReady]);

  async function deletePhoto(photoId: number) {
    Alert.alert(
      "Delete Photo",
      "Are you sure you want to delete this photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const photo = photos.find(
                (p) => p.PhotoID === photoId
              );

              if (photo?.FilePath) {
                await FileSystem.deleteAsync(
                  photo.FilePath,
                  { idempotent: true }
                );
              }

              await PhotoRepository.delete(photoId);
              await loadPhotos();
            } catch (error) {
              console.error("Delete Error:", error);
            }
          },
        },
      ]
    );
  }

  function formatDate(
    dateStr: string | null
  ): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatLocation(
    lat: number | null,
    lng: number | null
  ): string {
    if (lat === null || lng === null)
      return "No GPS";
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  function getFileUri(filePath: string): string {
    if (!filePath) return "";
    if (filePath.startsWith("file://")) return filePath;
    if (filePath.startsWith("/")) return `file://${filePath}`;
    return filePath;
  }

  const hasMinPhotos = photos.length >= 1;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* On-screen ViewShot for watermark capture */}
      {watermarkTarget && (
        <ViewShot
          ref={viewShotRef}
          options={{ format: "jpg", quality: 0.9 }}
          style={styles.viewShotOnScreen}
          onLayout={() => setWatermarkReady(true)}
        >
          <Image
            source={{ uri: getFileUri(watermarkTarget.filePath) }}
            style={styles.viewShotImage}
            resizeMode="contain"
          />
          <View style={styles.viewShotWatermark}>
            <Text style={styles.viewShotWatermarkLine}>
              {watermarkTarget.poleId}
            </Text>
            <Text style={styles.viewShotWatermarkLine}>
              {[
                project?.DistrictName,
                watermarkTarget.block,
              ].filter(Boolean).join(", ")}
            </Text>
            <Text style={styles.viewShotWatermarkLine}>
              {formatDate(watermarkTarget.timestamp)}
            </Text>
            <Text style={styles.viewShotWatermarkLine}>
              {formatLocation(
                watermarkTarget.latitude,
                watermarkTarget.longitude
              )}
            </Text>
          </View>
        </ViewShot>
      )}

      {/* Photo Preview Modal */}
      <Modal
        visible={!!previewPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium" style={styles.modalTitle}>
                Photo Preview
              </Text>
              <IconButton
                icon="close"
                size={24}
                iconColor="#FFF"
                onPress={() => setPreviewPhoto(null)}
              />
            </View>

            {previewPhoto?.FilePath && (
              <Image
                source={{ uri: getFileUri(previewPhoto.FilePath) }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}

            <View style={styles.modalWatermark}>
              <Text style={styles.modalWatermarkLine}>
                {contextPoleId || "NA"}
              </Text>
              <Text style={styles.modalWatermarkLine}>
                {[
                  project?.DistrictName,
                  block,
                ].filter(Boolean).join(", ")}
              </Text>
              <Text style={styles.modalWatermarkLine}>
                {formatDate(previewPhoto?.CapturedAt || null)}
              </Text>
              <Text style={styles.modalWatermarkLine}>
                {formatLocation(
                  previewPhoto?.Latitude ?? null,
                  previewPhoto?.Longitude ?? null
                )}
              </Text>
            </View>

            <View style={styles.modalInfo}>
              <Text variant="bodySmall" style={styles.modalInfoText}>
                {previewPhoto?.FileName}
              </Text>
            </View>

            <Button
              mode="contained"
              onPress={() => setPreviewPhoto(null)}
              style={styles.modalCloseButton}
            >
              Close Preview
            </Button>
          </View>
        </View>
      </Modal>

      {/* Header with count and validation */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="titleMedium" style={styles.headerTitle}>
            Photos ({photos.length})
          </Text>
          {!hasMinPhotos && (
            <Chip
              icon="alert-circle"
              style={styles.warningChip}
              textStyle={styles.warningChipText}
              compact
            >
              Min 1 required
            </Chip>
          )}
          {hasMinPhotos && (
            <Chip
              icon="check-circle"
              style={styles.successChip}
              textStyle={styles.successChipText}
              compact
            >
              OK
            </Chip>
          )}
        </View>

        <Button
          mode="contained"
          icon="camera"
          loading={capturing}
          disabled={capturing}
          onPress={capturePhoto}
        >
          {capturing ? "Capturing..." : "Capture"}
        </Button>
      </View>

      {/* Photo Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Unlimited photos per inspection. Each photo is
          automatically saved to gallery with watermark
          (GPS, timestamp, inspection details).
        </Text>
      </View>

      {photos.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>
            No Photos Captured
          </Text>
          <Text style={styles.emptySubtitle}>
            Tap Capture to take the first photo.
            Minimum 1 photo required.
          </Text>
        </View>
      )}

      {photos.map((photo, index) => (
        <Card key={photo.PhotoID} style={styles.card}>
          <Pressable
            onPress={() => setPreviewPhoto(photo)}
          >
            {photo.FilePath && (
              <Image
                source={{ uri: getFileUri(photo.FilePath) }}
                style={styles.image}
                resizeMode="cover"
              />
            )}

            {/* Watermark Overlay */}
            <View style={styles.watermarkOverlay} pointerEvents="none">
              <View style={styles.watermarkContent}>
                <Text style={styles.watermarkLine}>
                  {contextPoleId || "NA"}
                </Text>
                <Text style={styles.watermarkLine}>
                  {[
                    project?.DistrictName,
                    block,
                  ].filter(Boolean).join(", ")}
                </Text>
                <Text style={styles.watermarkLine}>
                  {formatDate(photo.CapturedAt)}
                </Text>
                <Text style={styles.watermarkLine}>
                  {formatLocation(
                    photo.Latitude,
                    photo.Longitude
                  )}
                </Text>
              </View>
            </View>
          </Pressable>

          <Card.Content>
            <View style={styles.photoInfoRow}>
              <View style={styles.photoInfoLeft}>
                <Text
                  variant="labelMedium"
                  style={styles.photoNumber}
                >
                  Photo {index + 1}
                </Text>
                <Text variant="bodySmall" style={styles.fileName}>
                  {photo.FileName}
                </Text>
              </View>

              <View style={styles.photoActions}>
                <IconButton
                  icon="eye"
                  iconColor="#1976D2"
                  size={22}
                  onPress={() => setPreviewPhoto(photo)}
                />
                <IconButton
                  icon="delete"
                  iconColor="#D32F2F"
                  size={22}
                  onPress={() =>
                    deletePhoto(photo.PhotoID!)
                  }
                />
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text variant="bodySmall" style={styles.metaText}>
                {formatLocation(
                  photo.Latitude,
                  photo.Longitude
                )}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text variant="bodySmall" style={styles.metaText}>
                {formatDate(photo.CapturedAt)}
              </Text>
            </View>
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerTitle: {
    fontWeight: "700",
    color: "#1976D2",
  },

  warningChip: {
    backgroundColor: "#FFF3E0",
  },

  warningChipText: {
    color: "#E65100",
    fontSize: 11,
  },

  successChip: {
    backgroundColor: "#E8F5E9",
  },

  successChipText: {
    color: "#2E7D32",
    fontSize: 11,
  },

  infoBanner: {
    backgroundColor: "#E3F2FD",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },

  infoText: {
    fontSize: 12,
    color: "#1565C0",
    lineHeight: 16,
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

  card: {
    marginBottom: 12,
    borderRadius: 10,
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: 220,
    backgroundColor: "#F0F0F0",
  },

  watermarkOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  watermarkContent: {
    gap: 1,
  },

  watermarkLine: {
    color: "#76FF03",
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 16,
  },

  photoInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },

  photoInfoLeft: {
    flex: 1,
  },

  photoActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  photoNumber: {
    fontWeight: "700",
    color: "#1976D2",
  },

  fileName: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },

  metaRow: {
    marginTop: 4,
  },

  metaText: {
    fontSize: 12,
    color: "#666",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContent: {
    width: "92%",
    maxHeight: "90%",
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },

  modalTitle: {
    color: "#FFF",
    fontWeight: "700",
  },

  modalImage: {
    width: "100%",
    height: 400,
  },

  modalWatermark: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  modalWatermarkLine: {
    color: "#76FF03",
    fontSize: 13,
    fontFamily: "monospace",
    lineHeight: 18,
  },

  modalInfo: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  modalInfoText: {
    color: "#AAA",
    fontSize: 11,
  },

  modalCloseButton: {
    margin: 12,
  },

  viewShotOnScreen: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 400,
    height: 533,
    backgroundColor: "transparent",
    zIndex: -1,
    opacity: 0.99,
  },

  viewShotImage: {
    width: 400,
    height: 480,
  },

  viewShotWatermark: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },

  viewShotWatermarkLine: {
    color: "#76FF03",
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 16,
  },
});
