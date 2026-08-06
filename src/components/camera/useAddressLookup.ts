import { useEffect, useRef, useState } from "react";
import { formatAddressLines, haversineMeters, reverseGeocode } from "@/src/utils/geo";

export const ADDRESS_CACHE_RADIUS_M = 10;
export const RESOLVING_ADDRESS = "Resolving Address...";

interface CachedAddress {
  latitude: number;
  longitude: number;
  lines: string[];
}

export function useAddressLookup(
  coords: { latitude: number; longitude: number } | null
): string[] {
  const [lines, setLines] = useState<string[]>([]);
  const cacheRef = useRef<CachedAddress | null>(null);

  useEffect(() => {
    if (!coords) {
      setLines([]);
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
      return;
    }

    let cancelled = false;
    setLines([RESOLVING_ADDRESS]);
    reverseGeocode(latitude, longitude)
      .then((address) => {
        if (cancelled) return;
        const addrLines = formatAddressLines(address);
        if (addrLines.length === 0) {
          setLines([]);
          return;
        }
        cacheRef.current = { latitude, longitude, lines: addrLines };
        setLines(addrLines);
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  return lines;
}