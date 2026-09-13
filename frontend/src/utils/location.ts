import * as Location from "expo-location";

import { logger } from "@/src/utils/logger";
export interface CurrentLocation {
  latitude: number;
  longitude: number;
}

export const LOCATION_TIMEOUT_MS = 20000;

export async function getCurrentLocation(): Promise<CurrentLocation | null> {
  try {
    const { status } =
      await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      alert("Location permission is required.");
      return null;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        new Promise<null>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Location request timed out")),
            LOCATION_TIMEOUT_MS
          );
        }),
      ]);

      if (!location) return null;

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (error) {
    logger.error("Location Error:", error);
    alert("Unable to get current location.");
    return null;
  }
}
