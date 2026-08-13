import React, { useCallback, useState } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Appbar, Button, Divider, Text, ActivityIndicator } from "react-native-paper";
import {
  buildReportTable,
  exportInspections,
  ExportFormat,
  ReportTable,
} from "@/src/utils/exportData";
import ReportTablePreview from "@/src/components/reports/ReportTablePreview";
import { logger } from "@/src/utils/logger";

const EXPORT_ACTIONS: { format: ExportFormat; label: string; icon: string }[] = [
  { format: "excel", label: "Export as Excel", icon: "microsoft-excel" },
  { format: "csv", label: "Export as CSV", icon: "file-delimited" },
];

export default function ReportsScreen() {
  const { projectId, projectName } = useLocalSearchParams<{
    projectId?: string;
    projectName?: string;
  }>();
  const router = useRouter();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (projectId) loadPreview();
    }, [projectId])
  );

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      setTable(await buildReportTable(Number(projectId)));
    } catch (error) {
      logger.error("Preview load error:", error);
      setTable(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  const handleExport = async (format: ExportFormat) => {
    if (!projectId) {
      Alert.alert("Export Failed", "Unable to export inspection data.");
      return;
    }
    setExporting(format);
    try {
      const success = await exportInspections(Number(projectId), projectName ?? "Project", format);
      if (!success) {
        Alert.alert("No Data", "No inspection data found to export for this project.");
      }
    } catch (error) {
      logger.error("Export error:", error);
      Alert.alert("Export Failed", "Unable to export inspection data.");
    } finally {
      setExporting(null);
    }
  };

  const totalRows = table?.rows.length ?? 0;
  const columnCount = table?.headers.length ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Reports" />
      </Appbar.Header>
      <View style={styles.content}>
        <Text variant="titleMedium" style={styles.subtitle}>
          {projectName ? `Export ${projectName} inspection data` : "Export inspection data"}
        </Text>
        {EXPORT_ACTIONS.map(({ format, label, icon }) => (
          <Button
            key={format}
            mode="contained"
            icon={icon}
            onPress={() => handleExport(format)}
            disabled={exporting !== null}
            loading={exporting === format}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            {label}
          </Button>
        ))}
        <Divider style={styles.divider} />
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Preview
        </Text>
        {loadingPreview ? (
          <ActivityIndicator style={styles.previewLoading} />
        ) : table && table.rows.length > 0 ? (
          <>
            <Text style={styles.summary}>
              Total Inspections: {table.inspectionCount} · Total Rows: {totalRows} · Total Columns: {columnCount}
            </Text>
            <ReportTablePreview table={table} />
          </>
        ) : (
          <Text style={styles.empty}>No inspection data to preview.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20 },
  subtitle: { marginBottom: 20 },
  button: { marginBottom: 15 },
  buttonContent: { paddingVertical: 4 },
  divider: { marginVertical: 16 },
  sectionTitle: { marginBottom: 10 },
  previewLoading: { marginTop: 20 },
  summary: { marginBottom: 10, fontSize: 13, color: "#555" },
  empty: { marginTop: 10, color: "#777" },
});
