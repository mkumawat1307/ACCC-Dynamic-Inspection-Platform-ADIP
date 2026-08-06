import {
  FACING_ICONS,
  FACING_LABELS,
  FLASH_ICONS,
  FLASH_LABELS,
  FLASH_ORDER,
  nextFacing,
  nextFlashMode,
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
