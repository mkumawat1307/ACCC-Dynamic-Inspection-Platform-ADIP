//frontend\app\projects\dashboard.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView, Alert } from "react-native";
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
import { exportProjectData } from "@/src/utils/exportData";
import { useInspection } from "@/src/context/InspectionContext";
import StatCard from "@/src/components/StatCard";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";

import { logger } from "@/src/utils/logger";
import DeleteProjectDialog from "./components/DeleteProjectDialog";
export default function ProjectDashboard() {
  const { projectId, projectData: projectDataJson } = useLocalSearchParams<{
    projectId: string;
    projectData?: string;
  }>();
  const router = useRouter();
  const { project: contextProject } = useInspection();

const [loading, setLoading] = useState(true);
const [exporting, setExporting] = useState(false);

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

  // 3. Last resort: query global DB (will corrupt handle on Android if project DB is active)
  logger.warn("[dashboard] Falling back to getProjectById -- may corrupt DB handle on Android");
  const data = await ProjectRepository.getProjectById(
    Number(projectId)
  );

  setProject(data);

  setLoading(false);
}

const handleExport = async () => {
  if (!project) return;
  setExporting(true);
  try {
    const success = await exportProjectData(project.ProjectID, project.ProjectName);
    if (!success) {
      Alert.alert("No Data", "No inspection data found to export for this project.");
    }
  } catch (error) {
    console.error("Export error:", error);
    Alert.alert("Export Failed", "Unable to export inspection data.");
  } finally {
    setExporting(false);
  }
};

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
    <Card.Title title="Project Information" />

        <Card.Content>
            <Text variant="headlineSmall">
            {project.ProjectName}
            </Text>

            <Text>
            Division : {project.DivisionName}
            </Text>

            <Text>
            District : {project.DistrictName}
            </Text>

            <Text>
            Block : {project.Block || "-"}
            </Text>

            <Text>
            Client : {project.Client || "-"}
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
        onPress={() => router.push("/reports")}
      />
    </View>
  </View>
  <View style={styles.actionRow}>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="Export"
        subtitle="Export inspection data as CSV"
        icon="database-export"
        compact
        onPress={handleExport}
      />
    </View>
    <View style={styles.actionHalf}>
      <View />
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
