import { useState, useRef, useCallback, useEffect } from "react";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { Project } from "@/src/models/Project";
import PhotoRepository from "@/src/database/repositories/PhotoRepository";
import { writePhoto, ensureTreeUri, getProjectDir } from "@/src/utils/storageManager";
import { canonicalProjectLabel } from "@/src/utils/folderNaming";
import { buildWatermarkPage } from "@/src/utils/watermarkHtml";
import { useInspection } from "@/src/context/InspectionContext";

interface WatermarkJob {
  photoId: number;
  inputPath: string;
  fileName: string;
  lines: string[];
  retries: number;
}

interface UseWatermarkProcessorOptions {
  project: Project | null;
  onPhotosUpdated: () => void;
}

export function useWatermarkProcessor({ project, onPhotosUpdated }: UseWatermarkProcessorOptions) {
  const { photoStates: watermarkState, setPhotoStates: setWatermarkState } = useInspection();
  const [watermarkHtml, setWatermarkHtml] = useState<string | null>(null);

  const queueRef = useRef<WatermarkJob[]>([]);
  const failedJobsRef = useRef<Map<number, WatermarkJob>>(new Map());
  const processingRef = useRef(false);
  const webViewRef = useRef<WebView>(null);

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
    enqueueWatermark(job.photoId, job.inputPath, job.fileName, job.lines);
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
    processingRef.current = false;
    setWatermarkHtml(null);
    setTimeout(() => processNext(), 50);
  }

  async function handleJobComplete(photoId: number) {
    const idx = queueRef.current.findIndex(j => j.photoId === photoId);
    if (idx < 0) return;

    const job = queueRef.current[idx];
    queueRef.current.splice(idx, 1);
    failedJobsRef.current.delete(photoId);

    if (job?.inputPath) {
      try {
        await FileSystem.deleteAsync(job.inputPath, { idempotent: true });
      } catch (e) {
        logger.warn("[Watermark] Failed to clean up temp file:", job.inputPath, e);
      }
    }

    setWatermarkState(prev => ({ ...prev, [photoId]: "completed" }));
    processingRef.current = false;
    setWatermarkHtml(null);
    setTimeout(() => processNext(), 50);
  }

  async function processNext() {
    if (processingRef.current || queueRef.current.length === 0) return;

    processingRef.current = true;

    const job = queueRef.current[0];
    setWatermarkState(prev => ({ ...prev, [job.photoId]: "processing" }));

    try {
      const base64 = await FileSystem.readAsStringAsync(job.inputPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const html = buildWatermarkPage(base64, job.lines, job.photoId);
      setWatermarkHtml(html);
    } catch (error) {
      logger.warn("[Watermark] read or build failed:", error);
      handleJobFailure(job);
    }
  }

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      const { photoId, base64 } = data;

      if (!base64 || photoId == null) {
        const job = queueRef.current[0];
        if (job) handleJobFailure(job);
        return;
      }

      const job = queueRef.current.find(j => j.photoId === photoId);
      if (!job) return;

      (async () => {
        const label = project ? canonicalProjectLabel(project) : "";

        const treeUri = await ensureTreeUri();
        const projectDir = await getProjectDir(treeUri, label);
        const contentUri = await writePhoto(projectDir, job.fileName, base64);
        await PhotoRepository.updateFilePath(photoId, contentUri);
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
  }, [project, onPhotosUpdated]);

  function enqueueWatermark(photoId: number, inputPath: string, fileName: string, lines: string[]) {
    const job: WatermarkJob = { photoId, inputPath, fileName, lines, retries: 0 };
    queueRef.current.push(job);
    setWatermarkState(prev => ({ ...prev, [photoId]: "pending" }));
    if (!processingRef.current) {
      setTimeout(() => processNext(), 100);
    }
  }

  return {
    watermarkState,
    watermarkHtml,
    webViewRef,
    handleWebViewMessage,
    enqueueWatermark,
    clearWatermarkState,
    retryWatermark,
  };
}

