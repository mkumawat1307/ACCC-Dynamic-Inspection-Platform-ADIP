import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Text } from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import DashboardCardManager from "@/src/components/dashboard/DashboardCardManager";

export default function DashboardSettingsScreen() {
  const router = useRouter();
  const { projectId: projectIdParam } = useLocalSearchParams<{ projectId?: string }>();
  const projectId = Number(projectIdParam);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Dashboard Cards" />
      </Appbar.Header>

      {projectId ? (
        <DashboardCardManager projectId={projectId} />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text>Project not found.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
