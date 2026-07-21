import * as Location from "expo-location";

export interface CurrentLocation {
  latitude: number;
  longitude: number;
}

export async function getCurrentLocation(): Promise<CurrentLocation | null> {
  try {
    const { status } =
      await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      alert("Location permission is required.");
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error("Location Error:", error);
    alert("Unable to get current location.");
    return null;
  }
}