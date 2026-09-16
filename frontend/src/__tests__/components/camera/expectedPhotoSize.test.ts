import {
  parsePictureSize,
  pickExpectedPhotoSize,
  pickLimitedPhotoSize,
  alignCapturedSizeToContainer,
  MAX_CAPTURE_PIXELS,
} from "@/src/components/camera/expectedPhotoSize";

describe("parsePictureSize", () => {
  it("parses WxH dimensions", () => {
    expect(parsePictureSize("4000x3000")).toEqual({ width: 4000, height: 3000 });
  });

  it("trims surrounding whitespace", () => {
    expect(parsePictureSize("  1920x1080  ")).toEqual({ width: 1920, height: 1080 });
  });

  it("accepts an uppercase X separator", () => {
    expect(parsePictureSize("4000X3000")).toEqual({ width: 4000, height: 3000 });
  });

  it("returns null for a non-size string", () => {
    expect(parsePictureSize("abc")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parsePictureSize("")).toBeNull();
  });

  it("returns null when height is missing", () => {
    expect(parsePictureSize("4000")).toBeNull();
  });

  it("returns null when a dimension is zero", () => {
    expect(parsePictureSize("0x3000")).toBeNull();
  });
});

describe("pickExpectedPhotoSize", () => {
  it("picks the largest 4:3 candidate and rotates it for a portrait preview", () => {
    const sizes = ["1920x1080", "4000x3000", "1280x720"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toEqual({ width: 3000, height: 4000 });
  });

  it("keeps sensor orientation for a landscape preview", () => {
    const sizes = ["4000x3000", "1920x1080"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 520,
        previewHeight: 390,
        ratio: "4:3",
      })
    ).toEqual({ width: 4000, height: 3000 });
  });

  it("picks the largest 16:9 candidate", () => {
    const sizes = ["4000x3000", "1920x1080", "1280x720"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "16:9",
      })
    ).toEqual({ width: 1080, height: 1920 });
  });

  it("handles a 1:1 ratio without rotation mismatch", () => {
    const sizes = ["4000x3000", "3000x3000"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "1:1",
      })
    ).toEqual({ width: 3000, height: 3000 });
  });

  it("returns null when no candidate matches the ratio", () => {
    const sizes = ["1920x1080", "1280x720"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toBeNull();
  });

  it("returns null when the size list is empty", () => {
    expect(
      pickExpectedPhotoSize([], {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toBeNull();
  });

  it("returns null when the ratio is unparseable", () => {
    const sizes = ["4000x3000"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3:2",
      })
    ).toBeNull();
  });

  it("skips malformed entries and still picks a valid one", () => {
    const sizes = ["garbage", "4000x3000", "no-separator"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toEqual({ width: 3000, height: 4000 });
  });

  it("returns null when every entry is malformed", () => {
    const sizes = ["garbage", "no-separator"];
    expect(
      pickExpectedPhotoSize(sizes, {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toBeNull();
  });

  it("returns null when no size is provided", () => {
    expect(
      pickExpectedPhotoSize(undefined as unknown as string[], {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toBeNull();
  });
});

describe("pickLimitedPhotoSize", () => {
  it("caps at ~12 MP when a larger high-MP size is available", () => {
    const sizes = ["8000x6000", "4000x3000", "3264x2448", "1920x1440"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 4000, height: 3000 });
  });

  it("selects the largest 4:3 size at or below ~12 MP when no exact 12 MP size exists", () => {
    const sizes = ["7568x5676", "8000x6000", "3264x2448", "1920x1440"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 3264, height: 2448 });
  });

  it("keeps the maximum size on a low-MP device", () => {
    const sizes = ["3264x2448", "1920x1440", "1600x1200"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 3264, height: 2448 });
  });

  it("matches the active ratio when multiple aspect ratios are supported", () => {
    const sizes = ["8000x6000", "4000x3000", "3840x2160", "1920x1080"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 520, previewHeight: 390, ratio: "16:9" })
    ).toEqual({ width: 3840, height: 2160 });
  });

  it("does not select a 4:3 size when a suitable 16:9 size exists", () => {
    const sizes = ["4000x3000", "3000x3000", "3840x2160", "1280x720"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 520, previewHeight: 390, ratio: "16:9" })
    ).toEqual({ width: 3840, height: 2160 });
  });

  it("selects a suitable 1:1 size when available", () => {
    const sizes = ["4000x3000", "3000x3000", "2000x2000"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "1:1" })
    ).toEqual({ width: 3000, height: 3000 });
  });

  it("falls back to a device-supported size when every matching size exceeds ~12 MP", () => {
    const sizes = ["8000x6000", "9216x6912"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 9216, height: 6912 });
  });

  it("returns null for an empty list", () => {
    expect(
      pickLimitedPhotoSize([], { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toBeNull();
  });

  it("returns null when no size list is provided", () => {
    expect(
      pickLimitedPhotoSize(undefined as unknown as string[], {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toBeNull();
  });

  it("returns null for an entirely malformed list without crashing", () => {
    expect(
      pickLimitedPhotoSize(["garbage", "no-separator"], {
        previewWidth: 390,
        previewHeight: 520,
        ratio: "4:3",
      })
    ).toBeNull();
  });

  it("returns null when no candidate matches the active ratio", () => {
    const sizes = ["3840x2160", "1920x1080"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toBeNull();
  });

  it("recalculates for a front-camera size list that differs from the back camera", () => {
    const backSizes = ["8000x6000", "4000x3000", "1920x1440"];
    const frontSizes = ["3264x2448", "1920x1440", "1280x960"];
    expect(
      pickLimitedPhotoSize(backSizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 4000, height: 3000 });
    expect(
      pickLimitedPhotoSize(frontSizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 3264, height: 2448 });
  });

  it("returns a different size after a facing change instead of reusing the stale back-camera size", () => {
    const staleBackSize = pickLimitedPhotoSize(
      ["8000x6000", "4000x3000"],
      { previewWidth: 390, previewHeight: 520, ratio: "4:3" }
    );
    const frontSize = pickLimitedPhotoSize(
      ["1920x1440", "1280x960"],
      { previewWidth: 390, previewHeight: 520, ratio: "4:3" }
    );
    expect(staleBackSize).toEqual({ width: 4000, height: 3000 });
    expect(frontSize).toEqual({ width: 1920, height: 1440 });
    expect(frontSize).not.toEqual(staleBackSize);
  });

  it("respects the ~12 MP cap on a 64 MP device", () => {
    const sizes = ["9216x6912", "4608x3456", "4000x3000", "3264x2448"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 4000, height: 3000 });
  });

  it("respects the ~12 MP cap on a 108 MP device", () => {
    const sizes = ["12000x9000", "8064x6048", "4000x3000", "3264x2448"];
    expect(
      pickLimitedPhotoSize(sizes, { previewWidth: 390, previewHeight: 520, ratio: "4:3" })
    ).toEqual({ width: 4000, height: 3000 });
  });

  it("honors an explicit maxPixels override", () => {
    const sizes = ["4000x3000", "3264x2448", "1920x1440"];
    expect(
      pickLimitedPhotoSize(
        sizes,
        { previewWidth: 390, previewHeight: 520, ratio: "4:3" },
        8_000_000
      )
    ).toEqual({ width: 3264, height: 2448 });
    expect(MAX_CAPTURE_PIXELS).toBe(12_000_000);
  });
});

describe("alignCapturedSizeToContainer", () => {
  it("keeps portrait capture dims in a portrait container unchanged", () => {
    expect(
      alignCapturedSizeToContainer(
        { width: 3024, height: 4032 },
        { width: 375, height: 500 }
      )
    ).toEqual({ width: 3024, height: 4032 });
  });

  it("keeps landscape capture dims in a landscape container unchanged", () => {
    expect(
      alignCapturedSizeToContainer(
        { width: 4032, height: 3024 },
        { width: 500, height: 375 }
      )
    ).toEqual({ width: 4032, height: 3024 });
  });

  it("swaps landscape capture dims in a portrait container", () => {
    expect(
      alignCapturedSizeToContainer(
        { width: 4032, height: 3024 },
        { width: 375, height: 500 }
      )
    ).toEqual({ width: 3024, height: 4032 });
  });

  it("swaps portrait capture dims in a landscape container", () => {
    expect(
      alignCapturedSizeToContainer(
        { width: 3024, height: 4032 },
        { width: 500, height: 375 }
      )
    ).toEqual({ width: 4032, height: 3024 });
  });
});
