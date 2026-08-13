import { NativeModules } from "react-native";

const ENCODER_MODULE = "WatermarkEncoder";

export interface WatermarkOverlayTimings {
  decodeOriginalMs?: number;
  decodeOverlayMs?: number;
  compositeMs?: number;
  jpegEncodeMs?: number;

  /** DEV-only composite diagnostics (present when the native build is a debug build). */
  overlayWidth?: number;
  overlayHeight?: number;
  overlayAlphaNonZero?: boolean;
  compositeApplied?: boolean;
  drawX?: number;
  drawY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface WatermarkEncoderNative {
  encodeJpeg(
    width: number,
    height: number,
    rgbaBase64: string,
    quality: number,
    outputPath: string
  ): Promise<void>;
  encodeOverlay(
    inputPath: string,
    overlayBase64: string,
    overlayX: number,
    overlayY: number,
    quality: number,
    outputPath: string
  ): Promise<void | WatermarkOverlayTimings>;
}

function getModule(): WatermarkEncoderNative | null {
  const mod = NativeModules[ENCODER_MODULE] as WatermarkEncoderNative | undefined;
  return mod && typeof mod.encodeJpeg === "function" ? mod : null;
}

export function hasNativeWatermarkEncoder(): boolean {
  return getModule() !== null;
}

export function hasNativeOverlayEncoder(): boolean {
  const mod = NativeModules[ENCODER_MODULE] as WatermarkEncoderNative | undefined;
  return !!mod && typeof mod.encodeOverlay === "function";
}

export async function encodeWatermarkJpeg(
  width: number,
  height: number,
  rgbaBase64: string,
  quality: number,
  outputPath: string
): Promise<void> {
  const mod = getModule();
  if (!mod) {
    throw new Error("WatermarkEncoder native module is not available");
  }
  await mod.encodeJpeg(width, height, rgbaBase64, quality, outputPath);
}

export async function encodeWatermarkOverlay(
  inputPath: string,
  overlayBase64: string,
  overlayX: number,
  overlayY: number,
  quality: number,
  outputPath: string
): Promise<WatermarkOverlayTimings | undefined> {
  const mod = getModule();
  if (!mod || typeof mod.encodeOverlay !== "function") {
    throw new Error("WatermarkEncoder overlay composite is not available");
  }
  const result = await mod.encodeOverlay(inputPath, overlayBase64, overlayX, overlayY, quality, outputPath);
  return typeof result === "object" && result !== null ? result : undefined;
}
