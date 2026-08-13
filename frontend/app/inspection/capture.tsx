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
import { usePhotoStates } from "@/src/context/PhotoStatesContext";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";
import { Photo } from "@/src/models/Photo";
import { generateFileName } from "@/src/components/inspection/photoUtils";
import { useGpsTracker } from "@/src/components/camera/useGpsTracker";
import WatermarkOverlay from "@/src/components/camera/WatermarkOverlay";
import { useCaptureFlow } from "@/src/components/camera/useCaptureFlow";
import WatermarkMergeWebView from "@/src/components/camera/WatermarkMergeWebView";
import { useWatermarkProcessor } from "@/src/components/inspection/useWatermarkProcessor";
import { useAddressLookup } from "@/src/components/camera/useAddressLookup";
import { composeWatermarkLines, gpsPillText, gpsAccuracyCategory, GPS_CATEGORY_COLORS } from "@/src/utils/watermarkLayout";
import { toWatermarkStyleConfig, WATERMARK_PREVIEW_VISUAL_CORRECTION } from "@/src/utils/watermarkStyle";
import { pickExpectedPhotoSize } from "@/src/components/camera/expectedPhotoSize";
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
import { perfNow, perfLog, uiPerfReset, uiPerfStage, uiPerfProbeSummary, uiPerfStageIfProbe } from "@/src/utils/perf";

export default function CaptureScreen() {
  const router = useRouter();
  const { inspectionId: inspectionIdParam } = useLocalSearchParams<{ inspectionId: string }>();
  const inspectionId = Number(inspectionIdParam);
  const { project, poleId: contextPoleId } = useInspection();
  const { photoStates } = usePhotoStates();
  const { settings } = useWatermarkSettings();

  const cameraRef = useRef<React.ElementRef<typeof CameraView>>(null);
  const gps = useGpsTracker();
  const { lines: addressLines, fullAddress } = useAddressLookup(gps.coords);

  const [cameraSize, setCameraSize] = useState({ width: 0, height: 0 });
  const [values, setValues] = useState<{ pole_id: string; block: string }>({
    pole_id: contextPoleId || "",
    block: "",
  });
  const [now, setNow] = useState(() => new Date());
  const [shutterBusy, setShutterBusy] = useState(false);
  const [capturedPhotoSize, setCapturedPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [expectedPhotoSize, setExpectedPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [facing, setFacing] = useState<CameraType>("back");
  const [zoom, setZoom] = useState(0);
  const [ratio, setRatio] = useState<CameraRatio>("4:3");
  const zoomRef = useRef(0);
  const setZoomState = (v: number) => {
    zoomRef.current = v;
    setZoom(v);
  };
  const lastTapRef = useRef(0);
  const captureTimesRef = useRef<number[]>([]);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);
  const [focusLocked, setFocusLocked] = useState(false);
  // TODO: manual exposure — expo-camera 17 exposes no Android API for exposure control.
  // Blocked until expo-camera adds `exposureCompensation` / `setExposureCompensationAsync` on Android.

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.numberActiveTouches >= 2,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.numberActiveTouches >= 2,
      onPanResponderGrant: (_evt) => {},
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches ?? [];
        if (touches.length < 2) return;
        const dist = touchDistance(
          touches.map((t) => ({ pageX: t.pageX, pageY: t.pageY }))
        );
        if (dist <= 0) return;
        const startDist = Math.max(dist, 1);
        const next = pinchZoomFromDistance(zoomRef.current, startDist, dist);
        setZoomState(next);
      },
    })
  ).current;

  const flow = useCaptureFlow();
  const savedTimeoutRef = useRef(flow.savedTimeout);
  savedTimeoutRef.current = flow.savedTimeout;
  const cameraUiRef = useRef({ shutterBusy, gpsStatus: gps.status });
  cameraUiRef.current = { shutterBusy, gpsStatus: gps.status };
  const handlePhotosUpdated = useCallback(() => {}, []);
  const {
    webViewRef,
    handleWebViewMessage,
    handleWebViewLoadEnd,
    handleRenderProcessGone,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  } = useWatermarkProcessor({ project, onPhotosUpdated: handlePhotosUpdated });

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

  // Seed the expected photo size once the camera is ready so the watermark
  // renders at final-photo size from the first frame (no oversized flash
  // before the first capture).
  useEffect(() => {
    if (!cameraReady || cameraSize.width <= 0 || cameraSize.height <= 0) return;
    let cancelled = false;
    cameraRef.current
      ?.getAvailablePictureSizesAsync()
      .then((sizes) => {
        if (cancelled) return;
        const expected = pickExpectedPhotoSize(sizes, {
          previewWidth: cameraSize.width,
          previewHeight: cameraSize.height,
          ratio,
        });
        setExpectedPhotoSize(expected);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          const coverScale = expected
            ? Math.max(cameraSize.width / expected.width, cameraSize.height / expected.height)
            : 0;
          const correctedScale = coverScale * WATERMARK_PREVIEW_VISUAL_CORRECTION;
          logger.debug(
            `[Watermark:init] ratio=${ratio} preview=${cameraSize.width}x${cameraSize.height} ` +
              `expectedPhoto=${expected ? `${expected.width}x${expected.height}` : "none"} ` +
              `scale=${correctedScale.toFixed(3)}`
          );
        }
      })
      .catch((e) => {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          logger.debug(`[Watermark:init] getAvailablePictureSizesAsync failed: ${String(e)}`);
        }
        if (!cancelled) setExpectedPhotoSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cameraReady, cameraSize.width, cameraSize.height, ratio, facing]);

  useEffect(() => {
    if (flow.phase !== "merging" || flow.pending == null) return;
    const s = photoStates[flow.pending.photoId];
    if (s === "completed") {
      uiPerfStage("reactRenderEnd", `photo=${flow.pending.photoId}`, uiPerfProbeSummary());
      uiPerfStageIfProbe("imageDecodeStart", "thumbnailRendering", `photo=${flow.pending.photoId}`);
      uiPerfStageIfProbe("thumbnailUpdateStart", "thumbnailRendering", `photo=${flow.pending.photoId}`);
      flow.markMergeCompleted();
    }
    else if (s === "failed") flow.markMergeFailed();
  }, [flow.phase, flow.pending, photoStates, flow.markMergeCompleted, flow.markMergeFailed]);

  useEffect(() => {
    if (flow.phase !== "saved") return;
    const { shutterBusy: busyNow, gpsStatus: gpsNow } = cameraUiRef.current;
    uiPerfStageIfProbe("timeoutWaitEnd", "setTimeoutActive");
    uiPerfStageIfProbe("animationEnd", "animationRunning");
    uiPerfStageIfProbe("imageDecodeEnd", "thumbnailRendering");
    uiPerfStageIfProbe("thumbnailUpdateEnd", "thumbnailRendering");
    uiPerfStageIfProbe("interactionManagerEnd", "interactionManagerUsed");
    uiPerfStage("uiReady", `phase=${flow.phase} shutterDisabled=${busyNow || gpsNow !== "fixed"}`, uiPerfProbeSummary());
    savedTimeoutRef.current();
  }, [flow.phase]);

  useEffect(() => {
    logger.debug(`[UI] saving=${flow.phase === "merging"}`);
  }, [flow.phase]);

  const cleanupPending = useCallback(async () => {
    const pending = flow.pending;
    if (!pending) return;
    await FileSystem.deleteAsync(pending.tempUri, { idempotent: true }).catch(() => {});
    await PhotoRepository.delete(pending.photoId).catch(() => {});
    clearWatermarkState(pending.photoId);
  }, [flow.pending, clearWatermarkState]);

  const handleBack = useCallback(() => {
    if ((flow.phase === "merging" || flow.phase === "failed") && flow.pending) {
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
      logger.info("[TAP] preview tapped");
      if (evt.nativeEvent.touches.length !== 1) return;
      const t = evt.nativeEvent.touches[0];
      const now = Date.now();
      const double = now - lastTapRef.current < 300;
      lastTapRef.current = now;

      if (double) {
        if (zoomRef.current > 0) setZoomState(0);
        return;
      }

      setFocusRing({ x: t.locationX, y: t.locationY });
      setFocusLocked(false);
      focusAnim.setValue(0);
      Animated.timing(focusAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setFocusLocked(true);
          setTimeout(() => setFocusRing(null), 500);
        }
      });
      logger.info("[GPS] tap refresh requested");
      gps.refreshNow();
    },
    [focusAnim, gps]
  );

  const handleShutter = async () => {
    if (shutterBusy) return;
    setShutterBusy(true);
    uiPerfReset();
    uiPerfStage("shutterTap", `phase=${flow.phase} gps=${gps.status} previewFrozen=false`);

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
        setShutterBusy(false);
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
      setShutterBusy(false);
      return;
    }
    perfLog("capture", "takePictureAndWrite", tCapture);
    perfLog("capture", "shutterToCamera", tShutter);
    uiPerfStage("photoCaptured", `size=${result.width}x${result.height}`);

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

    // Store photo dimensions for WYSIWYG preview
    if (result.width && result.height) {
      setCapturedPhotoSize({ width: result.width, height: result.height });
    }

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
      enqueueWatermark(
        photoId,
        result.uri,
        fileName,
        lines,
        toWatermarkStyleConfig(settings),
        undefined,
        { width: result.width, height: result.height }
      );

      // Save full formatted address to InspectionValues (field key: "location") - fire and forget
      if (fullAddress) {
        (async () => {
          try {
            const db = await (await import("@/src/database/db")).getDatabase();
            const locationField = await db.getFirstAsync<{ FieldID: number }>(
              `SELECT FieldID FROM InspectionFields WHERE FieldKey = ? AND IsActive = 1`,
              ["location"]
            );
            if (locationField) {
              await InspectionValueRepository.saveValue(inspectionId, locationField.FieldID, fullAddress);
              logger.debug(`[Capture] Saved full address to InspectionValues: ${fullAddress}`);
            } else {
              logger.warn("[Capture] Location field not found in InspectionFields");
            }
          } catch (e) {
            logger.warn("[Capture] Failed to save full address:", e);
          }
        })();
      }
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
    setCapturedPhotoSize(null);
  };

  const handleRetry = () => {
    const pending = flow.pending;
    if (!pending) return;
    retryWatermark(pending.photoId);
    flow.retry();
    setCapturedPhotoSize(null);
  };

  const handleClose = () => {
    handleBack();
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
    gps.refreshing
      ? "#FFEB3B"
      : gps.status === "fixed" && gps.accuracyM != null
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
              onCameraReady={() => setCameraReady(true)}
            />
          ) : (
            <View style={[styles.fill, styles.center]}>
              <ActivityIndicator size="large" />
            </View>
          )}

          {cameraSize.width > 0 && (capturedPhotoSize ?? expectedPhotoSize) && (
            <WatermarkOverlay
              width={cameraSize.width}
              height={cameraSize.height}
              lines={previewLines}
              settings={settings}
              photoWidth={capturedPhotoSize?.width ?? expectedPhotoSize?.width}
              photoHeight={capturedPhotoSize?.height ?? expectedPhotoSize?.height}
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
                  borderColor: focusLocked ? "#2E7D32" : "#FFFFFF",
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
              {gpsPillText(gps.status, gps.accuracyM, gps.refreshing)}
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

        {flow.phase === "preview" && <ZoomSlider value={zoom} onChange={setZoomState} />}

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
  const trackWidthRef = useRef(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const w = trackWidthRef.current;
        if (w <= 0) return;
        const x = evt.nativeEvent.locationX;
        const next = Math.min(1, Math.max(0, x / w));
        onChange(next);
      },
    })
  ).current;

  return (
    <View
      style={styles.zoomSliderOuter}
      onLayout={(e) => {
        trackWidthRef.current = e.nativeEvent.layout.width;
      }}
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
