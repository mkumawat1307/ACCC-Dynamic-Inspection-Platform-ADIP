import {
  composeWatermarkLines,
  gpsAccuracyCategory,
  formatGpsAccuracyLine,
  gpsPillText,
  gpsPillTextNew,
  GPS_CATEGORY_COLORS,
} from "@/src/utils/watermarkLayout";
import { DEFAULT_WATERMARK_SETTINGS } from "@/src/utils/watermarkSettings";
import { getGpsQuality } from "@/src/utils/gpsQuality";

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
  it("composes SiteID / District-Block / Date / LatLng / Address in order", () => {
    expect(composeWatermarkLines(base)).toEqual([
      "SIK/001",
      "Sikar, Sikar-01",
      "05-Aug-2026 06:02 PM",
      "27.608123N 75.151703E",
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

  it("appends the selected address components as separate lines", () => {
    const lines = composeWatermarkLines({
      ...base,
      addressLines: ["323, sabalpura", "Sikar, Rajasthan"],
    });
    expect(lines.slice(4)).toEqual(["323, sabalpura", "Sikar, Rajasthan"]);
  });

  it("preserves every component of a long address with no truncation (wrapping is the renderer's job)", () => {
    const addressLines = [
      "House 12, Station Road, Police Lines",
      "Sikar, Rajasthan",
    ];
    const lines = composeWatermarkLines({ ...base, addressLines });
    expect(lines.slice(4)).toEqual(addressLines);
    expect(lines.join("\n")).toContain("House 12");
    expect(lines.join("\n")).toContain("Rajasthan");
  });

  it("adds no address line when addressLines is empty", () => {
    const lines = composeWatermarkLines({ ...base, addressLines: [] });
    expect(lines).toEqual([
      "SIK/001",
      "Sikar, Sikar-01",
      "05-Aug-2026 06:02 PM",
      "27.608123N 75.151703E",
    ]);
  });
});

describe("gpsAccuracyCategory", () => {
  it("is high ≤20, medium ≤50, low >50", () => {
    expect(gpsAccuracyCategory(20)).toBe("high");
    expect(gpsAccuracyCategory(20.1)).toBe("medium");
    expect(gpsAccuracyCategory(50)).toBe("medium");
    expect(gpsAccuracyCategory(50.1)).toBe("low");
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
  it("shows high accuracy for fixed with accuracy ≤20m", () => {
    expect(gpsPillText("fixed", 12)).toBe("🟢 High Accuracy");
  });

  it("shows medium accuracy for fixed with accuracy 21–50m", () => {
    expect(gpsPillText("fixed", 20.1)).toBe("🟡 Medium Accuracy");
    expect(gpsPillText("fixed", 50)).toBe("🟡 Medium Accuracy");
  });

  it("shows low accuracy for fixed with accuracy >50m", () => {
    expect(gpsPillText("fixed", 50.1)).toBe("🔴 Low Accuracy");
  });

  it("defaults to high accuracy when fixed but accuracy unknown", () => {
    expect(gpsPillText("fixed", null)).toBe("🟢 High Accuracy");
  });

  it("shows denied and acquiring states", () => {
    expect(gpsPillText("denied", null)).toBe("GPS denied");
    expect(gpsPillText("acquiring", null)).toBe("Acquiring GPS…");
  });

  it("returns the refreshing indicator when refreshing is true", () => {
    expect(gpsPillText("fixed", 10, true)).toBe("⏳ Refreshing GPS…");
  });

  it("defaults refreshing to false and preserves accuracy text", () => {
    expect(gpsPillText("fixed", 10)).toBe("🟢 High Accuracy");
  });

  it("ignores accuracy while refreshing even for low accuracy", () => {
    expect(gpsPillText("fixed", 99, true)).toBe("⏳ Refreshing GPS…");
  });
});

describe("gpsPillTextNew (camera GPS pill display)", () => {
  it("shows High Accuracy with green emoji and rounded accuracy for <=20m", () => {
    // Math.round rounds to nearest integer (0.5 rounds up)
    expect(gpsPillTextNew("fixed", 0)).toBe("🟢 High Accuracy ±0 m");
    expect(gpsPillTextNew("fixed", 10)).toBe("🟢 High Accuracy ±10 m");
    expect(gpsPillTextNew("fixed", 20)).toBe("🟢 High Accuracy ±20 m");
    // Requirement examples: 7.59→High Accuracy ±8 m, 13.2→High Accuracy ±13 m, 15.61→High Accuracy ±16 m
    expect(gpsPillTextNew("fixed", 7.59)).toBe("🟢 High Accuracy ±8 m");
    expect(gpsPillTextNew("fixed", 13.2)).toBe("🟢 High Accuracy ±13 m");
    expect(gpsPillTextNew("fixed", 15.61)).toBe("🟢 High Accuracy ±16 m");
  });

  it("shows Medium Accuracy with orange emoji and rounded accuracy for >20m and <=50m", () => {
    // Math.round(20.1)=20, Math.round(32.62)=33, Math.round(47.1)=47, Math.round(50)=50
    expect(gpsPillTextNew("fixed", 20.1)).toBe("🟠 Medium Accuracy ±20 m");
    expect(gpsPillTextNew("fixed", 32.62)).toBe("🟠 Medium Accuracy ±33 m");
    expect(gpsPillTextNew("fixed", 47)).toBe("🟠 Medium Accuracy ±47 m");
    expect(gpsPillTextNew("fixed", 47.1)).toBe("🟠 Medium Accuracy ±47 m");
    expect(gpsPillTextNew("fixed", 50)).toBe("🟠 Medium Accuracy ±50 m");
  });

  it("shows Low Accuracy with red emoji and rounded accuracy for >50m", () => {
    // Math.round(50.1)=50, Math.round(52.39)=52, Math.round(73.06)=73,
    // Math.round(99.7)=100, Math.round(100)=100
    expect(gpsPillTextNew("fixed", 50.1)).toBe("🔴 Low Accuracy ±50 m");
    expect(gpsPillTextNew("fixed", 52.39)).toBe("🔴 Low Accuracy ±52 m");
    expect(gpsPillTextNew("fixed", 73.06)).toBe("🔴 Low Accuracy ±73 m");
    expect(gpsPillTextNew("fixed", 99.7)).toBe("🔴 Low Accuracy ±100 m");
    expect(gpsPillTextNew("fixed", 100)).toBe("🔴 Low Accuracy ±100 m");
  });

  it("shows No GPS when accuracy is null/negative/NaN", () => {
    expect(gpsPillTextNew("fixed", null)).toBe("⚪ No GPS");
    expect(gpsPillTextNew("fixed", -1)).toBe("⚪ No GPS");
    expect(gpsPillTextNew("fixed", NaN)).toBe("⚪ No GPS");
  });

  it("honors an explicit quality override", () => {
    expect(gpsPillTextNew("fixed", null, false, getGpsQuality(null))).toBe("⚪ No GPS");
    expect(gpsPillTextNew("fixed", 100, false, getGpsQuality(100))).toBe("🔴 Low Accuracy ±100 m");
  });

  it("returns the refreshing indicator while refreshing", () => {
    expect(gpsPillTextNew("fixed", 99, true)).toBe("⏳ Refreshing GPS…");
  });

  it("keeps the stale/denied/acquiring lifecycle states", () => {
    expect(gpsPillTextNew("stale", 30)).toBe("🟠 Stale GPS – tap to refresh");
    expect(gpsPillTextNew("denied", null)).toBe("GPS denied");
    expect(gpsPillTextNew("acquiring", null)).toBe("Acquiring GPS…");
  });

  it("shows the red GPS Poor prompt when status is poor", () => {
    expect(gpsPillTextNew("poor", null)).toBe("🔴 GPS Poor — Refresh GPS");
  });
});
