import { NativeModules } from "react-native";

const ENCODER_MODULE = "WatermarkEncoder";

export interface WatermarkEncoderNative {
  encodeJpeg(
    width: number,
    height: number,
    rgbaBase64: string,
    quality: number,
    outputPath: string
  ): Promise<void>;
}

function getModule(): WatermarkEncoderNative | null {
  const mod = NativeModules[ENCODER_MODULE] as WatermarkEncoderNative | undefined;
  return mod && typeof mod.encodeJpeg === "function" ? mod : null;
}

export function hasNativeWatermarkEncoder(): boolean {
  return getModule() !== null;
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
