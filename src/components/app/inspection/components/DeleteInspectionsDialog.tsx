import React from "react";
import { Dialog, Portal, Button, Text } from "react-native-paper";
import { InspectionRepository } from "@/src/database/repositories/InspectionRepository";
import { logger } from "@/src/utils/logger";

interface Props {
  visible: boolean;
  selectedIds: number[];
  selectedDrafts: number;
  selectedCompleted: number;
  onDismiss: () => void;
  onDeleted: () => void;
}

export default function DeleteInspectionsDialog({ visible, selectedIds, selectedDrafts, selectedCompleted, onDismiss, onDeleted }: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Delete Inspections</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">You selected {selectedIds.length} inspection(s).</Text>
          <Text variant="bodyMedium">Draft : {selectedDrafts}</Text>
          <Text variant="bodyMedium">Completed : {selectedCompleted}</Text>
          <Text variant="bodyMedium" style={{ marginTop: 12 }}>All selected inspections and their associated data will be permanently deleted.</Text>
          <Text variant="bodyMedium" style={{ color: "red", marginTop: 10, fontWeight: "bold" }}>This action cannot be undone.</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" onPress={async () => {
            try {
              await InspectionRepository.deleteMultipleInspections(selectedIds);
              onDismiss();
              onDeleted();
              logger.info("Delete completed");
            } catch (error) {
              logger.error("Delete failed:", error);
            }
          }}>Delete</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
