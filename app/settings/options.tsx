import React, { useState, useCallback } from "react";
import { View, FlatList, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Appbar, FAB, Card, Text, IconButton, Switch, Portal, Dialog,
  Button, TextInput,
} from "react-native-paper";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  FieldOptionRepository, FieldOption,
} from "../../src/database/repositories/FieldOptionRepository";
export default function OptionsScreen() {
  const { fieldId, fieldName } = useLocalSearchParams<{
    fieldId: string;
    fieldName: string;
  }>();
  const fid = Number(fieldId);

  const [options, setOptions] = useState<FieldOption[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<FieldOption | null>(null);
  const [optionLabel, setOptionLabel] = useState("");
  const [optionValue, setOptionValue] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const loadOptions = useCallback(async () => {
    const data = await FieldOptionRepository.getByField(fid);
    setOptions(data);
  }, [fid]);

  useFocusEffect(
    useCallback(() => {
      loadOptions();
    }, [loadOptions])
  );

  const openCreateDialog = () => {
    setEditing(null);
    setOptionLabel("");
    setOptionValue("");
    setIsDefault(false);
    setShowDialog(true);
  };

  const openEditDialog = (o: FieldOption) => {
    setEditing(o);
    setOptionLabel(o.OptionLabel);
    setOptionValue(o.OptionValue);
    setIsDefault(o.IsDefault === 1);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!optionLabel.trim()) {
      Alert.alert("Error", "Option label is required");
      return;
    }
    const value = optionValue.trim() || optionLabel.trim();

    if (editing) {
      await FieldOptionRepository.update(editing.OptionID, {
        OptionLabel: optionLabel.trim(),
        OptionValue: value,
        IsDefault: isDefault ? 1 : 0,
      });
    } else {
      await FieldOptionRepository.create({
        FieldID: fid,
        OptionLabel: optionLabel.trim(),
        OptionValue: value,
        IsDefault: isDefault ? 1 : 0,
      });
    }
    setShowDialog(false);
    loadOptions();
  };

  const handleDelete = (o: FieldOption) => {
    Alert.alert(
      "Delete Option",
      `Delete "${o.OptionLabel}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await FieldOptionRepository.hardDelete(o.OptionID);
            loadOptions();
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...options];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const reorderData = updated.map((o, i) => ({
      OptionID: o.OptionID,
      DisplayOrder: i + 1,
    }));
    await FieldOptionRepository.reorder(reorderData);
    setOptions(updated);
  };

  const handleMoveDown = async (index: number) => {
    if (index === options.length - 1) return;
    const updated = [...options];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const reorderData = updated.map((o, i) => ({
      OptionID: o.OptionID,
      DisplayOrder: i + 1,
    }));
    await FieldOptionRepository.reorder(reorderData);
    setOptions(updated);
  };

  const renderOption = ({ item, index }: { item: FieldOption; index: number }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.orderButtons}>
            <IconButton
              icon="chevron-up"
              size={20}
              disabled={index === 0}
              onPress={() => handleMoveUp(index)}
            />
            <Text variant="labelMedium" style={styles.orderNumber}>
              {index + 1}
            </Text>
            <IconButton
              icon="chevron-down"
              size={20}
              disabled={index === options.length - 1}
              onPress={() => handleMoveDown(index)}
            />
          </View>
          <View style={styles.cardInfo}>
            <Text variant="titleMedium" style={styles.cardTitle}>
              {item.OptionLabel}
            </Text>

            {item.IsDefault ? (
              <Text variant="bodySmall" style={styles.defaultText}>
                Default
              </Text>
            ) : null}
          </View>
          <View style={styles.cardActions}>
            <IconButton
              icon="pencil"
              size={20}
              onPress={() => openEditDialog(item)}
            />
            <IconButton
              icon="delete"
              size={20}
              iconColor="#D32F2F"
              onPress={() => handleDelete(item)}
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => {}} />
        <Appbar.Content title={fieldName ?? "Options"} />
      </Appbar.Header>

      <FlatList
        data={options}
        keyExtractor={(item) => String(item.OptionID)}
        renderItem={renderOption}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              No options yet. Add dropdown choices.
            </Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} onPress={openCreateDialog} label="New Option" />

      <Portal>
        <Dialog visible={showDialog} onDismiss={() => setShowDialog(false)}>
          <Dialog.Title>{editing ? "Edit Option" : "New Option"}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Label *"
              value={optionLabel}
              onChangeText={(text) => {
                setOptionLabel(text);
                if (!editing) setOptionValue(text);
              }}
              mode="outlined"
              style={styles.input}
            />

            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Default Selection</Text>
              <Switch value={isDefault} onValueChange={setIsDefault} />
            </View>
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
  cardHeader: { flexDirection: "row", alignItems: "center" },
  orderButtons: { alignItems: "center", marginRight: 8 },
  orderNumber: { fontWeight: "700", fontSize: 16 },
  cardInfo: { flex: 1 },
  cardTitle: { fontWeight: "600" },
  cardSubtitle: { color: "#666", marginTop: 2 },
  defaultText: { color: "#2E7D32", marginTop: 2, fontWeight: "600" },
  cardActions: { flexDirection: "row" },
  fab: { position: "absolute", right: 16, bottom: 32 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#999" },
  input: { marginBottom: 12 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
});
