//frontend\src\hooks\useInspectionProgress.ts
import { useEffect, useState } from "react";
import {
  InspectionProgress,
  InspectionProgressService,
} from "@/src/database/repositories/InspectionProgressService";
import { logger } from "@/src/utils/logger";

/**
 * Loads inspection progress for the current inspection. `refreshKey` is bumped
 * by the screen whenever inspection data changes (via onDataChanged), so the
 * value recomputes from the underlying data without polling or timers.
 */
export default function useInspectionProgress(
  inspectionId: number | null,
  templateId: number | undefined,
  refreshKey: number
): InspectionProgress | null {
  const [progress, setProgress] = useState<InspectionProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    InspectionProgressService.getInspectionProgress(inspectionId, templateId)
      .then((result) => {
        if (!cancelled) setProgress(result);
      })
      .catch((error) => {
        logger.error("[InspectionProgress] load failed:", error);
        if (!cancelled) setProgress(null);
      });

    return () => {
      cancelled = true;
    };
  }, [inspectionId, templateId, refreshKey]);

  return progress;
}