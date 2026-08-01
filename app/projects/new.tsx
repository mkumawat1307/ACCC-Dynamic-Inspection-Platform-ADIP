import React, { useEffect, useState } from "react";
import { logger } from "@/src/utils/logger";
import { ScrollView, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text, TextInput, Appbar } from "react-native-paper";

import { DistrictRepository } from "@/src/database/repositories/DistrictRepository";
import { District } from "@/src/models/District";
import { Dropdown } from "react-native-paper-dropdown";
import { router, useLocalSearchParams } from "expo-router";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { createProjectDb, getProjectDbPath } from "@/src/database/helpers/ProjectDBManager";

export default function NewProjectScreen() {
  const { editProjectId } = useLocalSearchParams<{ editProjectId?: string }>();
  const isEdit = !!editProjectId;

  const [projectName, setProjectName] = useState("");
  const [district, setDistrict] = useState<string>();
  const [block, setBlock] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [districts, setDistricts] = useState<District[]>([]);
const [, setLoading] = useState(true);
const [saving, setSaving] = useState(false);

  const districtOptions = districts.map((item) => ({
    label: item.DistrictName,
    value: item.DistrictID.toString(),
  }));

  useEffect(() => {
    loadDistricts();
  }, []);

  async function loadDistricts() {
    try {
      const result = await DistrictRepository.getAll();
      setDistricts(result);

      if (isEdit && editProjectId) {
        const project = await ProjectRepository.getProjectById(Number(editProjectId));
        if (project) {
          setProjectName(project.ProjectName);
          setDistrict(project.DistrictID.toString());
          setBlock(project.Block ?? "");
          setClient(project.Client ?? "");
          setDescription(project.Description ?? "");
          setInspectorName(project.InspectorName ?? "");
        }
      }
    } catch (error) {
      logger.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveProject() {
    if (!projectName.trim()) {
      Alert.alert("Validation", "Please enter Project Name.");
      return;
    }
    if (!district) {
      Alert.alert("Validation", "Please select District.");
      return;
    }
    if (!inspectorName.trim()) {
      Alert.alert("Validation", "Please enter Inspector Name.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && editProjectId) {
        await ProjectRepository.updateProject(Number(editProjectId), {
          projectName: projectName.trim(),
          districtId: Number(district),
          block: block.trim(),
          client: client.trim(),
          description: description.trim(),
          inspectorName: inspectorName.trim(),
        });
        Alert.alert("Success", "Project updated successfully.");
      } else {
        const dbPath = getProjectDbPath(projectName.trim());

        // Create the project DB with full schema + seed data
        await createProjectDb(projectName.trim(), dbPath);

        await ProjectRepository.createProject({
          projectName: projectName.trim(),
          districtId: Number(district),
          dbPath: dbPath,
          safPath: null as unknown as string,
          block: block.trim(),
          client: client.trim(),
          description: description.trim(),
          inspectorName: inspectorName.trim(),
        });
        Alert.alert("Success", "Project created successfully.");
      }
      router.back();
    } catch (error) {
      logger.error(error);
      Alert.alert("Error", "Unable to save project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={isEdit ? "Edit Project" : "Create Project"} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {isEdit
            ? "Update the project information below."
            : "Provide the project information to organize inspections and reports."}
        </Text>

        <TextInput
          label="Project Name *"
          value={projectName}
          onChangeText={setProjectName}
          mode="outlined"
          style={styles.input}
        />

        <Dropdown
          label="District *"
          placeholder="Select District"
          mode="outlined"
          options={districtOptions}
          value={district}
          onSelect={setDistrict}
        />

        <TextInput
          label="Block (Optional)"
          value={block}
          onChangeText={setBlock}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Inspector Name *"
          value={inspectorName}
          onChangeText={setInspectorName}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Client (Optional)"
          value={client}
          onChangeText={setClient}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Description (Optional)"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
        />

        <Button mode="contained" onPress={saveProject} style={styles.button} loading={saving} disabled={saving}>
          {isEdit ? "Update" : "Create"}
        </Button>
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
    padding: 20,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 20,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
    color: "#666",
  },
});

