// frontend/app/inspection/index.tsx

import React, { useEffect, useState } from "react";
import {
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
  Dialog,
  Portal,
} from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  InspectionListRepository,
  InspectionListItem,
} from "@/src/database/repositories/InspectionListRepository";

import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";

export default function InspectionListScreen() {

  const router = useRouter();

  const { projectId } = useLocalSearchParams<{
    projectId: string;
  }>();

  const [search, setSearch] = useState("");

  const [inspections, setInspections] =
    useState<InspectionListItem[]>([]);

  const [selectionMode, setSelectionMode] =
    useState(false);

  const [selectedIds, setSelectedIds] =
    useState<number[]>([]);

  const [deleteDialogVisible, setDeleteDialogVisible] =
    useState(false);

  useEffect(() => {
    loadInspections();
  }, []);

  async function loadInspections() {

    if (!projectId) return;

    const data =
      await InspectionListRepository.getByProject(
        Number(projectId)
      );

    setInspections(data);
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
    inspections.filter((item) =>
      item.PoleID.toLowerCase().includes(
        search.toLowerCase()
      )
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
        placeholder="Search Pole ID"
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

            router.push({
            pathname: "/inspection/edit",
            params: {
                inspectionId: item.InspectionID.toString(),
                projectId,
            },
            });

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
                    Status : {item.Status}
                  </Text>

                  <Text>
                    Date : {item.InspectionDate}
                  </Text>

                </View>

              </View>

            </Card.Content>

          </Card>

        )}
      />
            <Portal>

        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >

          <Dialog.Title>
            Delete Inspections
          </Dialog.Title>

          <Dialog.Content>

            <Text variant="bodyMedium">
              You selected {selectedIds.length} inspection(s).
            </Text>

            <Text variant="bodyMedium">
              Draft : {selectedDrafts}
            </Text>

            <Text variant="bodyMedium">
              Completed : {selectedCompleted}
            </Text>

            <Text
              variant="bodyMedium"
              style={{
                marginTop: 12,
              }}
            >
              All selected inspections and their associated
              data will be permanently deleted.
            </Text>

            <Text
              variant="bodyMedium"
              style={{
                color: "red",
                marginTop: 10,
                fontWeight: "bold",
              }}
            >
              This action cannot be undone.
            </Text>

          </Dialog.Content>

          <Dialog.Actions>

            <Button
              onPress={() =>
                setDeleteDialogVisible(false)
              }
            >
              Cancel
            </Button>

            <Button
            mode="contained"
            onPress={async () => {
                try {
                await InspectionRepository.deleteMultipleInspections(
                    selectedIds
                );

                setDeleteDialogVisible(false);

                clearSelection();

                await loadInspections();

                console.log("Delete completed");
                } catch (error) {
                console.error("Delete failed:", error);
                }
            }}
            >
            Delete
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