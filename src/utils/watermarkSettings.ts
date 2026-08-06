import AsyncStorage from "@react-native-async-storage/async-storage";

import { logger } from "@/src/utils/logger";

export type WatermarkSize = "small" | "medium" | "large";
export type WatermarkPosition = "bottomLeft" | "bottomRight";
export type WatermarkTextColor = "green" | "white" | "yellow";
export type WatermarkDateFormat = "dd-MMM-yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
export type WatermarkTimeFormat = "12h" | "24h";

export interface WatermarkSettings {
  size: WatermarkSize;
  position: WatermarkPosition;
  opacity: number;
  textColor: WatermarkTextColor;
  showGpsAccuracy: boolean;
  showAddress: boolean;
  dateFormat: WatermarkDateFormat;
  timeFormat: WatermarkTimeFormat;
}

export const WATERMARK_SETTINGS_STORAGE_KEY = "accc_watermark_settings_v1";
export const WATERMARK_OPACITY_MIN = 0.2;
export const WATERMARK_OPACITY_MAX = 0.8;

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  size: "medium",
  position: "bottomLeft",
  opacity: 0.5,
  textColor: "green",
  showGpsAccuracy: true,
  showAddress: true,
  dateFormat: "dd-MMM-yyyy",
  timeFormat: "12h",
};

const SIZES: readonly WatermarkSize[] = ["small", "medium", "large"];
const POSITIONS: readonly WatermarkPosition[] = ["bottomLeft", "bottomRight"];
const TEXT_COLORS: readonly WatermarkTextColor[] = ["green", "white", "yellow"];
const DATE_FORMATS: readonly WatermarkDateFormat[] = ["dd-MMM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd"];
const TIME_FORMATS: readonly WatermarkTimeFormat[] = ["12h", "24h"];

function isEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function normalizeWatermarkSettings(v: unknown): WatermarkSettings {
  const raw = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const opacity =
    typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
      ? Math.min(WATERMARK_OPACITY_MAX, Math.max(WATERMARK_OPACITY_MIN, raw.opacity))
      : DEFAULT_WATERMARK_SETTINGS.opacity;
  return {
    size: isEnum(raw.size, SIZES) ? raw.size : DEFAULT_WATERMARK_SETTINGS.size,
    position: isEnum(raw.position, POSITIONS) ? raw.position : DEFAULT_WATERMARK_SETTINGS.position,
    opacity,
    textColor: isEnum(raw.textColor, TEXT_COLORS) ? raw.textColor : DEFAULT_WATERMARK_SETTINGS.textColor,
    showGpsAccuracy:
      typeof raw.showGpsAccuracy === "boolean" ? raw.showGpsAccuracy : DEFAULT_WATERMARK_SETTINGS.showGpsAccuracy,
    showAddress: typeof raw.showAddress === "boolean" ? raw.showAddress : DEFAULT_WATERMARK_SETTINGS.showAddress,
    dateFormat: isEnum(raw.dateFormat, DATE_FORMATS) ? raw.dateFormat : DEFAULT_WATERMARK_SETTINGS.dateFormat,
    timeFormat: isEnum(raw.timeFormat, TIME_FORMATS) ? raw.timeFormat : DEFAULT_WATERMARK_SETTINGS.timeFormat,
  };
}

export async function loadWatermarkSettings(): Promise<WatermarkSettings> {
  try {
    const stored = await AsyncStorage.getItem(WATERMARK_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_WATERMARK_SETTINGS };
    }
    return normalizeWatermarkSettings(JSON.parse(stored));
  } catch (e) {
    logger.warn("[WatermarkSettings] failed to load, using defaults:", e);
    return { ...DEFAULT_WATERMARK_SETTINGS };
  }
}

export async function saveWatermarkSettings(s: WatermarkSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(
      WATERMARK_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeWatermarkSettings(s))
    );
  } catch (e) {
    logger.warn("[WatermarkSettings] failed to save:", e);
  }
}
