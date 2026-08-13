import React from "react";
import { View, ScrollView } from "react-native";
import { Dialog, TextInput, Text, Chip, Button } from "react-native-paper";

const FIELD_TYPES = [
  { label: "Text", value: "text" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Checkbox", value: "checkbox" },
];

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
}: FieldDialogProps) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>{editingField ? "Edit Field" : "Add Field"}</Dialog.Title>
      <Dialog.Content>
        <TextInput
          mode="outlined"
          label="Display Label"
          value={fieldLabel}
          onChangeText={onFieldLabelChange}
          style={inputStyle}
        />
        <Text variant="bodyMedium" style={{ marginBottom: 8 }}>Field Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={chipRowStyle}>
            {FIELD_TYPES.map((ft) => (
              <Chip
                key={ft.value}
                selected={fieldType === ft.value}
                onPress={() => onFieldTypeChange(ft.value)}
                style={[typeChipStyle, fieldType === ft.value && typeChipSelectedStyle]}
              >
                {ft.label}
              </Chip>
            ))}
          </View>
        </ScrollView>
        <View style={chipRowStyle}>
          <Chip
            selected={fieldRequired}
            onPress={onFieldRequiredToggle}
            style={[typeChipStyle, fieldRequired && typeChipSelectedStyle]}
          >
            Required
          </Chip>
        </View>
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
