import { getActiveProjectPath, getDatabase } from "@/src/database/db";
import InspectionValueRepository from "@/src/database/repositories/InspectionValueRepository";
import { logger } from "@/src/utils/logger";

export async function saveLocationAddress(
  inspectionId: number,
  fullAddress: string
): Promise<void> {
  const startDbPath = getActiveProjectPath();
  if (startDbPath === null) {
    logger.warn("[Capture] No active project DB; skipping address save.");
    return;
  }
  const db = await getDatabase();
  const locationField = await db.getFirstAsync<{ FieldID: number }>(
    `SELECT FieldID FROM InspectionFields WHERE FieldKey = ? AND IsActive = 1`,
    ["location"]
  );
  if (!locationField) {
    logger.warn("[Capture] Location field not found in InspectionFields");
    return;
  }
  if (getActiveProjectPath() !== startDbPath) {
    logger.warn("[Capture] Project DB changed during address save; skipping", {
      inspectionId,
      active: getActiveProjectPath(),
      expected: startDbPath,
    });
    return;
  }
  await InspectionValueRepository.saveValue(inspectionId, locationField.FieldID, fullAddress);
}