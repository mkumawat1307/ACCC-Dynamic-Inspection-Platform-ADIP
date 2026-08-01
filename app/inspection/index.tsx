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

import { useExportFlow } from "@/src/components/export/useExportFlow";

import DeleteInspectionsDialog from "./components/DeleteInspectionsDialog";
import InspectionExportDialogs from "./components/ExportDialogs";

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

  const exportFlow = useExportFlow(
    Number(projectId ?? 0),
    project?.ProjectName ?? "Project"
  );

  const exportState = exportFlow.state;
  const formatDialogTarget =
    exportState.phase === "choosing" ? exportState.target : null;
  const exportingFormat =
    exportState.phase === "exporting" ? exportState.format : null;
  const exportResult = exportState.phase === "success" ? exportState.result : null;
  const exportErrorMessage = exportState.phase === "error" ? exportState.message : null;

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

  function handleSingleExport(item: InspectionListItem) {
    exportFlow.beginExport({ ids: [item.InspectionID], poleId: item.PoleID || null });
  }

  function handleBulkExport() {
    if (selectedIds.length === 0) {
      Alert.alert("No Selection", "Please select at least one inspection.");
      return;
    }
    exportFlow.beginExport({ ids: selectedIds, poleId: null });
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
      (item.District ?? "").toLowerCase().includes(query)
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

        {selectionMode && (
          <Appbar.Action
            icon="close"
            onPress={clearSelection}
          />
        )}

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
              icon="export-variant"
              disabled={selectedIds.length === 0 || exportFlow.busy}
              onPress={handleBulkExport}
            >
              Export Selected
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
        placeholder="Search Pole ID, Division, District"
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
                      disabled={exportFlow.busy}
                      onPress={() => handleSingleExport(item)}
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
      <InspectionExportDialogs
        formatDialog={formatDialogTarget}
        exporting={exportFlow.busy}
        format={exportingFormat}
        result={exportResult}
        errorMessage={exportErrorMessage}
        onChooseFormat={(f) => { void exportFlow.runExport(f); }}
        onCancelFormat={exportFlow.dismiss}
        onRetry={exportFlow.retry}
        onCloseError={exportFlow.dismiss}
        onCloseSuccess={exportFlow.dismiss}
        onOpen={() => { void exportFlow.open(); }}
        onShare={() => { void exportFlow.share(); }}
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
