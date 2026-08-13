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

export function useAddressLookup(
  coords: { latitude: number; longitude: number } | null
): { lines: string[]; fullAddress: string } {
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
    const cached = cacheRef.current;
    if (
      cached &&
      haversineMeters(cached.latitude, cached.longitude, latitude, longitude) <=
        ADDRESS_CACHE_RADIUS_M
    ) {
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

  return { lines, fullAddress };
}