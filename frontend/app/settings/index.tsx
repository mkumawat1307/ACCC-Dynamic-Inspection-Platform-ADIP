import React, { useMemo, useState } from "react";
import { logger } from "@/src/utils/logger";
import { ScrollView, StyleSheet, Alert, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getDatabase } from "@/src/database/db";
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

  const handleResetToDefault = () => {
    Alert.alert(
      "Reset to Default?",
      "This will restore the inspection form to its original default state:\n\n" +
      "• Remove all custom sections\n" +
      "• Remove all custom fields\n" +
      "• Remove custom device types (NVR, Router, etc.)\n" +
      "• Restore original Camera/Switch fields\n\n" +
      "Existing inspection data will NOT be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: performReset,
        },
      ]
    );
  };

  const performReset = async () => {
    setResetting(true);
    try {
      const db = await getDatabase();

      await db.withTransactionAsync(async () => {
        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE IsDefault = 0
        `);

        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
          WHERE IsDefault = 1
        `);

        const defaultKeys = [
          "date", "division", "district", "block", "inspector_name", "pole_id", "location", "gps",
          "foundation_cond", "pole_avail", "pole_si", "pole_status",
          "jb_status", "power_cable", "cable_status", "cable_length",
          "earthing_wire", "earthing_chamber", "earthing_cover", "earthing_voltage",
          "meter_box_status", "meter_status", "meter_power_status", "meter_serial",
          "connectivity_type",
          "camera_count", "switch_count",
          "remarks",
        ];
        const placeholders = defaultKeys.map(() => "?").join(",");
        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
           WHERE FieldKey NOT IN (${placeholders})`,
          defaultKeys
        );

        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
           WHERE FieldKey IN (${placeholders})`,
          defaultKeys
        );

        await db.runAsync(`
          UPDATE DeviceFieldDefinitions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType NOT IN ('Camera', 'Switch')
        `);
        await db.runAsync(`
          UPDATE DeviceFieldDefinitions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType IN ('Camera', 'Switch')
        `);

        await db.runAsync(`
          UPDATE DeviceOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType NOT IN ('Camera', 'Switch')
        `);
        await db.runAsync(`
          UPDATE DeviceOptions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType IN ('Camera', 'Switch')
        `);

        await db.runAsync(`
          DELETE FROM ProjectDeviceTypes
          WHERE DeviceType NOT IN ('Camera', 'Switch')
        `);

        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE SectionKey LIKE '%_information'
          AND SectionKey NOT IN ('general_information', 'camera_information', 'switch_information')
        `);

        await db.runAsync(`
          UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE FieldKey LIKE '%_count'
          AND FieldKey NOT IN ('camera_count', 'switch_count')
        `);
      });

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
