import { NativeModules } from "react-native";
import {
  hasNativeWatermarkEncoder,
  encodeWatermarkJpeg,
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
});
