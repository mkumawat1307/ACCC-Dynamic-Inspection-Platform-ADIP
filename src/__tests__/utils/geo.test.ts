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

  it("returns the raw geocoded address object", async () => {
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    const { reverseGeocode } = require("@/src/utils/geo");
    const res = await reverseGeocode(1, 2);
    expect(res).toEqual({ street: "Main St", city: "Anytown", region: "CA" });
  });

  it("returns null when geocoding throws (offline)", async () => {
    __setMockReverseGeocode(null);
    jest.spyOn(Location, "reverseGeocodeAsync").mockRejectedValueOnce(new Error("offline"));
    const { reverseGeocode } = require("@/src/utils/geo");
    expect(await reverseGeocode(1, 2)).toBeNull();
  });
});

describe("truncateAddressLine", () => {
  const { truncateAddressLine, MAX_ADDRESS_LINE_LENGTH } = require("@/src/utils/geo");

  it("keeps short lines unchanged", () => {
    expect(truncateAddressLine("  Station Road  ")).toBe("Station Road");
  });

  it("truncates long lines with an ellipsis", () => {
    const long = "x".repeat(MAX_ADDRESS_LINE_LENGTH + 10);
    const out = truncateAddressLine(long);
    expect(out.length).toBe(MAX_ADDRESS_LINE_LENGTH);
    expect(out.endsWith("...")).toBe(true);
  });
});

describe("formatAddressLines", () => {
  const { formatAddressLines } = require("@/src/utils/geo");

  it("returns [] for a null address", () => {
    expect(formatAddressLines(null)).toEqual([]);
  });

  it("builds landmark and city lines without repeating the place name", () => {
    const addr = {
      name: "Near Collector Office",
      district: "Alwar",
      city: "Alwar",
      region: "Rajasthan",
      postalCode: "301001",
      country: "India",
    };
    expect(formatAddressLines(addr)).toEqual(["Near Collector Office", "Alwar"]);
  });

  it("prefers the narrower district over the broader subregion", () => {
    const out = formatAddressLines({
      name: "Ward 3 Market",
      subregion: "Sikar",
      district: "Gopalpura",
      city: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Ward 3 Market", "Gopalpura", "Sikar"]);
  });

  it("shows the state only when no city exists", () => {
    const out = formatAddressLines({
      name: "Farm Road",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Farm Road", "Rajasthan"]);
  });

  it("does not include country or postal code", () => {
    const out = formatAddressLines({
      street: "Station Rd",
      city: "Jaipur",
      region: "Rajasthan",
      postalCode: "302001",
      country: "India",
    });
    expect(out.join(" ")).not.toContain("India");
    expect(out.join(" ")).not.toContain("302001");
  });

  it("combines street number and street into the road line", () => {
    const out = formatAddressLines({
      streetNumber: "21",
      street: "Park Street",
      region: "West Bengal",
    });
    expect(out[0]).toBe("21 Park Street");
  });

  it("includes the subregion (block) when available even alongside a city", () => {
    const out = formatAddressLines({
      name: "Pole 42",
      city: "Shyamgarh",
      subregion: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Pole 42", "Shyamgarh", "Sikar"]);
  });

  it("dedupes a subregion that repeats the city name", () => {
    const out = formatAddressLines({
      name: "Main Bazaar",
      city: "Sikar",
      subregion: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Main Bazaar", "Sikar"]);
  });

  it("drops a bare Plus Code used as the name", () => {
    const out = formatAddressLines({
      name: "J552+GM9",
      street: "Police Lines",
      city: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Police Lines", "Sikar"]);
  });

  it("drops a Plus Code token embedded at the start of a name", () => {
    const out = formatAddressLines({
      name: "j552+gm9 police lines",
      city: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["police lines", "Sikar"]);
  });

  it("drops a Division from the subregion (broader than district)", () => {
    const out = formatAddressLines({
      name: "Police Lines",
      city: "Sikar",
      subregion: "Jaipur Division",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Police Lines", "Sikar"]);
  });

  it("caps the number of emitted lines at three", () => {
    const out = formatAddressLines({
      name: "A",
      subregion: "B",
      district: "C",
      city: "D",
      region: "E",
    });
    expect(out.length).toBe(3);
  });
});
