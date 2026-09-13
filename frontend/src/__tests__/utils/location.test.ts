jest.mock("expo-location");

import * as Location from "expo-location";
import type { LocationObject } from "expo-location";
import { __setPermissionStatus, __setMockLocation, __resetLocationState } from "expo-location";
import { LOCATION_TIMEOUT_MS } from "@/src/utils/location";

describe("getCurrentLocation", () => {
  beforeEach(() => {
    __resetLocationState();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("returns location when permission granted", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(34.05, -118.25);

    const { getCurrentLocation } = require("@/src/utils/location");
    const result = await getCurrentLocation();

    expect(result).toEqual({ latitude: 34.05, longitude: -118.25 });
  });

  it("returns null and alerts when permission denied", async () => {
    __setPermissionStatus("denied");

    const { getCurrentLocation } = require("@/src/utils/location");
    const result = await getCurrentLocation();

    expect(result).toBeNull();
    expect(global.alert).toHaveBeenCalledWith("Location permission is required.");
  });

  it("returns null and logs error when location fetch fails", async () => {
    __setPermissionStatus("granted");
    __setMockLocation(0, 0);

    jest.spyOn(Location, "getCurrentPositionAsync").mockRejectedValueOnce(new Error("GPS failed"));

    const { getCurrentLocation } = require("@/src/utils/location");
    const result = await getCurrentLocation();

    expect(result).toBeNull();
    expect(global.alert).toHaveBeenCalledWith("Unable to get current location.");
  });

  it("returns null and alerts when the location fetch times out", async () => {
    jest.useFakeTimers();
    __setPermissionStatus("granted");

    const neverSettles = () => new Promise<LocationObject>(() => {});
    jest.spyOn(Location, "getCurrentPositionAsync").mockImplementation(neverSettles);

    const { getCurrentLocation } = require("@/src/utils/location");
    const pending = getCurrentLocation();
    await jest.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS + 1);

    const result = await pending;
    expect(result).toBeNull();
    expect(global.alert).toHaveBeenCalledWith("Unable to get current location.");
  });
});
