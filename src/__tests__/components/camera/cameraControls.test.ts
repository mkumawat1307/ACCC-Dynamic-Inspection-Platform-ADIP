import {
  clamp01,
  FACING_ICONS,
  FACING_LABELS,
  FLASH_ICONS,
  FLASH_LABELS,
  FLASH_ORDER,
  nextFacing,
  nextFlashMode,
  pinchZoomFromDistance,
  touchDistance,
} from "@/src/components/camera/cameraControls";

describe("cameraControls flash cycle", () => {
  it("cycles off -> auto -> on -> off", () => {
    expect(nextFlashMode("off")).toBe("auto");
    expect(nextFlashMode("auto")).toBe("on");
    expect(nextFlashMode("on")).toBe("off");
  });

  it("exposes icons and labels for every mode", () => {
    for (const mode of FLASH_ORDER) {
      expect(FLASH_ICONS[mode]).toBeTruthy();
      expect(FLASH_LABELS[mode]).toBeTruthy();
    }
  });
});

describe("cameraControls facing toggle", () => {
  it("toggles back -> front -> back", () => {
    expect(nextFacing("back")).toBe("front");
    expect(nextFacing("front")).toBe("back");
  });

  it("exposes icons and labels for every facing", () => {
    for (const facing of ["back", "front"] as const) {
      expect(FACING_ICONS[facing]).toBeTruthy();
      expect(FACING_LABELS[facing]).toBeTruthy();
    }
  });
});

describe("cameraControls pinch helpers", () => {
  it("clamps values to [0, 1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(1.5)).toBe(1);
  });

  it("returns startZoom when startDistance is zero", () => {
    expect(pinchZoomFromDistance(0.5, 0, 100)).toBe(0.5);
  });

  it("increases zoom when fingers spread", () => {
    const result = pinchZoomFromDistance(0.3, 100, 150);
    expect(result).toBeGreaterThan(0.3);
  });

  it("decreases zoom when fingers pinch closed", () => {
    const result = pinchZoomFromDistance(0.5, 100, 50);
    expect(result).toBeLessThan(0.5);
  });

  it("never exceeds [0, 1] bounds", () => {
    expect(pinchZoomFromDistance(0.9, 100, 300)).toBeLessThanOrEqual(1);
    expect(pinchZoomFromDistance(0.1, 100, 0)).toBeGreaterThanOrEqual(0);
  });

  it("touchDistance returns 0 for fewer than 2 touches", () => {
    expect(touchDistance([{ pageX: 0, pageY: 0 }])).toBe(0);
  });

  it("touchDistance computes Euclidean distance", () => {
    expect(touchDistance([{ pageX: 0, pageY: 0 }, { pageX: 3, pageY: 4 }])).toBe(5);
  });
});
