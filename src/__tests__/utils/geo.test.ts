jest.mock("expo-location");

import * as Location from "expo-location";
import { __setMockReverseGeocode, __resetLocationState } from "expo-location";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    const { haversineMeters } = require("@/src/utils/geo");
    expect(haversineMeters(12.34, 56.78, 12.34, 56.78)).toBe(0);
  });

  it("approximates 1 degree of latitude (~111 km)", () => {
    const { haversineMeters } = require("@/src/utils/geo");
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  it("computes a large cross-hemisphere distance", () => {
    const { haversineMeters } = require("@/src/utils/geo");
    const d = haversineMeters(34.05, -118.25, -33.87, 151.21);
    expect(d).toBeGreaterThan(10000000);
    expect(d).toBeLessThan(15000000);
  });
});

describe("isLocationFresh", () => {
  it("returns true while within the staleness window", () => {
    const { isLocationFresh } = require("@/src/utils/geo");
    expect(isLocationFresh(1000, 60000, 60000)).toBe(true);
  });

  it("returns false at/after the staleness boundary", () => {
    const { isLocationFresh } = require("@/src/utils/geo");
    expect(isLocationFresh(0, 60000, 60000)).toBe(false);
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => {
    __resetLocationState();
  });

  it("returns null when no results are available", async () => {
    __setMockReverseGeocode(null);
    const { reverseGeocode } = require("@/src/utils/geo");
    expect(await reverseGeocode(1, 2)).toBeNull();
  });

  it("builds a label from address parts", async () => {
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    const { reverseGeocode } = require("@/src/utils/geo");
    const res = await reverseGeocode(1, 2);
    expect(res?.label).toBe("Main St, Anytown, CA");
  });

  it("returns null when geocoding throws (offline)", async () => {
    __setMockReverseGeocode(null);
    jest.spyOn(Location, "reverseGeocodeAsync").mockRejectedValueOnce(new Error("offline"));
    const { reverseGeocode } = require("@/src/utils/geo");
    expect(await reverseGeocode(1, 2)).toBeNull();
  });
});
