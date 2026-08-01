import { useCallback, useRef, useState } from "react";
import {
  applyTemplateImport,
  exportTemplates,
  ParsedTemplateFile,
  pickAndParseTemplate,
  shareTemplateFile,
  TemplateExportResult,
} from "@/src/utils/templateData";
import { logger } from "@/src/utils/logger";

export type TemplateFlowState =
  | { phase: "idle" }
  | { phase: "exporting" }
  | { phase: "exported"; result: TemplateExportResult }
  | { phase: "parsing" }
  | { phase: "confirming"; parsed: ParsedTemplateFile }
  | { phase: "importing" }
  | { phase: "imported"; message: string }
  | { phase: "error"; message: string };

export function useTemplateFlow() {
  const [state, setState] = useState<TemplateFlowState>({ phase: "idle" });
  const pendingImport = useRef<ParsedTemplateFile | null>(null);
  const errorSource = useRef<"export" | "import" | null>(null);

  const beginExport = useCallback(async () => {
    setState({ phase: "exporting" });
    try {
      const result = await exportTemplates();
      if (!result) {
        errorSource.current = "export";
        setState({ phase: "error", message: "No template found to export." });
        return;
      }
      setState({ phase: "exported", result });
    } catch (error) {
      logger.error("Export error:", error);
      errorSource.current = "export";
      setState({ phase: "error", message: "Unable to export template." });
    }
  }, []);

  const dismissExport = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const shareExported = useCallback(async () => {
    if (state.phase !== "exported") return;
    try {
      await shareTemplateFile(state.result);
    } catch (error) {
      logger.error("Share template error:", error);
    }
  }, [state]);

  const beginImport = useCallback(async () => {
    setState({ phase: "parsing" });
    try {
      const picked = await pickAndParseTemplate();
      if (picked.status === "canceled") {
        setState({ phase: "idle" });
        return;
      }
      if (picked.status === "error") {
        errorSource.current = "import";
        setState({ phase: "error", message: picked.message });
        return;
      }
      pendingImport.current = picked.parsed;
      setState({ phase: "confirming", parsed: picked.parsed });
    } catch (error) {
      logger.error("Import error:", error);
      errorSource.current = "import";
      setState({ phase: "error", message: "Unable to read the template file." });
    }
  }, []);

  const confirmImport = useCallback(async () => {
    const parsed = pendingImport.current;
    if (!parsed) return;
    setState({ phase: "importing" });
    try {
      const result = await applyTemplateImport(parsed.data);
      if (result.success) {
        setState({ phase: "imported", message: result.message });
      } else {
        errorSource.current = "import";
        setState({ phase: "error", message: result.message });
      }
    } catch (error) {
      logger.error("Import error:", error);
      errorSource.current = "import";
      setState({ phase: "error", message: "Failed to import template." });
    }
  }, []);

  const cancelImport = useCallback(() => {
    pendingImport.current = null;
    setState({ phase: "idle" });
  }, []);

  const dismissImport = useCallback(() => {
    pendingImport.current = null;
    setState({ phase: "idle" });
  }, []);

  const dismissError = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const retry = useCallback(() => {
    if (state.phase !== "error") return;
    if (errorSource.current === "import") {
      if (pendingImport.current) {
        void confirmImport();
      } else {
        void beginImport();
      }
    } else {
      void beginExport();
    }
  }, [state, confirmImport, beginImport, beginExport]);

  const busy = state.phase === "exporting" || state.phase === "parsing" || state.phase === "importing";

  return {
    state,
    busy,
    beginExport,
    beginImport,
    confirmImport,
    cancelImport,
    dismissExport,
    dismissImport,
    dismissError,
    shareExported,
    retry,
  };
}
