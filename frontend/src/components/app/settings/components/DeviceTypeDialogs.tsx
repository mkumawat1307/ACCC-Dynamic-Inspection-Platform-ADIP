import React from "react";
import { View, ScrollView } from "react-native";
import { Dialog, TextInput, Text, Chip, Button } from "react-native-paper";
import { CREATEABLE_FIELD_TYPES, FIELD_TYPES } from "@/src/database/repositories/FieldRepository";

const getTypeLabel = (type: string) =>
  CREATEABLE_FIELD_TYPES.find((t) => t.value === type)?.label ??
  FIELD_TYPES.find((t) => t.value === type)?.label ??
  type;

interface FieldDialogProps {
  visible: boolean;
  editingField: boolean;
  fieldLabel: string;
  fieldType: string;
  fieldRequired: boolean;
  onDismiss: () => void;
  onFieldLabelChange: (text: string) => void;
  onFieldTypeChange: (type: string) => void;
  onFieldRequiredToggle: () => void;
  onSave: () => void;
  typeChipStyle?: any;
  typeChipSelectedStyle?: any;
  chipRowStyle?: any;
  inputStyle?: any;
  fieldLabelText?: string;
  showExtraConfig?: boolean;
  placeholder?: string;
  isVisible?: boolean;
  onPlaceholderChange?: (text: string) => void;
  onVisibleToggle?: () => void;
}

export function FieldDialog({
  visible,
  editingField,
  fieldLabel,
  fieldType,
  fieldRequired,
  onDismiss,
  onFieldLabelChange,
  onFieldTypeChange,
  onFieldRequiredToggle,
  onSave,
  typeChipStyle,
  typeChipSelectedStyle,
  chipRowStyle,
  inputStyle,
  fieldLabelText = "Display Label",
  showExtraConfig = false,
  placeholder,
  isVisible,
  onPlaceholderChange,
  onVisibleToggle,
}: FieldDialogProps) {
  const legacyLocked =
    editingField && !CREATEABLE_FIELD_TYPES.some((ft) => ft.value === fieldType);

  const baseContent = (
    <>
      <TextInput
        mode="outlined"
        label={fieldLabelText}
        value={fieldLabel}
        onChangeText={onFieldLabelChange}
        style={inputStyle}
      />
      <Text variant="bodyMedium" style={{ marginBottom: 8 }}>Field Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={chipRowStyle}>
          {CREATEABLE_FIELD_TYPES.map((ft) => (
            <Chip
              key={ft.value}
              selected={fieldType === ft.value}
              disabled={legacyLocked}
              onPress={legacyLocked ? undefined : () => onFieldTypeChange(ft.value)}
              style={[typeChipStyle, fieldType === ft.value && typeChipSelectedStyle]}
            >
              {ft.label}
            </Chip>
          ))}
          {legacyLocked && (
            <Chip
              selected
              style={[typeChipStyle, typeChipSelectedStyle]}
            >
              {getTypeLabel(fieldType)}
            </Chip>
          )}
        </View>
      </ScrollView>
      <TextInput
        mode="outlined"
        label="Placeholder"
        value={placeholder}
        onChangeText={onPlaceholderChange}
        style={inputStyle}
      />
      <View style={chipRowStyle}>
        <Chip
          selected={fieldRequired}
          onPress={onFieldRequiredToggle}
          style={[typeChipStyle, fieldRequired && typeChipSelectedStyle]}
        >
          Required
        </Chip>
        <Chip
          selected={!!isVisible}
          onPress={onVisibleToggle}
          style={[typeChipStyle, isVisible && typeChipSelectedStyle]}
        >
          Visible
        </Chip>
      </View>
    </>
  );

  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>{editingField ? "Edit Field" : "Add Field"}</Dialog.Title>
      <Dialog.Content style={showExtraConfig ? { maxHeight: 400 } : undefined}>
        {showExtraConfig ? (
          <ScrollView keyboardShouldPersistTaps="handled">
            {baseContent}
          </ScrollView>
        ) : (
          baseContent
        )}
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button onPress={onSave}>Save</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

interface AddTypeDialogProps {
  visible: boolean;
  newTypeName: string;
  onDismiss: () => void;
  onNameChange: (text: string) => void;
  onAdd: () => void;
  inputStyle?: any;
}

export function AddTypeDialog({ visible, newTypeName, onDismiss, onNameChange, onAdd, inputStyle }: AddTypeDialogProps) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>Add Device Type</Dialog.Title>
      <Dialog.Content>
        <TextInput
          mode="outlined"
          label="Device Type Name"
          value={newTypeName}
          onChangeText={onNameChange}
          placeholder="e.g., NVR, Router, UPS"
          style={inputStyle}
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button onPress={onAdd}>Add</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

interface DeleteFieldDialogProps {
  visible: boolean;
  deleteTargetLabel: string | undefined;
  selectedType: string;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function DeleteFieldDialog({ visible, deleteTargetLabel, selectedType, onDismiss, onConfirm }: DeleteFieldDialogProps) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Icon icon="alert" color="#D32F2F" size={40} />
      <Dialog.Title style={{ textAlign: "center" }}>Delete Field?</Dialog.Title>
      <Dialog.Content>
        <Text variant="bodyMedium" style={{ textAlign: "center" }}>
          Remove {'\u201C'}{deleteTargetLabel}{'\u201D'} from {selectedType}?
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button textColor="#D32F2F" onPress={onConfirm}>Delete</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

interface DeleteTypeDialogProps {
  visible: boolean;
  selectedType: string;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function DeleteTypeDialog({ visible, selectedType, onDismiss, onConfirm }: DeleteTypeDialogProps) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
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
        <Button onPress={onDismiss}>Cancel</Button>
        <Button textColor="#D32F2F" onPress={onConfirm}>Delete Permanently</Button>
      </Dialog.Actions>
    </Dialog>
  );
}
