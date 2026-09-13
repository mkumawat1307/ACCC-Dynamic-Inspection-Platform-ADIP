import { Photo } from "@/src/models/Photo";
import type { WatermarkDateFormat, WatermarkTimeFormat } from "@/src/utils/watermarkSettings";

export type WatermarkState = "pending" | "processing" | "completed" | "failed";

export function normalizePhotoStateScope(projectDbPath?: string | null): string {
  return (projectDbPath ?? "").replace(/^file:\/\//, "");
}

export function makePhotoStateKey(
  projectDbPath: string | null | undefined,
  photoId: number
): string {
  return `${normalizePhotoStateScope(projectDbPath)}::${photoId}`;
}

export function extractProjectPhotoStates(
  projectDbPath: string | null | undefined,
  allStates: Record<string, WatermarkState>
): Record<number, WatermarkState> {
  const prefix = `${normalizePhotoStateScope(projectDbPath)}::`;
  const result: Record<number, WatermarkState> = {};
  for (const [key, state] of Object.entries(allStates)) {
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    result[Number(suffix)] = state;
  }
  return result;
}

export function uniqueFileNameSuffix(): string {
  return Math.floor(Math.random() * 0xffffff).toString(36).padStart(6, "0");
}

export type PhotoSaveBlockReason =
  | "no_photos"
  | "processing"
  | "pending"
  | "failed"
  | "unprocessed";

export interface PhotoSaveValidation {
  canSave: boolean;
  reason: PhotoSaveBlockReason | null;
}

export function validatePhotosForSave(
  photos: Photo[],
  states: Record<number, WatermarkState>
): PhotoSaveValidation {
  if (photos.length === 0) {
    return { canSave: false, reason: "no_photos" };
  }

  for (const photo of photos) {
    const state = photo.PhotoID != null ? states[photo.PhotoID] : undefined;

    if (state === "processing") return { canSave: false, reason: "processing" };
    if (state === "pending") return { canSave: false, reason: "pending" };
    if (state === "failed") return { canSave: false, reason: "failed" };

    const isProcessed =
      state === "completed" ||
      (state === undefined && (photo.FilePath ?? "").startsWith("content://"));

    if (!isProcessed) return { canSave: false, reason: "unprocessed" };
  }

  return { canSave: true, reason: null };
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLocation(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "No GPS";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function getFileUri(filePath: string): string {
  if (!filePath) return "";
  if (filePath.startsWith("file://")) return filePath;
  if (filePath.startsWith("/")) return `file://${filePath}`;
  return filePath;
}

export function formatDatePart(iso: string, dateFormat: WatermarkDateFormat): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  if (dateFormat === "dd/MM/yyyy") {
    return `${day}/${month}/${d.getFullYear()}`;
  }
  if (dateFormat === "yyyy-MM-dd") {
    return `${d.getFullYear()}-${month}-${day}`;
  }
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function formatTimePart(iso: string, timeFormat: WatermarkTimeFormat): string {
  const d = new Date(iso);
  const min = d.getMinutes().toString().padStart(2, "0");
  if (timeFormat === "24h") {
    const hh = d.getHours().toString().padStart(2, "0");
    return `${hh}:${min}`;
  }
  const h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = (h % 12 || 12).toString().padStart(2, "0");
  return `${h12}:${min} ${ampm}`;
}

export function formatWatermarkDate(
  iso: string,
  dateFormat: WatermarkDateFormat = "dd-MMM-yyyy",
  timeFormat: WatermarkTimeFormat = "12h"
): string {
  return `${formatDatePart(iso, dateFormat)} ${formatTimePart(iso, timeFormat)}`;
}

export function formatLatLngWM(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(6)}${latDir} ${Math.abs(lng).toFixed(6)}${lngDir}`;
}

export function generateFileName(
  district: string,
  blockName: string,
  pole: string,
  timestamp: string
): string {
  const d = new Date(timestamp);
  const day = d.getDate().toString().padStart(2, "0");
  const monthNames = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear().toString();
  const time =
    d.getHours().toString().padStart(2, "0") +
    d.getMinutes().toString().padStart(2, "0") +
    d.getSeconds().toString().padStart(2, "0");

  const cleanDistrict = (district || "NA")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 20);
  const cleanBlock = (blockName || "NA")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 20);
  const cleanPole = (pole || "NA")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 20);

  return `${cleanDistrict}_${cleanBlock}_${cleanPole}_${day}${month}${year}_${time}_${uniqueFileNameSuffix()}.jpg`;
}

export function cleanPoleToken(pole: string): string {
  return (pole || "NA").replace(/[^a-zA-Z0-9]/g, "").substring(0, 20);
}

export type PoleIdChangeDecision =
  | { type: "blocked" }
  | { type: "direct-save" }
  | { type: "dialog"; photoCount: number };

export function decidePoleIdChange(
  photos: Photo[],
  states: Record<number, WatermarkState>
): PoleIdChangeDecision {
  for (const photo of photos) {
    const state = photo.PhotoID != null ? states[photo.PhotoID] : undefined;
    if (state === "pending" || state === "processing" || state === "failed") {
      return { type: "blocked" };
    }
  }

  if (photos.length === 0) {
    return { type: "direct-save" };
  }

  return { type: "dialog", photoCount: photos.length };
}

export function renamePoleTokenInFileName(
  fileName: string,
  oldPoleId: string,
  newPoleId: string
): string | null {
  const oldToken = cleanPoleToken(oldPoleId);
  if (!oldToken || oldToken === "NA") return null;
  const parts = fileName.split("_");
  const index = parts.findIndex((part) => part === oldToken);
  if (index === -1) return null;
  const newToken = cleanPoleToken(newPoleId) || "NA";
  parts[index] = newToken;
  return parts.join("_");
}

export interface InspectionIdentity {
  district: string;
  block: string;
  poleId: string;
}

export function renameIdentityInFileName(
  fileName: string,
  oldDistrict: string,
  oldBlock: string,
  oldPoleId: string,
  newDistrict: string,
  newBlock: string,
  newPoleId: string
): string | null {
  const parts = fileName.split("_");
  if (parts.length < 3) return null;

  const oldTokens = [
    cleanPoleToken(oldDistrict),
    cleanPoleToken(oldBlock),
    cleanPoleToken(oldPoleId),
  ];

  for (let i = 0; i < 3; i++) {
    if (parts[i] !== oldTokens[i]) return null;
  }

  parts[0] = cleanPoleToken(newDistrict) || "NA";
  parts[1] = cleanPoleToken(newBlock) || "NA";
  parts[2] = cleanPoleToken(newPoleId) || "NA";
  return parts.join("_");
}
