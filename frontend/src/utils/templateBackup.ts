import { logger } from "@/src/utils/logger";
import { downloadStorage } from "@/src/utils/downloadStorage";
import {
  applyTemplateImport,
  buildTemplateExportData,
  ParsedTemplateFile,
  pickAndParseTemplate,
} from "@/src/utils/templateData";

export interface TemplateBackupResult {
  ok: boolean;
  message: string;
}

export function templateBackupFileName(projectLabel: string): string {
  return `${projectLabel}_templates_backup.json`;
}

export async function backupTemplatesToFile(
  projectLabel: string
): Promise<TemplateBackupResult> {
  logger.info("[TemplateBackup] start");
  try {
    const built = await buildTemplateExportData();
    if (!built) {
      return { ok: false, message: "No template found to back up." };
    }
    await downloadStorage.ensureFolder(projectLabel);
    const json = JSON.stringify(built.data, null, 2);
    const fileName = templateBackupFileName(projectLabel);
    await downloadStorage.writeUtf8(projectLabel, fileName, "application/json", json);
    logger.info("[TemplateBackup] success");
    return { ok: true, message: "Template backup saved." };
  } catch (e) {
    logger.error("[TemplateBackup] failed=" + String(e));
    return { ok: false, message: String(e) };
  }
}

export type TemplateRestoreStep =
  | { status: "canceled" }
  | { status: "error"; message: string }
  | { status: "confirm"; parsed: ParsedTemplateFile };

export async function restoreTemplatesFromFile(): Promise<TemplateRestoreStep> {
  logger.info("[TemplateRestore] start");
  try {
    const picked = await pickAndParseTemplate();
    if (picked.status === "canceled") return { status: "canceled" };
    if (picked.status === "error") {
      logger.info("[TemplateRestore] failed=" + picked.message);
      return { status: "error", message: picked.message };
    }
    return { status: "confirm", parsed: picked.parsed };
  } catch (e) {
    logger.info("[TemplateRestore] failed=" + String(e));
    return { status: "error", message: String(e) };
  }
}

export async function applyTemplateRestore(
  parsed: ParsedTemplateFile
): Promise<TemplateBackupResult> {
  try {
    const result = await applyTemplateImport(parsed.data);
    if (result.success) {
      logger.info("[TemplateRestore] success");
      return { ok: true, message: result.message };
    }
    logger.info("[TemplateRestore] failed=" + result.message);
    return { ok: false, message: result.message };
  } catch (e) {
    logger.info("[TemplateRestore] failed=" + String(e));
    return { ok: false, message: String(e) };
  }
}
