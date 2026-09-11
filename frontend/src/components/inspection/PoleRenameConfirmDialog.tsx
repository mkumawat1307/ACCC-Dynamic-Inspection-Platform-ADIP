import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Checkbox, Dialog, Portal, Text } from "react-native-paper";
import type { InspectionIdentity } from "./photoUtils";

interface PoleRenameConfirmDialogProps {
  visible: boolean;
  oldIdentity: InspectionIdentity;
  newIdentity: InspectionIdentity;
  photoCount: number;
  onCancel: () => void;
  onConfirm: (renameFiles: boolean, updateReports: boolean) => void;
}

export default function PoleRenameConfirmDialog({
  visible,
  oldIdentity,
  newIdentity,
  photoCount,
  onCancel,
  onConfirm,
}: PoleRenameConfirmDialogProps) {
  const [renameFiles, setRenameFiles] = useState(true);
  const [updateReports, setUpdateReports] = useState(true);

  const changed = [
    oldIdentity.district !== newIdentity.district,
    oldIdentity.block !== newIdentity.block,
    oldIdentity.poleId !== newIdentity.poleId,
  ];

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>Rename Site ID</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            District, Block Name, or Site ID has changed. Update the inspection
            identity from{" "}
            {`${oldIdentity.district}_${oldIdentity.block}_${oldIdentity.poleId}`} to{" "}
            {`${newIdentity.district}_${newIdentity.block}_${newIdentity.poleId}`}?
            Related records and photo files will be updated.
          </Text>
          {changed[0] && (
            <Text variant="bodySmall" style={styles.note}>
              District: {oldIdentity.district} → {newIdentity.district}
            </Text>
          )}
          {changed[1] && (
            <Text variant="bodySmall" style={styles.note}>
              Block Name: {oldIdentity.block} → {newIdentity.block}
            </Text>
          )}
          {changed[2] && (
            <Text variant="bodySmall" style={styles.note}>
              Site ID: {oldIdentity.poleId} → {newIdentity.poleId}
            </Text>
          )}
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
