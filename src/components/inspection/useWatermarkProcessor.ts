import { useState, useRef, useCallback, useEffect } from "react";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { Project } from "@/src/models/Project";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { writePhoto, ensureTreeUri, getProjectDir, getSafCacheState } from "@/src/utils/storageManager";
import { canonicalProjectLabel } from "@/src/utils/folderNaming";
import { buildRenderWatermarkScript } from "@/src/utils/watermarkHtml";
import { WatermarkStyleConfig } from "@/src/utils/watermarkStyle";
import { useInspection } from "@/src/context/InspectionContext";
import { perfStart, perfStage, perfReport, perfNow, perfLog, PerfAccumulator } from "@/src/utils/perf";

interface WatermarkJob {
  photoId: number;
  inputPath: string;
  fileName: string;
  lines: string[];
  style?: WatermarkStyleConfig;
  retries: number;
  startedAtMs: number;
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

export function useWatermarkProcessor({ project, onPhotosUpdated }: UseWatermarkProcessorOptions) {
  const { photoStates: watermarkState, setPhotoStates: setWatermarkState } = useInspection();
  const [webViewReady, setWebViewReady] = useState(false);

  const queueRef = useRef<WatermarkJob[]>([]);
  const failedJobsRef = useRef<Map<number, WatermarkJob>>(new Map());
  const processingRef = useRef(false);
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const readyWaitStartRef = useRef(0);
  const perfRef = useRef<PerfAccumulator | null>(null);

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
  }

  function retryWatermark(photoId: number) {
    const job = failedJobsRef.current.get(photoId);
    if (!job) return;
    failedJobsRef.current.delete(photoId);
    enqueueWatermark(job.photoId, job.inputPath, job.fileName, job.lines, job.style);
  }

  function handleJobFailure(job: WatermarkJob) {
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
    setTimeout(() => processNext(), 50);
  }

  async function handleJobComplete(photoId: number) {
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
    processingRef.current = false;
    setTimeout(() => processNext(), 50);
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

    const perf = perfStart(job.photoId);
    perfRef.current = perf;

    try {
      const base64 = await FileSystem.readAsStringAsync(job.inputPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      perfStage(perf, "fileRead");

      const wv = webViewRef.current;
      if (!wv) throw new Error("webview not available");
      wv.injectJavaScript(buildRenderWatermarkScript(job.photoId, base64, job.lines, job.style));
      perfStage(perf, "webviewSend");
    } catch (error) {
      logger.warn("[Watermark] read or send failed:", error);
      handleJobFailure(job);
    }
  }

  const handleWebViewLoadEnd = useCallback(() => {
    if (readyWaitStartRef.current) {
      perfLog("watermark", "webViewInitialLoad", readyWaitStartRef.current);
    }
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.__ready) {
        if (!readyRef.current) {
          readyRef.current = true;
          setWebViewReady(true);
          if (readyWaitStartRef.current) {
            perfLog("watermark", "webViewReady", readyWaitStartRef.current);
            readyWaitStartRef.current = 0;
          }
          setTimeout(() => processNext(), 0);
        }
        return;
      }

      const { photoId, base64 } = data;

      if (!base64 || photoId == null) {
        const job = queueRef.current[0];
        if (job) handleJobFailure(job);
        return;
      }

      const job = queueRef.current.find(j => j.photoId === photoId);
      if (!job) return;

      const perf = perfRef.current;
      const jsPerf = (data.perf ?? {}) as JsPerf;
      if (perf && (jsPerf.decode != null || jsPerf.total != null)) {
        perf.stages.push({ name: "jsDecode", ms: jsPerf.decode ?? 0 });
        perf.stages.push({ name: "jsDraw", ms: jsPerf.draw ?? 0 });
        perf.stages.push({ name: "jsEncode", ms: jsPerf.encode ?? 0 });
        perfStage(perf, "webviewReturn");
      }

      (async () => {
        const label = project ? canonicalProjectLabel(project) : "";

        const tSave = perfNow();
        const treeUri = await ensureTreeUri();
        const projectDir = await getProjectDir(treeUri, label);
        const contentUri = await writePhoto(projectDir, job.fileName, base64);
        if (perf) perfStage(perf, "safWrite");
        const saf = getSafCacheState();
        logger.debug(`[SAF] ProjectDirCache: ${saf.projectDirHit ? "HIT" : "MISS"}`);
        logger.debug(`[SAF] TreeUriCache: ${saf.treeUriHit ? "HIT" : "MISS"}`);
        logger.debug(`[SAF] WriteTime: ${(perfNow() - tSave).toFixed(1)} ms`);

        const tDb = perfNow();
        await PhotoRepository.updateFilePath(photoId, contentUri);
        if (perf) perfStage(perf, "sqliteUpdate");
        else logger.debug(`[Perf] watermark photo=${photoId} sqliteUpdate: ${(perfNow() - tDb).toFixed(1)}ms`);

        onPhotosUpdated();
        handleJobComplete(photoId);
      })().catch(() => {
        const j = queueRef.current.find(j => j.photoId === photoId);
        if (j) handleJobFailure(j);
      });
    } catch {
      const job = queueRef.current[0];
      if (job) handleJobFailure(job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, onPhotosUpdated]);

  function enqueueWatermark(
    photoId: number,
    inputPath: string,
    fileName: string,
    lines: string[],
    style?: WatermarkStyleConfig
  ) {
    const job: WatermarkJob = {
      photoId,
      inputPath,
      fileName,
      lines,
      style,
      retries: 0,
      startedAtMs: perfNow(),
    };
    queueRef.current.push(job);
    setWatermarkState(prev => ({ ...prev, [photoId]: "pending" }));
    if (!processingRef.current) {
      setTimeout(() => processNext(), 16);
    }
  }

  return {
    watermarkState,
    webViewReady,
    webViewRef,
    handleWebViewMessage,
    handleWebViewLoadEnd,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  };
}
