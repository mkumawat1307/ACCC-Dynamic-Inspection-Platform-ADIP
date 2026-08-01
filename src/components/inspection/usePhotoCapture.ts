import { useState } from "react";
import { logger } from "@/src/utils/logger";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { Photo } from "@/src/models/Photo";
import { Project } from "@/src/models/Project";
import { generateFileName, formatWatermarkDate, formatLatLngWM } from "./photoUtils";

interface UsePhotoCaptureOptions {
  inspectionId: number;
  project: Project | null;
  contextPoleId: string | undefined;
  block: string;
  onPhotoCaptured: (newPhotoId: number, assetUri: string, fileName: string, lines: string[]) => void;
}

export function usePhotoCapture({
  inspectionId,
  project,
  contextPoleId,
  block,
  onPhotoCaptured,
}: UsePhotoCaptureOptions) {
  const [capturing, setCapturing] = useState(false);

  async function requestCameraPermission(): Promise<boolean> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera permission is required to capture photos.");
      return false;
    }
    return true;
  }

  async function getCurrentLocation(): Promise<{ latitude: number | null; longitude: number | null }> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return { latitude: null, longitude: null };
      }

      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      const hasCached =
        lastKnown?.coords?.latitude != null && lastKnown?.coords?.longitude != null;

      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("GPS timeout")), hasCached ? 8000 : 20000)
        ),
      ]).catch(() => null);

      if (location?.coords?.latitude != null && location?.coords?.longitude != null) {
        return { latitude: location.coords.latitude, longitude: location.coords.longitude };
      }

      if (hasCached && lastKnown) {
        return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
      }
      return { latitude: null, longitude: null };
    } catch (err) {
      logger.warn("[GPS] Location error:", err);
      return { latitude: null, longitude: null };
    }
  }

  async function requestLocationPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "GPS Required",
          "GPS location is mandatory for photo capture. Please enable location permissions in your device settings."
        );
        return false;
      }
      return true;
    } catch {
      Alert.alert("GPS Required", "Unable to access GPS. Please ensure location services are enabled.");
      return false;
    }
  }

  async function capturePhoto() {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    const hasLocation = await requestLocationPermission();
    if (!hasLocation) return;

    setCapturing(true);

    try {
      const result = await ImagePicker.launchCameraAsync({
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
        Alert.alert("GPS Required", "Unable to get GPS coordinates. Please ensure GPS is enabled and try again.");
        setCapturing(false);
        return;
      }

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

      const photo: Photo = {
        InspectionID: inspectionId,
        PhotoType: "Pole",
        FileName: fileName,
        FilePath: asset.uri,
        Latitude: location.latitude,
        Longitude: location.longitude,
        CapturedAt: timestamp,
        Remarks: null,
      };

      const newPhotoId = await PhotoRepository.create(photo);

      const lines = [
        latestPoleId,
        `${project?.DistrictName || ""}, ${latestBlock}`,
        formatWatermarkDate(timestamp),
        formatLatLngWM(location.latitude, location.longitude),
      ];

      setCapturing(false);
      onPhotoCaptured(newPhotoId, asset.uri, fileName, lines);
    } catch (error) {
      logger.error("Capture Error:", error);
      Alert.alert("Error", "Failed to capture photo.");
      setCapturing(false);
    }
  }

  return { capturing, capturePhoto };
}

