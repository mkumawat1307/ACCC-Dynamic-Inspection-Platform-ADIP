import { useCallback, useRef, useState } from "react";
import { createExportFile, ExportFormat, ExportProjectMeta, ExportResult, openExportFile } from "@/src/utils/exportData";
import { logger } from "@/src/utils/logger";

export interface ExportTarget {
  ids: number[];
}

export type ExportFlowState =
  | { phase: "idle" }
  | { phase: "choosing"; target: ExportTarget }
  | { phase: "exporting"; format: ExportFormat; target: ExportTarget }
  | { phase: "success"; result: ExportResult }
  | { phase: "error"; format: ExportFormat; message: string };

const FORMAT_LABEL: Record<ExportFormat, string> = {
  excel: "Excel",
  csv: "CSV",
};

export function useExportFlow(projectId: number, projectName: string, meta?: ExportProjectMeta) {
  const [state, setState] = useState<ExportFlowState>({ phase: "idle" });
  const lastFormat = useRef<ExportFormat>("excel");
  const lastTarget = useRef<ExportTarget | null>(null);

  const beginExport = useCallback((target: ExportTarget) => {
    lastTarget.current = target;
    setState({ phase: "choosing", target });
  }, []);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      const target = lastTarget.current;
      if (!target) return;
      lastFormat.current = format;
      setState({ phase: "exporting", format, target });
      try {
        const result = await createExportFile(projectId, projectName, target.ids, format, meta);
        if (!result) {
          setState({
            phase: "error",
            format,
            message: `No inspection data found to export as ${FORMAT_LABEL[format]}.`,
          });
          return;
        }
        setState({ phase: "success", result });
      } catch (error) {
        logger.error("Export error:", error);
        setState({
          phase: "error",
          format,
          message: `Unable to generate the ${FORMAT_LABEL[format]} report.`,
        });
      }
    },
    [projectId, projectName, meta]
  );

  const retry = useCallback(() => {
    if (state.phase === "error") {
      void runExport(state.format);
    }
  }, [state, runExport]);

  const dismiss = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const open = useCallback(async () => {
    if (state.phase !== "success") return;
    try {
      const ok = await openExportFile(state.result);
      if (!ok) {
        logger.warn("Open unavailable on this device");
      }
    } catch (error) {
      logger.error("Open file error:", error);
    }
  }, [state]);

  const busy = state.phase === "exporting";

  return {
    state,
    busy,
    beginExport,
    runExport,
    retry,
    dismiss,
    open,
  };
}
