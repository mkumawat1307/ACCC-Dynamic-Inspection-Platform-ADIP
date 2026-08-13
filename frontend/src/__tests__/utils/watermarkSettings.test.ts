import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_WATERMARK_SETTINGS,
  WATERMARK_SETTINGS_STORAGE_KEY,
  loadWatermarkSettings,
  saveWatermarkSettings,
  normalizeWatermarkSettings,
} from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe("normalizeWatermarkSettings", () => {
  it("returns defaults for null/undefined", () => {
    expect(normalizeWatermarkSettings(null)).toEqual(DEFAULT_WATERMARK_SETTINGS);
    expect(normalizeWatermarkSettings(undefined)).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });
  it("falls back per-field for invalid values", () => {
    const out = normalizeWatermarkSettings({ size: "huge", opacity: "high", textColor: "pink" });
    expect(out.size).toBe(DEFAULT_WATERMARK_SETTINGS.size);
    expect(out.opacity).toBe(DEFAULT_WATERMARK_SETTINGS.opacity);
    expect(out.textColor).toBe(DEFAULT_WATERMARK_SETTINGS.textColor);
  });
  it("clamps opacity into 0.2..0.8", () => {
    expect(normalizeWatermarkSettings({ opacity: 0.1 }).opacity).toBe(0.2);
    expect(normalizeWatermarkSettings({ opacity: 0.99 }).opacity).toBe(0.8);
  });
  it("keeps valid overrides", () => {
    const out = normalizeWatermarkSettings({ size: "large", opacity: 0.65, dateFormat: "yyyy-MM-dd", timeFormat: "24h" });
    expect(out).toEqual(expect.objectContaining({ size: "large", opacity: 0.65, dateFormat: "yyyy-MM-dd", timeFormat: "24h" }));
  });
});

describe("loadWatermarkSettings", () => {
  it("returns defaults when nothing is stored", async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await loadWatermarkSettings()).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });
  it("parses and normalizes stored JSON", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ size: "small", opacity: 0.7 }));
    const s = await loadWatermarkSettings();
    expect(s.size).toBe("small");
    expect(s.opacity).toBe(0.7);
    expect(s.position).toBe(DEFAULT_WATERMARK_SETTINGS.position);
  });
  it("returns defaults on corrupt JSON", async () => {
    mockedGetItem.mockResolvedValue("not json{");
    expect(await loadWatermarkSettings()).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });
});

describe("saveWatermarkSettings", () => {
  it("persists normalized JSON under the storage key", async () => {
    await saveWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, size: "large", opacity: 0.99 });
    expect(mockedSetItem).toHaveBeenCalledWith(
      WATERMARK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_WATERMARK_SETTINGS, size: "large", opacity: 0.8 })
    );
  });
  it("does not throw when storage fails", async () => {
    mockedSetItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(saveWatermarkSettings(DEFAULT_WATERMARK_SETTINGS)).resolves.toBeUndefined();
  });
});
