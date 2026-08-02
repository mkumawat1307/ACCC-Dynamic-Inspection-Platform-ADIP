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
  TextInput,
  HelperText,
  ActivityIndicator,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DashboardCardRepository } from "@/src/database/repositories/DashboardCardRepository";
import { SmartCardGenerator, SmartFormField } from "@/src/database/repositories/SmartCardGenerator";
import InspectionFieldRepository from "@/src/database/repositories/InspectionFieldRepository";
import { COUNT_ENTITIES, COUNTER_TYPES } from "@/src/database/repositories/StatisticCountService";
import { DashboardCard } from "@/src/models/DashboardCard";

const ICON_CHOICES = [
  "transmission-tower",
  "cctv",
  "lan",
  "clipboard-list",
  "clipboard-check",
  "map-marker",
  "camera",
  "chart-box-outline",
  "chart-pie",
  "devices",
  "server",
  "speedometer",
];

const COLOR_CHOICES = [
  "#0B5ED7",
  "#198754",
  "#DC3545",
  "#6F42C1",
  "#FD7E14",
  "#20C997",
  "#0D6EFD",
  "#6C757D",
];

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

interface FilterRow {
  key: string;
  value: string;
}

function parseFilters(filterJson: string | null | undefined): FilterRow[] {
  if (!filterJson) return [];
  try {
    const parsed = JSON.parse(filterJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
        key,
        value: String(value),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

function filtersToJson(rows: FilterRow[]): string | null {
  const clean = rows.filter((r) => r.key && r.value.trim());
  if (clean.length === 0) return null;
  const obj: Record<string, string> = {};
  for (const row of clean) {
    obj[row.key] = row.value.trim();
  }
  return JSON.stringify(obj);
}

interface Props {
  projectId: number;
}

export default function DashboardCardManager({ projectId }: Props) {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<DashboardCard | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("chart-box-outline");
  const [color, setColor] = useState("#0B5ED7");
  const [entityType, setEntityType] = useState("inspections");
  const [counterType, setCounterType] = useState("total");
  const [editorMode, setEditorMode] = useState<"count" | "distinct" | "breakdown">("count");
  const [distinctColumn, setDistinctColumn] = useState<string>("");
  const [breakdownField, setBreakdownField] = useState<string>("");
  const [breakdownOptions, setBreakdownOptions] = useState<{ FieldKey: string; FieldName: string }[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [validationError, setValidationError] = useState<string>("");

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardCard | null>(null);

  const [entityMenuVisible, setEntityMenuVisible] = useState(false);
  const [counterMenuVisible, setCounterMenuVisible] = useState(false);
  const [modeMenuVisible, setModeMenuVisible] = useState(false);
  const [distinctMenuVisible, setDistinctMenuVisible] = useState(false);
  const [breakdownMenuVisible, setBreakdownMenuVisible] = useState(false);
  const [filterMenuIndex, setFilterMenuIndex] = useState<number | null>(null);
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

  const openAdd = () => {
    setEditingCard(null);
    setTitle("");
    setIcon("chart-box-outline");
    setColor("#0B5ED7");
    setEntityType("inspections");
    setCounterType("total");
    setEditorMode("count");
    setDistinctColumn("");
    setBreakdownField("");
    setBreakdownOptions([]);
    setFilters([]);
    setValidationError("");
    setEditorVisible(true);
  };

  const openEdit = (card: DashboardCard) => {
    setEditingCard(card);
    setTitle(card.Title);
    setIcon(card.Icon);
    setColor(card.Color);
    setEntityType(card.EntityType);
    setCounterType(card.CounterType);
    setEditorMode(card.BreakdownField ? "breakdown" : card.CountMode === "distinct" ? "distinct" : "count");
    setDistinctColumn(card.DistinctColumn ?? "");
    setBreakdownField(card.BreakdownField ?? "");
    setFilters(parseFilters(card.FilterJson));
    setValidationError("");
    setEditorVisible(true);
    if (card.BreakdownField) {
      InspectionFieldRepository.getActiveTemplateFields().then(setBreakdownOptions);
    }
  };

  const handleSave = async () => {
    if (editorMode === "breakdown" && !breakdownField) {
      setValidationError("Select a field to group by.");
      return;
    }
    if (!title.trim()) {
      setValidationError("Title is required.");
      return;
    }
    if (!COUNT_ENTITIES[entityType] || !COUNTER_TYPES[counterType]) {
      setValidationError("Entity and counter type must be valid.");
      return;
    }

    const payload: DashboardCard = {
      ProjectID: projectId,
      CardKey: editingCard?.CardKey ?? `card_${Date.now()}`,
      Title: title.trim(),
      Icon: icon,
      Color: color,
      EntityType: entityType,
      CounterType: counterType,
      FilterJson: filtersToJson(filters),
      CountMode: editorMode === "distinct" ? "distinct" : "count",
      DistinctColumn: editorMode === "distinct" ? distinctColumn : null,
      BreakdownField: editorMode === "breakdown" ? breakdownField : null,
      SortOrder: editingCard?.SortOrder ?? 0,
      Enabled: editingCard?.Enabled ?? 1,
      IsDefault: editingCard?.IsDefault ?? 0,
    };

    if (editingCard) {
      await DashboardCardRepository.updateCard({ ...payload, CardID: editingCard.CardID });
    } else {
      await DashboardCardRepository.createCard(payload);
    }

    setEditorVisible(false);
    load();
  };

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
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    const ids = next.map((c) => c.CardID as number);
    await DashboardCardRepository.reorderCards(projectId, ids);
    load();
  };

  const handleResetDefaults = async () => {
    await DashboardCardRepository.ensureDefaultCards(projectId);
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

  const entityConfig = COUNT_ENTITIES[entityType];
  const entityLabel = (key: string) => ENTITY_LABELS[key] ?? key;
  const counterLabel = (key: string) => COUNTER_TYPES[key]?.label ?? key;

  const addFilterRow = () => {
    if (entityConfig.filterableColumns.length === 0) return;
    setFilters((prev) => [...prev, { key: entityConfig.filterableColumns[0], value: "" }]);
  };

  const updateFilterRow = (index: number, patch: Partial<FilterRow>) => {
    setFilters((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeFilterRow = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

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
        <Button icon="tune-variant" mode="text" onPress={openAdd}>
          Custom Card
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
                      disabled={index === 0}
                      onPress={() => handleMove(index, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      disabled={index === cards.length - 1}
                      onPress={() => handleMove(index, 1)}
                    />
                    <IconButton icon="pencil" onPress={() => openEdit(card)} />
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

      <Dialog visible={editorVisible} onDismiss={() => setEditorVisible(false)}>
        <Dialog.Title>{editingCard ? "Edit Card" : "Add Card"}</Dialog.Title>
        <Dialog.Content>
          <ScrollView style={styles.editorScroll}>
          <TextInput
            label="Title"
            mode="outlined"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Icon</Text>
          <View style={styles.iconGrid}>
            {ICON_CHOICES.map((name) => (
              <IconButton
                key={name}
                icon={name}
                size={24}
                mode={icon === name ? "contained" : "outlined"}
                onPress={() => setIcon(name)}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Color</Text>
          <View style={styles.colorRow}>
            {COLOR_CHOICES.map((c) => (
              <IconButton
                key={c}
                icon={color === c ? "check" : "circle"}
                size={20}
                iconColor={color === c ? "#fff" : c}
                containerColor={c}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Entity</Text>
          <Button
            mode="outlined"
            onPress={() => setEntityMenuVisible(true)}
            style={styles.input}
          >
            {entityLabel(entityType)}
          </Button>
          <Dialog
            visible={entityMenuVisible}
            onDismiss={() => setEntityMenuVisible(false)}
          >
            <Dialog.Title>Select Entity</Dialog.Title>
            <Dialog.Content>
              {Object.keys(COUNT_ENTITIES).map((key) => (
                <List.Item
                  key={key}
                  title={entityLabel(key)}
                  onPress={() => {
                    setEntityType(key);
                    if (key !== "inspections") {
                      setEditorMode((prev) => (prev === "breakdown" ? "count" : prev));
                      setBreakdownField("");
                    }
                    setDistinctColumn("");
                    setFilters([]);
                    setEntityMenuVisible(false);
                  }}
                />
              ))}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setEntityMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>

          <Text style={styles.fieldLabel}>Counter</Text>
          <Button
            mode="outlined"
            onPress={() => setCounterMenuVisible(true)}
            style={styles.input}
          >
            {counterLabel(counterType)}
          </Button>
          <Dialog
            visible={counterMenuVisible}
            onDismiss={() => setCounterMenuVisible(false)}
          >
            <Dialog.Title>Select Counter</Dialog.Title>
            <Dialog.Content>
              {Object.keys(COUNTER_TYPES).map((key) => (
                <List.Item
                  key={key}
                  title={counterLabel(key)}
                  onPress={() => {
                    setCounterType(key);
                    setCounterMenuVisible(false);
                  }}
                />
              ))}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setCounterMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>

          <Text style={styles.fieldLabel}>Count Mode</Text>
          <Button
            mode="outlined"
            onPress={() => setModeMenuVisible(true)}
            style={styles.input}
          >
            {editorMode === "breakdown" ? "Breakdown" : editorMode === "distinct" ? "Distinct" : "Count"}
          </Button>
          <Dialog
            visible={modeMenuVisible}
            onDismiss={() => setModeMenuVisible(false)}
          >
            <Dialog.Title>Select Count Mode</Dialog.Title>
            <Dialog.Content>
              <List.Item
                title="Count"
                onPress={() => {
                  setEditorMode("count");
                  setBreakdownField("");
                  setModeMenuVisible(false);
                }}
              />
              <List.Item
                title="Distinct"
                onPress={() => {
                  setEditorMode("distinct");
                  setBreakdownField("");
                  setModeMenuVisible(false);
                }}
              />
              <List.Item
                title="Breakdown"
                onPress={() => {
                  setEditorMode("breakdown");
                  setDistinctColumn("");
                  setEntityType("inspections");
                  setBreakdownField("");
                  setFilters([]);
                  setModeMenuVisible(false);
                  InspectionFieldRepository.getActiveTemplateFields()
                    .then(setBreakdownOptions)
                    .then(() => setBreakdownMenuVisible(true));
                }}
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setModeMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>

          {editorMode === "distinct" ? (
            <>
              <Text style={styles.fieldLabel}>Distinct Column</Text>
              <Button
                mode="outlined"
                onPress={() => setDistinctMenuVisible(true)}
                style={styles.input}
              >
                {distinctColumn || "Select column"}
              </Button>
              <Dialog
                visible={distinctMenuVisible}
                onDismiss={() => setDistinctMenuVisible(false)}
              >
                <Dialog.Title>Select Column</Dialog.Title>
                <Dialog.Content>
                  {entityConfig.distinctableColumns.map((col) => (
                    <List.Item
                      key={col}
                      title={col}
                      onPress={() => {
                        setDistinctColumn(col);
                        setDistinctMenuVisible(false);
                      }}
                    />
                  ))}
                </Dialog.Content>
                <Dialog.Actions>
                  <Button onPress={() => setDistinctMenuVisible(false)}>Cancel</Button>
                </Dialog.Actions>
              </Dialog>
            </>
          ) : null}

          {editorMode === "breakdown" ? (
            <>
              <Text style={styles.fieldLabel}>Group by field</Text>
              <Button
                mode="outlined"
                onPress={() => {
                  InspectionFieldRepository.getActiveTemplateFields()
                    .then(setBreakdownOptions)
                    .then(() => setBreakdownMenuVisible(true));
                }}
                style={styles.input}
              >
                {(breakdownOptions.find((o) => o.FieldKey === breakdownField)?.FieldName ?? breakdownField) || "Select field"}
              </Button>
            </>
          ) : null}

          <Dialog
            visible={breakdownMenuVisible}
            onDismiss={() => setBreakdownMenuVisible(false)}
          >
            <Dialog.Title>Select Group-by Field</Dialog.Title>
            <Dialog.Content>
              {breakdownOptions.map((option) => (
                <List.Item
                  key={option.FieldKey}
                  title={option.FieldName}
                  onPress={() => {
                    setBreakdownField(option.FieldKey);
                    setTitle((prev) => (editingCard ? prev : prev.trim() ? prev : option.FieldName));
                    setBreakdownMenuVisible(false);
                  }}
                />
              ))}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setBreakdownMenuVisible(false)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>

          <Text style={styles.fieldLabel}>Filters</Text>
          {filters.map((row, index) => (
            <View key={index} style={styles.filterRow}>
              <Button
                mode="outlined"
                compact
                style={styles.filterCol}
                onPress={() => setFilterMenuIndex(index)}
              >
                {row.key}
              </Button>
              <TextInput
                mode="outlined"
                style={styles.filterValue}
                value={row.value}
                onChangeText={(text) => updateFilterRow(index, { value: text })}
                placeholder="value"
              />
              <IconButton icon="close" onPress={() => removeFilterRow(index)} />
            </View>
          ))}
          {entityConfig.filterableColumns.length > 0 ? (
            <Button icon="plus" onPress={addFilterRow} style={styles.input}>
              Add Filter
            </Button>
          ) : null}
          <Dialog
            visible={filterMenuIndex !== null}
            onDismiss={() => setFilterMenuIndex(null)}
          >
            <Dialog.Title>Select Filter Column</Dialog.Title>
            <Dialog.Content>
              {entityConfig.filterableColumns.map((col) => (
                <List.Item
                  key={col}
                  title={col}
                  onPress={() => {
                    if (filterMenuIndex !== null) updateFilterRow(filterMenuIndex, { key: col });
                    setFilterMenuIndex(null);
                  }}
                />
              ))}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setFilterMenuIndex(null)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>

          {validationError ? (
            <HelperText type="error">{validationError}</HelperText>
          ) : null}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setEditorVisible(false)}>Cancel</Button>
          <Button onPress={handleSave}>Save</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={fieldPickerVisible} onDismiss={() => setFieldPickerVisible(false)}>
        <Dialog.Title>Add Card</Dialog.Title>
        <Dialog.Content>
          {fieldPickerLoading ? (
            <ActivityIndicator style={styles.loading} />
          ) : availableFields.length === 0 ? (
            <Text style={styles.empty}>All available fields have cards configured.</Text>
          ) : (
            <ScrollView style={styles.editorScroll}>
              {availableFields.map((f) => {
                const spec = SmartCardGenerator.getSpec(f);
                return (
                  <List.Item
                    key={f.FieldKey}
                    title={f.FieldName}
                    description={FIELD_TYPE_LABELS[f.FieldType] ?? f.FieldType}
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

  input: {
    marginBottom: 12,
  },

  editorScroll: {
    maxHeight: 420,
  },

  fieldLabel: {
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 6,
  },

  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },

  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  filterCol: {
    flex: 1,
    marginRight: 8,
  },

  filterValue: {
    flex: 1,
  },
});
