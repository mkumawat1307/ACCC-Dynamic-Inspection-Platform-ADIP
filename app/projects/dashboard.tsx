//frontend\app\projects\dashboard.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  Card,
  Text,
  ActivityIndicator,
  Appbar,
} from "react-native-paper";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";
import DashboardCardGrid from "@/src/components/dashboard/DashboardCardGrid";

export default function ProjectDashboard() {
  const { projectId, projectData: projectDataJson } = useLocalSearchParams<{
    projectId: string;
    projectData?: string;
  }>();
  const router = useRouter();
  const { project: contextProject } = useInspection();
  const [statReloadKey, setStatReloadKey] = useState(0);
  const isFocused = useIsFocused();

const [loading, setLoading] = useState(true);

const [project, setProject] = useState<Project | null>(null);
useEffect(() => {
  loadProject();
}, []);

useFocusEffect(
  React.useCallback(() => {
    setStatReloadKey((k) => k + 1);
  }, [])
);

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
    <Card.Title title="Statistics" />
    <Card.Content>
        <DashboardCardGrid projectId={project.ProjectID} reloadKey={statReloadKey} focused={isFocused} />
    </Card.Content>
    </Card>
    <View style={styles.manageRow}>
    <DashboardActionCard
        title="Manage Cards"
        subtitle="Add, edit, reorder or disable dashboard cards"
        icon="tune-variant"
        onPress={() =>
          router.push({
            pathname: "/projects/dashboard-settings",
            params: {
              projectId: project.ProjectID.toString(),
            },
          })
        }
    />
    </View>

<View style={styles.actionGrid}>
  <View style={styles.actionRow}>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="New Inspection"
        subtitle="Start a new pole inspection"
        icon="clipboard-plus"
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
        onPress={() => router.push("/settings")}
      />
    </View>
    <View style={styles.actionHalf}>
      <DashboardActionCard
        title="Reports"
        subtitle="Generate inspection reports"
        icon="file-chart"
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
manageRow: {
  marginBottom: 2,
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
