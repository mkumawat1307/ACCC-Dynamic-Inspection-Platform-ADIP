import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Checkbox, Dialog, Portal, Text } from "react-native-paper";

interface PoleRenameConfirmDialogProps {
  visible: boolean;
  oldPoleId: string;
  newPoleId: string;
  photoCount: number;
  onCancel: () => void;
  onConfirm: (renameFiles: boolean, updateReports: boolean) => void;
}

export default function PoleRenameConfirmDialog({
  visible,
  oldPoleId,
  newPoleId,
  photoCount,
  onCancel,
  onConfirm,
}: PoleRenameConfirmDialogProps) {
  const [renameFiles, setRenameFiles] = useState(true);
  const [updateReports, setUpdateReports] = useState(true);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>Rename Site ID</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            Update Site ID from {oldPoleId} to {newPoleId}? Related records and photo files will be updated.
          </Text>
          <Text variant="bodySmall" style={styles.note}>
            Watermarks already burned into existing photos will keep showing the old Site ID.
          </Text>
          <View style={styles.toggles}>
            <Checkbox.Item
              label="Rename related photo files"
              status={renameFiles ? "checked" : "unchecked"}
              onPress={() => setRenameFiles((v) => !v)}
            />
            <Checkbox.Item
              label="Update future reports and exports"
              status={updateReports ? "checked" : "unchecked"}
              onPress={() => setUpdateReports((v) => !v)}
            />
          </View>
          {photoCount > 0 && (
            <Text variant="bodySmall" style={styles.photoCount}>
              {photoCount} photo file{photoCount === 1 ? "" : "s"} will be renamed
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button mode="contained" onPress={() => onConfirm(renameFiles, updateReports)}>Rename</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: 8,
    color: "#555",
  },
  toggles: {
    marginTop: 12,
  },
  photoCount: {
    marginTop: 8,
    color: "#555",
  },
});
