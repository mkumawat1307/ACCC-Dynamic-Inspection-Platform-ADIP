import React, { useState, useCallback, useEffect } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import {
  Card,
  Text,
  List,
  Switch,
  IconButton,
  Button,
  Dialog,
  ActivityIndicator,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DashboardCardRepository } from "@/src/database/repositories/DashboardCardRepository";
import { SmartCardGenerator, SmartFormField } from "@/src/database/repositories/SmartCardGenerator";
import { COUNTER_TYPES } from "@/src/database/repositories/StatisticCountService";
import { DashboardCard } from "@/src/models/DashboardCard";

const ENTITY_LABELS: Record<string, string> = {
  inspections: "Inspections",
  cameras: "Cameras",
  switches: "Switches",
  devices: "Devices",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  dropdown: "Dropdown",
  switch: "Switch (Yes/No)",
  checkbox: "Checkbox",
  number: "Number",
  text: "Text",
  multiline: "Multiline",
  date: "Date",
  date_auto: "Date (Auto)",
  time: "Time",
  gps: "GPS",
  device: "Device",
  camera: "Camera",
  calculation: "Calculation",
};

interface Props {
  projectId: number;
}

export default function DashboardCardManager({ projectId }: Props) {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCard | null>(null);

  const [fieldPickerVisible, setFieldPickerVisible] = useState(false);
  const [fieldPickerLoading, setFieldPickerLoading] = useState(false);
  const [availableFields, setAvailableFields] = useState<SmartFormField[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await DashboardCardRepository.getAllCards(projectId);
    setCards(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = (card: DashboardCard) => {
    setDeleteTarget(card);
    setDeleteVisible(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await DashboardCardRepository.deleteCard(deleteTarget.CardID!);
    setDeleteVisible(false);
    setDeleteTarget(null);
    load();
  };

  const handleToggleEnabled = async (card: DashboardCard, enabled: boolean) => {
    await DashboardCardRepository.setCardEnabled(card.CardID!, enabled);
    load();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= cards.length) return;
    const current = cards[index];
    const neighbor = cards[target];
    if ((current.SectionLabel ?? null) !== (neighbor.SectionLabel ?? null)) return;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    const ids = next.map((c) => c.CardID as number);
    await DashboardCardRepository.reorderCards(projectId, ids);
    await DashboardCardRepository.normalizeSections(projectId);
    load();
  };

  const handleResetDefaults = async () => {
    await DashboardCardRepository.resetDefaultCards(projectId);
    load();
  };

  const loadAvailableFields = useCallback(async () => {
    setFieldPickerLoading(true);
    const fields = await SmartCardGenerator.getAvailableFields(projectId);
    setAvailableFields(fields);
    setFieldPickerLoading(false);
  }, [projectId]);

  const handleSmartAdd = async (fieldKey: string) => {
    await SmartCardGenerator.addSmartCardsForField(projectId, fieldKey);
    setFieldPickerVisible(false);
    load();
    loadAvailableFields();
  };

  const entityLabel = (key: string) => ENTITY_LABELS[key] ?? key;
  const counterLabel = (key: string) => COUNTER_TYPES[key]?.label ?? key;

  const pickerDescription = (f: SmartFormField) =>
    f.source === "device"
      ? (f.DeviceType ?? f.FieldType)
      : (FIELD_TYPE_LABELS[f.FieldType] ?? f.FieldType);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button
          icon="plus"
          mode="contained-tonal"
          onPress={() => {
            setFieldPickerVisible(true);
            loadAvailableFields();
          }}
        >
          Add Card
        </Button>
        <Button icon="restore" mode="text" onPress={handleResetDefaults}>
          Reset Defaults
        </Button>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : cards.length === 0 ? (
        <Text style={styles.empty}>No cards yet. Add one to get started.</Text>
      ) : (
        <ScrollView>
          {cards.map((card, index) => (
            <Card key={card.CardID} style={styles.card}>
              <List.Item
                title={card.Title}
                description={`${entityLabel(card.EntityType)} · ${counterLabel(card.CounterType)}`}
                left={(props) => (
                  <View style={styles.iconWrap}>
                    <MaterialCommunityIcons
                      name={card.Icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={24}
                      color={card.Color}
                    />
                  </View>
                )}
                right={(props) => (
                  <View style={styles.rowActions}>
                    <IconButton
                      icon="arrow-up"
                      disabled={index === 0 || (cards[index - 1]?.SectionLabel ?? null) !== (card.SectionLabel ?? null)}
                      onPress={() => handleMove(index, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      disabled={index === cards.length - 1 || (cards[index + 1]?.SectionLabel ?? null) !== (card.SectionLabel ?? null)}
                      onPress={() => handleMove(index, 1)}
                    />
                    <IconButton icon="delete" onPress={() => confirmDelete(card)} />
                  </View>
                )}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Enabled</Text>
                <Switch
                  value={card.Enabled === 1}
                  onValueChange={(value) => handleToggleEnabled(card, value)}
                />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <Dialog
        visible={fieldPickerVisible}
        onDismiss={() => setFieldPickerVisible(false)}
      >
        <Dialog.Title>Add Card</Dialog.Title>
        <Dialog.Content>
          {fieldPickerLoading ? (
            <ActivityIndicator style={styles.loading} />
          ) : availableFields.length === 0 ? (
            <Text style={styles.empty}>All available fields have cards configured.</Text>
          ) : (
            <ScrollView style={styles.pickerScroll}>
              {availableFields.map((f) => {
                const spec = SmartCardGenerator.getSpec(f);
                return (
                  <List.Item
                    key={f.FieldKey}
                    title={f.FieldName}
                    description={pickerDescription(f)}
                    left={(props) => (
                      <View style={styles.iconWrap}>
                        <MaterialCommunityIcons
                          name={spec.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                          size={24}
                          color={spec.color}
                        />
                      </View>
                    )}
                    onPress={() => handleSmartAdd(f.FieldKey)}
                  />
                );
              })}
            </ScrollView>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setFieldPickerVisible(false)}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={deleteVisible} onDismiss={() => setDeleteVisible(false)}>
        <Dialog.Title>Delete Card</Dialog.Title>
        <Dialog.Content>
          <Text>
            {deleteTarget?.IsDefault === 1
              ? "This is a default card. It will be re-added automatically if this project is opened again. Delete anyway?"
              : `Delete "${deleteTarget?.Title}"?`}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setDeleteVisible(false)}>Cancel</Button>
          <Button onPress={handleDelete}>Delete</Button>
        </Dialog.Actions>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
  },

  loading: {
    marginTop: 24,
  },

  empty: {
    textAlign: "center",
    color: "#666",
    marginTop: 24,
  },

  card: {
    marginBottom: 10,
  },

  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
  },

  rowActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 16,
    paddingBottom: 8,
  },

  switchLabel: {
    marginRight: 8,
    color: "#666",
  },

  pickerScroll: {
    maxHeight: 420,
  },
});
