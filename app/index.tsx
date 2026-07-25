import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View, FlatList, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Searchbar,
  Button,
  Text,
  Card,
  Menu,
  IconButton,
  Divider,
  Portal,
  Dialog,
  ActivityIndicator,
  TextInput,
} from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
import { exportProjectData } from "@/src/utils/exportData";
import { useInspection } from "@/src/context/InspectionContext";
import { deleteProjectDb, deleteProjectFolder } from "@/src/database/helpers/ProjectDBManager";

export default function HomeScreen() {
  const router = useRouter();
  const { openProject, closeProject } = useInspection();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [cloneDialogVisible, setCloneDialogVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [exportingId, setExportingId] = useState<number | null>(null);

  const [sortBy, setSortBy] = useState<
    | "newest"
    | "oldest"
    | "projectAZ"
    | "projectZA"
    | "districtAZ"
    | "districtZA"
    | "clientAZ"
    | "clientZA"
  >("newest");

  const loadProjects = async () => {
    try {
      const data = await ProjectRepository.getProjects();
      setProjects(data);
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

  const searchText = search.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    let data = projects.filter((item) => {
      return (
        (item.ProjectName ?? "").toLowerCase().includes(searchText) ||
        (item.DistrictName ?? "").toLowerCase().includes(searchText) ||
        (item.Block ?? "").toLowerCase().includes(searchText) ||
        (item.Client ?? "").toLowerCase().includes(searchText)
      );
    });

    switch (sortBy) {
      case "oldest":
        data.sort((a, b) => a.ProjectID - b.ProjectID);
        break;
      case "projectAZ":
        data.sort((a, b) => a.ProjectName.localeCompare(b.ProjectName));
        break;
      case "projectZA":
        data.sort((a, b) => b.ProjectName.localeCompare(a.ProjectName));
        break;
      case "districtAZ":
        data.sort((a, b) =>
          (a.DistrictName ?? "").localeCompare(b.DistrictName ?? "")
        );
        break;
      case "districtZA":
        data.sort((a, b) =>
          (b.DistrictName ?? "").localeCompare(a.DistrictName ?? "")
        );
        break;
      case "clientAZ":
        data.sort((a, b) =>
          (a.Client ?? "").localeCompare(b.Client ?? "")
        );
        break;
      case "clientZA":
        data.sort((a, b) =>
          (b.Client ?? "").localeCompare(a.Client ?? "")
        );
        break;
      default:
        data.sort((a, b) => b.ProjectID - a.ProjectID);
    }

    return data;
  }, [projects, searchText, sortBy]);

  const confirmDelete = (project: Project) => {
    setSelectedProject(project);
    setDeleteDialogVisible(true);
  };

  const handleDelete = async () => {
    if (!selectedProject) return;
    try {
      // Close if this project is currently active
      await closeProject();
      // Delete the project's DB folder
      if (selectedProject.DBPath) {
        await deleteProjectDb(selectedProject.DBPath);
      }
      // Delete the project record from global DB
      await ProjectRepository.deleteProject(selectedProject.ProjectID);
      setDeleteDialogVisible(false);
      setSelectedProject(null);
      loadProjects();
    } catch (error) {
      console.error("Delete error:", error);
      Alert.alert("Error", "Unable to delete project.");
    }
  };

  const confirmClone = (project: Project) => {
    setSelectedProject(project);
    setCloneName(project.ProjectName + " (Copy)");
    setCloneDialogVisible(true);
  };

  const handleClone = async () => {
    if (!selectedProject || !cloneName.trim()) return;
    try {
      const newId = await ProjectRepository.cloneProject(
        selectedProject.ProjectID,
        cloneName.trim()
      );
      setCloneDialogVisible(false);
      setSelectedProject(null);
      setCloneName("");
      loadProjects();
      if (newId) {
        router.push({
          pathname: "/projects/new",
          params: { editProjectId: newId.toString() },
        });
      }
    } catch (error) {
      console.error("Clone error:", error);
      Alert.alert("Error", "Unable to clone project.");
    }
  };

  const handleExportProject = async (project: Project) => {
    setExportingId(project.ProjectID);
    try {
      const success = await exportProjectData(project.ProjectID, project.ProjectName);
      if (!success) {
        Alert.alert("No Data", "No inspection data to export for this project.");
      }
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", "Unable to export data.");
    } finally {
      setExportingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        ACCC Dynamic Inspection Platform
      </Text>

      <Button
        mode="contained"
        icon="plus"
        style={styles.button}
        onPress={() => router.push("/projects/new")}
      >
        New Project
      </Button>

      <Searchbar
        placeholder="Search Project, District, Block or Client..."
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />

      <Menu
        visible={sortMenuVisible}
        onDismiss={() => setSortMenuVisible(false)}
        anchor={
          <Button
            mode="outlined"
            icon="sort"
            onPress={() => setSortMenuVisible(true)}
            style={{ marginBottom: 20 }}
          >
            Sort
          </Button>
        }
      >
        <Menu.Item onPress={() => { setSortBy("newest"); setSortMenuVisible(false); }} title="Newest First" />
        <Menu.Item onPress={() => { setSortBy("oldest"); setSortMenuVisible(false); }} title="Oldest First" />
        <Menu.Item onPress={() => { setSortBy("projectAZ"); setSortMenuVisible(false); }} title="Project A-Z" />
        <Menu.Item onPress={() => { setSortBy("projectZA"); setSortMenuVisible(false); }} title="Project Z-A" />
        <Menu.Item onPress={() => { setSortBy("districtAZ"); setSortMenuVisible(false); }} title="District A-Z" />
        <Menu.Item onPress={() => { setSortBy("districtZA"); setSortMenuVisible(false); }} title="District Z-A" />
        <Menu.Item onPress={() => { setSortBy("clientAZ"); setSortMenuVisible(false); }} title="Client A-Z" />
        <Menu.Item onPress={() => { setSortBy("clientZA"); setSortMenuVisible(false); }} title="Client Z-A" />
      </Menu>

      {filteredProjects.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text variant="titleMedium">No Projects Found</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Tap "New Project" to create your first project.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.ProjectID.toString()}
          renderItem={({ item }) => (
            <Card style={styles.projectCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.projectName}>
                  {item.ProjectName}
                </Text>
                <Text variant="bodySmall" style={styles.projectDetail}>
                  District: {item.DistrictName}
                </Text>
                <Text variant="bodySmall" style={styles.projectDetail}>
                  Block: {item.Block || "-"}
                </Text>
                <Text variant="bodySmall" style={styles.projectDetail}>
                  Client: {item.Client || "-"}
                </Text>

                <Divider style={styles.divider} />

                <View style={styles.actionRow}>
                  <Button
                    mode="contained"
                    icon="clipboard-plus"
                    compact
                    style={styles.actionBtn}
                    onPress={async () => {
                      try {
                        await openProject(item);
                        router.push({
                          pathname: "/projects/dashboard",
                          params: {
                            projectId: item.ProjectID.toString(),
                            projectData: JSON.stringify(item),
                          },
                        });
                      } catch (error) {
                        Alert.alert("Error", "Unable to open project database.");
                      }
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    mode="outlined"
                    icon="pencil"
                    compact
                    style={styles.actionBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/projects/new",
                        params: { editProjectId: item.ProjectID.toString() },
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    mode="outlined"
                    icon="content-copy"
                    compact
                    style={styles.actionBtn}
                    onPress={() => confirmClone(item)}
                  >
                    Clone
                  </Button>
                  <Button
                    mode="outlined"
                    icon="microsoft-excel"
                    compact
                    style={styles.actionBtn}
                    loading={exportingId === item.ProjectID}
                    disabled={exportingId === item.ProjectID}
                    onPress={() => handleExportProject(item)}
                  >
                    Export
                  </Button>
                  <Button
                    mode="outlined"
                    icon="delete"
                    compact
                    textColor="#D32F2F"
                    style={[styles.actionBtn, { borderColor: "#D32F2F" }]}
                    onPress={() => confirmDelete(item)}
                  >
                    Delete
                  </Button>
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <Portal>
        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Icon icon="alert" color="#D32F2F" size={40} />
          <Dialog.Title style={{ textAlign: "center" }}>
            Delete Project?
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ textAlign: "center", fontWeight: "600", marginBottom: 8 }}>
              {selectedProject?.ProjectName}
            </Text>
            <Text variant="bodyMedium" style={{ textAlign: "center", color: "#D32F2F", marginBottom: 12 }}>
              This action cannot be undone!
            </Text>
            <Text variant="bodySmall" style={{ color: "#666" }}>
              Deleting this project will permanently remove:
            </Text>
            <Text variant="bodySmall" style={{ marginTop: 6, color: "#666" }}>
              {"\u2022"} Project details{"\n"}
              {"\u2022"} All inspections and inspection data{"\n"}
              {"\u2022"} All photos captured during inspections{"\n"}
              {"\u2022"} All camera and switch records{"\n"}
              {"\u2022"} All field values
            </Text>
            <Text variant="bodySmall" style={{ marginTop: 12, fontWeight: "600" }}>
              Are you sure you want to continue?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button
              textColor="#D32F2F"
              onPress={handleDelete}
            >
              Delete Permanently
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog
          visible={cloneDialogVisible}
          onDismiss={() => setCloneDialogVisible(false)}
        >
          <Dialog.Icon icon="content-copy" size={40} />
          <Dialog.Title style={{ textAlign: "center" }}>
            Clone Project
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ textAlign: "center", color: "#666", marginBottom: 12 }}>
              This will create a new project with its own independent template and inspection form.
            </Text>
            <TextInput
              label="Project Name"
              value={cloneName}
              onChangeText={setCloneName}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCloneDialogVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleClone}
              disabled={!cloneName.trim()}
            >
              Clone
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F5F5F5",
  },

  title: {
    textAlign: "center",
    marginBottom: 25,
    fontWeight: "bold",
  },

  button: {
    marginBottom: 20,
  },

  search: {
    marginBottom: 30,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  subtitle: {
    marginTop: 10,
    textAlign: "center",
    color: "#666",
  },

  projectCard: {
    marginBottom: 12,
    borderRadius: 10,
  },

  projectName: {
    fontWeight: "700",
    marginBottom: 4,
  },

  projectDetail: {
    color: "#555",
    marginBottom: 2,
  },

  divider: {
    marginVertical: 10,
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
  },

  actionBtn: {
    flex: 1,
  },
});
