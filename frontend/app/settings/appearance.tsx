import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, List, Text } from "react-native-paper";
import { useRouter } from "expo-router";

export default function AppearanceScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Appearance" />
      </Appbar.Header>

      <List.Section>
        <List.Item
          title="Theme"
          description="Light (Default)"
          left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
        />
      </List.Section>

      <Text style={styles.note}>The app uses the default light theme.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  note: {
    textAlign: "center",
    marginTop: 12,
    color: "#666",
  },
});
