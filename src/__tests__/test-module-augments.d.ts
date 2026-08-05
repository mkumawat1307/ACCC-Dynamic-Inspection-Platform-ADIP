export {};

declare module "expo-location" {
  export function __setPermissionStatus(status: "granted" | "denied" | "undetermined"): void;
  export function __setMockLocation(latitude: number, longitude: number, accuracy?: number): void;
  export function __setMockLastKnown(
    latitude: number,
    longitude: number,
    accuracy?: number,
    ageMs?: number
  ): void;
  export function __emitWatchLocation(latitude: number, longitude: number, accuracy?: number): void;
  export function __resetLocationState(): void;
  export function __setMockReverseGeocode(
    addresses: Array<{ street?: string; city?: string; region?: string }> | null
  ): void;
}

declare module "expo-document-picker" {
  export function __setMockResult(result: { canceled: boolean; assets?: { uri: string; name?: string; size?: number }[] }): void;
  export function __resetPickerState(): void;
}
