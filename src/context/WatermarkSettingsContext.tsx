import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_WATERMARK_SETTINGS,
  WatermarkSettings,
  loadWatermarkSettings,
  saveWatermarkSettings,
} from "@/src/utils/watermarkSettings";

interface WatermarkSettingsContextType {
  settings: WatermarkSettings;
  ready: boolean;
  setSetting: <K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) => void;
}

const WatermarkSettingsContext = createContext<WatermarkSettingsContextType | undefined>(
  undefined
);

export function WatermarkSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<WatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadWatermarkSettings().then((loaded) => {
      if (cancelled) {
        return;
      }
      setSettings(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSetting = useCallback(
    <K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        void saveWatermarkSettings(next);
        return next;
      });
    },
    []
  );

  const value = useMemo(
    () => ({ settings, ready, setSetting }),
    [settings, ready, setSetting]
  );

  return (
    <WatermarkSettingsContext.Provider value={value}>
      {children}
    </WatermarkSettingsContext.Provider>
  );
}

export function useWatermarkSettings(): WatermarkSettingsContextType {
  const context = useContext(WatermarkSettingsContext);

  if (!context) {
    throw new Error("useWatermarkSettings must be used inside WatermarkSettingsProvider");
  }

  return context;
}
