import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { ExportFormat, ExportResult } from "@/src/utils/exportData";
import { ExportTarget } from "@/src/components/export/useExportFlow";

interface ExportDialogsProps {
  formatDialog: ExportTarget | null;
  exporting: boolean;
  format: ExportFormat | null;
  result: ExportResult | null;
  errorMessage: string | null;
  onChooseFormat: (format: ExportFormat) => void;
  onCancelFormat: () => void;
  onRetry: () => void;
  onCloseError: () => void;
  onCloseSuccess: () => void;
  onOpen: () => void;
  onShare: () => void;
}

const FORMAT_META: Record<ExportFormat, { label: string; icon: string; message: string; success: string }> = {
  excel: { label: "Excel (.xlsx)", icon: "microsoft-excel", message: "Generating Excel Report...", success: "Excel Report Exported Successfully" },
  csv: { label: "CSV (.csv)", icon: "file-delimited", message: "Generating CSV Report...", success: "CSV Report Exported Successfully" },
};

function plural(count: number): string {
  return count === 1 ? "inspection" : "inspections";
}

export default function InspectionExportDialogs({
  formatDialog,
  exporting,
  format,
  result,
  errorMessage,
  onChooseFormat,
  onCancelFormat,
  onRetry,
  onCloseError,
  onCloseSuccess,
  onOpen,
  onShare,
}: ExportDialogsProps) {
  const isBulk = formatDialog !== null && formatDialog.ids.length > 1;

  return (
    <Portal>
      <Dialog visible={formatDialog !== null} onDismiss={onCancelFormat}>
        <Dialog.Title>{isBulk ? "Export Selected Inspections" : "Export Inspection"}</Dialog.Title>
        <Dialog.Content>
          {formatDialog && (
            <Text variant="bodyMedium" style={styles.selectionCount}>
              {formatDialog.ids.length} {plural(formatDialog.ids.length)} selected
            </Text>
          )}
          {(Object.keys(FORMAT_META) as ExportFormat[]).map((f) => (
            <Button
              key={f}
              mode="contained"
              icon={FORMAT_META[f].icon}
              onPress={() => onChooseFormat(f)}
              style={styles.formatButton}
            >
              {FORMAT_META[f].label}
            </Button>
          ))}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancelFormat}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={exporting && format !== null} dismissable={false}>
        <Dialog.Title>Exporting</Dialog.Title>
        <Dialog.Content>
          <View style={styles.progressRow}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.progressText}>
              {format ? FORMAT_META[format].message : "Generating Report..."}
            </Text>
          </View>
        </Dialog.Content>
      </Dialog>

      <Dialog visible={result !== null} onDismiss={onCloseSuccess}>
        <Dialog.Title>{result ? FORMAT_META[result.format].success : ""}</Dialog.Title>
        <Dialog.Content>
          {result && (
            <>
              <Text variant="bodyMedium">File: {result.fileName}</Text>
              <Text variant="bodyMedium">{result.inspectionCount} {plural(result.inspectionCount)} exported</Text>
              <Text variant="bodyMedium">{result.rowCount} rows exported</Text>
              <Text variant="bodyMedium" style={styles.duration}>
                Completed in {(result.durationMs / 1000).toFixed(1)}s
              </Text>
            </>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button icon="folder-open-outline" onPress={onOpen}>Open File</Button>
          <Button icon="share-variant" onPress={onShare}>Share File</Button>
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
  selectionCount: {
    marginBottom: 12,
  },
  formatButton: {
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressText: {
    marginLeft: 16,
    flex: 1,
  },
  duration: {
    marginTop: 4,
    color: "#555",
  },
});
