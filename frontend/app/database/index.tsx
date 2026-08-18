import React, { useState, useCallback } from "react";
import { StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator, Banner } from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { backupNow, restoreBackupFromUri } from "@/src/database/helpers/BackupManager";
import { getProjectDuplicates } from "@/src/database/DatabaseService";
import type { ProjectDuplicateGroup } from "@/src/database/projectIdentity";
import { buildProjectFolderLabel } from "@/src/utils/folderNaming";
import { ensureRootFolder } from "@/src/utils/storageManager";
import { logger } from "@/src/utils/logger";

export default function DatabaseScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [duplicates, setDuplicates] = useState<ProjectDuplicateGroup[]>([]);

  useFocusEffect(
    useCallback(() => {
      ensureRootFolder().catch((e) =>
        logger.error("[Storage] databaseScreen ensureRootFolder failed:", e)
      );
      setDuplicates(getProjectDuplicates());
    }, [])
  );

  const handleBackup = async () => {
    setBusy("backup");
    try {
      const result = await backupNow();
      Alert.alert(result.ok ? "Backup Created" : "Backup Failed", result.message);
    } finally {
      setBusy(null);
    }
  };

  const handleRestorePress = () => {
    logger.info("[Restore] start");
    Alert.alert("Select ZIP file", "Pick a backup (.zip) file to restore from.", [
      { text: "Cancel", style: "cancel" },
      { text: "Select", onPress: () => void openPicker() },
    ]);
  };

  const openPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed"],
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const selectedUri = result.assets[0].uri;
      const fileName = result.assets[0].name;
      logger.info("[Restore] fileSelected=" + fileName);
      Alert.alert("Restore DB Data?", `Replace all current data with the selected file "${fileName}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", style: "destructive", onPress: () => void handleRestore(selectedUri) },
      ]);
    } catch (e) {
      Alert.alert("Restore Failed", String(e));
    }
  };

  const handleRestore = async (selectedUri: string) => {
    setBusy("restore");
    try {
      const result = await restoreBackupFromUri(selectedUri, async () => true);
      Alert.alert(result.ok ? "Restore Completed" : "Restore Failed", result.message);
      if (result.ok) router.replace("/");
    } catch (e) {
      Alert.alert("Restore Failed", String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Database" />
      </Appbar.Header>

      {duplicates.length > 0 && (
        <Banner
          visible
          icon="alert-outline"
          actions={[
            {
              label: "Dismiss",
              onPress: () => setDuplicates([]),
            },
          ]}
        >
          Duplicate projects were found in the project database. Resolve them before enabling
          full duplicate protection.
        </Banner>
      )}

      {duplicates.length > 0 && (
        <List.Section>
          <List.Accordion
            title={`Duplicate projects detected (${duplicates.length} group${duplicates.length === 1 ? "" : "s"})`}
          >
            {duplicates.map((group) => (
              <List.Accordion
                key={`${group.districtKey}\u0000${group.projectKey}`}
                title={`${group.districtKey} / ${group.projectKey}`}
              >
                {group.members.map((member) => (
                  <List.Item
                    key={member.ProjectID}
                    title={`${member.DistrictName} / ${member.ProjectName}`}
                    description={`ID ${member.ProjectID}\nDB: ${member.DBPath ?? "n/a"}\nFolder: ${buildProjectFolderLabel(member.DistrictName, member.ProjectName)}`}
                    left={(props) => <List.Icon {...props} icon="folder-alert" />}
                  />
                ))}
              </List.Accordion>
            ))}
          </List.Accordion>
        </List.Section>
      )}

      <List.Section>
        <List.Item
          title="Backup DB Data"
          left={(props) => <List.Icon {...props} icon="database-export" />}
          right={(props) =>
            busy === "backup" ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />
          }
          onPress={() => void handleBackup()}
          disabled={busy !== null}
        />

        <Divider />

        <List.Item
          title="Restore DB Data"
          left={(props) => <List.Icon {...props} icon="database-import" />}
          right={(props) =>
            busy === "restore" ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />
          }
          onPress={handleRestorePress}
          disabled={busy !== null}
        />
      </List.Section>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
});
