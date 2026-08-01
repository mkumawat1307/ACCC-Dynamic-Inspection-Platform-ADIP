import React, { useState, useCallback, useEffect } from "react";
import { View, FlatList, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar, Card, Text, IconButton, Chip, Button, Portal,
  Dialog, TextInput, Divider,
} from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import DeviceOptionsRepository, {
  DeviceOption,
} from "../../src/database/repositories/DeviceOptionsRepository";
import DeviceFieldDefinitionsRepository, {
  DeviceFieldDefinition,
} from "../../src/database/repositories/DeviceFieldDefinitionsRepository";
import { getDatabase } from "../../src/database/db";

export default function DeviceOptionsScreen() {
  const router = useRouter();
  const { deviceType: initialType, fieldName: initialFieldName } = useLocalSearchParams<{
    deviceType?: string;
    fieldName?: string;
  }>();
  const [defaultTemplateId, setDefaultTemplateId] = useState<number>(1);
  const [selectedType] = useState<string>(initialType ?? "");
  const [selectedField, setSelectedField] = useState<string>(initialFieldName ?? "");
  const [options, setOptions] = useState<DeviceOption[]>([]);
  const [fields, setFields] = useState<DeviceFieldDefinition[]>([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingOption, setEditingOption] = useState<DeviceOption | null>(null);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  const dropdownFields = fields.filter((f) => f.FieldType === "dropdown");

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const t = await db.getFirstAsync<{ TemplateID: number }>(
        `SELECT TemplateID FROM InspectionTemplates WHERE IsDefault = 1 LIMIT 1`
      );
      if (t) setDefaultTemplateId(t.TemplateID);
    })();
  }, []);

  const loadFields = useCallback(async () => {
    if (!selectedType) {
      setFields([]);
      return;
    }
    const data = await DeviceFieldDefinitionsRepository.getByDeviceType(selectedType, defaultTemplateId);
    setFields(data);
  }, [selectedType, defaultTemplateId]);

  const loadOptions = useCallback(async () => {
    if (!selectedType || !selectedField) {
      setOptions([]);
      return;
    }
    const data = await DeviceOptionsRepository.getByField(selectedType, selectedField, defaultTemplateId);
    setOptions(data);
  }, [selectedType, selectedField, defaultTemplateId]);

  useFocusEffect(
    useCallback(() => {
      loadFields();
    }, [loadFields])
  );

  useFocusEffect(
    useCallback(() => {
      loadOptions();
    }, [loadOptions])
  );

  const openAddDialog = () => {
    setEditingOption(null);
    setLabel("");
    setValue("");
    setDialogVisible(true);
  };

  const openEditDialog = (opt: DeviceOption) => {
    setEditingOption(opt);
    setLabel(opt.OptionLabel);
    setValue(opt.OptionValue);
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!label.trim()) return;

    if (editingOption) {
      await DeviceOptionsRepository.update({
        ...editingOption,
        OptionLabel: label.trim(),
        OptionValue: value.trim(),
      });
    } else {
      const maxOrder = options.length > 0
        ? Math.max(...options.map((o) => o.DisplayOrder))
        : 0;
      await DeviceOptionsRepository.add({
        DeviceType: selectedType,
        FieldName: selectedField,
        OptionLabel: label.trim(),
        OptionValue: value.trim(),
        DisplayOrder: maxOrder + 1,
        IsActive: 1,
      }, defaultTemplateId);
    }

    setDialogVisible(false);
    loadOptions();
  };

  const handleDelete = async (id: number) => {
    await DeviceOptionsRepository.delete(id);
    loadOptions();
  };

  const handleMoveUp = async (id: number) => {
    await DeviceOptionsRepository.moveUp(id);
    loadOptions();
  };

  const handleMoveDown = async (id: number) => {
    await DeviceOptionsRepository.moveDown(id);
    loadOptions();
  };

  const renderOption = ({ item, index }: { item: DeviceOption; index: number }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <Text variant="titleMedium">{item.OptionLabel}</Text>

          </View>
          <View style={styles.actions}>
            <IconButton icon="pencil" size={20} onPress={() => openEditDialog(item)} />
            <IconButton icon="delete" size={20} iconColor="#D32F2F" onPress={() => handleDelete(item.OptionID!)} />
            <IconButton
              icon="chevron-up"
              size={20}
              disabled={index === 0}
              onPress={() => handleMoveUp(item.OptionID!)}
            />
            <IconButton
              icon="chevron-down"
              size={20}
              disabled={index === options.length - 1}
              onPress={() => handleMoveDown(item.OptionID!)}
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
        <Appbar.Content title={`${selectedType} Options`} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Select Field
        </Text>
        <View style={styles.chipRow}>
          {dropdownFields.map((f) => (
            <Chip
              key={f.FieldDefID}
              selected={selectedField === f.FieldName}
              onPress={() => setSelectedField(f.FieldName)}
              style={[
                styles.fieldChip,
                selectedField === f.FieldName && styles.fieldChipSelected,
              ]}
            >
              {f.Label}
            </Chip>
          ))}
        </View>

        {dropdownFields.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No dropdown fields defined for {selectedType}. Add dropdown fields in Device Types first.
            </Text>
          </View>
        )}

        <Divider style={styles.divider} />

        {selectedField ? (
          <>
            <View style={styles.headerRow}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Options ({options.length})
              </Text>
              <Button mode="contained" onPress={openAddDialog}>
                Add Option
              </Button>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item) => String(item.OptionID)}
              renderItem={renderOption}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No options for this field</Text>
                </View>
              }
            />
          </>
        ) : (
          dropdownFields.length > 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Select a field above to manage its dropdown options
              </Text>
            </View>
          )
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>
            {editingOption ? "Edit Option" : "Add Option"}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Display Label"
              value={label}
              onChangeText={(text) => {
                setLabel(text);
                if (!editingOption) setValue(text);
              }}
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSave}>Save</Button>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldChip: { marginBottom: 4 },
  fieldChipSelected: { backgroundColor: "#E8F5E9" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  card: { marginBottom: 8 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cardInfo: { flex: 1 },
  subtitle: { color: "#666", marginTop: 2 },
  actions: { flexDirection: "row" },
  input: { marginBottom: 12 },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: "#999" },
});
