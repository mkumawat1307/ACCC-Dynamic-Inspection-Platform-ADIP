const Accuracy = {
  Low: 1,
  Balanced: 3,
  High: 5,
  Highest: 6,
};

let permissionStatus: "granted" | "denied" | "undetermined" = "granted";
let mockCoords: {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
} | null = null;
let mockLastKnown: {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
} | null = null;
type MockAddress = {
  city?: string | null;
  district?: string | null;
  streetNumber?: string | null;
  street?: string | null;
  region?: string | null;
  subregion?: string | null;
  country?: string | null;
  postalCode?: string | null;
  name?: string | null;
};

let mockAddresses: MockAddress[] | null = null;
let watchCallback: ((loc: unknown) => void) | null = null;

function now(): number {
  return Date.now();
}

export { Accuracy };

export async function requestForegroundPermissionsAsync(): Promise<{
  status: "granted" | "denied" | "undetermined";
  granted: boolean;
  expires: "never" | number;
  canAskAgain: boolean;
}> {
  return {
    status: permissionStatus,
    granted: permissionStatus === "granted",
    expires: "never",
    canAskAgain: true,
  };
}

export async function getCurrentPositionAsync(
  _options?: { accuracy?: number }
): Promise<{
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}> {
  if (!mockCoords) {
    throw new Error("Location not available");
  }
  return { coords: { ...mockCoords }, timestamp: mockCoords.timestamp };
}

export async function getLastKnownPositionAsync(): Promise<{
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
} | null> {
  return mockLastKnown
    ? { coords: { ...mockLastKnown }, timestamp: mockLastKnown.timestamp }
    : null;
}

export async function watchPositionAsync(
  _options: unknown,
  callback: (loc: unknown) => void
): Promise<{ remove: () => void }> {
  watchCallback = callback;
  return {
    remove: () => {
      watchCallback = null;
    },
  };
}

export async function reverseGeocodeAsync(
  _coords: unknown
): Promise<MockAddress[] | null> {
  return mockAddresses;
}

export function __setPermissionStatus(status: "granted" | "denied" | "undetermined") {
  permissionStatus = status;
}

export function __setMockLocation(latitude: number, longitude: number, accuracy = 0) {
  mockCoords = { latitude, longitude, accuracy, timestamp: now() };
}

export function __setMockLastKnown(
  latitude: number,
  longitude: number,
  accuracy = 0,
  ageMs = 0
) {
  mockLastKnown = { latitude, longitude, accuracy, timestamp: now() - ageMs };
}

export function __setMockReverseGeocode(addresses: MockAddress[] | null) {
  mockAddresses = addresses;
}

export function __emitWatchLocation(
  latitude: number,
  longitude: number,
  accuracy = 0
) {
  if (watchCallback) {
    watchCallback({
      coords: { latitude, longitude, accuracy, timestamp: now() },
      timestamp: now(),
    });
  }
}

export function __resetLocationState() {
  permissionStatus = "granted";
  mockCoords = null;
  mockLastKnown = null;
  mockAddresses = null;
  watchCallback = null;
}
