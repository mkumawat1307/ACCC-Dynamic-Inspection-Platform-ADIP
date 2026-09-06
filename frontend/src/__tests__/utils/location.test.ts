jest.mock("expo-location");

import * as Location from "expo-location";
import { __setPermissionStatus, __setMockLocation, __resetLocationState } from "expo-location";

describe("getCurrentLocation", () => {
  beforeEach(() => {
    __resetLocationState();
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
});
