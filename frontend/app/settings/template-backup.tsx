import React, { useMemo, useState } from "react";
import { StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Divider, List, ActivityIndicator, Text } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Project } from "@/src/models/Project";
import { canonicalProjectLabel } from "@/src/utils/folderNaming";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { logger } from "@/src/utils/logger";
import { ParsedTemplateFile } from "@/src/utils/templateData";
import {
  applyTemplateRestore,
  backupTemplatesToFile,
  restoreTemplatesFromFile,
} from "@/src/utils/templateBackup";

export default function TemplateBackupScreen() {
  const { projectData: projectDataJson } = useLocalSearchParams<{
    projectId?: string;
    projectData?: string;
  }>();
  const router = useRouter();
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);

  const project = useMemo<Project | null>(() => {
    if (!projectDataJson) return null;
    try {
      return JSON.parse(projectDataJson) as Project;
    } catch {
      return null;
    }
  }, [projectDataJson]);

  const projectLabel = project ? canonicalProjectLabel(project) : null;

  const handleBackup = async () => {
    if (!projectLabel) return;
    setBusy("backup");
    try {
      const result = await backupTemplatesToFile(projectLabel);
      Alert.alert(result.ok ? "Backup Created" : "Backup Failed", result.message);
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async (parsed: ParsedTemplateFile) => {
    setBusy("restore");
    try {
      const result = await applyTemplateRestore(parsed);
      Alert.alert(result.ok ? "Restore Completed" : "Restore Failed", result.message);
      if (result.ok) router.back();
    } finally {
      setBusy(null);
    }
  };

  const confirmRestore = (parsed: ParsedTemplateFile) => {
    const summary = parsed.summary;
    Alert.alert(
      "Restore Template?",
      `Replace the current form with "${parsed.data.templates[0]?.TemplateName ?? "Untitled"}"?\n\n` +
      `${summary.templateCount} template(s), ${summary.sectionCount} section(s), ` +
      `${summary.fieldCount} field(s), ${summary.deviceTypeCount} device type(s).\n\n` +
      "Existing inspection data will NOT be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", style: "destructive", onPress: () => void doRestore(parsed) },
      ]
    );
  };

  const handleRestore = async () => {
    try {
      const completed = await InspectionRepository.countFinalInspections();
      if (completed > 0) {
        logger.info(`[TemplateRestore] blockedCompletedInspections=${completed}`);
        Alert.alert(
          "Restore Blocked",
          "Template restore is blocked because this project contains completed inspections. Create a new project if you need a different template."
        );
        return;
      }
    } catch (error) {
      logger.error("Restore check error:", error);
      Alert.alert("Restore Blocked", "Unable to verify project inspections before restoring templates.");
      return;
    }
    Alert.alert("Select JSON file", "Pick a template (.json) backup file to restore from.", [
      { text: "Cancel", style: "cancel" },
      { text: "Select", onPress: () => void pickAndRestore() },
    ]);
  };

  const pickAndRestore = async () => {
    setBusy("restore");
    try {
      const step = await restoreTemplatesFromFile();
      if (step.status === "confirm") {
        confirmRestore(step.parsed);
      } else if (step.status === "error") {
        Alert.alert("Restore Failed", step.message);
      }
    } finally {
      setBusy(null);
    }
  };

  if (!project || !projectLabel) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Template Backup & Restore" />
        </Appbar.Header>
        <Text style={styles.guard}>Open a project to access template settings.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Template Backup & Restore" />
      </Appbar.Header>

      <List.Section>
        <List.Item
          title="Backup Templates"
          left={(props) => <List.Icon {...props} icon="file-upload" />}
          right={(props) =>
            busy === "backup" ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />
          }
          onPress={() => void handleBackup()}
          disabled={busy !== null}
        />

        <Divider />

        <List.Item
          title="Restore Templates"
          left={(props) => <List.Icon {...props} icon="file-restore" />}
          right={(props) =>
            busy === "restore" ? <ActivityIndicator size={20} /> : <List.Icon {...props} icon="chevron-right" />
          }
          onPress={() => void handleRestore()}
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
  guard: {
    textAlign: "center",
    marginTop: 40,
    color: "#666",
  },
});
