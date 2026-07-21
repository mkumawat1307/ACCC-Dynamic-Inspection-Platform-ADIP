//frontend\app\projects\dashboard.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Card,
  Text,
  Button,
  ActivityIndicator,
  Appbar,
  Menu,
  Divider,
  Portal,
  Dialog,
} from "react-native-paper";
import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
import StatCard from "@/src/components/StatCard";

export default function ProjectDashboard() {
  const { projectId } = useLocalSearchParams<{
    projectId: string;
  }>();
  const router = useRouter();

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

  const data = await ProjectRepository.getProjectById(
    Number(projectId)
  );

  setProject(data);

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

<Button
  mode="contained"
  icon="plus"
  style={styles.button}
  onPress={() =>
    router.push({
      pathname: "/inspection/new",
      params: {
        projectId: project.ProjectID.toString(),
      },
    })
  }
>
  New Inspection
</Button>

<Button
  mode="outlined"
  icon="format-list-bulleted"
  style={styles.button}
  onPress={() =>
    router.push({
      pathname: "/inspection",
      params: {
        projectId: project.ProjectID.toString(),
      },
    })
  }
>
  Inspection List
</Button>
    </ScrollView>

    <Portal>
    <Dialog
        visible={deleteDialogVisible}
        onDismiss={() => setDeleteDialogVisible(false)}
    >
        <Dialog.Title>Delete Project</Dialog.Title>

        <Dialog.Content>
        <Text variant="bodyMedium">
            Project:
        </Text>

        <Text
            variant="titleMedium"
            style={{ marginBottom: 16 }}
        >
            {project.ProjectName}
        </Text>

        <Text variant="bodyMedium">
            Deleting this project will permanently remove:
        </Text>

        <Text style={{ marginTop: 10 }}>
            • Project{"\n"}
            • All inspections{"\n"}
            • All photos{"\n"}
            • Inspection values{"\n"}
            • Inspection devices
        </Text>

        <Text
            style={{
            marginTop: 20,
            fontWeight: "bold",
            }}
        >
            Would you like to export the data before deleting?
        </Text>
        </Dialog.Content>

        <Dialog.Actions>

        <Button
            onPress={() => {
            setDeleteDialogVisible(false);

            // Export Excel (Next Step)
            }}
        >
            Export & Delete
        </Button>

        <Button
        textColor="red"
        onPress={async () => {
            try {
            setDeleteDialogVisible(false);

            await ProjectRepository.deleteProject(project.ProjectID);

            router.back();

            } catch (error) {
            console.error("Delete Project Error:", error);
            }
        }}
        >
        Delete
        </Button>

        <Button
            onPress={() => setDeleteDialogVisible(false)}
        >
            Cancel
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
});