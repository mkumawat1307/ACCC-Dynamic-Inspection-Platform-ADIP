const Accuracy = {
  Low: 1,
  Balanced: 3,
  High: 5,
  Highest: 6,
};

let permissionStatus: PermissionResponse["status"] = "granted";
let mockCoords: { latitude: number; longitude: number } | null = null;

type PermissionResponse = {
  status: "granted" | "denied" | "undetermined";
  granted: boolean;
  expires: "never" | number;
  canAskAgain: boolean;
};

export { Accuracy };

export async function requestForegroundPermissionsAsync(): Promise<PermissionResponse> {
  return {
    status: permissionStatus,
    granted: permissionStatus === "granted",
    expires: "never",
    canAskAgain: true,
  };
}

export async function getCurrentPositionAsync(
  _options?: { accuracy?: number }
): Promise<{ coords: { latitude: number; longitude: number } }> {
  if (!mockCoords) {
    throw new Error("Location not available");
  }
  return { coords: mockCoords };
}

export function __setPermissionStatus(status: PermissionResponse["status"]) {
  permissionStatus = status;
}

export function __setMockLocation(latitude: number, longitude: number) {
  mockCoords = { latitude, longitude };
}

export function __resetLocationState() {
  permissionStatus = "granted";
  mockCoords = null;
}
