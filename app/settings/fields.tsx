import React, { useState, useCallback } from "react";
import { View, FlatList, ScrollView, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar, FAB, Card, Text, IconButton, Chip, Portal, Dialog,
  Button, TextInput, Switch, Divider,
} from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { FieldRepository, Field, FIELD_TYPES } from "../../src/database/repositories/FieldRepository";

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
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [fieldType, setFieldType] = useState("text");
  const [placeholder, setPlaceholder] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [helpText, setHelpText] = useState("");
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
    setKeyManuallyEdited(false);
    setFieldType("text");
    setPlaceholder("");
    setDefaultValue("");
    setHelpText("");
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
    setDefaultValue(f.DefaultValue ?? "");
    setHelpText(f.HelpText ?? "");
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
        Placeholder: placeholder.trim() || undefined,
        DefaultValue: defaultValue.trim() || undefined,
        HelpText: helpText.trim() || undefined,
        IsRequired: isRequired ? 1 : 0,
        IsVisible: isVisible ? 1 : 0,
      });
    } else {
      await FieldRepository.create({
        SectionID: sid,
        FieldName: fieldName.trim(),
        FieldKey: key,
        FieldType: fieldType,
        Placeholder: placeholder.trim() || undefined,
        DefaultValue: defaultValue.trim() || undefined,
        HelpText: helpText.trim() || undefined,
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
    FIELD_TYPES.find((t) => t.value === type)?.label ?? type;

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
              {item.FieldKey} • {getTypeLabel(item.FieldType)}
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
                pathname: "/settings/options" as any,
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
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={sectionName ?? "Fields"} />
      </Appbar.Header>

      <FlatList
        data={fields}
        keyExtractor={(item) => String(item.FieldID)}
        renderItem={renderField}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No fields yet. Tap + to add one.</Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} label="New Field" onPress={openCreateDialog} />

      <Portal>
        <Dialog visible={showDialog} onDismiss={() => setShowDialog(false)}>
          <Dialog.Title>{editing ? "Edit Field" : "New Field"}</Dialog.Title>
          <Dialog.Content style={{ maxHeight: 400 }}>
            <ScrollView>
              <TextInput label="Field Name *" value={fieldName} onChangeText={(text) => { setFieldName(text); if (!editing && !keyManuallyEdited) setFieldKey(generateKey(text)); }} mode="outlined" style={styles.input} />
              <TextInput label="Field Key *" value={fieldKey} onChangeText={(text) => { setFieldKey(text); setKeyManuallyEdited(true); }} mode="outlined" style={styles.input} disabled={!!editing} />

              <Text variant="bodyMedium" style={styles.sectionLabel}>Field Type</Text>
              <View style={styles.typeGrid}>
                {FIELD_TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    selected={fieldType === t.value}
                    onPress={() => setFieldType(t.value)}
                    style={[styles.typeChipOption, fieldType === t.value && styles.typeChipSelected]}
                    showSelectedOverlay
                  >
                    {t.label}
                  </Chip>
                ))}
              </View>

              <TextInput label="Placeholder" value={placeholder} onChangeText={setPlaceholder} mode="outlined" style={styles.input} />
              <TextInput label="Default Value" value={defaultValue} onChangeText={setDefaultValue} mode="outlined" style={styles.input} />
              <TextInput label="Help Text" value={helpText} onChangeText={setHelpText} mode="outlined" style={styles.input} />

              <View style={styles.switchRow}>
                <Text variant="bodyMedium">Required</Text>
                <Switch value={isRequired} onValueChange={setIsRequired} />
              </View>
              <View style={styles.switchRow}>
                <Text variant="bodyMedium">Visible</Text>
                <Switch value={isVisible} onValueChange={setIsVisible} />
              </View>
            </ScrollView>
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
  list: { padding: 16, paddingBottom: 100 },
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
  fab: { position: "absolute", right: 16, bottom: 32 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#999" },
  input: { marginBottom: 12 },
  sectionLabel: { fontWeight: "600", marginBottom: 8, marginTop: 4 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeChipOption: { marginBottom: 4 },
  typeChipSelected: { backgroundColor: "#1565C0" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
});
