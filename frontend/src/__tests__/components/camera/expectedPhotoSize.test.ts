import {
  parsePictureSize,
  pickExpectedPhotoSize,
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
