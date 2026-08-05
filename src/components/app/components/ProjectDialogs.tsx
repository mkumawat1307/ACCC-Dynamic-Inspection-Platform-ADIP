import React from "react";
import { Portal, Dialog, Button, Text, TextInput } from "react-native-paper";

interface DeleteProps {
  visible: boolean;
  projectName?: string;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function DeleteProjectDialog({ visible, projectName, onDismiss, onConfirm }: DeleteProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Icon icon="alert" color="#D32F2F" size={40} />
        <Dialog.Title style={{ textAlign: "center" }}>
          Delete Project?
        </Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ textAlign: "center", fontWeight: "600", marginBottom: 8 }}>
            {projectName}
          </Text>
          <Text variant="bodyMedium" style={{ textAlign: "center", color: "#D32F2F", marginBottom: 12 }}>
            This action cannot be undone!
          </Text>
          <Text variant="bodySmall" style={{ color: "#666" }}>
            Deleting this project will permanently remove:
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 6, color: "#666" }}>
            {"\u2022"} Project details{"\n"}
            {"\u2022"} All inspections and inspection data{"\n"}
            {"\u2022"} All photos captured during inspections{"\n"}
            {"\u2022"} All camera and switch records{"\n"}
            {"\u2022"} All field values
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 12, fontWeight: "600" }}>
            Are you sure you want to continue?
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button textColor="#D32F2F" onPress={onConfirm}>Delete Permanently</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

interface CloneProps {
  visible: boolean;
  cloneName: string;
  onDismiss: () => void;
  onCloneNameChange: (name: string) => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
}

export function CloneProjectDialog({ visible, cloneName, onDismiss, onCloneNameChange, onConfirm, confirmDisabled }: CloneProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Icon icon="content-copy" size={40} />
        <Dialog.Title style={{ textAlign: "center" }}>
          Clone Project
        </Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall" style={{ textAlign: "center", color: "#666", marginBottom: 12 }}>
            This will create a new project with its own independent template and inspection form.
          </Text>
          <TextInput
            label="Project Name"
            value={cloneName}
            onChangeText={onCloneNameChange}
            mode="outlined"
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" onPress={onConfirm} disabled={confirmDisabled}>Clone</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
