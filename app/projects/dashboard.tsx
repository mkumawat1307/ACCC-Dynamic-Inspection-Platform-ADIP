//frontend\app\projects\dashboard.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Card,
  Text,
  ActivityIndicator,
  Appbar,
  Menu,
  Divider,
} from "react-native-paper";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import StatCard from "@/src/components/StatCard";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";

import DeleteProjectDialog from "./components/DeleteProjectDialog";
export default function ProjectDashboard() {
  const { projectId, projectData: projectDataJson } = useLocalSearchParams<{
    projectId: string;
    projectData?: string;
  }>();
  const router = useRouter();
  const { project: contextProject } = useInspection();

const [loading, setLoading] = useState(true);

const [project, setProject] = useState<Project | null>(null);
const [menuVisible, setMenuVisible] = useState(false);
const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
const openMenu = () => setMenuVisible(true);

const closeMenu = () => setMenuVisible(false);
useEffect(() => {
  loadProject();
}, []);

async function loadProject() {
  if (!projectId) return;

  // 1. Use projectData passed via navigation params (most reliable -- no DB call needed)
  if (projectDataJson) {
    try {
      const parsed = JSON.parse(projectDataJson) as Project;
      setProject(parsed);
      setLoading(false);
      return;
    } catch {
      // fall through
    }
  }

  // 2. Use context (may not have propagated yet due to React batching)
  if (contextProject && contextProject.ProjectID === Number(projectId)) {
    setProject(contextProject);
    setLoading(false);
    return;
  }

  // 3. No global-DB fallback: switching to the global DB mid-project-session
  //    corrupts the Android handle (ADR-014). Show not-found instead.
  setProject(null);
  setLoading(false);
}

    if (loading) {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" />
    </SafeAreaView>
  );
}

if (!project) {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Project not found.</Text>
    </SafeAreaView>
  );
}

return (
  <SafeAreaView
    style={styles.container}
    edges={["left", "right", "bottom"]}
>
    <Appbar.Header>
    <Appbar.BackAction onPress={() => router.back()} />

    <Appbar.Content title="Project Dashboard" />

    <Menu
    visible={menuVisible}
    onDismiss={closeMenu}
    anchor={
        <Appbar.Action
        icon="dots-vertical"
        onPress={openMenu}
        />
    }
    >
    <Menu.Item
        leadingIcon="pencil"
        title="Edit Project"
        onPress={() => {
        closeMenu();

        // TODO
        }}
    />

    <Divider />

    <Menu.Item
        leadingIcon="delete"
        title="Delete Project"
        onPress={() => {
            closeMenu();
            setDeleteDialogVisible(true);
        }}
    />
    </Menu>
    </Appbar.Header>

    <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
    >
    <Card style={styles.card}>
        <Card.Content>
            <Text variant="headlineSmall" style={styles.cardTitle}>
            Project Information
            </Text>

            <Text variant="titleLarge" style={styles.projectHeading}>
            Division: {project.DivisionName || "-"}  District: {project.DistrictName || "-"}
            </Text>

            <Text variant="titleMedium" style={styles.projectName}>
            Project: {project.ProjectName}
            </Text>

            <Text>
            Inspector : {project.InspectorName || "-"}
            </Text>

            <Text>
            Client : {project.Client || "-"}
            </Text>

            <Text>
            Description : {project.Description || "-"}
            </Text>
        </Card.Content>
        </Card>
    <Card style={styles.card}>
    <Card.Title title="Inspection Summary" />

    <Card.Content>
        <View style={styles.statRow}>
        <StatCard
            title="Total"
            value={25}
            icon="clipboard-list"
        />

        <StatCard
            title="Completed"
            value={18}
            icon="check-circle"
        />
        </View>

        <View style={styles.statRow}>
        <StatCard
            title="Draft"
            value={7}
            icon="file-document-edit"
        />

        <StatCard
            title="Pending"
            value={0}
            icon="clock-outline"
        />
        </View>
    </Card.Content>
    </Card>
    <Card style={styles.card}>
    <Card.Title title="Asset Summary" />

    <Card.Content>
        <View style={styles.statRow}>
        <StatCard
            title="Poles"
            value={20}
            icon="transmission-tower"
        />

        <StatCard
            title="Cameras"
            value={40}
            icon="cctv"
        />
        </View>
    </Card.Content>
    </Card>
    <Card style={styles.card}>
    <Card.Title title="Today's Progress" />

    <Card.Content>
        <View style={styles.statRow}>
        <StatCard
            title="Inspection"
            value={15}
            icon="clipboard-check"
        />

        <StatCard
            title="Poles"
            value={10}
            icon="map-marker"
        />
        </View>

        <View style={styles.statRow}>
        <StatCard
            title="Cameras"
            value={30}
            icon="camera"
        />
        </View>
    </Card.Content>
    </Card>

<View style={styles.actionGrid}>
  <View style={styles.actionRow}>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="New Inspection"
        subtitle="Start a new pole inspection"
        icon="clipboard-plus"
        compact
        onPress={() =>
          router.push({
            pathname: "/inspection/new",
            params: {
              projectId: project.ProjectID.toString(),
              projectData: JSON.stringify(project),
            },
          })
        }
      />
    </View>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="Inspection List"
        subtitle="View completed and draft inspections"
        icon="clipboard-list"
        compact
        onPress={() =>
          router.push({
            pathname: "/inspection",
            params: {
              projectId: project.ProjectID.toString(),
            },
          })
        }
      />
    </View>
  </View>
  <View style={styles.actionRow}>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="Settings"
        subtitle="Templates, Sections and Fields"
        icon="cog"
        compact
        onPress={() => router.push("/settings")}
      />
    </View>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="Reports"
        subtitle="Generate inspection reports"
        icon="file-chart"
        compact
        onPress={() =>
          router.push({
            pathname: "/reports",
            params: {
              projectId: project.ProjectID.toString(),
              projectName: project.ProjectName,
            },
          })
        }
      />
    </View>
  </View>
</View>

    </ScrollView>

    <DeleteProjectDialog
      visible={deleteDialogVisible}
      projectName={project.ProjectName}
      onDismiss={() => setDeleteDialogVisible(false)}
      onDeleted={async () => {
        await ProjectRepository.deleteProject(project.ProjectID);
        router.back();
      }}
    />
   </SafeAreaView>
    
);
  
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },

  title: {
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },

  card: {
    marginBottom: 25,
  },

  projectHeading: {
    fontWeight: "700",
    color: "#0B5ED7",
  },

  cardTitle: {
    fontWeight: "bold",
    marginBottom: 6,
  },

  projectName: {
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 8,
  },

  button: {
    marginBottom: 15,
  },
  content: {
  padding: 20,
  paddingBottom: 40,
},

statRow: {
  flexDirection: "row",
  justifyContent: "space-between",
},
actionGrid: {
  marginBottom: 14,
},
actionRow: {
  flexDirection: "row",
  gap: 10,
  marginBottom: 0,
},
actionHalf: {
  flex: 1,
},
});
