import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar } from "react-native-paper";
import { useRouter } from "expo-router";

import WatermarkSettingsForm from "@/src/components/settings/WatermarkSettingsForm";

export default function WatermarkSettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Watermark Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <WatermarkSettingsForm />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
});
