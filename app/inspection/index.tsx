// frontend/app/inspection/index.tsx

import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar,
  Card,
  Text,
  Searchbar,
  Button,
  Checkbox,
  IconButton,
} from "react-native-paper";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import {
  InspectionListRepository,
  InspectionListItem,
} from "@/src/database/repositories/InspectionListRepository";

import { useInspection } from "@/src/context/InspectionContext";

import { exportInspection, ExportFormat } from "@/src/utils/exportData";
import { logger } from "@/src/utils/logger";

import DeleteInspectionsDialog from "./components/DeleteInspectionsDialog";

export default function InspectionListScreen() {

  const router = useRouter();

  const { projectId } = useLocalSearchParams<{
    projectId: string;
  }>();

  const { project } = useInspection();

  const [search, setSearch] = useState("");

  const [inspections, setInspections] =
    useState<InspectionListItem[]>([]);

  const [selectionMode, setSelectionMode] =
    useState(false);

  const [selectedIds, setSelectedIds] =
    useState<number[]>([]);

  const [deleteDialogVisible, setDeleteDialogVisible] =
    useState(false);

  const [exportingId, setExportingId] =
    useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadInspections();
    }, [projectId])
  );

  async function loadInspections() {

    if (!projectId) return;

    const data =
      await InspectionListRepository.getByProject(
        Number(projectId)
      );

    setInspections(data);
  }

  function openEdit(item: InspectionListItem) {

    const params: Record<string, string> = {
      inspectionId: item.InspectionID.toString(),
      projectId: projectId ?? "",
    };

    if (project) {
      params.projectData = JSON.stringify(project);
    }

    router.push({
      pathname: "/inspection/edit",
      params,
    });

  }

  function handleExport(item: InspectionListItem, format: ExportFormat) {
    if (!projectId || exportingId !== null) return;
    setExportingId(item.InspectionID);
    exportInspection(
      Number(projectId),
      project?.ProjectName ?? "Project",
      item.InspectionID,
      item.PoleID,
      format
    )
      .then((success) => {
        if (!success) {
          Alert.alert("No Data", "No inspection data found to export.");
        }
      })
      .catch((error) => {
        logger.error("Export error:", error);
        Alert.alert("Export Failed", "Unable to export inspection data.");
      })
      .finally(() => setExportingId(null));
  }

  function promptExport(item: InspectionListItem) {
    Alert.alert(`Export ${item.PoleID || "Inspection"}`, "Choose a format", [
      { text: "PDF", onPress: () => handleExport(item, "pdf") },
      { text: "Excel", onPress: () => handleExport(item, "excel") },
      { text: "CSV", onPress: () => handleExport(item, "csv") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function toggleSelection(id: number) {

    setSelectedIds((prev) => {

      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }

      return [...prev, id];
    });

  }

  function selectAll() {

    setSelectedIds(
      inspections.map((i) => i.InspectionID)
    );

  }

  function clearSelection() {

    setSelectedIds([]);

    setSelectionMode(false);

  }

  const selectedDrafts =
    inspections.filter(
      (i) =>
        selectedIds.includes(i.InspectionID) &&
        i.Status === "Draft"
    ).length;

  const selectedCompleted =
    inspections.filter(
      (i) =>
        selectedIds.includes(i.InspectionID) &&
        i.Status === "Completed"
    ).length;

  const query = search.toLowerCase();

  const filtered =
    inspections.filter((item) =>
      item.PoleID.toLowerCase().includes(query) ||
      (item.Division ?? "").toLowerCase().includes(query) ||
      (item.District ?? "").toLowerCase().includes(query) ||
      (item.Block ?? "").toLowerCase().includes(query)
    );

  return (
        <SafeAreaView
      style={styles.container}
      edges={["left", "right", "bottom"]}
    >

      <Appbar.Header>

        <Appbar.BackAction
          onPress={() => router.back()}
        />

        <Appbar.Content
          title={
            selectionMode
              ? `${selectedIds.length} Selected`
              : "Inspection List"
          }
        />

      </Appbar.Header>

      {selectionMode && (

        <Card style={styles.card}>

          <Card.Content>

            <Button
              mode="text"
              icon="checkbox-multiple-marked"
              onPress={selectAll}
            >
              Select All
            </Button>

            <Button
              mode="text"
              icon="checkbox-blank-outline"
              onPress={clearSelection}
            >
              Clear Selection
            </Button>

            <Button
              mode="contained"
              icon="delete"
              disabled={selectedIds.length === 0}
              onPress={() =>
                setDeleteDialogVisible(true)
              }
            >
              Delete Selected
            </Button>

            <Text>
              Draft : {selectedDrafts}
            </Text>

            <Text>
              Completed : {selectedCompleted}
            </Text>

          </Card.Content>

        </Card>

      )}

      <Searchbar
        placeholder="Search Pole ID, Division, District, Block"
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />

      <Button
        mode="contained"
        icon="plus"
        style={styles.button}
        onPress={() =>
          router.push({
            pathname: "/inspection/new",
            params: {
              projectId,
            },
          })
        }
      >
        New Inspection
      </Button>

      <FlatList
        data={filtered}
        keyExtractor={(item) =>
          item.InspectionID.toString()
        }
        renderItem={({ item }) => (

          <Card
            style={[
              styles.card,
              selectedIds.includes(item.InspectionID) && {
                borderWidth: 2,
                borderColor: "#1976D2",
                backgroundColor: "#E3F2FD",
              },
            ]}
            onLongPress={() => {
              setSelectionMode(true);
              toggleSelection(item.InspectionID);
            }}
            onPress={() => {

              if (selectionMode) {
                toggleSelection(item.InspectionID);
                return;
              }

              openEdit(item);

            }}
          >

            <Card.Content>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >

                {selectionMode && (

                  <Checkbox
                    status={
                      selectedIds.includes(
                        item.InspectionID
                      )
                        ? "checked"
                        : "unchecked"
                    }
                    onPress={() =>
                      toggleSelection(
                        item.InspectionID
                      )
                    }
                  />

                )}

                <View style={{ flex: 1 }}>

                  <Text variant="titleMedium">
                    {item.PoleID || "No Pole ID"}
                  </Text>

                  <Text>
                    Division : {item.Division || "N/A"}
                  </Text>

                  <Text>
                    District : {item.District || "N/A"}
                  </Text>

                  <Text>
                    Block : {item.Block || "N/A"}
                  </Text>

                  <Text>
                    Status : {item.Status}
                  </Text>

                  <Text>
                    Date : {item.InspectionDate}
                  </Text>

                </View>

                {!selectionMode && (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <IconButton
                      icon="export-variant"
                      size={20}
                      disabled={exportingId === item.InspectionID}
                      onPress={() => promptExport(item)}
                    />
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => openEdit(item)}
                    />
                  </View>
                )}

              </View>

            </Card.Content>

          </Card>

        )}
      />
      <DeleteInspectionsDialog
        visible={deleteDialogVisible}
        selectedIds={selectedIds}
        selectedDrafts={selectedDrafts}
        selectedCompleted={selectedCompleted}
        onDismiss={() => setDeleteDialogVisible(false)}
        onDeleted={() => { clearSelection(); loadInspections(); }}
      />
          </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },

  search: {
    margin: 20,
  },

  button: {
    marginHorizontal: 20,
    marginBottom: 15,
  },

  card: {
    marginHorizontal: 20,
    marginBottom: 12,
  },

});
