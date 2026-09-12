import { requireOptionalNativeModule } from "expo-modules-core";

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
  ): Promise<void | Record<string, number | boolean> | null>;
}

let nativeModule: WatermarkEncoderNative | null = null;
const mod = requireOptionalNativeModule<WatermarkEncoderNative>("WatermarkEncoder");
if (mod && typeof mod === "object" && typeof mod.encodeJpeg === "function") {
  nativeModule = mod;
}

export function getWatermarkEncoderNative(): WatermarkEncoderNative | null {
  return nativeModule;
}