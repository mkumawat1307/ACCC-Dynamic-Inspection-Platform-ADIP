import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { ParsedTemplateFile } from "@/src/utils/templateData";

interface TemplateImportDialogsProps {
  parsing: boolean;
  confirming: ParsedTemplateFile | null;
  importing: boolean;
  importedMessage: string | null;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onCloseSuccess: () => void;
  onRetry: () => void;
  onCloseError: () => void;
}

export default function TemplateImportDialogs({
  parsing,
  confirming,
  importing,
  importedMessage,
  errorMessage,
  onConfirm,
  onCancel,
  onCloseSuccess,
  onRetry,
  onCloseError,
}: TemplateImportDialogsProps) {
  return (
    <Portal>
      <Dialog visible={parsing} dismissable={false}>
        <Dialog.Title>Importing Template</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              Reading template file...
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={confirming !== null} onDismiss={onCancel}>
        <Dialog.Title>Import Template?</Dialog.Title>
        <Dialog.Content>
          {confirming && (
            <>
              <Text variant="bodyMedium">
                Import template {'\u201C'}{confirming.data.templates[0]?.TemplateName ?? "Untitled"}{'\u201D'}?
              </Text>
              <Text variant="bodyMedium" style={styles.body}>
                This will replace the current form:
                {"\n"}{confirming.summary.templateCount} template(s),
                {"\n"}{confirming.summary.sectionCount} section(s),
                {"\n"}{confirming.summary.fieldCount} field(s),
                {"\n"}{confirming.summary.deviceTypeCount} device type(s).
              </Text>
              <Text variant="bodySmall" style={styles.warn}>
                Existing inspection data will NOT be deleted.
              </Text>
            </>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button mode="contained" onPress={onConfirm}>Import</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={importing} dismissable={false}>
        <Dialog.Title>Applying Template</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              Applying template...
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={importedMessage !== null} onDismiss={onCloseSuccess}>
        <Dialog.Title>Template Imported</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{importedMessage}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseSuccess}>Close</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={errorMessage !== null} onDismiss={onCloseError}>
        <Dialog.Title>Import Failed</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{errorMessage}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCloseError}>Close</Button>
          <Button mode="contained" onPress={onRetry}>Retry</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", alignItems: "center" },
  progressText: { marginLeft: 16, flex: 1 },
  body: { marginTop: 8 },
  warn: { marginTop: 8, color: "#D32F2F" },
});
