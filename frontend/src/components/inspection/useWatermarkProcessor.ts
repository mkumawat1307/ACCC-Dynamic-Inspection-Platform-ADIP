import { useState, useRef, useCallback, useEffect } from "react";
import { Image } from "react-native";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { Project } from "@/src/models/Project";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { writePhoto, ensureTreeUri, getProjectDir, getSafCacheState } from "@/src/utils/storageManager";
import { canonicalProjectLabel } from "@/src/utils/folderNaming";
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
  WatermarkOverlayTimings,
} from "@/src/native/WatermarkEncoder";
import { useInspection } from "@/src/context/InspectionContext";
import { perfStart, perfStage, perfReport, perfNow, perfLog, PerfAccumulator, uiPerfStage } from "@/src/utils/perf";

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
  _firstRenderStartMs?: number;
}

interface SaveStageTimings {
  nativeTimings?: WatermarkOverlayTimings;
  tempFileReadMs?: number;
  saveStartMs: number;
}

interface JsPerf {
  decode?: number;
  draw?: number;
  encode?: number;
  total?: number;
}

interface WatermarkDiag {
  instance?: string;
  created?: number;
  capture?: number;
  jobs?: number;
  uptimeMs?: number;
  toBlobAtMs?: number;
  cbAtMs?: number;
  imgWasResident?: boolean;
  imgW?: number;
  imgH?: number;
  cvPrevW?: number;
  cvPrevH?: number;
  cvW?: number;
  cvH?: number;
  canvasReset?: boolean;
  blobSize?: number;
  b64Len?: number;
  overlayPngB64Len?: number;
  quality?: number;
  toBlobMs?: number;
  frMs?: number;
  getDataMs?: number;
  b64Ms?: number;
  rgbaLen?: number;
  native?: boolean;
  heapBefore?: number;
  heapAfter?: number;
  heapUsed?: number;
  heapLimit?: number;
  gcEvents?: number;
  gcMs?: number;
}

interface UseWatermarkProcessorOptions {
  project: Project | null;
  onPhotosUpdated: () => void;
}

function watermarkFallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.indexOf("E_OOM") === 0) return "oom";
  if (message.indexOf("E_DECODE") === 0) return "rgba-buffer-mismatch";
  if (message.indexOf("E_ENCODE") === 0) return "encode-error";
  if (message.indexOf("E_INVALID_ARGS") === 0) return "invalid-args";
  if (message.indexOf("overlay composite is not available") !== -1) return "overlay-module-missing";
  if (message.indexOf("native module is not available") !== -1) return "module-missing";
  const line = message.split("\n")[0].slice(0, 80);
  return line || "unknown";
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
  const { photoStates: watermarkState, setPhotoStates: setWatermarkState } = useInspection();
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
  const firstJobLoggedRef = useRef(false);

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

  function clearWatermarkState(photoId: number) {
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
    }
  }

  function armWatchdog(job: WatermarkJob, onTimeout: () => void) {
    clearWatchdog();
    const ms = STAGE_WATCHDOG_MS[job.stage];
    if (__DEV__) {
      logger.debug(
        `[Watermark:watchdog] photo=${job.photoId} stage=${job.stage} armed=${ms}ms`
      );
    }
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      if (__DEV__) {
        logger.debug(
          `[Watermark:watchdog] photo=${job.photoId} stage=${job.stage} FIRED`
        );
      }
      onTimeout();
    }, ms);
  }

  function retryWatermark(photoId: number) {
    const job = failedJobsRef.current.get(photoId);
    if (!job) return;
    failedJobsRef.current.delete(photoId);
    const dims =
      job.width && job.height ? { width: job.width, height: job.height } : undefined;
    enqueueWatermark(job.photoId, job.inputPath, job.fileName, job.lines, job.style, undefined, dims);
  }

function handleJobFailure(job: WatermarkJob) {
    clearWatchdog();
    if (job.retries < 1) {
      const retry = { ...job, retries: job.retries + 1 };
      queueRef.current[0] = retry;
      setWatermarkState(prev => ({ ...prev, [job.photoId]: "pending" }));
    } else {
      queueRef.current.shift();
      failedJobsRef.current.set(job.photoId, job);
      setWatermarkState(prev => ({ ...prev, [job.photoId]: "failed" }));
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
      const totalMs = perfNow() - job.startedAtMs;
      logger.debug(`[Perf:watermark] photo=${photoId} captureToSaved=${totalMs.toFixed(1)}ms`);
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
    uiPerfStage("stateUpdated", `photo=${photoId}`);
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
        if (__DEV__) {
          logger.debug(
            `[Watermark:overlay] photo=${job.photoId} dims=${dims.width}x${dims.height} cached`
          );
        }
      } catch (error) {
        if (__DEV__) {
          logger.debug(
            `[Watermark:overlay] photo=${job.photoId} imageSizeFailed reason=${watermarkFallbackReason(error)}`
          );
        }
        scheduleStage(job, "toblob");
        return;
      }
    }
    const style = job.style ?? DEFAULT_OVERLAY_STYLE;
    const metrics = computeWatermarkMetrics(job.width, job.height, style);
    injectJourneyScript(job, buildMeasureOverlayScript(job.photoId, metrics.fSize, job.lines));
  }

  function startStage(job: WatermarkJob) {
    if (__DEV__) {
      logger.debug(
        `[Watermark:path] photo=${job.photoId} stage=${job.stage} attempt=${job.retries + 1}`
      );
    }
    clearWatchdog();
    armWatchdog(job, () => {
      const next = downshiftStage(job);
      scheduleStage(job, next);
    });

    if (job.stage === "overlay") {
      startOverlayStage(job).catch((error) => {
        if (__DEV__) {
          logger.debug(
            `[Watermark:fallback] photo=${job.photoId} stage=overlay reason=${watermarkFallbackReason(error)}`
          );
        }
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
        if (__DEV__) {
          logger.debug(
            `[Watermark:fallback] photo=${job.photoId} stage=rgba reason=${watermarkFallbackReason(error)}`
          );
        }
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
        if (__DEV__) {
          logger.debug(
            `[Watermark:fallback] photo=${job.photoId} stage=toblob reason=${watermarkFallbackReason(error)}`
          );
        }
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
    if (__DEV__) {
      logger.debug(`[Watermark:fallback] photo=${job.photoId} overlay->${next}`);
    }
    processingRef.current = false;
    processNext();
}

  async function processNext() {
    if (processingRef.current || queueRef.current.length === 0) return;
    if (!readyRef.current) {
      if (!readyWaitStartRef.current) readyWaitStartRef.current = perfNow();
      return;
    }

    processingRef.current = true;

    const job = queueRef.current[0];
    setWatermarkState(prev => ({ ...prev, [job.photoId]: "processing" }));
    uiPerfStage("overlayStart", `photo=${job.photoId} stage=${job.stage}`);

    const perf = perfStart(job.photoId);
    perfRef.current = perf;

    startStage(job);
  }

  const handleWebViewLoadEnd = useCallback(() => {
    loadCountRef.current++;
    logger.debug(`[Watermark:lifecycle] onLoadEnd count=${loadCountRef.current}`);
    if (readyWaitStartRef.current) {
      perfLog("watermark", "webViewInitialLoad", readyWaitStartRef.current);
    }
  }, []);

  const handleRenderProcessGone = useCallback((event: any) => {
    const details = event?.nativeEvent ?? {};
    logger.debug(
      `[Watermark:lifecycle] render process gone didCrash=${details.didCrash} ` +
        `reason=${details.reason ?? "unknown"} loadCount=${loadCountRef.current}`
    );
  }, []);

function saveAndComplete(job: WatermarkJob, base64: string, saveTimings?: SaveStageTimings) {
    return (async () => {
      clearWatchdog();
      const label = project ? canonicalProjectLabel(project) : "";
      uiPerfStage("overlayDone", `photo=${job.photoId}`);

      const tSave = perfNow();
      const treeUri = await ensureTreeUri();
      const projectDir = await getProjectDir(treeUri, label);
      uiPerfStage("safWriteStart", `photo=${job.photoId}`);
      const contentUri = await writePhoto(projectDir, job.fileName, base64);
      uiPerfStage("safWriteDone", `photo=${job.photoId}`);
      if (__DEV__) {
        logger.debug(`[Watermark:save] photo=${job.photoId} writing=${contentUri}`);
        logger.debug(`[Watermark:save] photo=${job.photoId} original=${job.inputPath}`);
      }
      if (perfRef.current) perfStage(perfRef.current, "safWrite");
      const safWriteMs = perfNow() - tSave;
      const saf = getSafCacheState();
      logger.debug(`[SAF] ProjectDirCache: ${saf.projectDirHit ? "HIT" : "MISS"}`);
      logger.debug(`[SAF] TreeUriCache: ${saf.treeUriHit ? "HIT" : "MISS"}`);
      logger.debug(`[SAF] WriteTime: ${safWriteMs.toFixed(1)} ms`);

      const tDb = perfNow();
      await PhotoRepository.updateFilePath(job.photoId, contentUri);
      if (perfRef.current) perfStage(perfRef.current, "sqliteUpdate");
      else logger.debug(`[Perf] watermark photo=${job.photoId} sqliteUpdate: ${(perfNow() - tDb).toFixed(1)}ms`);
      const dbUpdateMs = perfNow() - tDb;

      if (__DEV__ && saveTimings) {
        const totalNativeSaveMs = perfNow() - saveTimings.saveStartMs;
        const nt = saveTimings.nativeTimings;
        const fmt = (n: number | undefined) => (n == null ? "n/a" : n.toFixed(1));
        logger.debug(
          `[Save] decode=${fmt(nt?.decodeOriginalMs ?? undefined)} overlay=${fmt(nt?.decodeOverlayMs ?? undefined)} ` +
            `composite=${fmt(nt?.compositeMs ?? undefined)} encode=${fmt(nt?.jpegEncodeMs ?? undefined)} ` +
            `read=${fmt(saveTimings.tempFileReadMs)} saf=${fmt(safWriteMs)} db=${fmt(dbUpdateMs)} ` +
            `total=${fmt(totalNativeSaveMs)}`
        );
      }

      onPhotosUpdated();
      await handleJobComplete(job.photoId);
    })().catch(() => {
      if (perfRef.current) perfStage(perfRef.current, "saveError");
      handleJobFailure(job);
    });
  }

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.__unload) {
        logger.debug(
          `[Watermark:lifecycle] renderer unloaded instance=${data.instance} ` +
            `created=${data.created} uptime=${data.uptime}ms`
        );
        return;
      }

      if (data.__ready) {
        readyCountRef.current++;
        const instance = data.instance ?? "unknown";
        const created = data.created ?? 0;
        const recreated =
          readyInstanceRef.current !== null && readyInstanceRef.current !== instance;
        logger.debug(
          `[Watermark:lifecycle] renderer ready instance=${instance} created=${created} ` +
            `readyCount=${readyCountRef.current} loadCount=${loadCountRef.current} recreated=${recreated}`
        );
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
            if (__DEV__) {
              logger.debug(`[Watermark:warmup] start`);
            }
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
                setTimeout(() => {
                  if (wv) {
                    wv.injectJavaScript(
                      `window.renderWatermarkFromJson(${JSON.stringify({
                        photoId: warmupId,
                        layout: { metrics: { fSize: 24, lh: 28, padY: 8, rPad: 10, gapX: 16, gapY: 20, corner: 4 }, boxX: 10, boxY: 10, boxW: 100, boxH: 50, overX: 0, overY: 0, overW: 124, overH: 74, textLeft: 20, textBase: 30 }, lines: ["Warmup"], style: { fontScale: 0.8, position: "bottomLeft", bgOpacity: 0.5, textColor: "#76FF03" },
                      })}); true;`
                    );
                    if (__DEV__) {
                      logger.debug(`[Watermark:warmup] ready in ${(perfNow() - warmupStartRef.current).toFixed(1)}ms`);
                    }
                  }
                }, 50);
              }
            } catch (e) {
              if (__DEV__) {
                logger.debug(`[Watermark:warmup] skipped reason=${e instanceof Error ? e.message : String(e)}`);
              }
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
        if (__DEV__) {
          const previewW = job.previewWidth ?? job.width;
          const previewH = job.previewHeight ?? job.height;
          logger.debug(
            `[Watermark:layout] photo=${photoId} preview=${previewW}x${previewH} ` +
              `final=${job.width}x${job.height}`
          );
          logger.debug(
            `[Watermark:layout] photo=${photoId} x=${job.layout.overX} y=${job.layout.overY} ` +
              `w=${job.layout.overW} h=${job.layout.overH}`
          );
          // First-capture logging
          if (!firstJobLoggedRef.current) {
            firstJobLoggedRef.current = true;
            logger.debug(`[Watermark:first] renderStart`);
            job._firstRenderStartMs = perfNow();
          }
        }
        try {
          injectJourneyScript(job, buildRenderOverlayScript(job.photoId, job.layout, job.lines, job.style));
        } catch (error) {
          if (__DEV__) {
            logger.debug(
              `[Watermark:overlay] photo=${photoId} measureOk but render failed reason=${watermarkFallbackReason(error)}`
            );
          }
          scheduleStage(job, "toblob");
        }
        return;
      }

      if (data.overlay != null) {
        if (job.stage !== "overlay") return;
        clearWatchdog();
        if (__DEV__) {
          logger.debug(
            `[Watermark:overlay] photo=${photoId} pngB64Len=${(data.diag?.overlayPngB64Len ?? data.overlay.length)} ` +
              `x=${data.overlayX} y=${data.overlayY} size=${data.overlayWidth}x${data.overlayHeight}`
          );
          // First-capture render ready logging
          if (job._firstRenderStartMs) {
            logger.debug(`[Watermark:first] renderReady in ${(perfNow() - job._firstRenderStartMs).toFixed(1)}ms`);
          }
        }
        const wrapped = { ...data, overlay: data.overlay } as typeof data & { overlay: string };
        (async () => {
          const outputPath = `${job.inputPath}.wm.jpg`;
          if (__DEV__) {
            logger.debug(`[Watermark:overlay] photo=${photoId} output=${outputPath}`);
          }
          const tOverlayStage = perfNow();
          try {
            const saveStartMs = perfNow();
            const tEnc = perfNow();
            const nativeTimings = await encodeWatermarkOverlay(
              job.inputPath,
              wrapped.overlay,
              data.overlayX ?? 0,
              data.overlayY ?? 0,
              95,
              outputPath
            );
            if (__DEV__) {
              logger.debug(
                `[Watermark:overlay] photo=${photoId} success totalMs=${(perfNow() - tOverlayStage).toFixed(1)}`
              );
              if (typeof nativeTimings === "object" && nativeTimings !== null) {
                const nt = nativeTimings as WatermarkOverlayTimings;
                logger.debug(
                  `[Watermark:overlay] photo=${photoId} position=x=${nt.drawX ?? "n/a"},y=${nt.drawY ?? "n/a"} ` +
                    `size=${nt.overlayWidth ?? "n/a"}x${nt.overlayHeight ?? "n/a"} ` +
                    `src=${nt.sourceWidth ?? "n/a"}x${nt.sourceHeight ?? "n/a"}`
                );
                logger.debug(
                  `[Watermark:overlay] photo=${photoId} alphaNonZero=${nt.overlayAlphaNonZero} compositeApplied=${nt.compositeApplied}`
                );
              }
              logger.debug(
                `[Watermark:encode] photo=${photoId} overlayCompositeMs=${(perfNow() - tEnc).toFixed(1)}`
              );
            }
            if (perfRef.current) perfStage(perfRef.current, "nativeComposite");

            const tRead = perfNow();
            const fileBase64 = await FileSystem.readAsStringAsync(outputPath, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const tempFileReadMs = perfNow() - tRead;
            try {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
            } catch {}
            await saveAndComplete(job, fileBase64, {
              nativeTimings,
              tempFileReadMs,
              saveStartMs,
            });
          } catch (error) {
            if (__DEV__) {
              logger.debug(
                `[Watermark:fallback] photo=${photoId} stage=overlay reason=${watermarkFallbackReason(error)}`
              );
            }
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
        if (__DEV__) {
          const rgbaTransferMs = perfRef.current ? perfNow() - perfRef.current.last : 0;
          logger.debug(
            `[Watermark:transfer] photo=${photoId} rgbaTransferMs=${rgbaTransferMs.toFixed(1)}`
          );
        }

        const perf = perfRef.current;
        const jsPerf = (data.perf ?? {}) as JsPerf;
        if (perf && (jsPerf.decode != null || jsPerf.total != null)) {
          perf.stages.push({ name: "jsDecode", ms: jsPerf.decode ?? 0 });
          perf.stages.push({ name: "jsDraw", ms: jsPerf.draw ?? 0 });
          perf.stages.push({ name: "jsGetData", ms: jsPerf.encode ?? 0 });
          perfStage(perf, "webviewReturn");
        }

        const diag = (data.diag ?? {}) as WatermarkDiag;
        if (diag && (diag.getDataMs != null || diag.b64Ms != null)) {
          logger.debug(
            `[Watermark:diag] photo=${photoId} instance=${diag.instance} capture=${diag.capture} jobs=${diag.jobs} ` +
              `mode=native getData=${diag.getDataMs}ms b64=${diag.b64Ms}ms ` +
              `img=${diag.imgW}x${diag.imgH} resident=${diag.imgWasResident} ` +
              `cv=${diag.cvPrevW}x${diag.cvPrevH}->${diag.cvW}x${diag.cvH} reset=${diag.canvasReset} ` +
              `rgba=${diag.rgbaLen} q=${diag.quality}`
          );
        }

        (async () => {
          const outputPath = `${job.inputPath}.wm.jpg`;
          try {
            const tEnc = perfNow();
            await encodeWatermarkJpeg(data.width, data.height, data.rgba, 95, outputPath);
            if (__DEV__) {
              logger.debug(
                `[Watermark:encode] photo=${photoId} rgbaEncodeMs=${(perfNow() - tEnc).toFixed(1)}`
              );
            }
            if (perf) perfStage(perf, "nativeEncode");

            const fileBase64 = await FileSystem.readAsStringAsync(outputPath, {
              encoding: FileSystem.EncodingType.Base64,
            });
            try {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
            } catch {}
            await saveAndComplete(job, fileBase64);
          } catch (error) {
            if (__DEV__) {
              logger.debug(
                `[Watermark:fallback] photo=${photoId} stage=rgba reason=${watermarkFallbackReason(error)}`
              );
            }
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

      if (__DEV__ && jsPerf.encode != null) {
        logger.debug(
          `[Watermark:encode] photo=${photoId} jsEncodeMs=${jsPerf.encode.toFixed(1)}`
        );
      }

      const diag = (data.diag ?? {}) as WatermarkDiag;
      if (diag && (diag.toBlobMs != null || diag.frMs != null)) {
        logger.debug(
          `[Watermark:diag] photo=${photoId} instance=${diag.instance} capture=${diag.capture} jobs=${diag.jobs} ` +
            `uptime=${diag.uptimeMs}ms toBlobAt=${diag.toBlobAtMs}ms cbAt=${diag.cbAtMs}ms ` +
            `img=${diag.imgW}x${diag.imgH} resident=${diag.imgWasResident} ` +
            `cv=${diag.cvPrevW}x${diag.cvPrevH}->${diag.cvW}x${diag.cvH} reset=${diag.canvasReset} ` +
            `blob=${diag.blobSize}b b64=${diag.b64Len} q=${diag.quality} ` +
            `toBlob=${diag.toBlobMs}ms fr=${diag.frMs}ms ` +
            `heap=${diag.heapBefore}->${diag.heapAfter}/${diag.heapLimit} gc=${diag.gcEvents}/${diag.gcMs}ms`
        );
      }

      clearWatchdog();
      saveAndComplete(job, data.base64);
      // eslint-disable-next-line react-hooks/exhaustive-deps
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