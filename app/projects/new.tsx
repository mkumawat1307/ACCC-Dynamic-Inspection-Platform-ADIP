//frontend\app\projects\new.tsx
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text, TextInput } from "react-native-paper";
import { DistrictRepository } from "@/src/database/repositories/DistrictRepository";
import { District } from "@/src/models/District";
import { Dropdown } from "react-native-paper-dropdown";
import { Alert } from "react-native";
import { router } from "expo-router";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";


export default function NewProjectScreen() {
  const [projectName, setProjectName] = useState("");
  const [district, setDistrict] = useState<string>();

  const [block, setBlock] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
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

    console.log("Districts:", result);

    setDistricts(result);
  } catch (error) {
    console.error("Failed to load districts:", error);
  } finally {
    setLoading(false);
  }
}

async function createProject() {
  if (!projectName.trim()) {
    Alert.alert("Validation", "Please enter Project Name.");
    return;
  }

  if (!district) {
    Alert.alert("Validation", "Please select District.");
    return;
  }

  try {
    await ProjectRepository.createProject({
      projectName: projectName.trim(),
      districtId: Number(district),
      block: block.trim(),
      client: client.trim(),
      description: description.trim(),
    });

    Alert.alert("Success", "Project created successfully.");

    router.back();
  } catch (error) {
    console.error(error);

    Alert.alert(
      "Error",
      "Unable to create project."
    );
  }
}

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        <Text variant="headlineMedium" style={styles.title}>
        Create Inspection Project
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
        Provide the project information to organize inspections and reports.
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

        <Button
        mode="contained"
        onPress={createProject}
        style={styles.button}
        >
        Create
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

  title: {
    textAlign: "center",
    marginBottom: 25,
    fontWeight: "bold",
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