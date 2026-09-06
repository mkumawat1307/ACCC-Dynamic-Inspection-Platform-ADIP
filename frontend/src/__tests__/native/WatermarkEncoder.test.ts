import { NativeModules } from "react-native";
import {
  hasNativeWatermarkEncoder,
  encodeWatermarkJpeg,
  encodeWatermarkOverlay,
} from "@/src/native/WatermarkEncoder";

describe("WatermarkEncoder native bridge", () => {
  afterEach(() => {
    delete NativeModules.WatermarkEncoder;
  });

  it("reports absent when the module is not registered", () => {
    expect(hasNativeWatermarkEncoder()).toBe(false);
  });

  it("reports present when the module is registered with encodeJpeg", () => {
    NativeModules.WatermarkEncoder = { encodeJpeg: jest.fn() };
    expect(hasNativeWatermarkEncoder()).toBe(true);
  });

  it("reports absent when the module exists but lacks encodeJpeg", () => {
    NativeModules.WatermarkEncoder = {};
    expect(hasNativeWatermarkEncoder()).toBe(false);
  });

  it("throws when the native module is missing", async () => {
    await expect(
      encodeWatermarkJpeg(4000, 3000, "AA==", 95, "/tmp/out.jpg")
    ).rejects.toThrow("WatermarkEncoder native module is not available");
  });

  it("delegates width, height, rgba, quality and output path to the native module", async () => {
    const encodeJpeg = jest.fn().mockResolvedValue(undefined);
    NativeModules.WatermarkEncoder = { encodeJpeg };
    await encodeWatermarkJpeg(4000, 3000, "AA==", 95, "/tmp/out.jpg");
    expect(encodeJpeg).toHaveBeenCalledWith(4000, 3000, "AA==", 95, "/tmp/out.jpg");
  });

  it("propagates a native rejection to the caller", async () => {
    const encodeJpeg = jest.fn().mockRejectedValue(new Error("E_ENCODE_FAILED"));
    NativeModules.WatermarkEncoder = { encodeJpeg };
    await expect(encodeWatermarkJpeg(1, 1, "A", 95, "/tmp/o.jpg")).rejects.toThrow(
      "E_ENCODE_FAILED"
    );
  });

  it("surfaces native overlay stage timings as an object", async () => {
    const encodeOverlay = jest.fn().mockResolvedValue({
      decodeOriginalMs: 220,
      decodeOverlayMs: 8,
      compositeMs: 12,
      jpegEncodeMs: 410,
    });
    NativeModules.WatermarkEncoder = {
      encodeJpeg: jest.fn(),
      encodeOverlay,
    };
    const result = await encodeWatermarkOverlay(
      "/tmp/in.jpg",
      "PNG_B64",
      10,
      20,
      95,
      "/tmp/out.jpg"
    );
    expect(result).toEqual({
      decodeOriginalMs: 220,
      decodeOverlayMs: 8,
      compositeMs: 12,
      jpegEncodeMs: 410,
    });
    expect(encodeOverlay).toHaveBeenCalledWith(
      "/tmp/in.jpg",
      "PNG_B64",
      10,
      20,
      95,
      "/tmp/out.jpg"
    );
  });

  it("treats a boolean resolution as no timings", async () => {
    NativeModules.WatermarkEncoder = {
      encodeJpeg: jest.fn(),
      encodeOverlay: jest.fn().mockResolvedValue(true),
    };
    const result = await encodeWatermarkOverlay("/tmp/in.jpg", "PNG", 0, 0, 95, "/tmp/o.jpg");
    expect(result).toBeUndefined();
  });

  it("throws when the overlay composite is unavailable", async () => {
    NativeModules.WatermarkEncoder = { encodeJpeg: jest.fn() };
    await expect(
      encodeWatermarkOverlay("/tmp/in.jpg", "PNG", 0, 0, 95, "/tmp/o.jpg")
    ).rejects.toThrow("overlay composite is not available");
  });
});
