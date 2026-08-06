import { FLASH_ICONS, FLASH_LABELS, FLASH_ORDER, nextFlashMode } from "@/src/components/camera/cameraControls";

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
