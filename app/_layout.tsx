// frontend\app\_layout.tsx
import { useEffect, useState, useRef } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { InspectionProvider } from "@/src/context/InspectionContext";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { initializeDatabase, getInitError } from "@/src/database";

import { logger } from "@/src/utils/logger";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const START = useRef(Date.now()).current;
  const [loaded, error] = useIconFonts();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
async function init() {
  await SystemUI.setBackgroundColorAsync("#F5F5F5");

  try {
    await initializeDatabase();
    setDbReady(true);
  } catch (e) {
    const msg = getInitError() || (e instanceof Error ? e.message : String(e));
    logger.error("[RootLayout] DB init failed:", msg);
    setDbError(msg);
    setDbReady(true);
  }
}

logger.info(`[perf] RootLayout mount: ${Date.now() - START}ms`);
    init();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      logger.info(`[perf] SplashScreen hidden: ${Date.now() - START}ms`);
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded || !dbReady) {
  return null;
}

if (dbError) {
  return (
    <PaperProvider>
      <SafeAreaProvider>
        <StatusBar
          style="light"
          translucent={false}
          backgroundColor="#D32F2F"
        />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: "#F5F5F5",
            },
          }}
        />
      </SafeAreaProvider>
    </PaperProvider>
  );
}

logger.info(`[perf] UI first render: ${Date.now() - START}ms`);
return (
  <PaperProvider>
    <InspectionProvider>
      <SafeAreaProvider>
        <StatusBar
          style="light"
          translucent={false}
          backgroundColor="#0B5ED7"
        />

        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: "#F5F5F5",
            },
          }}
        />
      </SafeAreaProvider>
    </InspectionProvider>
  </PaperProvider>
);
}
