import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16 },
  sectionTitle: { fontWeight: "600", marginBottom: 8 },
  divider: { marginVertical: 12 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  enableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0F4FF",
    padding: 12,
    borderRadius: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { marginBottom: 4 },
  typeChipSelected: { backgroundColor: "#E3F2FD" },
  card: { marginBottom: 8 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cardInfo: { flex: 1 },
  subtitle: { color: "#666", marginTop: 2 },
  actions: { flexDirection: "row" },
  input: { marginBottom: 12 },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: "#999" },
});
