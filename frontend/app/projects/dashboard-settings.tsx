import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import DashboardCardManager from "@/src/components/dashboard/DashboardCardManager";
import { useInspection } from "@/src/context/InspectionContext";
import { useProjectActivation } from "@/src/hooks/useProjectActivation";

export default function DashboardSettingsScreen() {
  const router = useRouter();
  const { projectId: projectIdParam } = useLocalSearchParams<{ projectId?: string }>();
  const projectId = Number(projectIdParam);

  const { project: contextProject } = useInspection();
  const resolvedProject =
    contextProject && contextProject.ProjectID === projectId
      ? contextProject
      : null;

  const { ready, error } = useProjectActivation(resolvedProject);

  if (error || !projectId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }} edges={["left", "right", "bottom"]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Dashboard Cards" />
        </Appbar.Header>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text>Project not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }} edges={["left", "right", "bottom"]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Dashboard Cards" />
        </Appbar.Header>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Dashboard Cards" />
      </Appbar.Header>

      <DashboardCardManager projectId={projectId} />
    </SafeAreaView>
  );
}