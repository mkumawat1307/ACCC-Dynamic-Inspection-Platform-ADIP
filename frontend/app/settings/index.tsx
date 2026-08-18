import React, { useMemo, useState } from "react";
import { logger } from "@/src/utils/logger";
import { ScrollView, StyleSheet, Alert, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { ResetRepository } from "@/src/database/repositories/ResetRepository";
import { Project } from "@/src/models/Project";

export default function SettingsScreen() {
  const { projectData: projectDataJson } = useLocalSearchParams<{
    projectId?: string;
    projectData?: string;
  }>();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  const project = useMemo<Project | null>(() => {
    if (!projectDataJson) return null;
    try {
      return JSON.parse(projectDataJson) as Project;
    } catch {
      return null;
    }
  }, [projectDataJson]);

  const settingsParams = project
    ? { projectId: project.ProjectID.toString(), projectData: JSON.stringify(project) }
    : undefined;

  const handleResetToDefault = async () => {
    let inspectionCount = 0;
    try {
      inspectionCount = await InspectionRepository.countAllInspections();
    } catch (error) {
      logger.error("Reset check error:", error);
      Alert.alert("Reset Blocked", "Unable to verify project inspections before resetting templates.");
      return;
    }

    if (inspectionCount > 0) {
      Alert.alert(
        "Reset to Default?",
        "Existing inspections were found.\n\n" +
        "Resetting will remove your custom Sections, Fields, Device Types, and Device Fields. " +
        "Data stored for those custom configurations in existing inspections will remain " +
        "but will no longer appear in the form.\n\n" +
        "Your projects, inspections, default inspection data, and photos will remain unchanged.\n\n" +
        "This action cannot be undone.\n\n" +
        "Do you want to continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reset to Default",
            style: "destructive",
            onPress: performReset,
          },
        ]
      );
    } else {
      Alert.alert(
        "Reset to Default?",
        "This will remove your custom inspection form configuration " +
        "and restore the default Sections, Fields, and Device Types.\n\n" +
        "Existing inspection data will NOT be deleted.\n\n" +
        "Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reset to Default",
            style: "destructive",
            onPress: performReset,
          },
        ]
      );
    }
  };

  const performReset = async () => {
    setResetting(true);
    try {
      await ResetRepository.performReset();
      Alert.alert("Done", "Inspection form has been reset to default.");
    } catch (error) {
      logger.error("Reset error:", error);
      Alert.alert("Error", "Failed to reset. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  if (!project || !settingsParams) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Project Settings" />
        </Appbar.Header>
        <Text style={styles.guard}>Open a project to access settings.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Project Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <List.Section>
          <List.Subheader>Inspection Form</List.Subheader>

          <List.Item
            title="Sections"
            description="Manage inspection sections (Pole, Earthing, Camera, etc.)"
            left={(props) => <List.Icon {...props} icon="view-list" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push("/settings/sections")}
          />

          <Divider />

          <List.Item
            title="Template Backup & Restore"
            description="Back up or restore the inspection form as a JSON file"
            left={(props) => <List.Icon {...props} icon="file-cog" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() =>
              router.push({
                pathname: "/settings/template-backup",
                params: settingsParams,
              })
            }
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Camera</List.Subheader>

          <List.Item
            title="Watermark"
            description="Size, position, colors and GPS options"
            left={(props) => <List.Icon {...props} icon="watermark" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push("/settings/watermark")}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>General</List.Subheader>

          <List.Item
            title="Appearance"
            description="Theme settings"
            left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push("/settings/appearance")}
          />

          <Divider />

          <List.Item
            title="About"
            description="App version and information"
            left={(props) => <List.Icon {...props} icon="information-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push("/settings/about")}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Advanced</List.Subheader>

          <List.Item
            title="Reset to Default"
            description="Restore the inspection form to its original default state"
            left={(props) => <List.Icon {...props} icon="restart" color="#D32F2F" />}
            right={(props) => resetting ? <ActivityIndicator size={20} color="#D32F2F" /> : <List.Icon {...props} icon="chevron-right" />}
            onPress={handleResetToDefault}
            disabled={resetting}
            titleStyle={{ color: "#D32F2F" }}
          />
        </List.Section>
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
    paddingBottom: 30,
  },
  guard: {
    textAlign: "center",
    marginTop: 40,
    color: "#666",
  },
});
