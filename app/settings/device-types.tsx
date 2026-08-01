import React, { useState, useCallback, useEffect } from "react";
import { ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Appbar, Portal } from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import DeviceFieldDefinitionsRepository, { DeviceFieldDefinition } from "../../src/database/repositories/DeviceFieldDefinitionsRepository";
import { getDatabase } from "../../src/database/db";
import { FieldDialog, AddTypeDialog, DeleteFieldDialog, DeleteTypeDialog } from "./components/DeviceTypeDialogs";
import { styles } from "./device-types.styles";
import DeviceTypeBody from "./components/DeviceTypeBody";

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

  const generateFieldName = (label: string) =>
    label.replace(/[^a-zA-Z0-9]/g, "");

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
      setSelectedType(initialDeviceType
        ? types.find((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_") === initialDeviceType) ?? types[0]
        : types[0]);
    }
    await loadEnabledTypes(types);
  }, [initialDeviceType, defaultTemplateId, selectedType]);

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
      loadFields();
    }, [loadDeviceTypes, loadFields])
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

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Device Types" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <DeviceTypeBody
          deviceTypes={deviceTypes}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          enabledTypes={enabledTypes}
          onToggleInspection={handleToggleInspection}
          onAddTypePress={() => setTypeDialogVisible(true)}
          onDeleteTypePress={() => setDeleteTypeDialogVisible(true)}
          fields={fields}
          onAddField={openAddFieldDialog}
          onEditField={openEditFieldDialog}
          onDeleteField={confirmDeleteField}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onNavigateOptions={(deviceType, fieldName) =>
            router.push({
              pathname: "/settings/device-options",
              params: { deviceType, fieldName },
            })
          }
        />
      </ScrollView>

      <Portal>
        <FieldDialog
          visible={fieldDialogVisible}
          editingField={editingField !== null}
          fieldName={fieldName}
          fieldLabel={fieldLabel}
          fieldType={fieldType}
          fieldRequired={fieldRequired}
          onDismiss={() => setFieldDialogVisible(false)}
          onFieldNameChange={setFieldName}
          onFieldLabelChange={(text) => { setFieldLabel(text); if (!editingField) setFieldName(generateFieldName(text)); }}
          onFieldTypeChange={setFieldType}
          onFieldRequiredToggle={() => setFieldRequired(!fieldRequired)}
          onSave={handleSaveField}
          typeChipStyle={styles.typeChip}
          typeChipSelectedStyle={styles.typeChipSelected}
          chipRowStyle={styles.chipRow}
          inputStyle={styles.input}
        />
        <AddTypeDialog
          visible={typeDialogVisible}
          newTypeName={newTypeName}
          onDismiss={() => setTypeDialogVisible(false)}
          onNameChange={setNewTypeName}
          onAdd={handleAddDeviceType}
          inputStyle={styles.input}
        />
        <DeleteFieldDialog
          visible={deleteDialogVisible}
          deleteTargetLabel={deleteTarget?.Label}
          selectedType={selectedType}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={handleDeleteField}
        />
        <DeleteTypeDialog
          visible={deleteTypeDialogVisible}
          selectedType={selectedType}
          onDismiss={() => setDeleteTypeDialogVisible(false)}
          onConfirm={handleDeleteDeviceType}
        />
      </Portal>
    </SafeAreaView>
  );
}

