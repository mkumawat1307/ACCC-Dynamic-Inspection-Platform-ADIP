import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  headerTitle: {
    fontWeight: "700",
    color: "#1976D2",
  },

  loading: {
    paddingVertical: 20,
    alignItems: "center",
  },

  card: {
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: "#F8F9FA",
  },

  cardTitle: {
    fontWeight: "700",
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#444",
    marginBottom: 4,
  },

  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },

  half: {
    flex: 1,
  },

  input: {
    marginBottom: 4,
    backgroundColor: "#FFFFFF",
  },

  dropdown: {
    height: 56,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },

  placeholder: {
    fontSize: 14,
    color: "#999999",
  },

  selectedText: {
    fontSize: 14,
    color: "#000000",
  },
});
