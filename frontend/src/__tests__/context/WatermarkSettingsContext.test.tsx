import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WatermarkSettingsProvider, useWatermarkSettings } from "@/src/context/WatermarkSettingsContext";
import { DEFAULT_WATERMARK_SETTINGS, WATERMARK_SETTINGS_STORAGE_KEY } from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

let captured: ReturnType<typeof useWatermarkSettings> | null = null;
function Probe() {
  captured = useWatermarkSettings();
  return null;
}

describe("WatermarkSettingsProvider", () => {
  beforeEach(() => {
    mockedGetItem.mockReset();
    mockedSetItem.mockReset();
    captured = null;
  });

  it("loads persisted settings and marks ready", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ size: "large" }));
    await act(async () => { TestRenderer.create(<WatermarkSettingsProvider><Probe /></WatermarkSettingsProvider>); });
    expect(captured!.ready).toBe(true);
    expect(captured!.settings.size).toBe("large");
  });

  it("defaults to DEFAULT_WATERMARK_SETTINGS when nothing stored", async () => {
    mockedGetItem.mockResolvedValue(null);
    await act(async () => { TestRenderer.create(<WatermarkSettingsProvider><Probe /></WatermarkSettingsProvider>); });
    expect(captured!.ready).toBe(true);
    expect(captured!.settings).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });

  it("setSetting updates state and persists", async () => {
    mockedGetItem.mockResolvedValue(null);
    await act(async () => { TestRenderer.create(<WatermarkSettingsProvider><Probe /></WatermarkSettingsProvider>); });
    await act(async () => { captured!.setSetting("position", "bottomRight"); });
    expect(captured!.settings.position).toBe("bottomRight");
    expect(mockedSetItem).toHaveBeenCalledWith(
      WATERMARK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_WATERMARK_SETTINGS, position: "bottomRight" })
    );
  });
});
