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

  it.skip("returns null when no results are available", async () => {
    __setMockReverseGeocode(null);
    const { reverseGeocode } = require("@/src/utils/geo");
    expect(await reverseGeocode(1, 2)).toBeNull();
  });

  it("returns FullAddress with address and formatted string", async () => {
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    const { reverseGeocode } = require("@/src/utils/geo");
    const res = await reverseGeocode(1, 2);
    expect(res).not.toBeNull();
    expect(res?.address).toEqual({ street: "Main St", city: "Anytown", region: "CA" });
    expect(res?.formatted).toContain("Main St");
    expect(res?.formatted).toContain("Anytown");
    expect(res?.formatted).toContain("CA");
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

  it("groups area, city into line 1 and state postalCode into line 2", () => {
    const out = formatAddressLines({
      district: "Doliyoh Ka Bass",
      subregion: "Sikar",
      region: "Rajasthan",
      postalCode: "332001",
    });
    expect(out).toEqual(["Doliyoh Ka Bass, Sikar", "Rajasthan 332001"]);
  });

  it("prefers the sub-locality (village) over the landmark name", () => {
    const out = formatAddressLines({
      name: "Near Collector Office",
      district: "Alwar",
      city: "Alwar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Alwar", "Rajasthan"]);
  });

  it("falls back to the landmark name when no sub-locality exists", () => {
    const out = formatAddressLines({
      name: "Near Collector Office",
      subregion: "Alwar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Near Collector Office, Alwar", "Rajasthan"]);
  });

  it("uses the district alone when no area/city exists", () => {
    const out = formatAddressLines({
      subregion: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Sikar", "Rajasthan"]);
  });

  it("omits any division for a non-Rajasthan district", () => {
    const out = formatAddressLines({
      name: "Park View",
      subregion: "Hooghly",
      region: "West Bengal",
    });
    expect(out).toEqual(["Park View, Hooghly", "West Bengal"]);
  });

  it("shows the state only when no other parts exist", () => {
    const out = formatAddressLines({
      name: "Farm Road",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Farm Road", "Rajasthan"]);
  });

  it("returns only the state when nothing else is available", () => {
    expect(formatAddressLines({ region: "Rajasthan" })).toEqual(["Rajasthan"]);
  });

  it("includes postal code in the address but not the country", () => {
    const out = formatAddressLines({
      city: "Jaipur",
      region: "Rajasthan",
      postalCode: "302001",
      country: "India",
    });
    expect(out.join(" ")).not.toContain("India");
    expect(out.join(" ")).toContain("302001");
  });

  it("dedupes a city that repeats the district or division", () => {
    const out = formatAddressLines({
      name: "Main Bazaar",
      city: "Sikar",
      subregion: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Main Bazaar, Sikar", "Rajasthan"]);
  });

  it("drops a bare Plus Code used as the locality", () => {
    const out = formatAddressLines({
      name: "J552+GM9",
      subregion: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Sikar", "Rajasthan"]);
  });

  it("strips a Plus Code token embedded in the locality", () => {
    const out = formatAddressLines({
      name: "j552+gm9 police lines",
      subregion: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["police lines, Sikar", "Rajasthan"]);
  });

  it("removes administrative division tokens from the area/city line", () => {
    const out = formatAddressLines({
      name: "Police Lines",
      subregion: "Sikar",
      city: "Sikar",
      region: "Rajasthan",
    });
    expect(out).toEqual(["Police Lines, Sikar", "Rajasthan"]);
  });

  it("returns [] when no usable parts exist", () => {
    expect(formatAddressLines({})).toEqual([]);
  });
});
