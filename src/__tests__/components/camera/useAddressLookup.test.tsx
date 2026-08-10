import React, { useState } from "react";
import { Text } from "react-native";
import TestRenderer from "react-test-renderer";
import * as Location from "expo-location";
import {
  __resetLocationState,
  __setMockReverseGeocode,
} from "expo-location";
import {
  useAddressLookup,
  RESOLVING_ADDRESS,
} from "@/src/components/camera/useAddressLookup";

jest.mock("expo-location");

let lastLines: string[] | null = null;
let lastFullAddress: string = "";
let setDriverCoords: ((c: { latitude: number; longitude: number } | null) => void) | null = null;

function Driver({ coords }: { coords: { latitude: number; longitude: number } | null }) {
  const { lines, fullAddress } = useAddressLookup(coords);
  lastLines = lines;
  lastFullAddress = fullAddress;
  return <Text>{lastLines.join("|")}</Text>;
}

function DriverHost() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  setDriverCoords = setCoords;
  return <Driver coords={coords} />;
}

async function flush() {
  await TestRenderer.act(async () => {});
}

describe("useAddressLookup", () => {
  let tree: ReturnType<typeof TestRenderer.create> | null = null;

  beforeEach(() => {
    __resetLocationState();
    lastLines = null;
    lastFullAddress = "";
    setDriverCoords = null;
  });

  afterEach(async () => {
    await TestRenderer.act(async () => {
      tree?.unmount();
    });
    tree = null;
  });

  it("returns no address lines before GPS is fixed", async () => {
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    expect(lastLines).toEqual([]);
  });

  it("shows Resolving Address... then the resolved lines", async () => {
    __setMockReverseGeocode([
      { name: "Near Collector Office", district: "Alwar", city: "Alwar", region: "Rajasthan" },
    ]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 27.6, longitude: 75.15 });
    });
    await flush();
    expect(lastLines).toEqual(["Alwar", "Alwar Jaipur Division", "Rajasthan"]);
  });

  it("hides the address when geocoding fails (never shows errors)", async () => {
    __setMockReverseGeocode(null);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 27.6, longitude: 75.15 });
    });
    await flush();
    expect(lastLines).toEqual([]);
  });

  it("reuses the cached address within 10 m without a new geocode", async () => {
    const spy = jest.spyOn(Location, "reverseGeocodeAsync");
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(lastLines).toEqual(["Anytown", "CA"]);
    const callsAfterFirst = spy.mock.calls.length;

    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.00003, longitude: 0 });
    });
    await flush();
    expect(lastLines).toEqual(["Anytown", "CA"]);
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("re-geocodes after the device moves beyond 10 m", async () => {
    const spy = jest.spyOn(Location, "reverseGeocodeAsync");
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    const callsAfterFirst = spy.mock.calls.length;

    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.01, longitude: 0 });
    });
    await flush();
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    expect(lastLines).toEqual(["Anytown", "CA"]);
  });

  it("enters the resolving state again for a fresh location", async () => {
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(lastLines).toEqual(["Anytown", "CA"]);

    const pending = new Promise<never>(() => {});
    jest
      .spyOn(Location, "reverseGeocodeAsync")
      .mockImplementationOnce(() => pending as unknown as ReturnType<typeof Location.reverseGeocodeAsync>);
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 1, longitude: 1 });
    });
    await flush();
    expect(lastLines).toEqual([RESOLVING_ADDRESS]);
  });
});
