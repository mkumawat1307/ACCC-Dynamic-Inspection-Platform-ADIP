import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { ReportTable } from "@/src/utils/exportData";

const COLUMN_WIDTH = 150;

export default function ReportTablePreview({ table }: { table: ReportTable }) {
  const renderBandRow = () => (
    <View style={styles.row}>
      {table.sections.map((s) => (
        <View
          key={s.index}
          style={[styles.cell, styles.headerCell, { width: COLUMN_WIDTH * s.columns.length }]}
        >
          <Text style={styles.headerText} numberOfLines={2}>
            {s.name}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderRow = (cells: string[], isHeader: boolean, tinted: boolean, index: number) => (
    <View
      style={styles.row}
      key={`${isHeader ? "h" : "d"}-${index}-${cells[0] ?? ""}-${cells.length}`}
    >
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
        {renderBandRow()}
        {renderRow(table.headers, true, false, 1)}
        {table.rows.map((row, i) => renderRow(row.cells, false, row.isDeviceRow, i))}
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
