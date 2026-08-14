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
  SegmentedButtons,
} from "react-native-paper";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import {
  InspectionListRepository,
  InspectionListItem,
} from "@/src/database/repositories/InspectionListRepository";
import { INSPECTION_FINAL_STATUSES } from "@/src/database/repositories/InspectionRepository";

import { useInspection } from "@/src/context/InspectionContext";

import { useExportFlow } from "@/src/components/export/useExportFlow";

import DeleteInspectionsDialog from "@/src/components/app/inspection/components/DeleteInspectionsDialog";
import InspectionExportDialogs from "@/src/components/app/inspection/components/ExportDialogs";

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

  const [tab, setTab] = useState<"final" | "drafts">("final");

  const exportFlow = useExportFlow(
    Number(projectId ?? 0),
    project?.ProjectName ?? "Project",
    {
      division: project?.DivisionName ?? "",
      inspector: project?.InspectorName ?? "",
    }
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
    }, [projectId, tab])
  );

  async function loadInspections() {

    if (!projectId) return;

    const statuses = tab === "final" ? INSPECTION_FINAL_STATUSES : ["Draft"];

    const data =
      await InspectionListRepository.getByProject(
        Number(projectId),
        statuses
      );

    setInspections(data);
  }

  function switchTab(next: "final" | "drafts") {
    if (next === tab) return;
    clearSelection();
    setTab(next);
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
    exportFlow.beginExport({ ids: [item.InspectionID] });
  }

  function handleBulkExport() {
    if (selectedIds.length === 0) {
      Alert.alert("No Selection", "Please select at least one inspection.");
      return;
    }
    exportFlow.beginExport({ ids: selectedIds });
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

  const filtered =
    InspectionListRepository.filterByQuery(inspections, search);

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

          <Card.Content style={styles.selectionContent}>

            <View style={styles.selectionRow}>

              <Button
                mode="text"
                icon="checkbox-multiple-marked"
                compact
                onPress={selectAll}
              >
                Select All
              </Button>

              <Button
                mode="text"
                icon="checkbox-blank-outline"
                compact
                onPress={clearSelection}
              >
                Clear Selection
              </Button>

              <View style={styles.selectionCounts}>

                <Text variant="labelMedium" style={styles.draftCount}>
                  Draft : {selectedDrafts}
                </Text>

                <Text variant="labelMedium">
                  Completed : {selectedCompleted}
                </Text>

              </View>

            </View>

            <View style={styles.selectionRow}>

              {tab === "final" && (
                <Button
                  mode="contained"
                  icon="export-variant"
                  compact
                  disabled={selectedIds.length === 0 || exportFlow.busy}
                  onPress={handleBulkExport}
                >
                  Export Selected
                </Button>
              )}

              <Button
                mode="contained"
                icon="delete"
                compact
                disabled={selectedIds.length === 0}
                onPress={() =>
                  setDeleteDialogVisible(true)
                }
              >
                Delete Selected
              </Button>

            </View>

          </Card.Content>

        </Card>

      )}

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => switchTab(v as "final" | "drafts")}
        buttons={[
          { value: "final", label: "Final" },
          { value: "drafts", label: "Drafts" },
        ]}
        style={styles.segmented}
      />

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
                    {tab === "final" && (
                      <IconButton
                        icon="export-variant"
                        size={20}
                        disabled={exportFlow.busy}
                        onPress={() => handleSingleExport(item)}
                      />
                    )}
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

  segmented: {
    marginHorizontal: 20,
    marginBottom: 15,
  },

  card: {
    marginHorizontal: 20,
    marginBottom: 12,
  },

  selectionContent: {
    paddingVertical: 8,
  },

  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  selectionCounts: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },

  draftCount: {
    marginRight: 12,
  },

});
