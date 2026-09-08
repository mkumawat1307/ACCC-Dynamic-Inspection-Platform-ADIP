// frontend\app\_layout.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { PaperProvider, Text, Button } from "react-native-paper";
import { InspectionProvider } from "@/src/context/InspectionContext";
import { PhotoStatesProvider } from "@/src/context/PhotoStatesContext";
import { WatermarkSettingsProvider } from "@/src/context/WatermarkSettingsContext";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { initializeDatabase, getInitError } from "@/src/database";

import { logger } from "@/src/utils/logger";
import { ensureRootFolder } from "@/src/utils/storageManager";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    async function init() {
      await SystemUI.setBackgroundColorAsync("#F5F5F5");

      try {
        await initializeDatabase();
        setDbError(null);
        setDbReady(true);
      } catch (e) {
        const msg = getInitError() || (e instanceof Error ? e.message : String(e));
        logger.error("[RootLayout] DB init failed:", msg);
        setDbError(msg);
        setDbReady(true);
      }

      // Auto-create Download/ACCC Dynamic Inspection on app start. Non-blocking:
      // failures are logged and re-checked by backup/export/camera before use.
      ensureRootFolder().catch((e) =>
        logger.error("[Storage] appStart ensureRootFolder failed:", e)
      );
    }

    init();
  }, [retryKey]);

  useEffect(() => {
    if (loaded || error) {
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
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
              backgroundColor: "#F5F5F5",
            }}
          >
            <Text
              variant="titleLarge"
              style={{ color: "#D32F2F", fontWeight: "700", marginBottom: 12, textAlign: "center" }}
            >
              Database Initialization Failed
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: "#666", marginBottom: 24, textAlign: "center" }}
            >
              {dbError}
            </Text>
            <Button
              mode="contained"
              onPress={() => {
                setDbError(null);
                setDbReady(false);
                setRetryKey((k) => k + 1);
              }}
            >
              Retry
            </Button>
          </View>
        </SafeAreaProvider>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider>
      <WatermarkSettingsProvider>
        <PhotoStatesProvider>
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
        </PhotoStatesProvider>
      </WatermarkSettingsProvider>
    </PaperProvider>
  );
}
