import {
  isFixUsable,
  isFixStale,
  needsGpsRefresh,
  GpsFix,
} from "@/src/components/camera/gpsPolicy";
import {
  MAX_GPS_ACCURACY_M,
  GPS_STALE_MS,
  GPS_REFRESH_AGE_MS,
  GPS_ACCURACY_REFRESH_M,
} from "@/src/components/camera/captureConfig";

describe("gpsPolicy", () => {
  const baseFix: GpsFix = {
    latitude: 34.05,
    longitude: -118.25,
    accuracyM: 10,
    timestamp: 1000,
  };

  describe("isFixUsable", () => {
    it("returns false for null", () => {
      expect(isFixUsable(null, 2000)).toBe(false);
    });

    it("accepts an accurate fix inside the stale window", () => {
      expect(isFixUsable(baseFix, 2000)).toBe(true);
    });

    it("rejects a fix whose accuracy is above the threshold", () => {
      const bad = { ...baseFix, accuracyM: MAX_GPS_ACCURACY_M + 1 };
      expect(isFixUsable(bad, 2000)).toBe(false);
    });

    it("accepts a fix exactly at the accuracy threshold", () => {
      const edge = { ...baseFix, accuracyM: MAX_GPS_ACCURACY_M };
      expect(isFixUsable(edge, 2000)).toBe(true);
    });

    it("rejects a fix at the exact stale boundary (strict)", () => {
      const old = { ...baseFix, timestamp: 1000 - GPS_STALE_MS };
      expect(isFixUsable(old, 1000)).toBe(false);
    });

    it("accepts a fix just inside the stale window", () => {
      const near = { ...baseFix, timestamp: 1000 - (GPS_STALE_MS - 1) };
      expect(isFixUsable(near, 1000)).toBe(true);
    });

    it("defaults nowMs to Date.now()", () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(1000);
        expect(isFixUsable(baseFix)).toBe(true);
        const old = { ...baseFix, timestamp: 0 };
        jest.setSystemTime(1000 + GPS_STALE_MS);
        expect(isFixUsable(old)).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("isFixStale", () => {
    it("returns false for null", () => {
      expect(isFixStale(null, 2000)).toBe(false);
    });

    it("returns false while the fix is usable", () => {
      expect(isFixStale(baseFix, 2000)).toBe(false);
    });

    it("returns true when the fix has aged past the stale window", () => {
      const old = { ...baseFix, timestamp: 0 };
      expect(isFixStale(old, 1000 + GPS_STALE_MS)).toBe(true);
    });

    it("returns true when accuracy is above the threshold", () => {
      const bad = { ...baseFix, accuracyM: MAX_GPS_ACCURACY_M + 1 };
      expect(isFixStale(bad, 2000)).toBe(true);
    });
  });

  describe("needsGpsRefresh", () => {
    it("returns false for null", () => {
      expect(needsGpsRefresh(null, 10000)).toBe(false);
    });

    it("returns false for a young, accurate fix", () => {
      const young = { ...baseFix, timestamp: GPS_REFRESH_AGE_MS - 1 };
      expect(needsGpsRefresh(young, GPS_REFRESH_AGE_MS)).toBe(false);
    });

    it("returns true once the fix reaches the refresh age", () => {
      const aged = { ...baseFix, timestamp: 0 };
      expect(needsGpsRefresh(aged, GPS_REFRESH_AGE_MS)).toBe(true);
    });

    it("returns true when accuracy is above the refresh threshold", () => {
      const goodAgeBadAccuracy = {
        ...baseFix,
        accuracyM: GPS_ACCURACY_REFRESH_M + 1,
        timestamp: 0,
      };
      expect(needsGpsRefresh(goodAgeBadAccuracy, 1)).toBe(true);
    });

    it("does not refresh purely on accuracy while it is exactly at the threshold", () => {
      const edge = {
        ...baseFix,
        accuracyM: GPS_ACCURACY_REFRESH_M,
        timestamp: 0,
      };
      expect(needsGpsRefresh(edge, 1)).toBe(false);
    });
  });
});