import type { FlashMode } from "expo-camera";

export const FLASH_ORDER: readonly FlashMode[] = ["off", "auto", "on"];

export const FLASH_ICONS: Record<FlashMode, string> = {
  off: "flash-off",
  auto: "flash-auto",
  on: "flash-on",
};

export const FLASH_LABELS: Record<FlashMode, string> = {
  off: "Flash Off",
  auto: "Flash Auto",
  on: "Flash On",
};

export function nextFlashMode(mode: FlashMode): FlashMode {
  const idx = FLASH_ORDER.indexOf(mode);
  return FLASH_ORDER[(idx + 1) % FLASH_ORDER.length];
}
