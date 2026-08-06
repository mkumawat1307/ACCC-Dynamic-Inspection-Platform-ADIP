import { logger } from "@/src/utils/logger";

export function perfNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export interface PerfStage {
  name: string;
  ms: number;
}

export interface PerfAccumulator {
  photoId: number;
  totalStart: number;
  last: number;
  stages: PerfStage[];
}

export function perfStart(photoId: number): PerfAccumulator {
  const now = perfNow();
  return { photoId, totalStart: now, last: now, stages: [] };
}

export function perfStage(acc: PerfAccumulator, name: string): PerfAccumulator {
  const now = perfNow();
  acc.stages.push({ name, ms: now - acc.last });
  acc.last = now;
  return acc;
}

export function perfReport(acc: PerfAccumulator, label = "watermark"): number {
  const total = perfNow() - acc.totalStart;
  const line = acc.stages.map(s => `${s.name}=${s.ms.toFixed(1)}ms`).join(" ");
  logger.debug(`[Perf:${label}] photo=${acc.photoId} total=${total.toFixed(1)}ms ${line}`);
  return total;
}

export function perfLog(context: string, stage: string, start: number): number {
  const ms = perfNow() - start;
  logger.debug(`[Perf] ${context} ${stage}: ${ms.toFixed(1)}ms`);
  return ms;
}
