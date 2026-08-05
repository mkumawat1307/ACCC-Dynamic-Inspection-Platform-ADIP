import React from "react";
import { View, FlatList } from "react-native";
import {
  Chip, Button, Divider, Switch as PaperSwitch, IconButton, Text,
} from "react-native-paper";
import { DeviceFieldDefinition } from "@/src/database/repositories/DeviceFieldDefinitionsRepository";
import { styles } from "../device-types.styles";
import DeviceTypeFieldCard from "./DeviceTypeFieldCard";

interface DeviceTypeBodyProps {
  deviceTypes: string[];
  selectedType: string;
  onSelectType: (type: string) => void;
  enabledTypes: Set<string>;
  onToggleInspection: (type: string) => Promise<void>;
  onAddTypePress: () => void;
  onDeleteTypePress: () => void;
  fields: DeviceFieldDefinition[];
  onAddField: () => void;
  onEditField: (field: DeviceFieldDefinition) => void;
  onDeleteField: (field: DeviceFieldDefinition) => void;
  onMoveUp: (id: number) => Promise<void>;
  onMoveDown: (id: number) => Promise<void>;
  onNavigateOptions: (deviceType: string, fieldName: string) => void;
}

export default function DeviceTypeBody({
  deviceTypes,
  selectedType,
  onSelectType,
  enabledTypes,
  onToggleInspection,
  onAddTypePress,
  onDeleteTypePress,
  fields,
  onAddField,
  onEditField,
  onDeleteField,
  onMoveUp,
  onMoveDown,
  onNavigateOptions,
}: DeviceTypeBodyProps) {
  return (
    <>
      <View style={styles.headerRow}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Device Types</Text>
        <Button mode="contained" onPress={onAddTypePress}>
          Add Device Type
        </Button>
      </View>
      <View style={styles.chipRow}>
        {deviceTypes.map((dt) => (
          <Chip
            key={dt}
            selected={selectedType === dt}
            onPress={() => onSelectType(dt)}
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
              onValueChange={() => onToggleInspection(selectedType)}
            />
            <IconButton
              icon="delete"
              size={22}
              iconColor="#D32F2F"
              onPress={onDeleteTypePress}
            />
          </View>

          <Divider style={styles.divider} />

          <View style={styles.headerRow}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {selectedType} Fields ({fields.length})
            </Text>
            <Button mode="contained" onPress={onAddField}>
              Add Field
            </Button>
          </View>

          <FlatList
            data={fields}
            keyExtractor={(item) => String(item.FieldDefID)}
            renderItem={({ item, index }) => (
              <DeviceTypeFieldCard
                item={item}
                index={index}
                fields={fields}
                onEdit={onEditField}
                onDelete={onDeleteField}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                onNavigateOptions={onNavigateOptions}
                cardStyle={styles.card}
                cardRowStyle={styles.cardRow}
                cardInfoStyle={styles.cardInfo}
                subtitleStyle={styles.subtitle}
                actionsStyle={styles.actions}
              />
            )}
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
    </>
  );
}
