//frontend\app\index.tsx

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Searchbar,
  Button,
  Text,
  Card,
  Menu,
} from "react-native-paper";
import { useRouter, useFocusEffect } from "expo-router";

import { ProjectRepository } from "@/src/database/repositories/ProjectRepository";
import { Project } from "@/src/models/Project";
export default function HomeScreen() {
const router = useRouter();
const [projects, setProjects] = useState<Project[]>([]);
const [search, setSearch] = useState("");
const [sortMenuVisible, setSortMenuVisible] = useState(false);

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
      (item.ProjectName ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (item.DistrictName ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (item.Block ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (item.Client ?? "")
        .toLowerCase()
        .includes(searchText)
    );
  });

  switch (sortBy) {
    case "oldest":
      data.sort((a, b) => a.ProjectID - b.ProjectID);
      break;

    case "projectAZ":
      data.sort((a, b) =>
        a.ProjectName.localeCompare(b.ProjectName)
      );
      break;

    case "projectZA":
      data.sort((a, b) =>
        b.ProjectName.localeCompare(a.ProjectName)
      );
      break;

    case "districtAZ":
      data.sort((a, b) =>
        (a.DistrictName ?? "").localeCompare(
          b.DistrictName ?? ""
        )
      );
      break;

    case "districtZA":
      data.sort((a, b) =>
        (b.DistrictName ?? "").localeCompare(
          a.DistrictName ?? ""
        )
      );
      break;

    case "clientAZ":
      data.sort((a, b) =>
        (a.Client ?? "").localeCompare(
          b.Client ?? ""
        )
      );
      break;

    case "clientZA":
      data.sort((a, b) =>
        (b.Client ?? "").localeCompare(
          a.Client ?? ""
        )
      );
      break;

    default:
      data.sort((a, b) => b.ProjectID - a.ProjectID);
  }

  return data;
}, [projects, searchText, sortBy]);
  return (
    <SafeAreaView style={styles.container}>

      <Text variant="headlineMedium" style={styles.title}>
        ACCC Pole Inspection
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
  <Menu.Item
    onPress={() => {
      setSortBy("newest");
      setSortMenuVisible(false);
    }}
    title="Newest First"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("oldest");
      setSortMenuVisible(false);
    }}
    title="Oldest First"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("projectAZ");
      setSortMenuVisible(false);
    }}
    title="Project A–Z"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("projectZA");
      setSortMenuVisible(false);
    }}
    title="Project Z–A"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("districtAZ");
      setSortMenuVisible(false);
    }}
    title="District A–Z"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("districtZA");
      setSortMenuVisible(false);
    }}
    title="District Z–A"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("clientAZ");
      setSortMenuVisible(false);
    }}
    title="Client A–Z"
  />

  <Menu.Item
    onPress={() => {
      setSortBy("clientZA");
      setSortMenuVisible(false);
    }}
    title="Client Z–A"
  />
</Menu>

{filteredProjects.length === 0 ? (
  <View style={styles.emptyContainer}>
    <Text variant="titleMedium">
      No Projects Found
    </Text>

    <Text variant="bodyMedium" style={styles.subtitle}>
      Tap "New Project" to create your first project.
    </Text>
  </View>
) : (
  <FlatList
    data={filteredProjects}
    keyExtractor={(item) => item.ProjectID.toString()}
    renderItem={({ item }) => (
      <Card
  style={{ marginBottom: 12 }}
  onPress={() =>
    router.push({
      pathname: "/projects/dashboard",
      params: {
        projectId: item.ProjectID.toString(),
      },
    })
  }
>
        <Card.Content>
          <Text variant="titleMedium">
            {item.ProjectName}
          </Text>

          <Text>
            District: {item.DistrictName}
          </Text>

          <Text>
            Block: {item.Block || "-"}
          </Text>

          <Text>
            Client: {item.Client || "-"}
          </Text>
        </Card.Content>
      </Card>
    )}
  />
)}

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
});