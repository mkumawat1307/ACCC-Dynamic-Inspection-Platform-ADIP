import { useEffect, useRef, useState } from "react";
import { formatAddressLines, haversineMeters, reverseGeocode } from "@/src/utils/geo";

export const ADDRESS_CACHE_RADIUS_M = 10;
export const RESOLVING_ADDRESS = "Resolving Address...";

interface CachedAddress {
  latitude: number;
  longitude: number;
  lines: string[];
  fullAddress: string;
}

export interface AddressLookup {
  lines: string[];
  fullAddress: string;
  getAddressFor(
    latitude: number,
    longitude: number
  ): CachedAddress | null;
  resolveAddress(latitude: number, longitude: number): Promise<string | null>;
}

function cacheHit(
  cache: CachedAddress | null,
  latitude: number,
  longitude: number
): CachedAddress | null {
  if (
    cache &&
    haversineMeters(cache.latitude, cache.longitude, latitude, longitude) <=
      ADDRESS_CACHE_RADIUS_M
  ) {
    return cache;
  }
  return null;
}

export function useAddressLookup(
  coords: { latitude: number; longitude: number } | null
): AddressLookup {
  const [lines, setLines] = useState<string[]>([]);
  const [fullAddress, setFullAddress] = useState<string>("");
  const cacheRef = useRef<CachedAddress | null>(null);

  useEffect(() => {
    if (!coords) {
      setLines([]);
      setFullAddress("");
      return;
    }
    const { latitude, longitude } = coords;
    const cached = cacheHit(cacheRef.current, latitude, longitude);
    if (cached) {
      setLines(cached.lines);
      setFullAddress(cached.fullAddress);
      return;
    }

    let cancelled = false;
    setLines([RESOLVING_ADDRESS]);
    setFullAddress("");
    reverseGeocode(latitude, longitude)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setLines([]);
          setFullAddress("");
          return;
        }
        const addrLines = formatAddressLines(result.address);
        if (addrLines.length === 0) {
          setLines([]);
          setFullAddress("");
          return;
        }
        cacheRef.current = { latitude, longitude, lines: addrLines, fullAddress: result.formatted };
        setLines(addrLines);
        setFullAddress(result.formatted);
      })
      .catch(() => {
        if (!cancelled) {
          setLines([]);
          setFullAddress("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  const getAddressFor = (latitude: number, longitude: number): CachedAddress | null =>
    cacheHit(cacheRef.current, latitude, longitude);

  const resolveAddress = async (
    latitude: number,
    longitude: number
  ): Promise<string | null> => {
    const cached = cacheHit(cacheRef.current, latitude, longitude);
    if (cached) return cached.fullAddress;
    const result = await reverseGeocode(latitude, longitude);
    if (!result) return null;
    const addrLines = formatAddressLines(result.address);
    if (addrLines.length === 0) return null;
    const entry: CachedAddress = {
      latitude,
      longitude,
      lines: addrLines,
      fullAddress: result.formatted,
    };
    cacheRef.current = entry;
    return entry.fullAddress;
  };

  return { lines, fullAddress, getAddressFor, resolveAddress };
}