import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Text } from "react-native-paper";
import { useRouter } from "expo-router";

export default function SectionManagerScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Section Manager" />
      </Appbar.Header>

      <Text
        variant="headlineMedium"
        style={{
          margin: 20,
        }}
      >
        Section Manager
      </Text>
    </SafeAreaView>
  );
}