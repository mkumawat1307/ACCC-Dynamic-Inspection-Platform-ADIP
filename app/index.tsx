import React, { useCallback, useMemo, useState } from "react";
import { logger } from "@/src/utils/logger";
import { View, FlatList, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Searchbar,
  Button,
  Text,
  Card,
  Menu,
  Divider,
} from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
import { DeleteProjectDialog, CloneProjectDialog } from "@/app/components/ProjectDialogs";
import { styles } from "@/app/index.styles";
import { useInspection } from "@/src/context/InspectionContext";
import { deleteProjectDb } from "@/src/database/helpers/ProjectDBManager";

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
      logger.error("Error loading projects:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await closeProject();
        await loadProjects();
      })();
    }, [closeProject])
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
      logger.error("Delete error:", error);
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
      logger.error("Clone error:", error);
      Alert.alert("Error", "Unable to clone project.");
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
            Tap {'\u201C'}New Project{'\u201D'} to create your first project.
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
                      } catch {
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

      <DeleteProjectDialog
        visible={deleteDialogVisible}
        projectName={selectedProject?.ProjectName}
        onDismiss={() => setDeleteDialogVisible(false)}
        onConfirm={handleDelete}
      />

      <CloneProjectDialog
        visible={cloneDialogVisible}
        cloneName={cloneName}
        onDismiss={() => { setCloneDialogVisible(false); setCloneName(""); }}
        onCloneNameChange={setCloneName}
        onConfirm={handleClone}
        confirmDisabled={!cloneName.trim()}
      />
    </SafeAreaView>
  );
}



