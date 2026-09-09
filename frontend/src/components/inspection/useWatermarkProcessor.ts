import { useState, useRef, useCallback, useEffect } from "react";
import { Image } from "react-native";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { Project } from "@/src/models/Project";
import { getActiveProjectPath } from "@/src/database/db";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { writePhotoUnique, buildPhotoFolderDisplayPath, deletePhoto } from "@/src/utils/storageManager";
import { photoStorageLabelForProject } from "@/src/utils/folderNaming";
import {
  buildRenderWatermarkScript,
  buildRenderOverlayScript,
  buildMeasureOverlayScript,
} from "@/src/utils/watermarkHtml";
import {
  WatermarkStyleConfig,
  WatermarkOverlayLayout,
  computeWatermarkMetrics,
  computeWatermarkOverlayLayout,
} from "@/src/utils/watermarkStyle";
import {
  hasNativeWatermarkEncoder,
  hasNativeOverlayEncoder,
  encodeWatermarkJpeg,
  encodeWatermarkOverlay,
} from "@/src/native/WatermarkEncoder";
import { usePhotoStates } from "@/src/context/PhotoStatesContext";
import { perfStart, perfStage, perfReport, perfNow, perfLog, PerfAccumulator, uiPerfStage, uiPerfProbeSummary, uiPerfSetProbe, uiPerfStageIfProbe } from "@/src/utils/perf";

type WatermarkStage = "overlay" | "rgba" | "toblob";

const STAGE_WATCHDOG_MS: Record<WatermarkStage, number> = {
  overlay: 8000,
  rgba: 8000,
  toblob: 12000,
};

const DEFAULT_OVERLAY_STYLE: WatermarkStyleConfig = {
  fontScale: 0.8,
  position: "bottomLeft",
  bgOpacity: 0.5,
  textColor: "#76FF03",
};

interface WatermarkJob {
  photoId: number;
  inputPath: string;
  fileName: string;
  lines: string[];
  style?: WatermarkStyleConfig;
  stage: WatermarkStage;
  retries: number;
  startedAtMs: number;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  layout?: WatermarkOverlayLayout;
  projectDbPath?: string;
  writeLabel?: string;
}

interface JsPerf {
  decode?: number;
  draw?: number;
  encode?: number;
  total?: number;
}

interface UseWatermarkProcessorOptions {
  project: Project | null;
  onPhotosUpdated: () => void;
}

function resolveImageSize(inputPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      inputPath,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

export function useWatermarkProcessor({ project, onPhotosUpdated }: UseWatermarkProcessorOptions) {
  const { photoStates: watermarkState, setPhotoStates: setWatermarkState } = usePhotoStates();
  const [webViewReady, setWebViewReady] = useState(false);

  const queueRef = useRef<WatermarkJob[]>([]);
  const failedJobsRef = useRef<Map<number, WatermarkJob>>(new Map());
  const processingRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const readyWaitStartRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const perfRef = useRef<PerfAccumulator | null>(null);
  const loadCountRef = useRef(0);
  const readyCountRef = useRef(0);
  const readyInstanceRef = useRef<string | null>(null);
  const warmupDoneRef = useRef(false);
  const warmupStartRef = useRef(0);
  const cancelledRef = useRef<Set<number>>(new Set());
  const finalizingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setWatermarkState(prev => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const id = Number(key);
        if (next[id] === "pending" || next[id] === "processing") {
          next[id] = "failed";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { clearWatchdog(); };
  }, []);

  function clearWatermarkState(photoId: number) {
    cancelledRef.current.add(photoId);
    setWatermarkState(prev => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
    queueRef.current = queueRef.current.filter(j => j.photoId !== photoId);
    failedJobsRef.current.delete(photoId);
    clearWatchdog();
  }

  function clearWatchdog() {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      uiPerfSetProbe("setTimeoutActive", false);
    }
  }

  function armWatchdog(job: WatermarkJob, onTimeout: () => void) {
    clearWatchdog();
    const ms = STAGE_WATCHDOG_MS[job.stage];
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      uiPerfSetProbe("setTimeoutActive", false);
      onTimeout();
    }, ms);
    uiPerfSetProbe("setTimeoutActive", true);
  }

function retryWatermark(photoId: number): boolean {
    cancelledRef.current.delete(photoId);
    const job = failedJobsRef.current.get(photoId);
    if (!job) return false;
    failedJobsRef.current.delete(photoId);
    const dims =
      job.width && job.height ? { width: job.width, height: job.height } : undefined;
    enqueueWatermark(job.photoId, job.inputPath, job.fileName, job.lines, job.style, undefined, dims);
    persistStatus(job.photoId, "captured", job.projectDbPath);
    return true;
}

function persistStatus(photoId: number, status: string, expectedDbPath?: string) {
    if (expectedDbPath && getActiveProjectPath() !== expectedDbPath) {
      logger.warn("[Watermark] Project switched before status persist; skipping", {
        photoId,
        status,
        active: getActiveProjectPath(),
        expected: expectedDbPath,
      });
      return;
    }
    PhotoRepository.setProcessingStatus(photoId, status).catch((error) => {
      logger.warn("[Watermark] Failed to persist photo status:", photoId, status, error);
    });
}

function handleJobFailure(job: WatermarkJob) {
    clearWatchdog();
    if (cancelledRef.current.has(job.photoId)) return;
    if (finalizingRef.current.has(job.photoId)) return;
    const idx = queueRef.current.findIndex(j => j.photoId === job.photoId);
    if (idx < 0) return;
    if (job.retries < 1) {
      const retry = { ...job, retries: job.retries + 1 };
      queueRef.current[idx] = retry;
      setWatermarkState(prev => ({ ...prev, [job.photoId]: "pending" }));
      persistStatus(job.photoId, "captured", job.projectDbPath);
    } else {
      queueRef.current.splice(idx, 1);
      failedJobsRef.current.set(job.photoId, job);
      setWatermarkState(prev => ({ ...prev, [job.photoId]: "failed" }));
      persistStatus(job.photoId, "failed", job.projectDbPath);
    }
    if (perfRef.current) perfReport(perfRef.current, "watermark-failed");
    perfRef.current = null;
    processingRef.current = false;
    processNext();
}

  async function handleJobComplete(photoId: number) {
    clearWatchdog();
    const idx = queueRef.current.findIndex(j => j.photoId === photoId);
    if (idx < 0) return;

    const job = queueRef.current[idx];
    queueRef.current.splice(idx, 1);
    failedJobsRef.current.delete(photoId);

    if (perfRef.current) {
      perfReport(perfRef.current);
    }
    perfRef.current = null;

    if (job?.inputPath) {
      try {
        await FileSystem.deleteAsync(job.inputPath, { idempotent: true });
      } catch (e) {
        logger.warn("[Watermark] Failed to clean up temp file:", job.inputPath, e);
      }
    }

setWatermarkState(prev => ({ ...prev, [photoId]: "completed" }));
    uiPerfStage("stateUpdated", `photo=${photoId}`, uiPerfProbeSummary());
    uiPerfStage("reactRenderStart", `photo=${photoId}`, uiPerfProbeSummary());
    uiPerfStageIfProbe("timeoutWaitStart", "setTimeoutActive", `photo=${photoId}`);
    uiPerfStageIfProbe("animationStart", "animationRunning", `photo=${photoId}`);
    uiPerfStageIfProbe("interactionManagerStart", "interactionManagerUsed", `photo=${photoId}`);
    processingRef.current = false;
    processNext();
}

  function downshiftStage(job: WatermarkJob): WatermarkStage | null {
    if (job.stage === "overlay") return "toblob";
    if (job.stage === "rgba") return "toblob";
    return null;
  }

  function injectJourneyScript(job: WatermarkJob, script: string) {
    const wv = webViewRef.current;
    if (!wv) throw new Error("webview not available");
    wv.injectJavaScript(script);
    perfStage(perfRef.current!, "webviewSend");
  }

  async function startOverlayStage(job: WatermarkJob) {
    if (job.width && job.height) {
      if (__DEV__) {
        try {
          const dims = await resolveImageSize(job.inputPath);
          job.previewWidth = dims.width;
          job.previewHeight = dims.height;
        } catch {
          job.previewWidth = undefined;
          job.previewHeight = undefined;
        }
      }
    } else {
      try {
        const dims = await resolveImageSize(job.inputPath);
        job.width = dims.width;
        job.height = dims.height;
      } catch {
        scheduleStage(job, "toblob");
        return;
      }
    }
    const style = job.style ?? DEFAULT_OVERLAY_STYLE;
    const metrics = computeWatermarkMetrics(job.width, job.height, style);
    injectJourneyScript(job, buildMeasureOverlayScript(job.photoId, metrics.fSize, job.lines));
  }

  function startStage(job: WatermarkJob) {
    clearWatchdog();
    armWatchdog(job, () => {
      const next = downshiftStage(job);
      scheduleStage(job, next);
    });

    if (job.stage === "overlay") {
      startOverlayStage(job).catch((error) => {
        scheduleStage(job, "toblob");
      });
      return;
    }

    if (job.stage === "rgba") {
      startupRgbaStage(job);
      return;
    }

    startupToblobStage(job);
  }

  function startupRgbaStage(job: WatermarkJob) {
    FileSystem.readAsStringAsync(job.inputPath, {
      encoding: FileSystem.EncodingType.Base64,
    })
      .then((base64) => {
        injectJourneyScript(
          job,
          buildRenderWatermarkScript(job.photoId, base64, job.lines, job.style, true)
        );
      })
      .catch((error) => {
        scheduleStage(job, "toblob");
      });
  }

  function startupToblobStage(job: WatermarkJob) {
    FileSystem.readAsStringAsync(job.inputPath, {
      encoding: FileSystem.EncodingType.Base64,
    })
      .then((base64) => {
        injectJourneyScript(
          job,
          buildRenderWatermarkScript(job.photoId, base64, job.lines, job.style, false)
        );
      })
      .catch((error) => {
        handleJobFailure(job);
      });
  }

function scheduleStage(job: WatermarkJob, next: WatermarkStage | null) {
    clearWatchdog();
    if (!next || next === job.stage) {
      handleJobFailure(job);
      return;
    }
    const queued = queueRef.current.find(j => j.photoId === job.photoId);
    if (!queued) return;
    queued.stage = next;
    processingRef.current = false;
    processNext();
}

  async function processNext() {
    if (processingRef.current || queueRef.current.length === 0) return;
    if (!readyRef.current) {
      if (!readyWaitStartRef.current) readyWaitStartRef.current = perfNow();
      return;
    }

    const job = queueRef.current[0];
    if (finalizingRef.current.has(job.photoId)) return;

    processingRef.current = true;

    setWatermarkState(prev => ({ ...prev, [job.photoId]: "processing" }));
    persistStatus(job.photoId, "processing", job.projectDbPath);
    uiPerfStage("overlayStart", `photo=${job.photoId} stage=${job.stage}`);

    const perf = perfStart(job.photoId);
    perfRef.current = perf;

    startStage(job);
  }

  const handleWebViewLoadEnd = useCallback(() => {
    loadCountRef.current++;
    if (readyWaitStartRef.current) {
      perfLog("watermark", "webViewInitialLoad", readyWaitStartRef.current);
    }
  }, []);

  const handleRenderProcessGone = useCallback((_event: any) => {
    logger.warn("[Watermark] WebView render process gone — attempting recovery");
    clearWatchdog();
    readyRef.current = false;
    setWebViewReady(false);
    processingRef.current = false;
    warmupDoneRef.current = false;
    const head = queueRef.current[0];
    if (head && !cancelledRef.current.has(head.photoId) && !finalizingRef.current.has(head.photoId)) {
      if (head.retries < 1) {
        const retry = { ...head, retries: head.retries + 1 };
        const idx = queueRef.current.findIndex(j => j.photoId === head.photoId);
        if (idx >= 0) {
          queueRef.current[idx] = retry;
          setWatermarkState(prev => ({ ...prev, [head.photoId]: "pending" }));
          persistStatus(head.photoId, "captured", head.projectDbPath);
        }
      } else {
        handleJobFailure(head);
      }
    }
    try {
      webViewRef.current?.reload?.();
    } catch {}
  }, []);

function saveAndComplete(job: WatermarkJob, base64: string) {
    return (async () => {
      if (cancelledRef.current.has(job.photoId)) return;
      if (finalizingRef.current.has(job.photoId)) return;
      finalizingRef.current.add(job.photoId);
      try {
        clearWatchdog();

        const activeDbPath = getActiveProjectPath();
        if (job.projectDbPath && activeDbPath !== job.projectDbPath) {
          logger.warn("[Watermark] Project switched before save; skipping watermark write", {
            photoId: job.photoId,
            active: activeDbPath,
            expected: job.projectDbPath,
          });
          queueRef.current = queueRef.current.filter(j => j.photoId !== job.photoId);
          setWatermarkState(prev => ({ ...prev, [job.photoId]: "failed" }));
          persistStatus(job.photoId, "captured", job.projectDbPath);
          processingRef.current = false;
          processNext();
          return;
        }

        const label = job.writeLabel ?? (project ? photoStorageLabelForProject(project) : "");
        uiPerfStage("overlayDone", `photo=${job.photoId}`);

        uiPerfStage("safWriteStart", `photo=${job.photoId}`);
        persistStatus(job.photoId, "saving", job.projectDbPath);
        const { contentUri, fileName: storedFileName } = await writePhotoUnique(
          label,
          job.fileName,
          base64
        );
        uiPerfStage("safWriteDone", `photo=${job.photoId}`);
        if (perfRef.current) perfStage(perfRef.current, "safWrite");

        if (cancelledRef.current.has(job.photoId)) {
          try {
            await deletePhoto(contentUri);
          } catch {}
          return;
        }

        const displayPath = buildPhotoFolderDisplayPath(label);
        const activeDbPathAfterWrite = getActiveProjectPath();
        if (job.projectDbPath && activeDbPathAfterWrite !== job.projectDbPath) {
          logger.warn("[Watermark] Project switched mid-save; skipping DB finalize", {
            photoId: job.photoId,
            active: activeDbPathAfterWrite,
            expected: job.projectDbPath,
          });
          queueRef.current = queueRef.current.filter(j => j.photoId !== job.photoId);
          setWatermarkState(prev => ({ ...prev, [job.photoId]: "failed" }));
          persistStatus(job.photoId, "captured", job.projectDbPath);
          processingRef.current = false;
          processNext();
          return;
        }
        await PhotoRepository.updateFinalPath(job.photoId, storedFileName, contentUri, displayPath);
        if (perfRef.current) perfStage(perfRef.current, "sqliteUpdate");
        persistStatus(job.photoId, "completed", job.projectDbPath);

        onPhotosUpdated();
        await handleJobComplete(job.photoId);
      } finally {
        finalizingRef.current.delete(job.photoId);
      }
    })().catch((error) => {
      if (perfRef.current) perfStage(perfRef.current, "saveError");
      logger.warn("[Watermark] saveAndComplete threw:", error);
      handleJobFailure(job);
    });
  }

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.__unload) {
        return;
      }

      if (data.__ready) {
        readyCountRef.current++;
        const instance = data.instance ?? "unknown";
        readyInstanceRef.current = instance;
        if (!readyRef.current) {
          readyRef.current = true;
          setWebViewReady(true);
          if (readyWaitStartRef.current) {
            perfLog("watermark", "webViewReady", readyWaitStartRef.current);
            readyWaitStartRef.current = 0;
          }
          processNext();

          // WebView warmup: run a no-op measure+render to warm up V8/Canvas
          // Skip warmup in test environment (Jest) to avoid interfering with fake timers
          const isTestEnv = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;
          if (!warmupDoneRef.current && !isTestEnv) {
            warmupDoneRef.current = true;
            warmupStartRef.current = perfNow();
            try {
              // Inject a measure script with dummy data, then a tiny render
              const wv = webViewRef.current;
              if (wv) {
                // Use a dummy photoId that won't match any real job
                const warmupId = -1;
                // Measure phase
                wv.injectJavaScript(
                  `window.renderWatermarkFromJson(${JSON.stringify({
                    photoId: warmupId,
                    measure: true,
                    fontSize: 24,
                    lines: ["Warmup"],
                  })}); true;`
                );
                // After a brief delay, inject a renderOverlay with minimal layout
                uiPerfSetProbe("setTimeoutActive", true);
                setTimeout(() => {
                  uiPerfSetProbe("setTimeoutActive", false);
                  if (wv) {
                    wv.injectJavaScript(
                      `window.renderWatermarkFromJson(${JSON.stringify({
                        photoId: warmupId,
                        layout: { metrics: { fSize: 24, lh: 28, padY: 8, rPad: 10, gapX: 16, gapY: 20, corner: 4 }, boxX: 10, boxY: 10, boxW: 100, boxH: 50, overX: 0, overY: 0, overW: 124, overH: 74, textLeft: 20, textBase: 30 }, lines: ["Warmup"], style: { fontScale: 0.8, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" },
                      })}); true;`
                    );
                  }
                }, 50);
              }
            } catch {
            }
          }
        }
        return;
      }

      const { photoId } = data;
      const job = queueRef.current.find(j => j.photoId === photoId);
      if (photoId == null || !job) return;

      if (data.maxTextWidth != null) {
        if (job.stage !== "overlay") return;
        if (!job.width || !job.height) return;
        const style = job.style ?? DEFAULT_OVERLAY_STYLE;
        job.layout = computeWatermarkOverlayLayout(
          job.width,
          job.height,
          data.maxTextWidth,
          job.lines.length,
          style
        );
        try {
          injectJourneyScript(job, buildRenderOverlayScript(job.photoId, job.layout, job.lines, job.style));
        } catch {
          scheduleStage(job, "toblob");
        }
        return;
      }

      if (data.overlay != null) {
        if (job.stage !== "overlay") return;
        clearWatchdog();
        const wrapped = { ...data, overlay: data.overlay } as typeof data & { overlay: string };
        (async () => {
          const outputPath = `${job.inputPath}.wm.jpg`;
          try {
            await encodeWatermarkOverlay(
              job.inputPath,
              wrapped.overlay,
              data.overlayX ?? 0,
              data.overlayY ?? 0,
              95,
              outputPath
            );
            if (perfRef.current) perfStage(perfRef.current, "nativeComposite");

            const fileBase64 = await FileSystem.readAsStringAsync(outputPath, {
              encoding: FileSystem.EncodingType.Base64,
            });
            try {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
            } catch {}
            await saveAndComplete(job, fileBase64);
          } catch (error) {
            logger.warn("[Watermark] overlay composite failed, falling back to toBlob:", error);
            try {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
            } catch {}
            scheduleStage(job, "toblob");
          }
        })();
        return;
      }

      if (data.rgba != null && data.width != null && data.height != null) {
        if (job.stage !== "rgba") return;
        clearWatchdog();

        const perf = perfRef.current;
        const jsPerf = (data.perf ?? {}) as JsPerf;
        if (perf && (jsPerf.decode != null || jsPerf.total != null)) {
          perf.stages.push({ name: "jsDecode", ms: jsPerf.decode ?? 0 });
          perf.stages.push({ name: "jsDraw", ms: jsPerf.draw ?? 0 });
          perf.stages.push({ name: "jsGetData", ms: jsPerf.encode ?? 0 });
          perfStage(perf, "webviewReturn");
        }

        (async () => {
          const outputPath = `${job.inputPath}.wm.jpg`;
          try {
            await encodeWatermarkJpeg(data.width, data.height, data.rgba, 95, outputPath);
            if (perf) perfStage(perf, "nativeEncode");

            const fileBase64 = await FileSystem.readAsStringAsync(outputPath, {
              encoding: FileSystem.EncodingType.Base64,
            });
            try {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
            } catch {}
            await saveAndComplete(job, fileBase64);
          } catch (error) {
            logger.warn("[Watermark] native encode failed, falling back to toBlob:", error);
            try {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
            } catch {}
            scheduleStage(job, "toblob");
          }
        })();
        return;
      }

      if (!data.base64 || photoId == null) {
        handleJobFailure(job);
        return;
      }

      const perf = perfRef.current;
      const jsPerf = (data.perf ?? {}) as JsPerf;
      if (perf && (jsPerf.decode != null || jsPerf.total != null)) {
        perf.stages.push({ name: "jsDecode", ms: jsPerf.decode ?? 0 });
        perf.stages.push({ name: "jsDraw", ms: jsPerf.draw ?? 0 });
        perf.stages.push({ name: "jsEncode", ms: jsPerf.encode ?? 0 });
        perfStage(perf, "webviewReturn");
      }

      clearWatchdog();
      saveAndComplete(job, data.base64);
    } catch {
      const job = queueRef.current[0];
      if (job) handleJobFailure(job);
    }
  }, [project, onPhotosUpdated]);

function enqueueWatermark(
    photoId: number,
    inputPath: string,
    fileName: string,
    lines: string[],
    style?: WatermarkStyleConfig,
    useNativeOverride?: boolean | "rgba",
    size?: { width: number; height: number }
) {
    let stage: WatermarkStage;
    if (useNativeOverride === "rgba") stage = "rgba";
    else if (useNativeOverride === false) stage = "toblob";
    else if (useNativeOverride === true) stage = "overlay";
    else if (hasNativeWatermarkEncoder() && hasNativeOverlayEncoder()) stage = "overlay";
    else stage = "toblob";

    const job: WatermarkJob = {
      photoId,
      inputPath,
      fileName,
      lines,
      style,
      stage,
      retries: 0,
      startedAtMs: perfNow(),
      width: size?.width,
      height: size?.height,
      projectDbPath: project?.DBPath ?? undefined,
      writeLabel: project ? photoStorageLabelForProject(project) : "",
    };
    queueRef.current.push(job);
    setWatermarkState(prev => ({ ...prev, [photoId]: "pending" }));
    if (!processingRef.current) {
      processNext();
    }
}

  return {
    watermarkState,
    webViewReady,
    webViewRef,
    handleWebViewMessage,
    handleWebViewLoadEnd,
    handleRenderProcessGone,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  };
}