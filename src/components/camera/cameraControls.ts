import type { CameraType, FlashMode } from "expo-camera";

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

export const FACING_ICONS: Record<CameraType, string> = {
  back: "camera-rear-variant",
  front: "camera-front-variant",
};

export const FACING_LABELS: Record<CameraType, string> = {
  back: "Rear Camera",
  front: "Front Camera",
};

export function nextFacing(facing: CameraType): CameraType {
  return facing === "back" ? "front" : "back";
}
