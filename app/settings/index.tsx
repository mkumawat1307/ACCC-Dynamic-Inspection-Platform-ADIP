import React, { useState } from "react";
import { ScrollView, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator } from "react-native-paper";
import { useRouter } from "expo-router";
import { exportDefaultTemplate, importTemplate } from "@/src/utils/templateData";
import { getDatabase } from "@/src/database/db";

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleExportTemplate = async () => {
    setLoading(true);
    try {
      const success = await exportDefaultTemplate();
      if (!success) {
        Alert.alert("Export Failed", "No template found to export.");
      }
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", "Unable to export template.");
    } finally {
      setLoading(false);
    }
  };

  const handleImportTemplate = async () => {
    setLoading(true);
    try {
      const result = await importTemplate();
      if (result.success) {
        Alert.alert("Import Success", result.message);
      } else if (result.message !== "No file selected.") {
        Alert.alert("Import Failed", result.message);
      }
    } catch (error) {
      console.error("Import error:", error);
      Alert.alert("Import Failed", "Unable to import template.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefault = () => {
    Alert.alert(
      "Reset to Default?",
      "This will restore the inspection form to its original default state:\n\n" +
      "• Remove all custom sections\n" +
      "• Remove all custom fields\n" +
      "• Remove custom device types (NVR, Router, etc.)\n" +
      "• Restore original Camera/Switch fields\n" +
      "• Remove all device records\n\n" +
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
        // 1. Deactivate all non-default sections
        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE IsDefault = 0
        `);

        // 2. Reactivate default sections
        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
          WHERE IsDefault = 1
        `);

        // 3. Deactivate all non-default fields (fields not in original seed)
        const defaultKeys = [
          "date", "division", "district", "block", "inspector_name", "pole_id", "location", "gps",
          "foundation_cond", "pole_avail", "pole_si", "pole_status",
          "jb_status", "power_cable", "cable_status", "cable_length",
          "earthing_wire", "earthing_chamber", "earthing_cover", "earthing_voltage",
          "meter_box_status", "meter_status", "meter_power_status", "meter_serial",
          "connectivity_type",
          "camera_count", "switch_count",
          "pole_category", "remarks",
        ];
        const placeholders = defaultKeys.map(() => "?").join(",");
        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
           WHERE FieldKey NOT IN (${placeholders})`,
          defaultKeys
        );

        // 4. Reactivate default fields
        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
           WHERE FieldKey IN (${placeholders})`,
          defaultKeys
        );

        // 5. Delete custom device types (only keep Camera and Switch)
        await db.runAsync(`
          UPDATE DeviceFieldDefinitions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType NOT IN ('Camera', 'Switch')
        `);
        await db.runAsync(`
          UPDATE DeviceFieldDefinitions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType IN ('Camera', 'Switch')
        `);

        // 6. Delete custom device options
        await db.runAsync(`
          UPDATE DeviceOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType NOT IN ('Camera', 'Switch')
        `);
        await db.runAsync(`
          UPDATE DeviceOptions SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP
          WHERE DeviceType IN ('Camera', 'Switch')
        `);

        // 7. Remove all project device type mappings for custom types
        await db.runAsync(`
          DELETE FROM ProjectDeviceTypes
          WHERE DeviceType NOT IN ('Camera', 'Switch')
        `);

        // 8. Delete all device records
        await db.runAsync(`DELETE FROM DeviceRecords`);

        // 9. Deactivate custom sections from device types (e.g., nvr_information)
        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE SectionKey LIKE '%_information'
          AND SectionKey NOT IN ('general_information', 'camera_information', 'switch_information')
        `);

        // 10. Deactivate custom count fields
        await db.runAsync(`
          UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE FieldKey LIKE '%_count'
          AND FieldKey NOT IN ('camera_count', 'switch_count')
        `);
      });

      Alert.alert("Done", "Inspection form has been reset to default.");
    } catch (error) {
      console.error("Reset error:", error);
      Alert.alert("Error", "Failed to reset. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Inspection Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>

        <List.Section>
          <List.Subheader>Inspection Form</List.Subheader>

          <List.Item
            title="Sections"
            description="Manage inspection sections (Pole, Earthing, Camera, etc.)"
            left={(props) => <List.Icon {...props} icon="view-list" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push("/settings/sections" as any)}
          />

          <Divider />

          <List.Item
            title="Export Template"
            description="Export inspection template with sections, fields and options as JSON file"
            left={(props) => <List.Icon {...props} icon="file-export" />}
            right={(props) => loading ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />}
            onPress={handleExportTemplate}
            disabled={loading}
          />

          <Divider />

          <List.Item
            title="Import Template"
            description="Import inspection template from a JSON file"
            left={(props) => <List.Icon {...props} icon="file-import" />}
            right={(props) => loading ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />}
            onPress={handleImportTemplate}
            disabled={loading}
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
});
