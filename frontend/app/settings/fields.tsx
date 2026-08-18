import React, { useState, useCallback } from "react";
import { View, FlatList, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar, Card, Text, IconButton, Chip, Portal, Button,
} from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { FieldRepository, Field, CREATEABLE_FIELD_TYPES, FIELD_TYPES } from "../../src/database/repositories/FieldRepository";
import { FieldDialog } from "@/src/components/app/settings/components/DeviceTypeDialogs";
import { styles as deviceTypeStyles } from "@/src/components/app/settings/device-types.styles";

export default function FieldsScreen() {
  const router = useRouter();
  const { sectionId, sectionName } = useLocalSearchParams<{
    sectionId: string;
    sectionName: string;
  }>();
  const sid = Number(sectionId);

  const [fields, setFields] = useState<Field[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Field | null>(null);

  const [fieldName, setFieldName] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [placeholder, setPlaceholder] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const loadFields = useCallback(async () => {
    const data = await FieldRepository.getBySection(sid);
    setFields(data);
  }, [sid]);

  useFocusEffect(
    useCallback(() => {
      loadFields();
    }, [loadFields])
  );

  const generateKey = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const openCreateDialog = () => {
    setEditing(null);
    setFieldName("");
    setFieldKey("");
    setFieldType("text");
    setPlaceholder("");
    setIsRequired(false);
    setIsVisible(true);
    setShowDialog(true);
  };

  const openEditDialog = (f: Field) => {
    setEditing(f);
    setFieldName(f.FieldName);
    setFieldKey(f.FieldKey);
    setFieldType(f.FieldType);
    setPlaceholder(f.Placeholder ?? "");
    setIsRequired(f.IsRequired === 1);
    setIsVisible(f.IsVisible === 1);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!fieldName.trim()) {
      Alert.alert("Error", "Field name is required");
      return;
    }
    const key = fieldKey.trim() || generateKey(fieldName.trim());

    if (editing) {
      await FieldRepository.update(editing.FieldID, {
        FieldName: fieldName.trim(),
        FieldKey: key,
        FieldType: fieldType,
        Placeholder: placeholder.trim() || null,
        DefaultValue: editing.DefaultValue ?? null,
        IsRequired: isRequired ? 1 : 0,
        IsVisible: isVisible ? 1 : 0,
      });
    } else {
      await FieldRepository.create({
        SectionID: sid,
        FieldName: fieldName.trim(),
        FieldKey: key,
        FieldType: fieldType,
        Placeholder: placeholder.trim() || null,
        DefaultValue: null,
        IsRequired: isRequired ? 1 : 0,
        IsVisible: isVisible ? 1 : 0,
      });
    }

    setShowDialog(false);
    loadFields();
  };

  const handleDelete = (f: Field) => {
    Alert.alert(
      "Delete Field",
      `Delete "${f.FieldName}"? Any dropdown options will also be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await FieldRepository.hardDelete(f.FieldID);
            loadFields();
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...fields];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    await FieldRepository.reorder(updated.map((f, i) => ({ FieldID: f.FieldID, DisplayOrder: i + 1 })));
    setFields(updated);
  };

  const handleMoveDown = async (index: number) => {
    if (index === fields.length - 1) return;
    const updated = [...fields];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    await FieldRepository.reorder(updated.map((f, i) => ({ FieldID: f.FieldID, DisplayOrder: i + 1 })));
    setFields(updated);
  };

const getTypeLabel = (type: string) =>
  CREATEABLE_FIELD_TYPES.find((t) => t.value === type)?.label ??
  FIELD_TYPES.find((t) => t.value === type)?.label ??
  type;

  const renderField = ({ item, index }: { item: Field; index: number }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardRow}>
          <View style={styles.orderButtons}>
            <IconButton icon="chevron-up" size={20} disabled={index === 0} onPress={() => handleMoveUp(index)} />
            <Text variant="labelMedium" style={styles.orderNumber}>{index + 1}</Text>
            <IconButton icon="chevron-down" size={20} disabled={index === fields.length - 1} onPress={() => handleMoveDown(index)} />
          </View>
          <View style={styles.cardInfo}>
            <Text variant="titleMedium" style={styles.cardTitle}>{item.FieldName}</Text>
            <Text variant="bodySmall" style={styles.cardSubtitle}>
              {getTypeLabel(item.FieldType)}
            </Text>
            <View style={styles.chipRow}>
              <Chip compact style={styles.typeChip}>{getTypeLabel(item.FieldType)}</Chip>
              {item.IsRequired ? (
                <Chip compact style={[styles.chip, { backgroundColor: "#FFEBEE" }]}>Required</Chip>
              ) : null}
              {!item.IsVisible ? (
                <Chip compact style={[styles.chip, { backgroundColor: "#FFF3E0" }]}>Hidden</Chip>
              ) : null}
            </View>
          </View>
          <View style={styles.cardActions}>
            <IconButton icon="pencil" size={20} onPress={() => openEditDialog(item)} />
            <IconButton icon="delete" size={20} iconColor="#D32F2F" onPress={() => handleDelete(item)} />
          </View>
        </View>
      </Card.Content>
      {item.FieldType === "dropdown" && (
        <Card.Actions style={styles.cardActionsRow}>
          <Button
            mode="text"
            onPress={() =>
              router.push({
                pathname: "/settings/options",
                params: {
                  fieldId: item.FieldID,
                  fieldName: item.FieldName,
                  fieldKey: item.FieldKey,
                },
              })
            }
          >
            Manage Options
          </Button>
        </Card.Actions>
      )}
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={sectionName ?? "Fields"} />
      </Appbar.Header>

      <View style={styles.listHeader}>
        <View style={deviceTypeStyles.headerRow}>
          <Text variant="titleMedium" style={deviceTypeStyles.sectionTitle}>
            Fields ({fields.length})
          </Text>
          <Button mode="contained" onPress={openCreateDialog}>
            Add Field
          </Button>
        </View>
      </View>

      <FlatList
        data={fields}
        keyExtractor={(item) => String(item.FieldID)}
        renderItem={renderField}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No fields yet. Tap Add Field to add one.</Text>
          </View>
        }
      />

      <Portal>
        <FieldDialog
          visible={showDialog}
          editingField={editing !== null}
          fieldLabel={fieldName}
          fieldType={fieldType}
          fieldRequired={isRequired}
          onDismiss={() => setShowDialog(false)}
          onFieldLabelChange={(text) => { setFieldName(text); setFieldKey(generateKey(text)); }}
          onFieldTypeChange={setFieldType}
          onFieldRequiredToggle={() => setIsRequired(!isRequired)}
          onSave={handleSave}
          typeChipStyle={deviceTypeStyles.typeChip}
          typeChipSelectedStyle={deviceTypeStyles.typeChipSelected}
          chipRowStyle={deviceTypeStyles.chipRow}
          inputStyle={deviceTypeStyles.input}
          fieldLabelText="Field Name *"
          showExtraConfig
          placeholder={placeholder}
          isVisible={isVisible}
          onPlaceholderChange={setPlaceholder}
          onVisibleToggle={() => setIsVisible(!isVisible)}
        />
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  listHeader: { paddingHorizontal: 16, paddingTop: 12 },
  list: { padding: 16, paddingBottom: 30 },
  card: { marginBottom: 12 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  orderButtons: { alignItems: "center", marginRight: 8 },
  orderNumber: { fontWeight: "700", fontSize: 16 },
  cardInfo: { flex: 1 },
  cardTitle: { fontWeight: "600" },
  cardSubtitle: { color: "#666", marginTop: 2 },
  chipRow: { flexDirection: "row", marginTop: 4, gap: 4 },
  chip: { height: 26 },
  typeChip: { height: 26, backgroundColor: "#E8EAF6" },
  cardActions: { flexDirection: "row" },
  cardActionsRow: { justifyContent: "flex-end" },
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#999" },
});
