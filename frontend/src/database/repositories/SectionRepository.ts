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

  /**
   * Whether another active section already uses this name, compared
   * case-insensitively after trimming whitespace. Only used for duplicate
   * detection — stored values are never modified. Pass excludeSectionId when
   * editing so the section keeps its own name.
   */
  static async nameExists(name: string, excludeSectionId?: number): Promise<boolean> {
    const db = await getDatabase();
    let query = `SELECT SectionName FROM InspectionSections WHERE IsActive = 1`;
    const params: number[] = [];
    if (excludeSectionId !== undefined) {
      query += ` AND SectionID != ?`;
      params.push(excludeSectionId);
    }
    const rows = (await db.getAllAsync<{ SectionName: string }>(query, params)) ?? [];
    const target = name.trim().toLowerCase();
    return rows.some((r) => r.SectionName.trim().toLowerCase() === target);
  }

  /**
   * Whether another active section within the same template already uses this
   * key, compared case-insensitively after trimming whitespace. SectionKey
   * uniqueness is scoped per template — different templates may reuse the same
   * key. Pass excludeSectionId when editing so the section keeps its own key.
   */
  static async keyExists(
    key: string,
    templateId: number,
    excludeSectionId?: number
  ): Promise<boolean> {
    const db = await getDatabase();
    let query = `SELECT SectionKey FROM InspectionSections WHERE TemplateID = ? AND IsActive = 1`;
    const params: (number | string)[] = [templateId];
    if (excludeSectionId !== undefined) {
      query += ` AND SectionID != ?`;
      params.push(excludeSectionId);
    }
    const rows =
      (await db.getAllAsync<{ SectionKey: string }>(query, params)) ?? [];
    const target = key.trim().toLowerCase();
    return rows.some((r) => r.SectionKey.trim().toLowerCase() === target);
  }
}
