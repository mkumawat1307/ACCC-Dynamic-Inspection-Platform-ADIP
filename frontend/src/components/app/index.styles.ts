import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F5F5F5",
  },
  title: {
    textAlign: "center",
    marginBottom: 25,
    fontWeight: "bold",
  },
  topRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  topBtn: {
    flex: 1,
  },
  button: {
    marginBottom: 20,
  },
  search: {
    marginBottom: 30,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  subtitle: {
    marginTop: 10,
    textAlign: "center",
    color: "#666",
  },
  projectCard: {
    marginBottom: 12,
    borderRadius: 10,
  },
  projectHeading: {
    fontWeight: "700",
    marginBottom: 2,
    color: "#0B5ED7",
  },
  projectName: {
    fontWeight: "700",
    marginBottom: 4,
  },
  projectDetail: {
    color: "#555",
    marginBottom: 2,
  },
  divider: {
    marginVertical: 10,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
});
