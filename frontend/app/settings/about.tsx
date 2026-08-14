import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "1.1.0";

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="About" />
      </Appbar.Header>

      <Text variant="titleMedium" style={styles.title}>
        ACCC Dynamic Inspection Platform
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        Version {version}
      </Text>
      <Text variant="bodySmall" style={styles.body}>
        Offline-first inspection platform for ACCC infrastructure.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center",
    marginTop: 32,
    fontWeight: "700",
  },
  body: {
    textAlign: "center",
    marginTop: 8,
    color: "#555",
  },
});
