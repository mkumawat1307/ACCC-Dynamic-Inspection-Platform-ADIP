import React, { useState, useCallback, useEffect } from "react";
import { View, FlatList, ScrollView, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar, Card, Text, IconButton, Chip, Button, Portal,
  Dialog, TextInput, Divider, Switch as PaperSwitch,
} from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import DeviceFieldDefinitionsRepository, {
  DeviceFieldDefinition,
} from "../../src/database/repositories/DeviceFieldDefinitionsRepository";
import { getDatabase } from "../../src/database/db";

const FIELD_TYPES = [
  { label: "Text", value: "text" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Checkbox", value: "checkbox" },
];

export default function DeviceTypesScreen() {
  const router = useRouter();
  const { deviceType: initialDeviceType } = useLocalSearchParams<{ deviceType?: string }>();
  const [defaultTemplateId, setDefaultTemplateId] = useState<number>(1);
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [fields, setFields] = useState<DeviceFieldDefinition[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());

  const [fieldDialogVisible, setFieldDialogVisible] = useState(false);
  const [editingField, setEditingField] = useState<DeviceFieldDefinition | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldRequired, setFieldRequired] = useState(false);

  const [typeDialogVisible, setTypeDialogVisible] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeviceFieldDefinition | null>(null);
  const [deleteTypeDialogVisible, setDeleteTypeDialogVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const t = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      if (t) setDefaultTemplateId(t.TemplateID);
    })();
  }, []);

  const loadDeviceTypes = useCallback(async () => {
    const types = await DeviceFieldDefinitionsRepository.getDeviceTypes(defaultTemplateId);
    setDeviceTypes(types);
    if (types.length > 0 && !selectedType) {
      if (initialDeviceType) {
        const matched = types.find(
          (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_") === initialDeviceType
        );
        setSelectedType(matched ?? types[0]);
      } else {
        setSelectedType(types[0]);
      }
    }
    await loadEnabledTypes(types);
  }, [initialDeviceType, defaultTemplateId]);

  const loadEnabledTypes = async (types?: string[]) => {
    const db = await getDatabase();
    const countFields = await db.getAllAsync<{ FieldKey: string }>(
      `SELECT f.FieldKey FROM InspectionFields f
       INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
       WHERE f.IsActive = 1 AND f.FieldKey LIKE '%_count' AND s.TemplateID = ?`,
      [defaultTemplateId]
    );
    const enabled = new Set<string>();
    for (const row of countFields) {
      const match = row.FieldKey.match(/^(.+)_count$/);
      if (match) {
        const typeName = (types ?? deviceTypes).find(
          (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count" === row.FieldKey
        );
        if (typeName) enabled.add(typeName);
      }
    }
    setEnabledTypes(enabled);
  };

  const loadFields = useCallback(async () => {
    if (!selectedType) {
      setFields([]);
      return;
    }
    const data = await DeviceFieldDefinitionsRepository.getByDeviceType(selectedType, defaultTemplateId);
    setFields(data);
  }, [selectedType, defaultTemplateId]);

  useFocusEffect(
    useCallback(() => {
      loadDeviceTypes();
    }, [loadDeviceTypes])
  );

  useFocusEffect(
    useCallback(() => {
      loadFields();
    }, [loadFields])
  );

  const handleToggleInspection = async (type: string) => {
    const db = await getDatabase();
    const isEnabled = enabledTypes.has(type);
    const sectionKey = type.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information";
    const countKey = type.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count";

    if (isEnabled) {
      await db.runAsync(
        `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
         WHERE FieldKey = ? AND SectionID IN (SELECT SectionID FROM InspectionSections WHERE TemplateID = ?)`,
        [countKey, defaultTemplateId]
      );
      await db.runAsync(
        `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
         WHERE SectionKey = ? AND TemplateID = ?`,
        [sectionKey, defaultTemplateId]
      );
    } else {
      // Enable on default template
      const existingSection = await db.getFirstAsync<{ SectionID: number }>(
        `SELECT SectionID FROM InspectionSections WHERE SectionKey = ? AND TemplateID = ?`,
        [sectionKey, defaultTemplateId]
      );

      if (!existingSection) {
        const maxSectionOrder = await db.getFirstAsync<{ max: number }>(
          `SELECT COALESCE(MAX(DisplayOrder), 0) as max FROM InspectionSections WHERE TemplateID = ?`,
          [defaultTemplateId]
        );
        await db.runAsync(
          `INSERT INTO InspectionSections (TemplateID, SectionName, SectionKey, Description, DisplayOrder, IsRepeatable, IsVisible, IsDefault, IsActive)
           VALUES (?, ?, ?, ?, ?, 0, 1, 0, 1)`,
          [defaultTemplateId, type + " Information", sectionKey, type + " device details", (maxSectionOrder?.max ?? 0) + 1]
        );
      } else {
        await db.runAsync(
          `UPDATE InspectionSections SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE SectionKey = ? AND TemplateID = ?`,
          [sectionKey, defaultTemplateId]
        );
      }

      const existingField = await db.getFirstAsync<{ FieldID: number }>(
        `SELECT f.FieldID FROM InspectionFields f
         INNER JOIN InspectionSections s ON f.SectionID = s.SectionID
         WHERE f.FieldKey = ? AND s.TemplateID = ?`,
        [countKey, defaultTemplateId]
      );

      if (!existingField) {
        const targetSection = await db.getFirstAsync<{ SectionID: number }>(
          `SELECT SectionID FROM InspectionSections WHERE SectionKey = ? AND TemplateID = ? LIMIT 1`,
          [sectionKey, defaultTemplateId]
        );
        if (targetSection) {
          const maxFieldOrder = await db.getFirstAsync<{ max: number }>(
            `SELECT COALESCE(MAX(DisplayOrder), 0) as max FROM InspectionFields WHERE SectionID = ?`,
            [targetSection.SectionID]
          );
          await db.runAsync(
            `INSERT INTO InspectionFields (SectionID, FieldName, FieldKey, FieldType, Placeholder, IsRequired, DisplayOrder, IsVisible, IsReadOnly, IsSystemField, Width, IsActive)
             VALUES (?, ?, ?, 'number', ?, 0, ?, 1, 0, 0, 12, 1)`,
            [targetSection.SectionID, type + " Count", countKey, "Enter " + type + " Count", (maxFieldOrder?.max ?? 0) + 1]
          );
        }
      } else {
        await db.runAsync(
          `UPDATE InspectionFields SET IsActive = 1, UpdatedAt = CURRENT_TIMESTAMP WHERE FieldKey = ?`,
          [countKey]
        );
      }

      // Sync to all cloned templates
      await loadEnabledTypes();
    }

    await loadEnabledTypes();
  };

  const openAddFieldDialog = () => {
    setEditingField(null);
    setFieldName("");
    setFieldLabel("");
    setFieldType("text");
    setFieldRequired(false);
    setFieldDialogVisible(true);
  };

  const openEditFieldDialog = (field: DeviceFieldDefinition) => {
    setEditingField(field);
    setFieldName(field.FieldName);
    setFieldLabel(field.Label);
    setFieldType(field.FieldType);
    setFieldRequired(field.IsRequired === 1);
    setFieldDialogVisible(true);
  };

  const handleSaveField = async () => {
    if (!fieldName.trim() || !fieldLabel.trim()) return;

    if (editingField) {
      await DeviceFieldDefinitionsRepository.update({
        ...editingField,
        Label: fieldLabel.trim(),
        FieldType: fieldType,
        IsRequired: fieldRequired ? 1 : 0,
      });
    } else {
      const maxOrder = fields.length > 0
        ? Math.max(...fields.map((f) => f.DisplayOrder))
        : 0;
      await DeviceFieldDefinitionsRepository.add({
        DeviceType: selectedType,
        FieldName: fieldName.trim().replace(/\s+/g, ""),
        Label: fieldLabel.trim(),
        FieldType: fieldType,
        IsRequired: fieldRequired ? 1 : 0,
        DisplayOrder: maxOrder + 1,
        IsActive: 1,
      }, defaultTemplateId);
    }

    setFieldDialogVisible(false);
    loadFields();
  };

  const confirmDeleteField = (field: DeviceFieldDefinition) => {
    setDeleteTarget(field);
    setDeleteDialogVisible(true);
  };

  const handleDeleteField = async () => {
    if (!deleteTarget) return;
    await DeviceFieldDefinitionsRepository.delete(deleteTarget.FieldDefID!);

    setDeleteDialogVisible(false);
    setDeleteTarget(null);
    loadFields();
  };

  const handleMoveUp = async (id: number) => {
    await DeviceFieldDefinitionsRepository.moveUp(id);
    loadFields();
  };

  const handleMoveDown = async (id: number) => {
    await DeviceFieldDefinitionsRepository.moveDown(id);
    loadFields();
  };

  const handleAddDeviceType = async () => {
    if (!newTypeName.trim()) return;
    const type = newTypeName.trim();

    if (deviceTypes.some((dt) => dt.toLowerCase() === type.toLowerCase())) {
      Alert.alert("Duplicate", `Device type "${type}" already exists.`);
      return;
    }

    await DeviceFieldDefinitionsRepository.add({
      DeviceType: type,
      FieldName: type + "Status",
      Label: type + " Status",
      FieldType: "dropdown",
      IsRequired: 0,
      DisplayOrder: 1,
      IsActive: 1,
    }, defaultTemplateId);

    setTypeDialogVisible(false);
    setNewTypeName("");
    setSelectedType(type);
    loadDeviceTypes();
  };

  const handleDeleteDeviceType = async () => {
    if (!selectedType) return;
    const db = await getDatabase();

    // Deactivate all field definitions for this type (default template only)
    await db.runAsync(
      `UPDATE DeviceFieldDefinitions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
       WHERE DeviceType = ? AND TemplateID = ?`,
      [selectedType, defaultTemplateId]
    );

    // Deactivate all device options for this type (default template only)
    await db.runAsync(
      `UPDATE DeviceOptions SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
       WHERE DeviceType = ? AND TemplateID = ?`,
      [selectedType, defaultTemplateId]
    );

    // Deactivate section (default template only)
    const sectionKey = selectedType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_information";
    await db.runAsync(
      `UPDATE InspectionSections SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
       WHERE SectionKey = ? AND TemplateID = ?`,
      [sectionKey, defaultTemplateId]
    );

    // Deactivate count field (default template only)
    const countKey = selectedType.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_count";
    await db.runAsync(
      `UPDATE InspectionFields SET IsActive = 0, UpdatedAt = CURRENT_TIMESTAMP
       WHERE FieldKey = ? AND SectionID IN (SELECT SectionID FROM InspectionSections WHERE TemplateID = ?)`,
      [countKey, defaultTemplateId]
    );

    // Remove from project device types
    await db.runAsync(
      `DELETE FROM ProjectDeviceTypes WHERE DeviceType = ?`,
      [selectedType]
    );

    // Delete device records
    await db.runAsync(
      `DELETE FROM DeviceRecords WHERE DeviceType = ?`,
      [selectedType]
    );

    setDeleteTypeDialogVisible(false);
    setSelectedType("");
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      next.delete(selectedType);
      return next;
    });
    loadDeviceTypes();
  };

  const renderField = ({ item, index }: { item: DeviceFieldDefinition; index: number }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <Text variant="titleMedium">{item.Label}</Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              Key: {item.FieldName} | Type: {item.FieldType}
              {item.IsRequired ? " | Required" : ""}
            </Text>
          </View>
          <View style={styles.actions}>
            {item.FieldType === "dropdown" && (
              <Button
                mode="outlined"
                compact
                icon="format-list-bulleted"
                style={{ marginRight: 4 }}
                onPress={() =>
                  router.push({
                    pathname: "/settings/device-options" as any,
                    params: { deviceType: item.DeviceType, fieldName: item.FieldName },
                  })
                }
              >
                Options
              </Button>
            )}
            <IconButton icon="pencil" size={20} onPress={() => openEditFieldDialog(item)} />
            <IconButton icon="delete" size={20} iconColor="#D32F2F" onPress={() => confirmDeleteField(item)} />
            <IconButton
              icon="chevron-up"
              size={20}
              disabled={index === 0}
              onPress={() => handleMoveUp(item.FieldDefID!)}
            />
            <IconButton
              icon="chevron-down"
              size={20}
              disabled={index === fields.length - 1}
              onPress={() => handleMoveDown(item.FieldDefID!)}
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Device Types" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Device Types</Text>
          <Button mode="contained" onPress={() => setTypeDialogVisible(true)}>
            Add Device Type
          </Button>
        </View>
        <View style={styles.chipRow}>
          {deviceTypes.map((dt) => (
            <Chip
              key={dt}
              selected={selectedType === dt}
              onPress={() => setSelectedType(dt)}
              style={[styles.typeChip, selectedType === dt && styles.typeChipSelected]}
            >
              {dt}
            </Chip>
          ))}
        </View>

        <Divider style={styles.divider} />

        {selectedType ? (
          <>
            <View style={styles.enableRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={{ fontWeight: "600" }}>
                  {selectedType}
                </Text>
                <Text variant="bodySmall" style={{ color: "#666" }}>
                  {enabledTypes.has(selectedType)
                    ? "Enabled in inspection form"
                    : "Not in inspection form"}
                </Text>
              </View>
              <PaperSwitch
                value={enabledTypes.has(selectedType)}
                onValueChange={() => handleToggleInspection(selectedType)}
              />
              <IconButton
                icon="delete"
                size={22}
                iconColor="#D32F2F"
                onPress={() => setDeleteTypeDialogVisible(true)}
              />
            </View>

            <Divider style={styles.divider} />

            <View style={styles.headerRow}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {selectedType} Fields ({fields.length})
              </Text>
              <Button mode="contained" onPress={openAddFieldDialog}>
                Add Field
              </Button>
            </View>

            <FlatList
              data={fields}
              keyExtractor={(item) => String(item.FieldDefID)}
              renderItem={renderField}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No fields defined for this device type</Text>
                </View>
              }
            />
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {deviceTypes.length === 0
                ? "No device types defined yet. Add one to get started."
                : "Select a device type above to manage its fields"
              }
            </Text>
          </View>
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={fieldDialogVisible} onDismiss={() => setFieldDialogVisible(false)}>
          <Dialog.Title>{editingField ? "Edit Field" : "Add Field"}</Dialog.Title>
          <Dialog.Content>
            {!editingField && (
              <TextInput
                mode="outlined"
                label="Field Key (no spaces)"
                value={fieldName}
                onChangeText={setFieldName}
                style={styles.input}
              />
            )}
            <TextInput
              mode="outlined"
              label="Display Label"
              value={fieldLabel}
              onChangeText={setFieldLabel}
              style={styles.input}
            />
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>Field Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={styles.chipRow}>
                {FIELD_TYPES.map((ft) => (
                  <Chip
                    key={ft.value}
                    selected={fieldType === ft.value}
                    onPress={() => setFieldType(ft.value)}
                    style={[styles.typeChip, fieldType === ft.value && styles.typeChipSelected]}
                  >
                    {ft.label}
                  </Chip>
                ))}
              </View>
            </ScrollView>
            <View style={styles.chipRow}>
              <Chip
                selected={fieldRequired}
                onPress={() => setFieldRequired(!fieldRequired)}
                style={[styles.typeChip, fieldRequired && styles.typeChipSelected]}
              >
                Required
              </Chip>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setFieldDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSaveField}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={typeDialogVisible} onDismiss={() => setTypeDialogVisible(false)}>
          <Dialog.Title>Add Device Type</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Device Type Name"
              value={newTypeName}
              onChangeText={setNewTypeName}
              placeholder="e.g., NVR, Router, UPS"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setTypeDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleAddDeviceType}>Add</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Icon icon="alert" color="#D32F2F" size={40} />
          <Dialog.Title style={{ textAlign: "center" }}>Delete Field?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ textAlign: "center" }}>
              Remove "{deleteTarget?.Label}" from {selectedType}?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button textColor="#D32F2F" onPress={handleDeleteField}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={deleteTypeDialogVisible} onDismiss={() => setDeleteTypeDialogVisible(false)}>
          <Dialog.Icon icon="alert" color="#D32F2F" size={40} />
          <Dialog.Title style={{ textAlign: "center" }}>Delete Device Type?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ textAlign: "center", fontWeight: "600", marginBottom: 8 }}>
              {selectedType}
            </Text>
            <Text variant="bodySmall" style={{ textAlign: "center", color: "#666" }}>
              This will permanently remove:
            </Text>
            <Text variant="bodySmall" style={{ marginTop: 6, color: "#666" }}>
              {"\u2022"} All field definitions{"\n"}
              {"\u2022"} All dropdown options{"\n"}
              {"\u2022"} Inspection section and count field{"\n"}
              {"\u2022"} All device records
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteTypeDialogVisible(false)}>Cancel</Button>
            <Button textColor="#D32F2F" onPress={handleDeleteDeviceType}>Delete Permanently</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16 },
  sectionTitle: { fontWeight: "600", marginBottom: 8 },
  divider: { marginVertical: 12 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  enableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0F4FF",
    padding: 12,
    borderRadius: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { marginBottom: 4 },
  typeChipSelected: { backgroundColor: "#E3F2FD" },
  card: { marginBottom: 8 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cardInfo: { flex: 1 },
  subtitle: { color: "#666", marginTop: 2 },
  actions: { flexDirection: "row" },
  input: { marginBottom: 12 },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: "#999" },
});
