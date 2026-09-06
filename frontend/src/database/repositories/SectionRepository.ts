import { getDatabase } from "../db";
import { isLockedSectionKey } from "../seeds/factory-config";

export interface SectionDeletionResult {
  deleted: boolean;
  reason: "ok" | "protected" | "not_found";
}

export class SectionDeletionError extends Error {
  readonly reason: "protected" | "not_found";
  constructor(reason: "protected" | "not_found", message: string) {
    super(message);
    this.name = "SectionDeletionError";
    this.reason = reason;
  }
}

export default class SectionRepository {
  /**
   * Soft-delete a section (IsActive = 0) so historical inspection data is
   * preserved. Locked sections (General Information, Remarks, Photos) are
   * protected and cannot be deleted. Other default sections can be deleted.
   * Returns true when deleted, false when the section does not exist.
   * Throws SectionDeletionError for protected or missing sections.
   */
  static async softDeleteSection(sectionId: number): Promise<void> {
    const db = await getDatabase();

    const section = await db.getFirstAsync<{ SectionID: number; SectionKey: string }>(
      `SELECT SectionID, SectionKey FROM InspectionSections WHERE SectionID = ?`,
      [sectionId]
    );

    if (!section) {
      throw new SectionDeletionError("not_found", "Section not found.");
    }

    if (isLockedSectionKey(section.SectionKey)) {
      throw new SectionDeletionError(
        "protected",
        "Locked sections cannot be deleted."
      );
    }

    await db.runAsync(
      `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionID = ?`,
      [sectionId]
    );
  }
}
