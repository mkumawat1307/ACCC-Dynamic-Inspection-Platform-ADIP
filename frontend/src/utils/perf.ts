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

export function perfReport(acc: PerfAccumulator, _label = "watermark"): number {
  const total = perfNow() - acc.totalStart;
  return total;
}

export function perfLog(context: string, stage: string, start: number): number {
  const ms = perfNow() - start;
  return ms;
}

let uiPerfSessionStart = 0;
let uiPerfPrevMs = 0;

const UI_PERF_STALE_MS = 15000;

type UiProbeKey =
  | "setTimeoutActive"
  | "interactionManagerUsed"
  | "thumbnailRendering"
  | "listRefreshing"
  | "cameraPausing"
  | "animationRunning";

const UI_PROBE_SHORT: Record<UiProbeKey, string> = {
  setTimeoutActive: "to",
  interactionManagerUsed: "iim",
  thumbnailRendering: "thumb",
  listRefreshing: "list",
  cameraPausing: "cam",
  animationRunning: "anim",
};

const uiProbeCounters: Record<UiProbeKey, number> = {
  setTimeoutActive: 0,
  interactionManagerUsed: 0,
  thumbnailRendering: 0,
  listRefreshing: 0,
  cameraPausing: 0,
  animationRunning: 0,
};

export function uiPerfSetProbe(key: UiProbeKey, active: boolean): void {
  if (active) uiProbeCounters[key] += 1;
  else uiProbeCounters[key] = Math.max(0, uiProbeCounters[key] - 1);
}

export function uiPerfProbeSummary(): string {
  const parts = (Object.keys(uiProbeCounters) as UiProbeKey[]).map(
    (k) => `${UI_PROBE_SHORT[k]}=${uiProbeCounters[k] > 0 ? 1 : 0}`
  );
  return `probes=[${parts.join(" ")}]`;
}

export function uiPerfStageIfProbe(
  label: string,
  key: UiProbeKey,
  extra?: string
): void {
  if (uiProbeCounters[key] > 0) {
    uiPerfStage(label, extra, uiPerfProbeSummary());
  }
}

export function uiPerfReset(): void {
  uiPerfSessionStart = perfNow();
  uiPerfPrevMs = uiPerfSessionStart;
}

export function uiPerfStage(label: string, extra?: string, probe?: string): void {
  const now = perfNow();
  let stale = false;
  if (uiPerfSessionStart <= 0) stale = true;
  else if (now - uiPerfPrevMs > UI_PERF_STALE_MS) stale = true;
  if (stale) {
    uiPerfSessionStart = now;
    uiPerfPrevMs = now;
  }
  uiPerfPrevMs = now;
}
