import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { ReportTable } from "@/src/utils/exportData";

const COLUMN_WIDTH = 150;

export default function ReportTablePreview({ table }: { table: ReportTable }) {
  const bandRow = table.sections.flatMap((s) => s.columns.map(() => s.name));

  const renderRow = (cells: string[], isHeader: boolean, tinted: boolean) => (
    <View style={styles.row} key={`${isHeader ? "h" : "d"}-${cells[0] ?? ""}-${cells.length}`}>
      {cells.map((cell, i) => (
        <View key={i} style={[styles.cell, isHeader && styles.headerCell, tinted && styles.tintedCell]}>
          <Text style={isHeader ? styles.headerText : styles.cellText} numberOfLines={2}>
            {cell}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView horizontal style={styles.scroll}>
      <View>
        {renderRow(bandRow, true, false)}
        {renderRow(table.headers, true, false)}
        {table.rows.map((row, i) => renderRow(row.cells, false, row.isDeviceRow))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: "row" },
  cell: {
    width: COLUMN_WIDTH,
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: "#C8C8C8",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  headerCell: { backgroundColor: "#E3E3E3" },
  tintedCell: { backgroundColor: "#E3F2FD" },
  headerText: { fontSize: 11, fontWeight: "700" },
  cellText: { fontSize: 11 },
});
