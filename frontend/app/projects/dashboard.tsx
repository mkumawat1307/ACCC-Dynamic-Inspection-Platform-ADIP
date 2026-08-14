import React, { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Card, Text, ActivityIndicator, Appbar } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Project } from "@/src/models/Project";
import { useInspection } from "@/src/context/InspectionContext";
import { logger } from "@/src/utils/logger";
import DashboardActionCard from "@/src/components/dashboard/DashboardActionCard";
import DashboardCardGrid from "@/src/components/dashboard/DashboardCardGrid";
import { COLORS, RADIUS, SPACING } from "@/src/constants/ui";
import { ensureProjectFolder } from "@/src/utils/storageManager";
import { canonicalProjectLabel } from "@/src/utils/folderNaming";

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

  useEffect(() => {
    if (!project) return;
    // Auto-create Download/ACCC Dynamic Inspection/<District>_<Project> when an
    // existing project is opened. Failure is logged, not fatal.
    ensureProjectFolder(canonicalProjectLabel(project)).catch((e) =>
      logger.error("[Storage] dashboard ensureProjectFolder failed:", e)
    );
  }, [project]);

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
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>Project not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Project Dashboard" />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.card}>
          <Card.Title
            title="Project Information"
            titleVariant="titleMedium"
            titleStyle={{ fontWeight: "700" }}
            left={() => (
              <MaterialCommunityIcons
                name="information-outline"
                size={22}
                color={COLORS.primary}
              />
            )}
          />
          <Card.Content>
            <View style={styles.infoGrid}>
              <InfoField label="Project" value={project.ProjectName || "-"} />
              <InfoField label="Division" value={project.DivisionName || "-"} />
              <InfoField label="District" value={project.DistrictName || "-"} />
              <InfoField label="Inspector" value={project.InspectorName || "-"} />
              <InfoField label="Client" value={project.Client || "-"} />
            </View>
            <InfoField label="Description" value={project.Description || "-"} full />
          </Card.Content>
        </Card>

        <Text style={styles.sectionHeader}>Statistics</Text>
        <DashboardCardGrid
          projectId={project.ProjectID}
          reloadKey={statReloadKey}
          focused={isFocused}
        />

        <View style={styles.manageCard}>
          <DashboardActionCard
            title="Manage Cards"
            subtitle="Add, edit, reorder or disable dashboard cards"
            icon="tune-variant"
            borderColor={COLORS.primary}
            borderWidth={2}
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

        <Text style={styles.sectionHeader}>Quick Actions</Text>
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

function InfoField({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <View style={full ? styles.infoFull : styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },

  card: {
    marginBottom: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  infoField: {
    width: "50%",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },

  infoFull: {
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },

  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },

  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },

  manageCard: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },

  actionGrid: {
    marginBottom: SPACING.sm,
  },

  actionRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },

  actionHalf: {
    flex: 1,
  },
});
