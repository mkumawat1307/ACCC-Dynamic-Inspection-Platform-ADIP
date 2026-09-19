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
  ADDRESS_REVERSE_GEOCODE_REFRESH_M,
} from "@/src/components/camera/useAddressLookup";

jest.mock("expo-location");

let lastLines: string[] | null = null;
let setDriverCoords: ((c: { latitude: number; longitude: number } | null) => void) | null = null;

function Driver({ coords }: { coords: { latitude: number; longitude: number } | null }) {
  const { lines } = useAddressLookup(coords);
  lastLines = lines;
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
    expect(lastLines).toEqual(["Alwar", "Rajasthan"]);
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
    expect(lastLines).toEqual(["Main St", "Anytown, CA"]);
    const callsAfterFirst = spy.mock.calls.length;

    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.00003, longitude: 0 });
    });
    await flush();
    expect(lastLines).toEqual(["Main St", "Anytown, CA"]);
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
    expect(lastLines).toEqual(["Main St", "Anytown, CA"]);
  });

  it("reverse-geocode refresh threshold constant is set to 50 m", () => {
    expect(ADDRESS_REVERSE_GEOCODE_REFRESH_M).toBe(50);
  });

  it("reverse-geocodes immediately on the first usable GPS fix (no 50 m wait)", async () => {
    const spy = jest.spyOn(Location, "reverseGeocodeAsync");
    spy.mockClear();
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    expect(spy).not.toHaveBeenCalled();
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastLines).toEqual(["Main St", "Anytown, CA"]);
  });

  it("does not trigger reverse geocoding for ~30 m of movement within the 50 m threshold", async () => {
    const spy = jest.spyOn(Location, "reverseGeocodeAsync");
    spy.mockClear();
    __setMockReverseGeocode([{ street: "A", region: "R" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    const callsAfterFirst = spy.mock.calls.length;

    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.0003, longitude: 0 });
    });
    await flush();
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
    expect(lastLines).toEqual(["A", "R"]);
  });

  it("does not reverse-geocode across multiple ~10 m GPS steps that stay within the 50 m threshold", async () => {
    const spy = jest.spyOn(Location, "reverseGeocodeAsync");
    spy.mockClear();
    __setMockReverseGeocode([{ street: "A", region: "R" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    const callsAfterFirst = spy.mock.calls.length;

    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.0001, longitude: 0 });
    });
    await flush();
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.0002, longitude: 0 });
    });
    await flush();
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.0003, longitude: 0 });
    });
    await flush();
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
    expect(lastLines).toEqual(["A", "R"]);
  });

  it("triggers reverse geocoding when movement exceeds the 50 m refresh threshold", async () => {
    const spy = jest.spyOn(Location, "reverseGeocodeAsync");
    spy.mockClear();
    __setMockReverseGeocode([{ street: "A", region: "R" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    const callsAfterFirst = spy.mock.calls.length;

    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0.001, longitude: 0 });
    });
    await flush();
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    expect(lastLines).toEqual(["A", "R"]);
  });

  it("enters the resolving state for a fresh location beyond the 50 m threshold", async () => {
    __setMockReverseGeocode([{ street: "Main St", city: "Anytown", region: "CA" }]);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(lastLines).toEqual(["Main St", "Anytown, CA"]);

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

  it("reverse geocoding failure does not block useAddressLookup (returns no lines silently)", async () => {
    __setMockReverseGeocode(null);
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<DriverHost />);
    });
    await TestRenderer.act(async () => {
      setDriverCoords!({ latitude: 0, longitude: 0 });
    });
    await flush();
    expect(lastLines).toEqual([]);
  });
});

