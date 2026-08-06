import {
  composeWatermarkLines,
  gpsAccuracyCategory,
  formatGpsAccuracyLine,
  gpsPillText,
  GPS_CATEGORY_COLORS,
} from "@/src/utils/watermarkLayout";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const base = {
  siteId: "SIK/001",
  district: "Sikar",
  block: "Sikar-01",
  timestampIso: "2026-08-05T18:02:00",
  latitude: 27.608123,
  longitude: 75.151703,
  accuracyM: 12,
  addressLines: ["Police Lines", "Sikar"],
  settings: DEFAULT_WATERMARK_SETTINGS,
};

describe("composeWatermarkLines", () => {
  it("composes SiteID / District-Block / Date / LatLng / Accuracy / Address in order", () => {
    expect(composeWatermarkLines(base)).toEqual([
      "SIK/001",
      "Sikar, Sikar-01",
      "05-Aug-2026 06:02 PM",
      "27.608123N 75.151703E",
      "Accuracy : ±12 m",
      "Police Lines",
      "Sikar",
    ]);
  });

  it("omits empty district or block segments", () => {
    expect(composeWatermarkLines({ ...base, district: "", block: "B1" })[1]).toBe("B1");
  });

  it("falls back to NA when district and block are both empty", () => {
    expect(composeWatermarkLines({ ...base, district: "", block: "" })[1]).toBe("NA");
  });

  it("uses 24h and dd/MM/yyyy when configured", () => {
    expect(
      composeWatermarkLines({
        ...base,
        settings: {
          ...DEFAULT_WATERMARK_SETTINGS,
          dateFormat: "dd/MM/yyyy",
          timeFormat: "24h",
        },
      })
    ).toEqual([
      "SIK/001",
      "Sikar, Sikar-01",
      "05/08/2026 18:02",
      "27.608123N 75.151703E",
      "Accuracy : ±12 m",
      "Police Lines",
      "Sikar",
    ]);
  });

  it("omits accuracy when showGpsAccuracy is false", () => {
    const lines = composeWatermarkLines({
      ...base,
      settings: { ...DEFAULT_WATERMARK_SETTINGS, showGpsAccuracy: false },
    });
    expect(lines).not.toContain("Accuracy : ±12 m");
  });

  it("omits accuracy when accuracyM is null", () => {
    const lines = composeWatermarkLines({ ...base, accuracyM: null });
    expect(lines).not.toContain("Accuracy : ±12 m");
  });

  it("omits address lines when showAddress is false", () => {
    const lines = composeWatermarkLines({
      ...base,
      settings: { ...DEFAULT_WATERMARK_SETTINGS, showAddress: false },
    });
    expect(lines).not.toContain("Police Lines");
  });

  it("shows the acquiring placeholder when coords are null", () => {
    const lines = composeWatermarkLines({
      ...base,
      latitude: null,
      longitude: null,
      accuracyM: null,
    });
    expect(lines).toEqual([
      "SIK/001",
      "Sikar, Sikar-01",
      "05-Aug-2026 06:02 PM",
      "Acquiring GPS…",
    ]);
  });
});

describe("gpsAccuracyCategory", () => {
  it("is high ≤15, medium ≤30, low >30", () => {
    expect(gpsAccuracyCategory(15)).toBe("high");
    expect(gpsAccuracyCategory(16)).toBe("medium");
    expect(gpsAccuracyCategory(30)).toBe("medium");
    expect(gpsAccuracyCategory(31)).toBe("low");
  });
});

describe("GPS_CATEGORY_COLORS", () => {
  it("maps accuracy categories to spec colors", () => {
    expect(GPS_CATEGORY_COLORS).toEqual({
      high: "#76FF03",
      medium: "#FFEB3B",
      low: "#FF5252",
    });
  });
});

describe("formatGpsAccuracyLine", () => {
  it("formats rounded accuracy", () => {
    expect(formatGpsAccuracyLine(12.4)).toBe("Accuracy : ±12 m");
    expect(formatGpsAccuracyLine(12.6)).toBe("Accuracy : ±13 m");
  });
});

describe("gpsPillText", () => {
  it("shows high accuracy for fixed with accuracy ≤15m", () => {
    expect(gpsPillText("fixed", 12)).toBe("🟢 High Accuracy");
  });

  it("shows medium accuracy for fixed with accuracy 16–30m", () => {
    expect(gpsPillText("fixed", 20)).toBe("🟡 Medium Accuracy");
  });

  it("shows low accuracy for fixed with accuracy >30m", () => {
    expect(gpsPillText("fixed", 50)).toBe("🔴 Low Accuracy");
  });

  it("defaults to high accuracy when fixed but accuracy unknown", () => {
    expect(gpsPillText("fixed", null)).toBe("🟢 High Accuracy");
  });

  it("shows denied and acquiring states", () => {
    expect(gpsPillText("denied", null)).toBe("GPS denied");
    expect(gpsPillText("acquiring", null)).toBe("Acquiring GPS…");
  });
});
