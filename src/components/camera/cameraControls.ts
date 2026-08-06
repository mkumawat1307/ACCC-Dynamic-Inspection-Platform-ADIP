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

export const ZOOM_MIN = 0;
export const ZOOM_MAX = 1;

export function clamp01(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

export function pinchZoomFromDistance(
  startZoom: number,
  startDistance: number,
  distance: number,
  sensitivity = 1.5
): number {
  if (startDistance <= 0) {
    return startZoom;
  }
  const delta = (distance / startDistance - 1) * sensitivity;
  return clamp01(startZoom + delta);
}

export function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) {
    return 0;
  }
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}
