import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, BackHandler, PanResponder, StyleSheet, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  CameraRatio,
  CameraType,
  FlashMode,
} from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Button, Text, ActivityIndicator, IconButton } from "react-native-paper";
import * as FileSystem from "expo-file-system/legacy";
import { useInspection } from "@/src/context/InspectionContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { Photo } from "@/src/models/Photo";
import { generateFileName } from "@/src/components/inspection/photoUtils";
import { useGpsTracker } from "@/src/components/camera/useGpsTracker";
import WatermarkOverlay from "@/src/components/camera/WatermarkOverlay";
import { useCaptureFlow } from "@/src/components/camera/useCaptureFlow";
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { useAddressLookup } from "@/src/components/camera/useAddressLookup";
import { composeWatermarkLines, gpsPillText, gpsAccuracyCategory, GPS_CATEGORY_COLORS } from "@/src/utils/watermarkLayout";
import { toWatermarkStyleConfig } from "@/src/utils/watermarkStyle";
import { useWatermarkSettings } from "@/src/context/WatermarkSettingsContext";
import {
  FLASH_ICONS,
  FLASH_LABELS,
  nextFlashMode,
  FACING_ICONS,
  FACING_LABELS,
  nextFacing,
  pinchZoomFromDistance,
  touchDistance,
  RATIO_LABELS,
  nextRatio,
  zoomToMagnification,
} from "@/src/components/camera/cameraControls";
import { PHOTO_QUALITY, GPS_GRACE_MS } from "@/src/components/camera/captureConfig";
import { logger } from "@/src/utils/logger";
import { perfNow, perfLog } from "@/src/utils/perf";

export default function CaptureScreen() {
  const router = useRouter();
  const { inspectionId: inspectionIdParam } = useLocalSearchParams<{ inspectionId: string }>();
  const inspectionId = Number(inspectionIdParam);
  const { project, poleId: contextPoleId, photoStates } = useInspection();
  const { settings } = useWatermarkSettings();

  const cameraRef = useRef<React.ElementRef<typeof CameraView>>(null);
  const gps = useGpsTracker();
  const addressLines = useAddressLookup(gps.coords);

  const [cameraSize, setCameraSize] = useState({ width: 0, height: 0 });
  const [values, setValues] = useState<{ pole_id: string; block: string }>({
    pole_id: contextPoleId || "",
    block: "",
  });
  const [now, setNow] = useState(() => new Date());
  const [shutterBusy, setShutterBusy] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [facing, setFacing] = useState<CameraType>("back");
  const [zoom, setZoom] = useState(0);
  const [ratio, setRatio] = useState<CameraRatio>("4:3");
  const zoomRef = useRef(0);
  const lastTapRef = useRef(0);
  const captureTimesRef = useRef<number[]>([]);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);
  // TODO: manual exposure — expo-camera 17 exposes no Android API for exposure control.
  // Blocked until expo-camera adds `exposureCompensation` / `setExposureCompensationAsync` on Android.

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.numberActiveTouches >= 2,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.numberActiveTouches >= 2,
      onPanResponderGrant: (_evt) => {
        zoomRef.current = zoom;
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches ?? [];
        if (touches.length < 2) return;
        const dist = touchDistance(
          touches.map((t) => ({ pageX: t.pageX, pageY: t.pageY }))
        );
        if (dist <= 0) return;
        const startDist = Math.max(dist, 1);
        const next = pinchZoomFromDistance(zoomRef.current, startDist, dist);
        zoomRef.current = next;
        setZoom(next);
      },
    })
  ).current;

  const flow = useCaptureFlow();
  const {
    webViewRef,
    handleWebViewMessage,
    handleWebViewLoadEnd,
    handleRenderProcessGone,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  } = useWatermarkProcessor({ project, onPhotosUpdated: () => {} });

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      setPermissionDenied(true);
    }
  }, [permission]);

  useEffect(() => {
    if (!inspectionId) return;
    InspectionRepository.getInspectionValues(inspectionId)
      .then((v) =>
        setValues({
          pole_id: v.pole_id || contextPoleId || "",
          block: v.block || "",
        })
      )
      .catch((e) => logger.error("Load values error:", e));
  }, [inspectionId, contextPoleId]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (flow.phase !== "merging" || flow.pending == null) return;
    const s = photoStates[flow.pending.photoId];
    if (s === "completed") flow.markMergeCompleted();
    else if (s === "failed") flow.markMergeFailed();
  }, [flow.phase, flow.pending, photoStates, flow.markMergeCompleted, flow.markMergeFailed]);

  useEffect(() => {
    if (flow.phase !== "saved") return;
    const t = setTimeout(() => flow.savedTimeout(), 400);
    return () => clearTimeout(t);
  }, [flow.phase, flow.savedTimeout]);

  const cleanupPending = useCallback(async () => {
    const pending = flow.pending;
    if (!pending) return;
    await FileSystem.deleteAsync(pending.tempUri, { idempotent: true }).catch(() => {});
    await PhotoRepository.delete(pending.photoId).catch(() => {});
    clearWatermarkState(pending.photoId);
  }, [flow.pending, clearWatermarkState]);

  const handleBack = useCallback(() => {
    if (flow.phase === "merging" && flow.pending) {
      Alert.alert(
        "Discard Photo?",
        "This photo is still being processed. Leaving now will discard it.",
        [
          { text: "Keep Processing", style: "cancel" },
          {
            text: "Discard & Leave",
            style: "destructive",
            onPress: async () => {
              await cleanupPending();
              router.back();
            },
          },
        ]
      );
      return;
    }
    router.back();
  }, [flow.phase, flow.pending, cleanupPending, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleCameraTouch = useCallback(
    (evt: { nativeEvent: { touches: { locationX: number; locationY: number }[] } }) => {
      const t = evt.nativeEvent.touches?.[0];
      if (!t) return;
      const now = Date.now();
      const double = now - lastTapRef.current < 300;
      lastTapRef.current = now;

      if (double) {
        setZoom((z) => (z > 0 ? 0 : z));
        return;
      }

      setFocusRing({ x: t.locationX, y: t.locationY });
      focusAnim.setValue(0);
      Animated.timing(focusAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setFocusRing(null);
      });
      gps.refreshNow();
    },
    [focusAnim, gps]
  );

  const handleShutter = async () => {
    if (shutterBusy) return;

    const tShutter = perfNow();
    let coords = gps.coords;
    let accuracyM = gps.accuracyM;
    if (!coords) {
      const fix = await gps.captureGps(GPS_GRACE_MS);
      if (!fix) {
        Alert.alert(
          "GPS is still being acquired",
          "Wait a moment and try again.",
          [{ text: "Wait" }, { text: "Cancel", style: "cancel" }]
        );
        return;
      }
      coords = { latitude: fix.latitude, longitude: fix.longitude };
      accuracyM = fix.accuracyM;
    }

    const tCapture = perfNow();
    const result = await cameraRef.current?.takePictureAsync({
      quality: PHOTO_QUALITY,
      skipProcessing: false,
    });
    if (!result?.uri) {
      Alert.alert("Error", "Failed to capture photo.");
      return;
    }
    perfLog("capture", "takePictureAndWrite", tCapture);
    perfLog("capture", "shutterToCamera", tShutter);

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      captureTimesRef.current.push(perfNow() - tCapture);
      if (captureTimesRef.current.length >= 10) {
        const arr = captureTimesRef.current;
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        logger.debug(
          `[Perf:capture] last${arr.length} takePictureAndWrite avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms`
        );
        captureTimesRef.current = [];
      }
    }

    setShutterBusy(true);
    try {
      const timestamp = new Date().toISOString();
      const poleId = values.pole_id || "NA";
      const block = values.block || "NA";
      const fileName = generateFileName(
        project?.DistrictName || "",
        block,
        poleId,
        timestamp
      );

      const photo: Photo = {
        InspectionID: inspectionId,
        PhotoType: "Pole",
        FileName: fileName,
        FilePath: result.uri,
        Latitude: coords.latitude,
        Longitude: coords.longitude,
        CapturedAt: timestamp,
        Remarks: null,
      };

      const tDbInsert = perfNow();
      const photoId = await PhotoRepository.create(photo);
      perfLog("capture", `photo=${photoId} sqliteCreate`, tDbInsert);
      perfLog("capture", "shutterToDbInsert", tShutter);

      const lines = composeWatermarkLines({
        siteId: poleId,
        district: project?.DistrictName || "",
        block,
        timestampIso: timestamp,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyM,
        addressLines,
        settings,
      });

      flow.beginCapture({ photoId, tempUri: result.uri, fileName, lines, timestamp });
      enqueueWatermark(photoId, result.uri, fileName, lines, toWatermarkStyleConfig(settings));
    } catch (error) {
      logger.error("Capture Error:", error);
      Alert.alert("Error", "Failed to capture photo.");
    } finally {
      setShutterBusy(false);
    }
  };

  const handleDiscard = async () => {
    await cleanupPending();
    flow.discard();
  };

  const handleRetry = () => {
    const pending = flow.pending;
    if (!pending) return;
    retryWatermark(pending.photoId);
    flow.retry();
  };

  const handleClose = () => {
    router.back();
  };

  const previewLines = composeWatermarkLines({
    siteId: values.pole_id || "NA",
    district: project?.DistrictName || "",
    block: values.block || "NA",
    timestampIso: now.toISOString(),
    latitude: gps.coords?.latitude ?? null,
    longitude: gps.coords?.longitude ?? null,
    accuracyM: gps.accuracyM,
    addressLines,
    settings,
  });

  const gpsPillColor =
    gps.status === "fixed" && gps.accuracyM != null
      ? GPS_CATEGORY_COLORS[gpsAccuracyCategory(gps.accuracyM)]
      : gps.status === "denied"
      ? "#FF5252"
      : "#FFEB3B";

  if (permissionDenied) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Camera" />
        </Appbar.Header>
        <View style={styles.center}>
          <Text>Camera permission is required to capture photos.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title="Capture Photo" />
        <Appbar.Action icon="cog" onPress={() => router.push("/settings/watermark")} />
      </Appbar.Header>

      <View style={styles.body}>
        <View
          style={styles.cameraWrap}
          onLayout={(e) =>
            setCameraSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
          onTouchStart={handleCameraTouch}
          {...pinchResponder.panHandlers}
        >
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              facing={facing}
              ratio={ratio}
              flash={flash}
              zoom={zoom}
              style={styles.fill}
            />
          ) : (
            <View style={[styles.fill, styles.center]}>
              <ActivityIndicator size="large" />
            </View>
          )}

          {cameraSize.width > 0 && (
            <WatermarkOverlay
              width={cameraSize.width}
              height={cameraSize.height}
              lines={previewLines}
              settings={settings}
            />
          )}

          {focusRing && (
            <Animated.View
              style={[
                styles.focusRing,
                {
                  left: focusRing.x - 25,
                  top: focusRing.y - 25,
                  opacity: focusAnim,
                  transform: [
                    {
                      scale: focusAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.5],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}

          <View style={styles.gpsPill}>
            <Text style={[styles.gpsPillText, { color: gpsPillColor }]}>
              {gpsPillText(gps.status, gps.accuracyM)}
            </Text>
          </View>
        </View>

        {flow.phase === "merging" && (
          <View style={styles.mergeBanner} pointerEvents="none">
            <ActivityIndicator size="small" />
            <Text style={styles.mergeBannerText}>Merging watermark…</Text>
          </View>
        )}

        {flow.phase === "saved" && (
          <View style={styles.mergeBanner} pointerEvents="none">
            <Text style={styles.mergeBannerText}>Photo Saved</Text>
          </View>
        )}

        {flow.phase === "failed" && (
          <View style={styles.failedOverlay}>
            <Text style={[styles.mergeBannerText, styles.failedText]}>
              Watermarking failed.
            </Text>
            <View style={styles.confirmButtons}>
              <Button mode="outlined" icon="refresh" onPress={handleRetry}>
                Retry
              </Button>
              <Button mode="contained" icon="close" onPress={handleDiscard}>
                Discard
              </Button>
            </View>
          </View>
        )}

        <View style={styles.cameraToolbar}>
          <IconButton
            icon="close"
            accessibilityLabel="Close camera"
            onPress={handleClose}
          />
          <IconButton
            icon={FACING_ICONS[facing]}
            accessibilityLabel={FACING_LABELS[facing]}
            testID="camera-facing"
            onPress={() => setFacing(nextFacing)}
          />
          <IconButton
            icon={FLASH_ICONS[flash]}
            accessibilityLabel={FLASH_LABELS[flash]}
            testID="camera-flash"
            onPress={() => setFlash(nextFlashMode)}
          />
          <Text style={styles.zoomLabel}>{`${zoomToMagnification(zoom).toFixed(1)}x`}</Text>
          <IconButton
            icon="aspect-ratio"
            accessibilityLabel={`Aspect ratio ${RATIO_LABELS[ratio]}`}
            testID="camera-ratio"
            onPress={() => setRatio(nextRatio)}
          />
        </View>

        {flow.phase === "preview" && <ZoomSlider value={zoom} onChange={setZoom} />}

        <View style={styles.controls}>
          <Button
            mode="contained"
            icon="camera"
            loading={shutterBusy}
            disabled={shutterBusy || gps.status !== "fixed" || flow.phase !== "preview"}
            onPress={handleShutter}
          >
            Capture
          </Button>
        </View>
      </View>

      <WatermarkMergeWebView
        webViewRef={webViewRef}
        onMessage={handleWebViewMessage}
        onLoadEnd={handleWebViewLoadEnd}
        onRenderProcessGone={handleRenderProcessGone}
      />
    </SafeAreaView>
  );
}

function ZoomSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        if (trackWidth <= 0) return;
        const x = evt.nativeEvent.locationX;
        const next = Math.min(1, Math.max(0, x / trackWidth));
        onChange(next);
      },
    })
  ).current;

  return (
    <View
      style={styles.zoomSliderOuter}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      <View style={styles.zoomSliderTrack}>
        <View style={[styles.zoomSliderFill, { width: `${value * 100}%` }]} />
      </View>
      <Text style={styles.zoomLabel}>{`${zoomToMagnification(value).toFixed(1)}x`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  body: {
    flex: 1,
  },
  cameraWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: "#000000",
  },
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  gpsPill: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gpsPillText: {
    color: "#76FF03",
    fontSize: 12,
  },
  cameraToolbar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  zoomLabel: {
    fontSize: 12,
    color: "#76FF03",
    fontWeight: "bold",
    minWidth: 36,
    textAlign: "center",
  },
  focusRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent",
  },
  controls: {
    paddingVertical: 24,
    alignItems: "center",
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  failedText: {
    color: "#C62828",
  },
  mergeBanner: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  mergeBannerText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  failedOverlay: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  zoomSliderOuter: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  zoomSliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
    overflow: "hidden",
  },
  zoomSliderFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#76FF03",
  },
});
