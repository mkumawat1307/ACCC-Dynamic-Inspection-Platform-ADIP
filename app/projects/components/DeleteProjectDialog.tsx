import React from "react";
import { Dialog, Portal, Button, Text } from "react-native-paper";
import { logger } from "@/src/utils/logger";

interface Props {
  visible: boolean;
  projectName: string;
  onDismiss: () => void;
  onDeleted: () => void;
}

export default function DeleteProjectDialog({
  visible,
  projectName,
  onDismiss,
  onDeleted,
}: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Delete Project</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">Project:</Text>
          <Text variant="titleMedium" style={{ marginBottom: 16 }}>
            {projectName}
          </Text>
          <Text variant="bodyMedium">
            Deleting this project will permanently remove:
          </Text>
          <Text style={{ marginTop: 10 }}>
            • Project{"\n"}
            • All inspections{"\n"}
            • All photos{"\n"}
            • Inspection values{"\n"}
            • Inspection devices
          </Text>
          <Text style={{ marginTop: 20, fontWeight: "bold" }}>
            Would you like to export the data before deleting?
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={() => {
              onDismiss();
              // Export Excel (Next Step)
            }}
          >
            Export & Delete
          </Button>
          <Button
            textColor="red"
            onPress={async () => {
              try {
                onDismiss();
                onDeleted();
              } catch (error) {
                logger.error("Delete Project Error:", error);
              }
            }}
          >
            Delete
          </Button>
          <Button onPress={onDismiss}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
