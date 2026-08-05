import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { TemplateExportResult } from "@/src/utils/templateData";

interface TemplateExportDialogsProps {
  exporting: boolean;
  result: TemplateExportResult | null;
  errorMessage: string | null;
  onShare: () => void;
  onCloseSuccess: () => void;
  onRetry: () => void;
  onCloseError: () => void;
}

export default function TemplateExportDialogs({
  exporting,
  result,
  errorMessage,
  onShare,
  onCloseSuccess,
  onRetry,
  onCloseError,
}: TemplateExportDialogsProps) {
  return (
    <Portal>
      <Dialog visible={exporting} dismissable={false}>
        <Dialog.Title>Exporting Template</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              Building template file...
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={result !== null} onDismiss={onCloseSuccess}>
        <Dialog.Title>Template Exported</Dialog.Title>
        <Dialog.Content>
          {result && (
            <>
              <Text variant="bodyMedium">File: {result.fileName}</Text>
              <Text variant="bodyMedium">
                {result.summary.templateCount} template(s), {result.summary.sectionCount} section(s),
                {"\n"}{result.summary.fieldCount} field(s), {result.summary.deviceTypeCount} device type(s)
              </Text>
            </>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button icon="share-variant" mode="contained" onPress={onShare}>Share File</Button>
          <Button onPress={onCloseSuccess}>Close</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={errorMessage !== null} onDismiss={onCloseError}>
        <Dialog.Title>Export Failed</Dialog.Title>
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
});
