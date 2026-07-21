import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

export default function DashboardHeader() {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        ACCC Pole Inspection
      </Text>

      <Text variant="bodyMedium" style={styles.subtitle}>
        Inspection Management System
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },

  title: {
    fontWeight: "700",
  },

  subtitle: {
    marginTop: 4,
    opacity: 0.7,
  },
});