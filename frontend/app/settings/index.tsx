import React, { useState } from "react";
import { logger } from "@/src/utils/logger";
import { ScrollView, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator } from "react-native-paper";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useTemplateFlow } from "@/src/components/template/useTemplateFlow";
import { getDatabase } from "@/src/database/db";
import { backupNow, restoreBackup, restoreBackupFromUri } from "@/src/database/helpers/BackupManager";
import { buildBackupDisplayPath } from "@/src/utils/backupZip";
import TemplateExportDialogs from "@/src/components/app/settings/components/TemplateExportDialogs";
import TemplateImportDialogs from "@/src/components/app/settings/components/TemplateImportDialogs";

export default function SettingsScreen() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const flow = useTemplateFlow();

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
          "remarks",
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

        // 8. Deactivate custom sections from device types (e.g., nvr_information)
        await db.runAsync(`
          UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
          WHERE SectionKey LIKE '%_information'
          AND SectionKey NOT IN ('general_information', 'camera_information', 'switch_information')
        `);

        // 9. Deactivate custom count fields
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

  const errorFlow = React.useRef<"export" | "import" | null>(null);

  const exporting = flow.state.phase === "exporting";
  const parsing = flow.state.phase === "parsing";
  const importing = flow.state.phase === "importing";
  const busy = flow.busy;

  const exportResult = flow.state.phase === "exported" ? flow.state.result : null;
  const confirming = flow.state.phase === "confirming" ? flow.state.parsed : null;
  const importedMessage = flow.state.phase === "imported" ? flow.state.message : null;
  const errorMessage = flow.state.phase === "error" ? flow.state.message : null;
  const exportError = errorFlow.current === "export" ? errorMessage : null;
  const importError = errorFlow.current === "import" ? errorMessage : null;

  const handleBeginExport = () => {
    errorFlow.current = "export";
    void flow.beginExport();
  };

  const handleBeginImport = () => {
    errorFlow.current = "import";
    void flow.beginImport();
  };

  const handleBackupNow = async () => {
    setBackupBusy(true);
    try {
      const result = await backupNow();
      if (result.ok) {
        Alert.alert("Backup Created", `Backup saved to:\n${buildBackupDisplayPath()}`);
      } else {
        Alert.alert("Backup Failed", result.message);
      }
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = () => {
    Alert.alert(
      "Restore Backup?",
      `Replace all current data with the backup at:\n${buildBackupDisplayPath()}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBackupBusy(true);
              try {
                const result = await restoreBackup(async () => true);
                Alert.alert(result.ok ? "Restore Completed" : "Restore Failed", result.message);
                if (result.ok) router.replace("/");
              } finally {
                setBackupBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleRestoreFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/octet-stream"],
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const selectedUri = result.assets[0].uri;
      const fileName = result.assets[0].name;
      Alert.alert(
        "Restore Backup?",
        `Replace all current data with the selected file "${fileName}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setBackupBusy(true);
                try {
                  const restoreResult = await restoreBackupFromUri(selectedUri, async () => true);
                  Alert.alert(restoreResult.ok ? "Restore Completed" : "Restore Failed", restoreResult.message);
                  if (restoreResult.ok) router.replace("/");
                } finally {
                  setBackupBusy(false);
                }
              })();
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert("Restore Failed", String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
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
            onPress={() => router.push("/settings/sections")}
          />

          <Divider />

          <List.Item
            title="Export Template"
            description="Export inspection template with sections, fields and options as JSON file"
            left={(props) => <List.Icon {...props} icon="file-export" />}
            right={(props) => (busy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
            onPress={handleBeginExport}
            disabled={busy}
          />

          <Divider />

          <List.Item
            title="Import Template"
            description="Import inspection template from a JSON file"
            left={(props) => <List.Icon {...props} icon="file-import" />}
            right={(props) => (busy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
            onPress={handleBeginImport}
            disabled={busy}
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
          <List.Subheader>Backup & Restore</List.Subheader>

          <List.Item
            title="Backup Now"
            description={`Export all data to ${buildBackupDisplayPath()}`}
            left={(props) => <List.Icon {...props} icon="database-export" />}
            right={(props) => (backupBusy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
            onPress={handleBackupNow}
            disabled={backupBusy}
          />

          <Divider />

          <List.Item
            title="Restore Backup"
            description="Replace current data with the saved backup"
            left={(props) => <List.Icon {...props} icon="database-import" />}
            right={(props) => (backupBusy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
            onPress={handleRestoreBackup}
            disabled={backupBusy}
          />

          <Divider />

          <List.Item
            title="Restore from File..."
            description="Pick a backup file (.zip) and restore from it"
            left={(props) => <List.Icon {...props} icon="file-restore" />}
            right={(props) => (backupBusy ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />)}
            onPress={handleRestoreFromFile}
            disabled={backupBusy}
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

      <TemplateExportDialogs
        exporting={exporting}
        result={exportResult}
        errorMessage={exportError}
        onShare={() => { void flow.shareExported(); }}
        onCloseSuccess={flow.dismissExport}
        onRetry={() => { void flow.retry(); }}
        onCloseError={flow.dismissError}
      />
      <TemplateImportDialogs
        parsing={parsing}
        confirming={confirming}
        importing={importing}
        importedMessage={importedMessage}
        errorMessage={importError}
        onConfirm={() => { void flow.confirmImport(); }}
        onCancel={flow.cancelImport}
        onCloseSuccess={flow.dismissImport}
        onRetry={() => { void flow.retry(); }}
        onCloseError={flow.dismissError}
      />
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

