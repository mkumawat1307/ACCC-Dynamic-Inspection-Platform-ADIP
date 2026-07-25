import React, { useState, useCallback } from "react";
import { View, FlatList, ScrollView, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar, Card, Text, IconButton, Chip, Portal, Dialog,
  Button, TextInput, Switch, Divider,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getDatabase } from "../../src/database/db";

interface Section {
  SectionID: number;
  TemplateID: number;
  SectionName: string;
  SectionKey: string;
  Description: string | null;
  Icon: string | null;
  DisplayOrder: number;
  IsRepeatable: number;
  IsVisible: number;
  IsDefault: number;
  IsActive: number;
  FieldCount: number;
}

export default function SectionsScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionKey, setSectionKey] = useState("");
  const [description, setDescription] = useState("");

  const loadSections = useCallback(async () => {
    const db = await getDatabase();
    const data = await db.getAllAsync<Section>(
      `SELECT s.*,
       (SELECT COUNT(*) FROM InspectionFields f WHERE f.SectionID = s.SectionID AND f.IsActive = 1) as FieldCount
       FROM InspectionSections s
       INNER JOIN InspectionTemplates t ON t.TemplateID = s.TemplateID
       WHERE s.IsActive = 1 AND t.IsDefault = 1
       ORDER BY CASE WHEN s.SectionKey = 'photos' THEN 1 ELSE 0 END, s.DisplayOrder`
    );
    setSections(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSections();
    }, [loadSections])
  );

  const generateKey = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const openCreateDialog = () => {
    setEditing(null);
    setSectionName("");
    setSectionKey("");
    setDescription("");
    setShowDialog(true);
  };

  const openEditDialog = (s: Section) => {
    setEditing(s);
    setSectionName(s.SectionName);
    setSectionKey(s.SectionKey);
    setDescription(s.Description ?? "");
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!sectionName.trim()) {
      Alert.alert("Error", "Section name is required");
      return;
    }
    const key = sectionKey.trim() || generateKey(sectionName.trim());
    const db = await getDatabase();

    if (editing) {
      await db.runAsync(
        `UPDATE InspectionSections SET SectionName = ?, SectionKey = ?, Description = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionID = ?`,
        [sectionName.trim(), key, description.trim() || null, editing.SectionID]
      );
    } else {
      const maxOrder = sections.length > 0
        ? Math.max(...sections.map((s) => s.DisplayOrder))
        : 0;
      const template = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      await db.runAsync(
        `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
         VALUES (?, ?, ?, ?, ?, 0, 1, 0, 1)`,
        [template?.TemplateID ?? 1, sectionName.trim(), key, description.trim() || null, maxOrder + 1]
      );
    }

    setShowDialog(false);
    loadSections();
  };

  const handleDelete = (s: Section) => {
    if (s.IsDefault) {
      Alert.alert("Cannot Delete", "Default sections cannot be deleted.");
      return;
    }
    Alert.alert(
      "Delete Section",
      `Delete "${s.SectionName}"? All fields in this section will also be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const db = await getDatabase();
            await db.runAsync(
              `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionID = ?`,
              [s.SectionID]
            );
            loadSections();
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...sections];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < updated.length; i++) {
        await db.runAsync(
          `UPDATE InspectionSections SET DisplayOrder = ? WHERE SectionID = ?`,
          [i + 1, updated[i].SectionID]
        );
      }
    });
    setSections(updated);
  };

  const handleMoveDown = async (index: number) => {
    if (index === sections.length - 1) return;
    const updated = [...sections];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < updated.length; i++) {
        await db.runAsync(
          `UPDATE InspectionSections SET DisplayOrder = ? WHERE SectionID = ?`,
          [i + 1, updated[i].SectionID]
        );
      }
    });
    setSections(updated);
  };

  const renderSection = ({ item, index }: { item: Section; index: number }) => {
    const isLocked = item.SectionKey === "photos";
    const isDeviceSection =
      item.SectionKey.endsWith("_information") &&
      item.SectionKey !== "general_information";
    const deviceTypeSlug = isDeviceSection
      ? item.SectionKey.replace(/_information$/, "")
      : null;

    const handlePress = () => {
      if (isLocked) {
        Alert.alert("Locked", "This section cannot be edited.");
        return;
      }
      if (isDeviceSection) {
        router.push({
          pathname: "/settings/device-types" as any,
          params: { deviceType: deviceTypeSlug },
        });
      } else {
        router.push({
          pathname: "/settings/fields" as any,
          params: {
            sectionId: item.SectionID,
            sectionName: item.SectionName,
          },
        });
      }
    };

    return (
      <Card style={styles.card} onPress={handlePress}>
        <Card.Content>
          <View style={styles.cardRow}>
            <View style={styles.orderButtons}>
              <IconButton
                icon="chevron-up"
                size={20}
                disabled={index === 0 || isLocked}
                onPress={(e) => { e.stopPropagation?.(); handleMoveUp(index); }}
              />
              <Text variant="labelMedium" style={styles.orderNumber}>{index + 1}</Text>
              <IconButton
                icon="chevron-down"
                size={20}
                disabled={index === sections.length - 1 || isLocked}
                onPress={(e) => { e.stopPropagation?.(); handleMoveDown(index); }}
              />
            </View>
            <View style={styles.cardInfo}>
              <View style={styles.cardTitleRow}>
                <Text variant="titleMedium" style={styles.cardTitle}>
                  {item.SectionName}
                </Text>
                {!isLocked && (
                  <IconButton
                    icon="pencil"
                    size={18}
                    onPress={(e) => { e.stopPropagation?.(); openEditDialog(item); }}
                  />
                )}
                {!item.IsDefault && !isLocked && (
                  <IconButton
                    icon="delete"
                    size={18}
                    iconColor="#D32F2F"
                    onPress={(e) => { e.stopPropagation?.(); handleDelete(item); }}
                  />
                )}
                {!isLocked && <IconButton icon="chevron-right" size={20} />}
              </View>
              <Text variant="bodySmall" style={styles.cardSubtitle}>
                Key: {item.SectionKey} • {item.FieldCount} fields
              </Text>
              <View style={styles.chipRow}>
                {isLocked ? (
                  <Chip compact style={[styles.chip, { backgroundColor: "#E0E0E0" }]}>Locked</Chip>
                ) : isDeviceSection ? (
                  <Chip compact style={[styles.chip, { backgroundColor: "#E3F2FD" }]}>Device Type</Chip>
                ) : item.IsDefault ? (
                  <Chip compact style={[styles.chip, { backgroundColor: "#E8F5E9" }]}>Default</Chip>
                ) : (
                  <Chip compact style={[styles.chip, { backgroundColor: "#FFF3E0" }]}>Custom</Chip>
                )}
                {!item.IsVisible && !isLocked ? (
                  <Chip compact style={[styles.chip, { backgroundColor: "#FFEBEE" }]}>Hidden</Chip>
                ) : null}
              </View>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Sections" />
        <Appbar.Action icon="devices" onPress={() => router.push("/settings/device-types" as any)} />
        <Appbar.Action icon="plus" onPress={openCreateDialog} />
      </Appbar.Header>

      <FlatList
        data={sections}
        keyExtractor={(item) => String(item.SectionID)}
        renderItem={renderSection}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sections found</Text>
          </View>
        }
      />

      <Portal>
        <Dialog visible={showDialog} onDismiss={() => setShowDialog(false)}>
          <Dialog.Title>{editing ? "Edit Section" : "New Section"}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Section Name *"
              value={sectionName}
              onChangeText={(text) => {
                setSectionName(text);
                if (!editing) setSectionKey(generateKey(text));
              }}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Section Key *"
              value={sectionKey}
              onChangeText={setSectionKey}
              mode="outlined"
              style={styles.input}
              disabled={!!editing}
            />
            <TextInput
              label="Description"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDialog(false)}>Cancel</Button>
            <Button onPress={handleSave}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  list: { padding: 16, paddingBottom: 30 },
  card: { marginBottom: 12 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  orderButtons: { alignItems: "center", marginRight: 8 },
  orderNumber: { fontWeight: "700", fontSize: 16 },
  cardInfo: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontWeight: "600", flex: 1 },
  cardSubtitle: { color: "#666", marginTop: 2 },
  chipRow: { flexDirection: "row", marginTop: 4, gap: 4 },
  chip: { height: 26 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#999" },
  input: { marginBottom: 12 },
});
