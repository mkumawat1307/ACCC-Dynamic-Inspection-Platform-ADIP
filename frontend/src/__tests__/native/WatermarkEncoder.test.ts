import {
  hasNativeWatermarkEncoder,
  encodeWatermarkJpeg,
  encodeWatermarkOverlay,
} from "@/src/native/WatermarkEncoder";

const globals = globalThis as { expo?: { modules?: Record<string, unknown> } };

function setEncoder(encoder?: Record<string, unknown>) {
  if (!globals.expo) {
    globals.expo = { modules: {} };
  }
  if (!globals.expo.modules) {
    globals.expo.modules = {};
  }
  if (encoder === undefined) {
    delete globals.expo.modules.WatermarkEncoder;
  } else {
    globals.expo.modules.WatermarkEncoder = encoder;
  }
}

describe("WatermarkEncoder native bridge", () => {
  afterEach(() => {
    delete globals.expo;
  });

  it("reports absent when the module is not registered", () => {
    setEncoder();
    expect(hasNativeWatermarkEncoder()).toBe(false);
  });

  it("reports present when the module is registered with encodeJpeg", () => {
    setEncoder({ encodeJpeg: jest.fn() });
    expect(hasNativeWatermarkEncoder()).toBe(true);
  });

  it("reports absent when the module exists but lacks encodeJpeg", () => {
    setEncoder({});
    expect(hasNativeWatermarkEncoder()).toBe(false);
  });

  it("throws when the native module is missing", async () => {
    setEncoder();
    await expect(
      encodeWatermarkJpeg(4000, 3000, "AA==", 95, "/tmp/out.jpg")
    ).rejects.toThrow("WatermarkEncoder native module is not available");
  });

  it("delegates width, height, rgba, quality and output path to the native module", async () => {
    const encodeJpeg = jest.fn().mockResolvedValue(undefined);
    setEncoder({ encodeJpeg });
    await encodeWatermarkJpeg(4000, 3000, "AA==", 95, "/tmp/out.jpg");
    expect(encodeJpeg).toHaveBeenCalledWith(4000, 3000, "AA==", 95, "/tmp/out.jpg");
  });

  it("propagates a native rejection to the caller", async () => {
    const encodeJpeg = jest.fn().mockRejectedValue(new Error("E_ENCODE_FAILED"));
    setEncoder({ encodeJpeg });
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
    setEncoder({
      encodeJpeg: jest.fn(),
      encodeOverlay,
    });
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
    setEncoder({
      encodeJpeg: jest.fn(),
      encodeOverlay: jest.fn().mockResolvedValue(true),
    });
    const result = await encodeWatermarkOverlay("/tmp/in.jpg", "PNG", 0, 0, 95, "/tmp/o.jpg");
    expect(result).toBeUndefined();
  });

  it("throws when the overlay composite is unavailable", async () => {
    setEncoder({ encodeJpeg: jest.fn() });
    await expect(
      encodeWatermarkOverlay("/tmp/in.jpg", "PNG", 0, 0, 95, "/tmp/o.jpg")
    ).rejects.toThrow("overlay composite is not available");
  });
});